import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCancellationSource,
  defineMapStyle,
  type MapCamera,
  type MapMarker,
  type MapSelection,
} from 'korea-map-core';
import { createNativeMapSession, type NativeBridge } from '../../packages/native/src/controller.js';
import {
  nativeClustering,
  nativeFeatureSelection,
  nativeMarkerSelection,
  nativePickLayers,
  nativeTouchRadius,
  nativeBoundsFit,
  pickNativeRenderedFeatures,
  createNativePickRequests,
} from '../../packages/native/src/features.js';

const target: MapCamera = { center: [127, 37], zoom: 14, bearing: 0, pitch: 0 };
const marker: MapMarker = { id: 'park', coordinate: [127, 37], label: '합성 공원' };
const scheduler = {
  schedule(callback: () => void, delay: number) {
    const timer = setTimeout(callback, delay);
    return () => clearTimeout(timer);
  },
};
const sessions = new Set<ReturnType<typeof createNativeMapSession>>();
function setup(extra: Partial<NativeBridge> = {}) {
  const changed = vi.fn();
  const bridge = {
    setCamera: vi.fn(async () => {}),
    getBounds: vi.fn(async (): Promise<[number, number, number, number]> => [126, 36, 128, 38]),
    stopCamera: vi.fn(async () => {}),
    isBoundsFitted: vi.fn(async () => true),
    ...extra,
  };
  const session = createNativeMapSession(
    defineMapStyle({ version: 8, sources: {}, layers: [] }, 'MIT synthetic only'),
    bridge,
    scheduler,
    changed,
  );
  sessions.add(session);
  session.loaded();
  return { session, bridge, changed };
}
async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}
afterEach(() => {
  for (const session of sessions) session.api.destroy();
  sessions.clear();
  vi.useRealTimers();
});

describe('Native interaction port (mock bridge, not device rendering)', () => {
  it('keeps the legacy zero-duration API while advanced motion waits for actual matching region completion', async () => {
    const { session, bridge } = setup();
    await session.api.setZoom(9);
    expect(bridge.setCamera).toHaveBeenLastCalledWith({ zoom: 9, duration: 0 });
    let finished = false;
    const motion = session.interactions.transitionCamera(target).then(() => {
      finished = true;
    });
    await flush();
    expect(bridge.setCamera).toHaveBeenLastCalledWith({
      ...target,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      duration: 300,
      easing: 'ease',
    });
    expect(finished).toBe(false);
    session.regionChanged('will', target, false, 10);
    session.regionChanged('did', { ...target, zoom: 8 }, false, 11);
    await flush();
    expect(finished).toBe(false);
    session.regionChanged('did', target, false, 12);
    await motion;
    expect(finished).toBe(true);
  });
  it('accepts completion before bridge acknowledgement without resolving before either', async () => {
    let accept = () => {};
    const { session } = setup({
      setCamera: () =>
        new Promise<void>((resolve) => {
          accept = resolve;
        }),
    });
    let completed = false;
    const pending = session.interactions.transitionCamera(target).then(() => {
      completed = true;
    });
    session.regionChanged('will', target, false, 10);
    session.regionChanged('did', target, false, 11);
    await flush();
    expect(completed).toBe(false);
    accept();
    await pending;
    expect(completed).toBe(true);
  });
  it('forwards asymmetric insets and unwrapped antimeridian bounds; ignores stale timestamps/revisions', async () => {
    const { session, bridge } = setup();
    session.regionChanged('did', target, false, 20);
    let completed = false;
    const pending = session.interactions
      .fitBounds(
        { west: 170, south: -10, east: -170, north: 10 },
        { insets: { top: 20, bottom: 180, left: 4, right: 8 } },
      )
      .then(() => {
        completed = true;
      });
    expect(bridge.setCamera).toHaveBeenLastCalledWith({
      bounds: [170, -10, 190, 10],
      padding: { top: 20, right: 8, bottom: 180, left: 4 },
      bearing: 0,
      pitch: 0,
      duration: 300,
      easing: 'ease',
    });
    session.regionChanged('will', target, false, 19);
    session.regionChanged('did', target, false, 19);
    session.regionChanged('did', target, false, 21, -1);
    await flush();
    expect(completed).toBe(false);
    session.regionChanged('will', target, false, 22);
    session.regionChanged('did', target, false, 23);
    await pending;
  });
  it('cancels on caller abort, superseding camera, gesture and timeout without restoring a prior target', async () => {
    vi.useFakeTimers();
    const { session, bridge } = setup();
    const caller = createCancellationSource();
    const first = session.interactions.transitionCamera(target, { signal: caller.signal });
    const firstRejected = expect(first).rejects.toMatchObject({ code: 'ABORTED' });
    caller.cancel();
    await firstRejected;
    const second = session.interactions.transitionCamera(target);
    const secondRejected = expect(second).rejects.toMatchObject({ code: 'ABORTED' });
    const third = session.interactions.transitionCamera({ ...target, zoom: 15 });
    const thirdRejected = expect(third).rejects.toMatchObject({ code: 'ABORTED' });
    await secondRejected;
    const events = vi.fn();
    session.interactions.onEvent(events);
    session.regionChanged('will', target, true, 30);
    await thirdRejected;
    session.regionChanged('did', target, false, 31);
    expect(events.mock.calls.at(-1)?.[0]).toMatchObject({ type: 'camera', origin: 'gesture' });
    const last = session.interactions.transitionCamera(target, { timeoutMs: 25 });
    const lastRejected = expect(last).rejects.toMatchObject({ code: 'ABORTED' });
    await vi.advanceTimersByTimeAsync(25);
    await lastRejected;
    expect(bridge.stopCamera).toHaveBeenCalledTimes(4);
  });
  it('does not complete a new bounds fit on queued events from the previous move before its actual projected fit', async () => {
    let fitted = false;
    const { session } = setup({ isBoundsFitted: async () => fitted });
    const first = session.interactions.fitBounds({ west: 126, south: 36, east: 128, north: 38 });
    const aborted = expect(first).rejects.toMatchObject({ code: 'ABORTED' });
    let done = false;
    const next = session.interactions
      .fitBounds({ west: 129, south: 35, east: 130, north: 36 })
      .then(() => {
        done = true;
      });
    await aborted;
    session.regionChanged('will', target, false, 100);
    session.regionChanged('did', target, false, 101);
    await flush();
    expect(done).toBe(false);
    fitted = true;
    session.regionChanged('will', { ...target, center: [129.5, 35.5] }, false, 102);
    session.regionChanged('did', { ...target, center: [129.5, 35.5] }, false, 103);
    await next;
    expect(done).toBe(true);
  });
  it('accepts wrapped longitude/bearing completion and safely rejects bridges without fit verification capability', async () => {
    const { session } = setup();
    const pending = session.interactions.transitionCamera({
      ...target,
      center: [180, 37],
      bearing: -90,
    });
    session.regionChanged('did', { ...target, center: [-180, 37], bearing: 270 }, false, 1);
    await pending;
    const oldBridge = createNativeMapSession(
      defineMapStyle({ version: 8, sources: {}, layers: [] }, 'MIT'),
      { setCamera: async () => {}, getBounds: async () => [126, 36, 128, 38] },
      scheduler,
      () => {},
    );
    sessions.add(oldBridge);
    oldBridge.loaded();
    await expect(
      oldBridge.interactions.fitBounds({ west: 126, south: 36, east: 128, north: 38 }),
    ).rejects.toThrow('BOUNDS_FIT_VERIFICATION_UNAVAILABLE');
    await oldBridge.interactions.fitBounds(
      { west: 126, south: 36, east: 128, north: 38 },
      { durationMs: 0 },
    );
  });
  it('ignores a cancelled asynchronous fit verification after a newer selection', async () => {
    let verify: (fitted: boolean) => void = () => {};
    const { session, changed } = setup({
      isBoundsFitted: () =>
        new Promise<boolean>((resolve) => {
          verify = resolve;
        }),
    });
    await session.interactions.setMarkers([marker]);
    const pending = session.interactions.fitBounds({ west: 126, south: 36, east: 128, north: 38 });
    const aborted = expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
    session.regionChanged('will', target, false, 10);
    session.regionChanged('did', target, false, 11);
    await session.interactions.selectFeature(nativeMarkerSelection(marker));
    await aborted;
    changed.mockClear();
    verify(true);
    await flush();
    expect(changed).not.toHaveBeenCalled();
    expect(session.getSnapshot().selection?.key).toBe('marker:park');
  });
  it('respects explicit and OS reduced motion without waiting for an animation event', async () => {
    const { session, bridge } = setup();
    await session.interactions.transitionCamera(target, { reducedMotion: true });
    expect(bridge.setCamera).toHaveBeenLastCalledWith(expect.objectContaining({ duration: 0 }));
    const os = setup({ prefersReducedMotion: () => true });
    await os.session.interactions.transitionCamera(target);
    expect(os.bridge.setCamera).toHaveBeenLastCalledWith(expect.objectContaining({ duration: 0 }));
  });
  it('batches 1000 markers in one publication, suppresses semantic no-ops and clears removed selection atomically', async () => {
    const { session, changed } = setup();
    const markers = Array.from({ length: 1000 }, (_, id) => ({ ...marker, id: `m${id}` }));
    await session.interactions.setMarkers(markers);
    expect(changed).toHaveBeenCalledTimes(1);
    await session.interactions.setMarkers(
      markers.map((entry) => ({ ...entry, coordinate: [...entry.coordinate] })),
    );
    await session.api.addMarker(markers[0]!);
    await session.api.removeMarker('absent');
    expect(changed).toHaveBeenCalledTimes(1);
    await session.interactions.selectFeature(nativeMarkerSelection(markers[0]!));
    changed.mockClear();
    await session.interactions.setMarkers(markers.slice(1));
    expect(changed).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().selection).toBeNull();
    const before = session.getSnapshot();
    await expect(session.interactions.setMarkers([marker, marker])).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    expect(session.getSnapshot()).toBe(before);
  });
  it('delegates picking through the explicit bridge, detaches data and keeps selected source identities', async () => {
    const pick: MapSelection = { ...nativeMarkerSelection(marker), distancePixels: 12 };
    const { session } = setup({ pickFeatures: async () => [pick, pick] });
    await session.interactions.setMarkers([marker]);
    const features = await session.interactions.pickFeatures({ x: 40, y: 50 });
    expect(features).toHaveLength(1);
    expect(features[0]).not.toBe(pick);
    await session.interactions.selectFeature(features[0]!);
    expect(session.getSnapshot().selection).toMatchObject({
      sourceId: 'kmk-markers',
      layerId: 'kmk-marker-points',
    });
    const unavailable = setup();
    await expect(unavailable.session.interactions.pickFeatures({ x: 0, y: 0 })).rejects.toThrow(
      'FEATURE_QUERY_UNAVAILABLE',
    );
  });
  it('expands a selected cluster only on actual completion and cancels pending lookup on gesture', async () => {
    let expand: (zoom: number) => void = () => {};
    const { session } = setup({
      getCamera: async () => target,
      getClusterExpansionZoom: () =>
        new Promise<number>((resolve) => {
          expand = resolve;
        }),
    });
    const cluster: MapSelection = {
      key: 'cluster:4',
      id: '4',
      kind: 'cluster',
      coordinate: [127, 37],
      label: '2개 장소',
      sourceId: 'kmk-markers',
      clusterId: 4,
      count: 2,
    };
    const first = session.interactions.selectFeature(cluster);
    const rejected = expect(first).rejects.toMatchObject({ code: 'ABORTED' });
    session.regionChanged('will', target, true, 1);
    await rejected;
    expand(16);
    await flush();
    expect(session.getSnapshot().selection).toBeNull();
    const next = session.interactions.selectFeature(cluster);
    expand(16);
    await flush();
    expect(session.getSnapshot().selection).toBeNull();
    const expanded = { ...target, zoom: 16 };
    session.regionChanged('will', expanded, false, 2);
    session.regionChanged('did', expanded, false, 3);
    await next;
    expect(session.getSnapshot().selection?.kind).toBe('cluster');
    await session.interactions.setMarkers([marker]);
    expect(session.getSnapshot().selection).toBeNull();
  });
  it('rejects stale marker selections and cluster expansion after a marker generation change', async () => {
    let resolveZoom: (zoom: number) => void = () => {};
    const { session, bridge } = setup({
      getCamera: async () => target,
      getClusterExpansionZoom: () =>
        new Promise<number>((resolve) => {
          resolveZoom = resolve;
        }),
    });
    await expect(session.interactions.selectFeature(nativeMarkerSelection(marker))).rejects.toThrow(
      'MARKER_NOT_FOUND',
    );
    const cluster: MapSelection = {
      key: 'cluster:1',
      id: '1',
      kind: 'cluster',
      coordinate: [127, 37],
      label: '2개 장소',
      sourceId: 'kmk-markers',
      clusterId: 1,
      count: 2,
    };
    const pending = session.interactions.selectFeature(cluster);
    const aborted = expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
    await session.interactions.setMarkers([marker]);
    resolveZoom(16);
    await aborted;
    expect(bridge.setCamera).not.toHaveBeenCalled();
    expect(session.getSnapshot().selection).toBeNull();
  });
  it('limits overlapping native pick results to eight deterministic detached candidates', async () => {
    const selections: MapSelection[] = Array.from({ length: 20 }, (_, id) => ({
      key: `poi:${id}`,
      id: String(id),
      kind: 'poi',
      coordinate: [127, 37],
      label: `Synthetic ${id}`,
      distancePixels: 20 - id,
    }));
    const { session } = setup({ pickFeatures: async () => selections });
    const candidates = await session.interactions.pickFeatures({ x: 100, y: 100 });
    expect(candidates).toHaveLength(8);
    expect(candidates[0]?.id).toBe('19');
    expect(Object.isFrozen(candidates)).toBe(true);
  });
  it('destroys only the extension when asked, while map destruction cancels all pending motion and ignores late callbacks', async () => {
    const first = setup();
    first.session.interactions.destroy();
    await first.session.api.setZoom(5);
    await expect(first.session.interactions.setMarkers([])).rejects.toThrow(
      'INTERACTION_DESTROYED',
    );
    const { session, changed } = setup();
    const pending = session.interactions.transitionCamera(target);
    const rejected = expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
    session.api.destroy();
    await rejected;
    const calls = changed.mock.calls.length;
    session.regionChanged('did', target, false, 100);
    session.loaded();
    expect(changed).toHaveBeenCalledTimes(calls);
    expect(session.getSnapshot()).toMatchObject({ destroyed: true, selection: null, markers: [] });
  });
});

describe('Native logical touch, selection identities and opt-in clustering', () => {
  it('uses Android 48dp/iOS44pt targets and opt-in radius48/maxZoom13 clustering', () => {
    expect(nativeTouchRadius('android')).toBe(24);
    expect(nativeTouchRadius('ios')).toBe(22);
    expect(nativeClustering()).toEqual({ enabled: false, radius: 48, maxZoom: 13 });
    expect(nativeClustering(true)).toEqual({ enabled: true, radius: 48, maxZoom: 13 });
    expect(() => nativeClustering({ radius: 0 })).toThrow('INVALID_CLUSTERING');
    expect(() => nativeClustering({ maxZoom: 1.5 })).toThrow('INVALID_CLUSTERING');
    expect(() => nativeClustering({ maxZoom: 22 })).toThrow('INVALID_CLUSTERING');
    const layers = ['korea-poi'];
    const copied = nativePickLayers(layers);
    layers.length = 0;
    expect(copied).toEqual(['korea-poi']);
    expect(() => nativePickLayers(['kmk-selection'])).toThrow('INVALID_PICK_LAYERS');
  });
  it('normalizes rendered Point features with explicit source/layer identities and Korean fallback without raw properties', () => {
    const feature: GeoJSON.Feature = {
      type: 'Feature',
      id: 9,
      geometry: { type: 'Point', coordinates: [127, 37] },
      properties: { 'name:ko': '합성 장소', name: 'Synthetic', privateValue: 'excluded' },
    };
    const selection = nativeFeatureSelection(feature, 'operator-poi', 'poi-layer', new Map());
    expect(selection).toMatchObject({
      key: 'poi:operator-poi:poi-layer:9',
      label: '합성 장소',
      sourceId: 'operator-poi',
      layerId: 'poi-layer',
    });
    expect(selection).not.toHaveProperty('properties');
    expect(
      nativeFeatureSelection(
        { ...feature, properties: { fid: 'node/9', 'name:ko': ' ', name: 'Fallback' } },
        's',
        'l',
        new Map(),
      )?.label,
    ).toBe('Fallback');
    expect(
      nativeFeatureSelection(
        { ...feature, properties: { fid: 'node/9007199254740993', name: 'Synthetic' } },
        's',
        'l',
        new Map(),
      )?.id,
    ).toBe('node/9007199254740993');
    expect(
      nativeFeatureSelection(
        { ...feature, geometry: { type: 'Point', coordinates: [127, 91] } },
        's',
        'l',
        new Map(),
      ),
    ).toBeNull();
    expect(
      nativeFeatureSelection(
        { ...feature, properties: { id: marker.id } },
        'kmk-markers',
        'kmk-marker-points',
        new Map([[marker.id, marker]]),
      ),
    ).toMatchObject({ kind: 'marker', key: 'marker:park' });
    expect(
      nativeFeatureSelection(
        { ...feature, properties: { cluster: true, cluster_id: 4, point_count: 1000 } },
        'kmk-markers',
        'kmk-marker-clusters',
        new Map(),
      ),
    ).toMatchObject({ kind: 'cluster', clusterId: 4, count: 1000 });
  });
  it('queries a logical-radius box, excludes diagonal false positives and reuses same-coordinate projections', async () => {
    const make = (id: number): GeoJSON.Feature => ({
      type: 'Feature',
      id,
      geometry: { type: 'Point', coordinates: [127 + id, 37] },
      properties: { name: `Synthetic ${id}` },
    });
    const query = vi.fn(async () => [make(0), make(1)]);
    const project = vi.fn(async ([longitude]: [number, number]): Promise<[number, number]> =>
      longitude === 127 ? [70, 50] : [73, 73],
    );
    const result = await pickNativeRenderedFeatures({
      point: { x: 50, y: 50 },
      radius: 24,
      layers: [
        { id: 'a', source: 's' },
        { id: 'b', source: 's' },
      ],
      markers: new Map(),
      query,
      project,
      isCurrent: () => true,
    });
    expect(query).toHaveBeenCalledWith(
      [
        [26, 26],
        [74, 74],
      ],
      'a',
    );
    expect(project).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
    expect(result.every((selection) => selection.distancePixels === 20)).toBe(true);
    expect(new Set(result.map((selection) => selection.layerId))).toEqual(new Set(['a', 'b']));
  });
  it('drops stale/cancelled native queries before further projection work', async () => {
    let current = true;
    const project = vi.fn(async (): Promise<[number, number]> => [0, 0]);
    await expect(
      pickNativeRenderedFeatures({
        point: { x: 0, y: 0 },
        radius: 22,
        layers: [{ id: 'a', source: 's' }],
        markers: new Map(),
        query: async () => {
          current = false;
          return [];
        },
        project,
        isCurrent: () => current,
      }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
    expect(project).not.toHaveBeenCalled();
  });
  it('keeps only the newest tap and invalidates candidates when a list choice, close or data generation cancels them', () => {
    const requests = createNativePickRequests();
    const older = requests.begin(),
      newer = requests.begin();
    expect(requests.isCurrent(older)).toBe(false);
    expect(requests.isCurrent(newer)).toBe(true);
    requests.cancel();
    expect(requests.isCurrent(newer)).toBe(false);
    const next = requests.begin();
    expect(requests.isCurrent(next)).toBe(true);
    requests.cancel();
    expect(requests.isCurrent(next)).toBe(false);
  });
  it('requires projected containment and a fitted axis in the inset viewport, preventing older wider views from completing a fit', () => {
    const frame = {
      width: 390,
      height: 600,
      insets: { left: 10, right: 10, top: 20, bottom: 180 },
      zoom: 13,
      bearing: 0,
      pitch: 0,
    };
    expect(nativeBoundsFit({ ...frame, northWest: [10, 80], southEast: [380, 360] })).toBe(true);
    expect(nativeBoundsFit({ ...frame, northWest: [100, 100], southEast: [200, 200] })).toBe(false);
    expect(nativeBoundsFit({ ...frame, northWest: [10, 100], southEast: [380, 380] })).toBe(false);
    expect(nativeBoundsFit({ ...frame, northWest: [0, 80], southEast: [380, 360] })).toBe(false);
    expect(
      nativeBoundsFit({ ...frame, northWest: [10, 80], southEast: [380, 360], bearing: 20 }),
    ).toBe(false);
    expect(
      nativeBoundsFit({ ...frame, northWest: [100, 100], southEast: [100, 100], zoom: 22 }),
    ).toBe(false);
    expect(
      nativeBoundsFit({ ...frame, northWest: [195, 220], southEast: [195, 220], zoom: 22 }),
    ).toBe(true);
  });
});
