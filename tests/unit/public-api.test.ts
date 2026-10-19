import { expect, it, vi, afterEach } from 'vitest';
import {
  assertLngLat,
  createCancellationSource,
  createMapController,
  defineMapStyle,
  defineMapLayer,
  KitError,
  LocationError,
  normalizeVisibleBounds,
  routeToGeoJSON,
  runOperation,
  validateBounds,
  validateGeoJSON,
  validateMarkers,
  type MapCommand,
  type MapPort,
  type Scheduler,
} from '@korea-map-kit/core';
import {
  createNativeMapSession,
  validateNativeStyle,
} from '../../packages/native/src/controller.js';
const scheduler: Scheduler = {
  schedule(callback, delay) {
    const timer = setTimeout(callback, delay);
    return () => clearTimeout(timer);
  },
};
const style = () =>
  defineMapStyle(
    {
      version: 8,
      sources: {},
      layers: [{ id: 'base', type: 'background', paint: { 'background-color': '#eef5ef' } }],
    },
    'Own synthetic data · MIT',
  );
afterEach(() => vi.useRealTimers());
function port() {
  const commands: MapCommand[] = [];
  const removed = vi.fn();
  const destroy = vi.fn();
  const adapter: MapPort = {
    execute: (command) => {
      commands.push(command);
    },
    getVisibleBounds: () => ({ west: 126, south: 36, east: 128, north: 38 }),
    subscribe: () => removed,
    destroy,
  };
  return { commands, removed, destroy, api: createMapController(adapter, scheduler) };
}
it('uses longitude first, validates bounds and normalizes world copies/dateline', () => {
  expect(() => assertLngLat([37, 127])).toThrow('INVALID_COORDINATE');
  expect(validateBounds({ west: 170, south: -10, east: -170, north: 10 }).west).toBe(170);
  expect(normalizeVisibleBounds(170, -10, 190, 10)).toEqual({
    west: 170,
    south: -10,
    east: -170,
    north: 10,
  });
  expect(normalizeVisibleBounds(-240, -89, 240, 89)).toEqual({
    west: -180,
    south: -85.051129,
    east: 180,
    north: 85.051129,
  });
  expect(() => validateBounds({ west: 0, south: 10, east: 1, north: 0 })).toThrow('INVALID_BOUNDS');
});
it('all requested methods dispatch validated copied contracts; teardown is idempotent', async () => {
  const p = port();
  const marker = { id: 'a', label: '합성', coordinate: [127, 37] as [number, number] };
  await p.api.setCenter(marker.coordinate);
  await p.api.setZoom(15);
  await p.api.setCamera({ center: [127, 37], zoom: 14, bearing: 20, pitch: 30 });
  await p.api.fitBounds({ west: 126, south: 36, east: 128, north: 38 }, { padding: 24 });
  await p.api.setStyle(style());
  await p.api.addMarker(marker);
  marker.coordinate[0] = 128;
  expect(p.commands.find((command) => command.type === 'marker')).toMatchObject({
    marker: { coordinate: [127, 37] },
  });
  await p.api.removeMarker('a');
  await p.api.addGeoJSON('point', {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [127, 37] } },
    ],
  });
  await p.api.showRoute({
    id: 'route',
    coordinates: [
      [127, 37],
      [128, 38],
    ],
    distanceMeters: 100,
  });
  await p.api.removeGeoJSON('point');
  expect(await p.api.getVisibleBounds()).toEqual({ west: 126, south: 36, east: 128, north: 38 });
  expect(p.commands.map((command) => command.type)).toEqual([
    'center',
    'zoom',
    'camera',
    'bounds',
    'style',
    'marker',
    'remove-marker',
    'geojson',
    'geojson',
    'remove-geojson',
  ]);
  p.api.onEvent(() => {});
  p.api.destroy();
  p.api.destroy();
  expect(p.destroy).toHaveBeenCalledTimes(1);
  expect(p.removed).toHaveBeenCalledTimes(1);
  await expect(p.api.setZoom(10)).rejects.toMatchObject({
    code: 'UNAVAILABLE',
    detail: 'MAP_DESTROYED',
  });
});
it('rejects invalid commands without mutating the adapter', async () => {
  const { api, commands } = port();
  await expect(api.setZoom(Infinity)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  await expect(
    api.fitBounds({ west: 0, south: 0, east: 1, north: 1 }, { padding: -1 }),
  ).rejects.toThrow('INVALID_PADDING');
  await expect(
    api.addGeoJSON('kmk-reserved', { type: 'FeatureCollection', features: [] }),
  ).rejects.toThrow('INVALID_ID');
  await expect(
    api.showRoute({ id: 'a', coordinates: [[127, 37]], durationSeconds: -1 }),
  ).rejects.toThrow('INVALID_ROUTE');
  await expect(api.addMarker({ id: '', label: 'x', coordinate: [127, 37] })).rejects.toThrow(
    'INVALID_MARKER',
  );
  expect(commands).toEqual([]);
  api.destroy();
});
it('JSON and geometry validators reject malformed data and executable values with stable errors', () => {
  for (const value of [
    null,
    { type: 'FeatureCollection', features: [null] },
    { type: 'FeatureCollection', features: [{ type: 'Feature', properties: [], geometry: null }] },
  ])
    expect(() => validateGeoJSON(value as never)).toThrow(KitError);
  expect(() =>
    defineMapStyle({ version: 8, sources: {}, layers: [], callback: () => {} }, 'MIT'),
  ).toThrow('INVALID_JSON');
  expect(() => defineMapStyle({ version: 8, sources: {}, layers: [] }, ' ')).toThrow(
    'INVALID_STYLE',
  );
  expect(() => defineMapStyle(JSON.parse('{"__proto__":{}}'), 'MIT')).toThrow('UNSAFE_JSON_KEY');
  expect(defineMapLayer({ id: 'operator', type: 'background' }).type).toBe('background');
  expect(() => defineMapLayer({ id: 'a', type: 'custom' })).toThrow('INVALID_LAYER');
  expect(() => routeToGeoJSON({ id: 'route', coordinates: [[127, 37]] })).toThrow(
    'INVALID_GEOJSON',
  );
  expect(() =>
    validateGeoJSON({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
              ],
            ],
          },
        },
      ],
    }),
  ).toThrow('INVALID_GEOJSON');
});
it('pre-cancel prevents invocation and explicit abort cancels pending work and timer', async () => {
  vi.useFakeTimers();
  const source = createCancellationSource();
  const operation = vi.fn();
  source.cancel();
  await expect(runOperation(operation, { signal: source.signal }, scheduler)).rejects.toMatchObject(
    { code: 'ABORTED' },
  );
  expect(operation).not.toHaveBeenCalled();
  const active = createCancellationSource();
  let aborted = false;
  const result = runOperation(
    ({ signal }) =>
      new Promise<void>(() => {
        signal.subscribe(() => {
          aborted = true;
        });
      }),
    { signal: active.signal },
    scheduler,
  );
  active.cancel();
  active.cancel();
  await expect(result).rejects.toMatchObject({ code: 'ABORTED' });
  expect(aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
it('deadline aborts adapter, ignores late success and releases listeners on success/failure', async () => {
  vi.useFakeTimers();
  let complete!: (value: string) => void;
  const cancel = vi.fn();
  const result = runOperation(
    ({ signal }) => {
      signal.subscribe(cancel);
      return new Promise<string>((resolve) => {
        complete = resolve;
      });
    },
    { timeoutMs: 25 },
    scheduler,
  );
  const checked = expect(result).rejects.toMatchObject({ code: 'TIMEOUT' });
  await vi.advanceTimersByTimeAsync(25);
  await checked;
  complete('late');
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
  let listeners = 0;
  const signal = {
    aborted: false,
    subscribe() {
      listeners++;
      return () => {
        listeners--;
      };
    },
  };
  expect(await runOperation(() => 42, { signal }, scheduler)).toBe(42);
  expect(listeners).toBe(0);
  await expect(
    runOperation(
      () => {
        throw new Error('private provider response');
      },
      { signal },
      scheduler,
    ),
  ).rejects.toMatchObject({ code: 'UNAVAILABLE', detail: 'OPERATION_FAILED' });
  expect(listeners).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  await expect(runOperation(() => 1, { timeoutMs: 0 }, scheduler)).rejects.toMatchObject({
    code: 'INVALID_ARGUMENT',
  });
  expect(new LocationError('PERMISSION_DENIED')).toMatchObject({
    name: 'LocationError',
    code: 'PERMISSION_DENIED',
  });
});
it('destroy cancels in-flight controller calls without waiting for an uncooperative bridge', async () => {
  vi.useFakeTimers();
  const api = createMapController(
    {
      execute: () => new Promise<void>(() => {}),
      getVisibleBounds: () => {
        throw new Error();
      },
      subscribe: () => () => {},
      destroy: () => {},
    },
    scheduler,
  );
  const pending = api.setZoom(12);
  api.destroy();
  await expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
  expect(vi.getTimerCount()).toBe(0);
});
it('native bridge implements common commands, style readiness, replacement and teardown (mock bridge, not device QA)', async () => {
  const setCamera = vi.fn(async () => {});
  const changed = vi.fn();
  const session = createNativeMapSession(
    style(),
    { setCamera, getBounds: async () => [170, -10, 190, 10] },
    scheduler,
    changed,
  );
  const events: string[] = [];
  session.api.onEvent((event) => events.push(event.type));
  await expect(session.api.setZoom(10)).rejects.toThrow('MAP_NOT_READY');
  session.loaded();
  await session.api.setCenter([127, 37]);
  await session.api.setZoom(15);
  await session.api.setCamera({ center: [127, 37], zoom: 14, pitch: 30, bearing: 20 });
  await session.api.fitBounds({ west: 170, south: -10, east: -170, north: 10 }, { padding: 10 });
  expect(setCamera).toHaveBeenLastCalledWith({
    bounds: [170, -10, 190, 10],
    duration: 0,
    bearing: 0,
    pitch: 0,
    padding: { top: 10, right: 10, bottom: 10, left: 10 },
  });
  await session.api.addMarker({ id: 'a', label: 'one', coordinate: [127, 37] });
  await session.api.addMarker({ id: 'a', label: 'two', coordinate: [127, 37] });
  expect(session.getSnapshot().markers).toHaveLength(1);
  await session.api.addGeoJSON('point', { type: 'FeatureCollection', features: [] });
  await session.api.showRoute({
    id: 'walk',
    coordinates: [
      [127, 37],
      [127.01, 37],
    ],
  });
  const replacement = session.api.setStyle(style());
  session.loaded();
  await replacement;
  expect(session.getSnapshot().overlays.size).toBe(2);
  expect(session.getSnapshot().markers).toHaveLength(1);
  expect(await session.api.getVisibleBounds()).toEqual({
    west: 170,
    south: -10,
    east: -170,
    north: 10,
  });
  await session.api.removeMarker('a');
  await session.api.removeMarker('missing');
  await session.api.removeGeoJSON('point');
  expect(session.getSnapshot().markers).toHaveLength(0);
  session.api.destroy();
  expect(session.getSnapshot().destroyed).toBe(true);
  expect(events).toEqual(['ready', 'ready', 'destroyed']);
});
it('native rejects remote/glyph styles before mutation and cancels an unfinished style load', async () => {
  vi.useFakeTimers();
  const remote = defineMapStyle(
    {
      version: 8,
      sources: {
        vector: { type: 'vector', tiles: ['https://tiles.example.invalid/{z}/{x}/{y}.pbf'] },
      },
      layers: [],
    },
    'operator',
  );
  expect(() => validateNativeStyle(remote)).toThrow('NATIVE_OFFLINE_GEOMETRY_STYLE_REQUIRED');
  const session = createNativeMapSession(
    style(),
    { setCamera: async () => {}, getBounds: async () => [0, 0, 1, 1] },
    scheduler,
    () => {},
  );
  session.loaded();
  await expect(session.api.setStyle(remote)).rejects.toMatchObject({ code: 'UNSUPPORTED' });
  await session.api.setZoom(12);
  const pending = session.api.setStyle(style(), { timeoutMs: 5 });
  const checked = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' });
  await vi.advanceTimersByTimeAsync(5);
  await checked;
  expect(session.getSnapshot().destroyed).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it('rejects sparse arrays instead of skipping missing coordinates or markers', () => {
  expect(() => assertLngLat(new Array(2))).toThrow('INVALID_COORDINATE');
  expect(() => validateMarkers(new Array(1))).toThrow('INVALID_COORDINATE');
  expect(() => defineMapStyle({ version: 8, sources: {}, layers: new Array(1) }, 'MIT')).toThrow(
    'INVALID_JSON',
  );
});
