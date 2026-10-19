import { afterEach, expect, it, vi } from 'vitest';
import { boundsFromCoordinates, createMapController, type MapCommand } from 'korea-map-core';
import {
  createScenarioSession,
  storageKey,
  type DemoStorage,
} from '../../examples/scenarios/src/index.js';
const scheduler = {
  schedule(fn: () => void, ms: number) {
    const timer = setTimeout(fn, ms);
    return () => clearTimeout(timer);
  },
};
afterEach(() => vi.useRealTimers());
function harness() {
  const commands: MapCommand[] = [];
  const subscriptions = new Set<unknown>();
  const map = createMapController(
    {
      execute(command) {
        commands.push(command);
      },
      getVisibleBounds: async () => ({ west: 126, east: 128, south: 37, north: 38 }),
      subscribe(listener) {
        subscriptions.add(listener);
        return () => {
          subscriptions.delete(listener);
        };
      },
      destroy() {},
    },
    scheduler,
  );
  let text: string | null = null;
  const storage: DemoStorage = {
    async getItem() {
      return text;
    },
    async setItem(key, value) {
      expect(key).toBe(storageKey);
      text = value;
    },
    async removeItem() {
      text = null;
    },
  };
  return { commands, map, storage, subscriptions, read: () => text };
}
it('coordinate bounds finds the short dateline arc, handles duplicates and rejects empty/sparse/polar points', () => {
  expect(
    boundsFromCoordinates([
      [179, 10],
      [-179, -10],
    ]),
  ).toEqual({ west: 179, east: -179, south: -10, north: 10 });
  expect(
    boundsFromCoordinates([
      [127, 37],
      [127, 37],
    ]),
  ).toEqual({ west: 127, east: 127, south: 37, north: 37 });
  expect(
    boundsFromCoordinates([
      [180, 0],
      [-180, 0],
    ]),
  ).toEqual({ west: -180, east: -180, south: 0, north: 0 });
  for (const value of [[], new Array(1), [[0, 90]], [[NaN, 0]]])
    expect(() => boundsFromCoordinates(value as [number, number][])).toThrow();
  const points = [
    [128, 38],
    [126, 36],
    [127, 37],
  ] as const;
  expect(boundsFromCoordinates(points)).toEqual({ west: 126, east: 128, south: 36, north: 38 });
  expect(points[0]).toEqual([128, 38]);
});
it('walk uses the common controller, pauses without new points, persists/reloads/replays and cleans all timers', async () => {
  vi.useFakeTimers();
  const h = harness();
  const session = createScenarioSession(
    'walk',
    h.map,
    h.storage,
    scheduler,
    { monotonicMs: () => Date.now() },
    () => {},
  );
  await session.initialize();
  await session.current();
  await session.start();
  await vi.advanceTimersByTimeAsync(3100);
  expect(session.getSnapshot().points).toBe(4);
  session.pause();
  await vi.advanceTimersByTimeAsync(5000);
  expect(session.getSnapshot().points).toBe(4);
  await session.resume();
  await vi.advanceTimersByTimeAsync(2000);
  await session.finish();
  await session.saveWalk();
  expect(session.getSnapshot().saved.walks[0]?.segments).toHaveLength(2);
  expect(h.read()).toContain('demo-walk-');
  const before = h.commands.length;
  session.dispose();
  await vi.advanceTimersByTimeAsync(10000);
  expect(h.commands.length).toBe(before);
  expect(h.subscriptions.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  const reloaded = createScenarioSession(
    'walk',
    h.map,
    h.storage,
    scheduler,
    { monotonicMs: () => Date.now() },
    () => {},
  );
  await reloaded.initialize();
  expect(reloaded.getSnapshot().saved.walks).toHaveLength(1);
  await reloaded.replay(reloaded.getSnapshot().saved.walks[0]!.id);
  await vi.advanceTimersByTimeAsync(5000);
  expect(reloaded.getSnapshot().status).toBe('경로 다시 보기 완료');
  await reloaded.theme('outdoor');
  expect(reloaded.getSnapshot().theme).toBe('outdoor');
  await reloaded.reset();
  expect(h.read()).toBeNull();
  reloaded.dispose();
});
it('trip persists days, de-duplicates pins, clears old routes, supports empty search and camera focus using common API', async () => {
  const h = harness();
  const session = createScenarioSession(
    'trip',
    h.map,
    h.storage,
    scheduler,
    { monotonicMs: () => 0 },
    () => {},
  );
  await session.initialize();
  await session.search('공 원');
  expect(session.getSnapshot().results).toHaveLength(1);
  await session.search('없는가상장소');
  expect(session.getSnapshot().results).toHaveLength(0);
  await session.savePlace('park');
  await session.savePlace('park');
  await session.savePlace('museum');
  expect(session.getSnapshot().saved.visits).toHaveLength(2);
  expect(h.commands.some((c) => c.type === 'geojson' && c.id === 'trip-order')).toBe(true);
  await session.day(2);
  await session.savePlace('cafe');
  await session.focus('cafe');
  expect(h.commands.at(-1)).toMatchObject({ type: 'zoom', zoom: 16 });
  await session.removePlace('cafe');
  expect(session.getSnapshot().saved.visits).toHaveLength(2);
  session.dispose();
  const next = createScenarioSession(
    'trip',
    h.map,
    h.storage,
    scheduler,
    { monotonicMs: () => 0 },
    () => {},
  );
  await next.initialize();
  expect(next.getSnapshot().saved.visits.map((v) => v.day)).toEqual([1, 1]);
  next.dispose();
});
it('storage corruption is not overwritten; denied writes retain the previous state and can recover', async () => {
  const h = harness();
  let writes = 0;
  const storage = {
    ...h.storage,
    getItem: async () => '{bad',
    setItem: async () => {
      writes++;
    },
  };
  const session = createScenarioSession(
    'trip',
    h.map,
    storage,
    scheduler,
    { monotonicMs: () => 0 },
    () => {},
  );
  await session.initialize();
  expect(session.getSnapshot().status).toContain('저장 자료 오류');
  await session.savePlace('park');
  expect(writes).toBe(0);
  expect(session.getSnapshot().saved.visits).toEqual([]);
  await session.reset();
  await session.savePlace('park');
  expect(writes).toBe(1);
  session.dispose();
  const denied = createScenarioSession(
    'trip',
    h.map,
    {
      ...h.storage,
      setItem: async () => {
        throw new Error('quota');
      },
    },
    scheduler,
    { monotonicMs: () => 0 },
    () => {},
  );
  await denied.initialize();
  await denied.savePlace('park');
  expect(denied.getSnapshot().saved.visits).toEqual([]);
  expect(denied.getSnapshot().status).toContain('오류');
  denied.dispose();
});
