import { expect, it, vi } from 'vitest';
import { createMap } from '@korea-map-kit/web';
const mock = vi.hoisted(() => ({ construct: vi.fn(), remove: vi.fn() }));
vi.mock('maplibre-gl', () => ({
  setWorkerUrl: vi.fn(),
  Map: class {
    constructor(options: unknown) {
      mock.construct(options);
    }
    remove = mock.remove;
  },
}));
it('does not construct renderer when required config is absent', async () => {
  // Simulates a JavaScript consumer bypassing TypeScript.
  await expect(
    createMap({
      container: {} as HTMLElement,
      workerUrl: '/vendor/maplibre/maplibre-gl-worker.mjs',
      config: undefined as never,
    }),
  ).rejects.toThrow('CONFIG_REQUIRED');
  expect(mock.construct).not.toHaveBeenCalled();
});
it('rejects invalid camera before renderer construction', async () => {
  await expect(
    createMap({
      container: {} as HTMLElement,
      workerUrl: '/vendor/maplibre/maplibre-gl-worker.mjs',
      config: { mode: 'local-fixture', fixtureId: 'synthetic-v1' },
      center: [0, 89],
    }),
  ).rejects.toThrow('OUTSIDE_MERCATOR');
  expect(mock.construct).not.toHaveBeenCalled();
});
it('constructs only explicit local style and removes once', async () => {
  const handle = await createMap({
    container: {} as HTMLElement,
    workerUrl: '/vendor/maplibre/maplibre-gl-worker.mjs',
    config: { mode: 'local-fixture', fixtureId: 'synthetic-v1' },
  });
  const options = mock.construct.mock.calls[0]?.[0] as {
    style: object;
    transformRequest: () => void;
  };
  expect(JSON.stringify(options.style)).not.toMatch(/https?:/);
  expect(options.transformRequest).toThrow('forbids remote resources');
  handle.destroy();
  handle.destroy();
  expect(mock.remove).toHaveBeenCalledTimes(1);
});
