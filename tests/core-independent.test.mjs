import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

test('core runs in an isolated directory without node_modules, MapLibre or browser globals', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kmk-core-'));
  const previousFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error('Network forbidden');
  };
  try {
    cpSync('packages/core/dist', dir, { recursive: true });
    const core = await import(pathToFileURL(join(dir, 'index.js')).href);
    assert.equal(typeof globalThis.window, 'undefined');
    const commands = [];
    const map = core.createMapController(
      {
        execute: (command) => {
          commands.push(command);
        },
        getVisibleBounds: () => ({ west: 126, south: 36, east: 128, north: 38 }),
        subscribe: () => () => {},
        destroy: () => {},
      },
      {
        schedule(callback, delay) {
          const timer = globalThis.setTimeout(callback, delay);
          return () => globalThis.clearTimeout(timer);
        },
      },
    );
    await map.setCenter([127, 37]);
    await map.setZoom(14);
    await map.fitBounds({ west: 126, south: 36, east: 128, north: 38 });
    await map.setStyle(core.defineMapStyle({ version: 8, sources: {}, layers: [] }, 'MIT'));
    await map.addMarker({ id: 'a', coordinate: [127, 37], label: 'A' });
    await map.removeMarker('a');
    await map.addGeoJSON('empty', { type: 'FeatureCollection', features: [] });
    await map.showRoute({
      id: 'walk',
      coordinates: [
        [127, 37],
        [127.01, 37],
      ],
    });
    assert.equal((await map.getVisibleBounds()).west, 126);
    assert.equal(commands.length, 8);
    await assert.rejects(map.setCenter([37, 127]), { code: 'INVALID_ARGUMENT' });
    map.destroy();
    await assert.rejects(map.setZoom(2), { code: 'UNAVAILABLE' });
    const queries = [];
    const client = core.createPlacesClient(
      {
        query: async (query) => {
          queries.push(query);
          return [];
        },
      },
      {
        schedule(callback, delay) {
          const timer = globalThis.setTimeout(callback, delay);
          return () => globalThis.clearTimeout(timer);
        },
      },
    );
    await client.getNearbyPlaces({ center: [127, 37], radiusMeters: 100 });
    await client.getPlacesInBounds({ bounds: { west: 126, south: 36, east: 128, north: 38 } });
    await client.getPlacesByCategory({ category: 'park' });
    assert.deepEqual(
      queries.map((q) => q.kind),
      ['nearby', 'bounds', 'category'],
    );
  } finally {
    globalThis.fetch = previousFetch;
    rmSync(dir, { recursive: true, force: true });
  }
});
