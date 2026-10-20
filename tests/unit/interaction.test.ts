import { describe, expect, it, vi } from 'vitest';
import {
  createCancellationSource,
  createMapInteractionController,
  type CameraTransitionOptions,
  type MapCamera,
  type MapInteractionEvent,
  type MapInteractionPort,
  type MapMarker,
  type MapSelection,
  type NormalizedCameraTransition,
  type OperationContext,
  type Scheduler,
} from 'korea-map-core';

const camera = (): MapCamera => ({ center: [127, 37], zoom: 13, bearing: 10, pitch: 20 });
const selection = (key = 'own', extra: Partial<MapSelection> = {}): MapSelection => ({
  key,
  id: key,
  kind: 'marker',
  coordinate: [127, 37],
  label: '자체 합성 장소',
  ...extra,
});
function harness() {
  const timers = new Set<{ callback: () => void; delay: number }>();
  const scheduler: Scheduler = {
    schedule(callback, delay) {
      const task = { callback, delay };
      timers.add(task);
      return () => {
        timers.delete(task);
      };
    },
  };
  const listeners = new Set<(event: MapInteractionEvent) => void>();
  const emit = (event: MapInteractionEvent) => {
    for (const listener of [...listeners]) listener(event);
  };
  const motions: Array<{
    value: unknown;
    transition?: NormalizedCameraTransition;
    context: OperationContext;
    stopped: boolean;
    complete(): void;
  }> = [];
  function movement(
    value: unknown,
    transition: NormalizedCameraTransition | undefined,
    context: OperationContext,
  ) {
    if (transition?.durationMs === 0) return;
    return new Promise<void>((resolve) => {
      const record = {
        value,
        ...(transition ? { transition } : {}),
        context,
        stopped: false,
        complete: () => {},
      };
      const off = context.signal.subscribe(() => {
        record.stopped = true;
      });
      record.complete = () => {
        off();
        resolve();
      };
      motions.push(record);
    });
  }
  const batches: Array<readonly MapMarker[]> = [];
  let results: readonly MapSelection[] = [];
  const destroyed = vi.fn();
  const detached = vi.fn();
  const port: MapInteractionPort = {
    transitionCamera: vi.fn((value, transition, context) => movement(value, transition, context)),
    fitBounds: vi.fn((value, transition, context) => movement(value, transition, context)),
    setMarkers: vi.fn((markers) => {
      batches.push(markers);
    }),
    pickFeatures: vi.fn(() => results),
    selectFeature: vi.fn((value, context) => {
      emit({ type: 'selection', selection: value });
      if (value?.kind === 'cluster') return movement(value, undefined, context);
    }),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        detached();
      };
    },
    destroy: destroyed,
  };
  const api = createMapInteractionController(port, scheduler);
  return {
    api,
    port,
    motions,
    batches,
    timers,
    emit,
    listeners,
    destroyed,
    detached,
    setResults(values: readonly MapSelection[]) {
      results = values;
    },
    expire() {
      for (const timer of [...timers]) timer.callback();
    },
  };
}

describe('optional portable map interactions', () => {
  it('constructs without commands, resources or timers and snapshots a camera with default transition values', async () => {
    const h = harness();
    expect(h.motions).toHaveLength(0);
    expect(h.timers.size).toBe(0);
    expect(h.port.setMarkers).not.toHaveBeenCalled();
    const input = {
      ...camera(),
      center: [127, 37] as [number, number],
      rawEngineProperties: { unused: true },
    };
    const pending = h.api.transitionCamera(input);
    input.center[0] = 128;
    expect(h.motions[0]?.value).toEqual(camera());
    expect(h.motions[0]?.transition).toEqual({
      durationMs: 300,
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
      reducedMotion: false,
    });
    expect(Object.isFrozen(h.motions[0]?.value)).toBe(true);
    let completed = false;
    void pending.then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);
    h.motions[0]!.complete();
    await pending;
    expect(h.timers.size).toBe(0);
    h.api.destroy();
  });
  it('normalizes independent edge insets and reduced motion without losing the fit bounds', async () => {
    const h = harness();
    const bounds = { west: 179, south: -10, east: -179, north: 10 };
    const fit = { durationMs: 900, insets: { left: 40, bottom: 180 }, reducedMotion: true };
    await h.api.fitBounds(bounds, fit);
    expect(h.port.fitBounds).toHaveBeenCalledWith(
      bounds,
      { durationMs: 0, insets: { top: 0, right: 0, bottom: 180, left: 40 }, reducedMotion: true },
      expect.anything(),
    );
    const input = { durationMs: 600, insets: { top: 50 } };
    const pending = h.api.transitionCamera(camera(), input);
    input.insets.top = 999;
    expect(h.motions[0]?.transition?.insets.top).toBe(50);
    h.motions[0]!.complete();
    await pending;
    h.api.destroy();
  });
  it('rejects invalid camera, duration, insets, coordinates and cancellation without dispatch', async () => {
    const h = harness();
    for (const input of [
      { durationMs: -1 },
      { durationMs: 10001 },
      { durationMs: NaN },
      { durationMs: null },
      { insets: { top: -1 } },
      { insets: { right: Infinity } },
      { insets: { bottom: 1001 } },
      { insets: { top: null } },
      { reducedMotion: 'yes' },
    ]) {
      await expect(
        h.api.transitionCamera(camera(), input as CameraTransitionOptions),
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    }
    await expect(h.api.transitionCamera({ ...camera(), center: [37, 127] })).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    await expect(h.api.fitBounds({ west: 0, east: 1, south: 2, north: 1 })).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    await expect(h.api.pickFeatures({ x: NaN, y: 1 })).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    expect(h.port.transitionCamera).not.toHaveBeenCalled();
    expect(h.port.fitBounds).not.toHaveBeenCalled();
    h.api.destroy();
  });
  it('snapshots a batch of 1000 markers in one call and rejects duplicates before mutation', async () => {
    const h = harness();
    const markers = Array.from({ length: 1000 }, (_, n) => ({
      id: String(n),
      coordinate: [127 + n / 100000, 37] as [number, number],
      label: '합성',
      engineProperties: { unused: true },
    }));
    await h.api.setMarkers(markers);
    markers[0]!.coordinate[0] = 128;
    expect(h.batches).toHaveLength(1);
    expect(h.batches[0]).toHaveLength(1000);
    expect(h.batches[0]![0]).toEqual({ id: '0', coordinate: [127, 37], label: '합성' });
    expect(Object.isFrozen(h.batches[0])).toBe(true);
    await expect(h.api.setMarkers([markers[0]!, markers[0]!])).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    await expect(h.api.setMarkers(new Array(1))).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    expect(h.batches).toHaveLength(1);
    h.api.destroy();
  });
  it('sorts by priority, pixel distance and key, deduplicates and returns at most eight detached selections', async () => {
    const h = harness();
    const picked = [
      selection('b', { distancePixels: 4 }),
      selection('a', { distancePixels: 4 }),
      selection('b', { priority: 1, distancePixels: 1 }),
      selection('first', { priority: -1, distancePixels: 99 }),
      selection('far', { distancePixels: 5 }),
      ...Array.from({ length: 10 }, (_, n) =>
        selection(`extra-${n}`, { priority: 2, distancePixels: 0 }),
      ),
    ];
    const raw = {
      ...picked[0]!,
      coordinate: [127, 37] as [number, number],
      properties: { privateEngineField: 'ignored' },
    };
    picked[0] = raw;
    h.setResults(picked);
    const result = await h.api.pickFeatures({ x: 10, y: 20 });
    raw.coordinate[0] = 128;
    expect(result.map((value) => value.key)).toEqual([
      'first',
      'a',
      'b',
      'far',
      'extra-0',
      'extra-1',
      'extra-2',
      'extra-3',
    ]);
    expect(result[2]?.coordinate).toEqual([127, 37]);
    expect(result[2]).not.toHaveProperty('properties');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[2]?.coordinate)).toBe(true);
    h.setResults([selection('bad', { priority: Infinity })]);
    await expect(h.api.pickFeatures({ x: 0, y: 0 })).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    h.setResults(new Array(1));
    await expect(h.api.pickFeatures({ x: 0, y: 0 })).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    h.api.destroy();
  });
  it('selection sends only typed detached fields and event callbacks cannot break other listeners', async () => {
    const h = harness();
    const received: MapInteractionEvent[] = [];
    h.api.onEvent(() => {
      throw new Error('Consumer callback');
    });
    const off = h.api.onEvent((event) => received.push(event));
    const input = {
      ...selection(),
      coordinate: [127, 37] as [number, number],
      rawProperties: { unused: true },
    };
    await h.api.selectFeature(input);
    input.coordinate[0] = 128;
    expect(received).toEqual([{ type: 'selection', selection: selection() }]);
    expect(h.port.selectFeature).toHaveBeenCalledWith(selection(), expect.anything());
    off();
    off();
    await h.api.selectFeature(null);
    expect(received).toHaveLength(1);
    h.api.destroy();
  });
  it('caller cancellation aborts the port in place and releases deadline and caller subscriptions', async () => {
    const h = harness();
    const source = createCancellationSource();
    let subscriptions = 0;
    const signal = {
      get aborted() {
        return source.signal.aborted;
      },
      subscribe(listener: () => void) {
        subscriptions++;
        const off = source.signal.subscribe(listener);
        return () => {
          subscriptions--;
          off();
        };
      },
    };
    const pending = h.api.transitionCamera(camera(), { signal });
    const rejected = expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
    source.cancel();
    await rejected;
    expect(h.motions[0]?.stopped).toBe(true);
    expect(h.port.transitionCamera).toHaveBeenCalledTimes(1);
    expect(subscriptions).toBe(0);
    expect(h.timers.size).toBe(0);
    h.api.destroy();
  });
  it('motion timeout rejects ABORTED, signals stop and ignores late movement completion', async () => {
    const h = harness();
    const pending = h.api.transitionCamera(camera(), { timeoutMs: 20 });
    const rejected = expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
    h.expire();
    await rejected;
    h.motions[0]!.complete();
    await Promise.resolve();
    expect(h.motions[0]?.stopped).toBe(true);
    expect(h.port.transitionCamera).toHaveBeenCalledTimes(1);
    expect(h.timers.size).toBe(0);
    h.api.destroy();
  });
  it('a new camera preempts the previous move and a late old completion cannot untrack the new move', async () => {
    const h = harness();
    const old = h.api.transitionCamera(camera());
    const oldRejected = expect(old).rejects.toMatchObject({ code: 'ABORTED' });
    const next = h.api.transitionCamera({ ...camera(), zoom: 15 });
    const nextRejected = expect(next).rejects.toMatchObject({ code: 'ABORTED' });
    await oldRejected;
    h.motions[0]!.complete();
    await Promise.resolve();
    expect(h.motions[1]?.context.signal.aborted).toBe(false);
    h.emit({ type: 'gesture' });
    await nextRejected;
    expect(h.motions.every((motion) => motion.stopped)).toBe(true);
    expect(h.timers.size).toBe(0);
    h.api.destroy();
  });
  it('gesture-origin camera events cancel motion while API camera events do not', async () => {
    const h = harness();
    const pending = h.api.transitionCamera(camera());
    const rejected = expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
    h.emit({ type: 'camera', camera: camera(), origin: 'api' });
    expect(h.motions[0]?.stopped).toBe(false);
    h.emit({ type: 'camera', camera: camera(), origin: 'gesture' });
    await rejected;
    expect(h.motions[0]?.stopped).toBe(true);
    const next = h.api.transitionCamera(camera());
    const nextRejected = expect(next).rejects.toMatchObject({ code: 'ABORTED' });
    h.emit({ type: 'camera', camera: { ...camera(), zoom: Infinity }, origin: 'gesture' });
    await nextRejected;
    expect(h.motions[1]?.stopped).toBe(true);
    h.api.destroy();
  });
  it('invalid or pre-cancelled replacement does not interrupt a valid active movement', async () => {
    const h = harness();
    const pending = h.api.transitionCamera(camera());
    await expect(h.api.transitionCamera({ ...camera(), zoom: 30 })).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    await expect(h.api.transitionCamera(camera(), { timeoutMs: 0 })).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    const source = createCancellationSource();
    source.cancel();
    await expect(h.api.transitionCamera(camera(), { signal: source.signal })).rejects.toMatchObject(
      { code: 'ABORTED' },
    );
    expect(h.motions[0]?.context.signal.aborted).toBe(false);
    expect(h.port.transitionCamera).toHaveBeenCalledTimes(1);
    h.motions[0]!.complete();
    await pending;
    h.api.destroy();
  });
  it('cluster selection participates in the same latest movement cancellation lifecycle', async () => {
    const h = harness();
    const cluster = h.api.selectFeature(
      selection('cluster', { kind: 'cluster', clusterId: 42, count: 20 }),
    );
    const rejected = expect(cluster).rejects.toMatchObject({ code: 'ABORTED' });
    await h.api.transitionCamera(camera(), { durationMs: 0 });
    await rejected;
    expect(h.motions[0]?.context.signal.aborted).toBe(true);
    h.api.destroy();
  });
  it('destroy cancels uncooperative ports, emits once, detaches once and leaves base-map ownership to the adapter', async () => {
    const h = harness();
    const events: string[] = [];
    h.api.onEvent((event) => events.push(event.type));
    const pending = h.api.transitionCamera(camera());
    const rejected = expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
    h.api.destroy();
    h.api.destroy();
    await rejected;
    expect(events).toEqual(['destroyed']);
    expect(h.destroyed).toHaveBeenCalledTimes(1);
    expect(h.detached).toHaveBeenCalledTimes(1);
    expect(h.listeners.size).toBe(0);
    expect(h.timers.size).toBe(0);
    await expect(h.api.transitionCamera(camera())).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(() => h.api.onEvent(() => {})).toThrow('INTERACTION_DESTROYED');
  });
  it('adapter destruction cancels work without recursively destroying the adapter again', async () => {
    const h = harness();
    const pending = h.api.transitionCamera(camera());
    const rejected = expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
    h.emit({ type: 'destroyed' });
    await rejected;
    h.api.destroy();
    expect(h.destroyed).not.toHaveBeenCalled();
    expect(h.detached).toHaveBeenCalledTimes(1);
  });
});
