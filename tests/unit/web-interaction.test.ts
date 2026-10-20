import { describe, expect, it, vi } from 'vitest';
import { createCancellationSource, type CameraState } from 'korea-map-core';
import type { Map as LibreMap, MapGeoJSONFeature } from 'maplibre-gl';
import { createMapState } from 'korea-map-web';
import {
  createWebInteractions,
  validateInteractionOptions,
} from '../../packages/web/src/interaction.js';

function harness(reducedMotion = false) {
  let current: CameraState = { center: [127, 37], zoom: 10, bearing: 0, pitch: 0 };
  let target = current;
  const handlers = new Map<string, Set<(event: { originalEvent?: unknown }) => void>>();
  const layers = new Set(['kmk-marker-points', 'kmk-marker-clusters', 'poi']);
  const source = { setData: vi.fn(), getClusterExpansionZoom: vi.fn(async () => 14) };
  const sources = new Map([['kmk-markers', source]]);
  const emit = (event: string, value = {}) => {
    for (const listener of [...(handlers.get(event) ?? [])]) listener(value);
  };
  const complete = () => {
    current = target;
    emit('move');
    emit('moveend');
  };
  const engine = {
    on(event: string, listener: (event: { originalEvent?: unknown }) => void) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(listener);
    },
    off(event: string, listener: (event: { originalEvent?: unknown }) => void) {
      handlers.get(event)?.delete(listener);
    },
    getCanvas: () => ({ clientWidth: 800, clientHeight: 600 }),
    getCenter: () => ({
      lng: current.center[0],
      lat: current.center[1],
      wrap: () => ({ lng: current.center[0], lat: current.center[1] }),
    }),
    getZoom: () => current.zoom,
    getBearing: () => current.bearing,
    getPitch: () => current.pitch,
    getMaxZoom: () => 22,
    getPadding: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
    getSource: (id: string) => sources.get(id),
    getLayer: (id: string) => layers.has(id),
    addSource: (id: string) => sources.set(id, source),
    removeSource: (id: string) => sources.delete(id),
    addLayer: (layer: { id: string }) => layers.add(layer.id),
    removeLayer: (id: string) => layers.delete(id),
    project: (coordinate: readonly number[]) => ({ x: coordinate[0], y: coordinate[1] }),
    queryRenderedFeatures: vi.fn(() => [] as MapGeoJSONFeature[]),
    stop: vi.fn(() => emit('moveend')),
    easeTo: vi.fn((options: CameraState & { duration: number }) => {
      target = options;
      if (!options.duration) complete();
    }),
    cameraForBounds: vi.fn(() => ({ center: [127, 37] as [number, number], zoom: 12 })),
    fitBounds: vi.fn((_bounds: unknown, options: { duration: number }) => {
      target = { center: [127, 37], zoom: 12, bearing: 0, pitch: 0 };
      if (!options.duration) complete();
    }),
  };
  const state = createMapState();
  const update = vi.spyOn(state, 'setMarkers');
  let ready = true;
  const adapter = createWebInteractions({
    map: engine as unknown as LibreMap,
    requireMap() {
      if (!ready) throw Error('Not ready');
      return engine as unknown as LibreMap;
    },
    state,
    poiLayers: ['poi'],
    reducedMotion: () => reducedMotion,
  });
  adapter.styleLoaded();
  return {
    ...adapter,
    engine,
    state,
    source,
    update,
    emit,
    complete,
    sources,
    layers,
    handlers,
    current: () => current,
    progress: (value: CameraState) => {
      current = value;
    },
    setReady: (value: boolean) => {
      ready = value;
    },
  };
}
const destination: CameraState = { center: [128, 38], zoom: 12, bearing: 30, pitch: 20 };

describe('Web interaction renderer adapter', () => {
  it('requires explicit valid clustering and basemap picking configuration before DOM construction', () => {
    expect(validateInteractionOptions({})).toEqual({ clustering: undefined, poiLayers: [] });
    expect(validateInteractionOptions({ clustering: {} }).clustering).toEqual({
      radius: 48,
      maxZoom: 13,
    });
    for (const clustering of [{ radius: 0 }, { maxZoom: 23 }, { radius: 1.5 }, false])
      expect(() => validateInteractionOptions({ clustering } as never)).toThrow(
        'INVALID_CLUSTER_OPTIONS',
      );
    for (const interactionPoiLayers of [
      ['kmk-markers'],
      ['poi', 'poi'],
      ['https://layers.example.invalid'],
    ])
      expect(() => validateInteractionOptions({ interactionPoiLayers })).toThrow(
        'INVALID_PICK_LAYERS',
      );
  });
  it('resolves on actual moveend and emits detached camera API origin', async () => {
    const h = harness(),
      events: unknown[] = [];
    h.controller.onEvent((event) => events.push(event));
    let finished = false;
    const motion = h.controller.transitionCamera(destination).then(() => {
      finished = true;
    });
    await Promise.resolve();
    expect(finished).toBe(false);
    expect(h.engine.easeTo).toHaveBeenCalledWith(expect.objectContaining({ duration: 300 }));
    h.complete();
    await motion;
    expect(finished).toBe(true);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'camera', origin: 'api', camera: destination }),
    );
    h.controller.destroy();
  });
  it('rejects calls before renderer readiness without submitting an engine transition', async () => {
    const h = harness();
    h.setReady(false);
    await expect(h.controller.transitionCamera(destination)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    await expect(h.controller.setMarkers([])).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(h.engine.easeTo).not.toHaveBeenCalled();
    h.controller.destroy();
  });
  it('cancels in place on caller signal, replacement and actual gesture, never resolving stop moveend as success', async () => {
    const h = harness(),
      signal = createCancellationSource();
    const first = h.controller.transitionCamera(destination, { signal: signal.signal });
    const firstCheck = expect(first).rejects.toMatchObject({ code: 'ABORTED' });
    const midway = { ...destination, center: [127.5, 37.5] as const };
    h.progress(midway);
    signal.cancel();
    await firstCheck;
    expect(h.current()).toEqual(midway);
    const second = h.controller.transitionCamera(destination);
    const secondCheck = expect(second).rejects.toMatchObject({ code: 'ABORTED' });
    const replacement = h.controller.transitionCamera({ ...destination, zoom: 13 });
    await secondCheck;
    h.complete();
    await replacement;
    const gesture = h.controller.transitionCamera(destination);
    const gestureCheck = expect(gesture).rejects.toMatchObject({ code: 'ABORTED' });
    h.emit('dragstart', { originalEvent: {} });
    await gestureCheck;
    expect(h.engine.stop.mock.calls.length).toBeGreaterThanOrEqual(3);
    h.controller.destroy();
  });
  it('honors system reduced motion and absolute fit insets; rejects impossible viewport insets', async () => {
    const h = harness(true);
    await h.controller.transitionCamera(destination, { durationMs: 500 });
    expect(h.engine.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ duration: 0 }));
    await h.controller.fitBounds(
      { west: 126, south: 36, east: 128, north: 38 },
      { insets: { bottom: 100 } },
    );
    expect(h.engine.fitBounds).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        absolutePadding: true,
        duration: 0,
        padding: { top: 0, right: 0, bottom: 100, left: 0 },
      }),
    );
    await expect(
      h.controller.transitionCamera(destination, { insets: { left: 800 } }),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    h.controller.destroy();
  });
  it('batches 1000 markers once and strips basemap properties while sorting/capping picks', async () => {
    const h = harness();
    const markers = Array.from({ length: 1000 }, (_, i) => ({
      id: `m-${i}`,
      label: `M${i}`,
      coordinate: [127, 37] as const,
    }));
    await h.controller.setMarkers(markers);
    expect(h.update).toHaveBeenCalledTimes(1);
    h.engine.queryRenderedFeatures.mockReturnValue([
      ...markers
        .slice(0, 12)
        .reverse()
        .map((marker) => ({
          source: 'kmk-markers',
          layer: { id: 'kmk-marker-points' },
          properties: { id: marker.id, unrelatedPayload: 'never-return' },
          geometry: { type: 'Point', coordinates: [127, 37] },
        })),
      {
        source: 'base',
        layer: { id: 'poi' },
        properties: { fid: 'n123', 'name:ko': '합성 시설', unrelatedPayload: 'never-return' },
        geometry: { type: 'Point', coordinates: [127, 37] },
      },
    ] as never);
    const picks = await h.controller.pickFeatures({ x: 127, y: 37 });
    expect(picks).toHaveLength(8);
    expect(picks[0]?.key).toBe('marker:m-0');
    expect(JSON.stringify(picks)).not.toContain('unrelatedPayload');
    expect(h.engine.queryRenderedFeatures).toHaveBeenLastCalledWith(
      [
        [105, 15],
        [149, 59],
      ],
      { layers: ['kmk-marker-points', 'kmk-marker-clusters', 'poi'] },
    );
    h.engine.queryRenderedFeatures.mockReturnValue([
      {
        source: 'base',
        layer: { id: 'poi' },
        properties: { fid: 'n123', 'name:ko': '합성 시설' },
        geometry: { type: 'Point', coordinates: [127, 37] },
      },
    ] as never);
    const [poi] = await h.controller.pickFeatures({ x: 127, y: 37 });
    expect(poi?.key).toBe('poi:base:poi:n123');
    await h.controller.selectFeature(poi!);
    expect(h.source.setData).toHaveBeenLastCalledWith(
      expect.objectContaining({
        features: [expect.objectContaining({ properties: { key: poi?.key } })],
      }),
    );
    h.controller.destroy();
  });
  it('expands a cluster using the source zoom and removes only extension listeners/highlight on destroy', async () => {
    const h = harness(true);
    await h.controller.selectFeature({
      key: 'cluster:4',
      id: '4',
      kind: 'cluster',
      coordinate: [127, 37],
      label: '10 places',
      sourceId: 'kmk-markers',
      clusterId: 4,
      count: 10,
    });
    expect(h.source.getClusterExpansionZoom).toHaveBeenCalledWith(4);
    expect(h.engine.easeTo).toHaveBeenLastCalledWith(
      expect.objectContaining({ zoom: 14, duration: 0 }),
    );
    h.controller.destroy();
    expect(h.listenerCount()).toBe(0);
    expect([...h.handlers.values()].every((listeners) => listeners.size === 0)).toBe(true);
    expect(h.sources.has('kmk-picked-feature')).toBe(false);
    expect(h.layers.has('kmk-marker-points')).toBe(true);
    await expect(h.controller.pickFeatures({ x: 1, y: 1 })).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
  });
  it('does not emit stale cluster selection after a completed expansion is superseded in the same turn', async () => {
    const h = harness(),
      events: unknown[] = [];
    h.controller.onEvent((event) => events.push(event));
    await h.controller.setMarkers([{ id: 'm', label: 'M', coordinate: [127, 37] }]);
    const old = h.controller.selectFeature({
      key: 'cluster:4',
      id: '4',
      kind: 'cluster',
      coordinate: [127, 37],
      label: '10 places',
      sourceId: 'kmk-markers',
      clusterId: 4,
      count: 10,
    });
    const rejected = expect(old).rejects.toMatchObject({ code: 'ABORTED' });
    await Promise.resolve();
    h.complete();
    await h.controller.selectFeature({
      key: 'marker:m',
      id: 'm',
      kind: 'marker',
      coordinate: [127, 37],
      label: 'M',
    });
    await rejected;
    expect(events.filter((event) => (event as { type: string }).type === 'selection')).toEqual([
      { type: 'selection', selection: expect.objectContaining({ kind: 'marker', id: 'm' }) },
    ]);
    h.controller.destroy();
  });
});
