// Optional real-data QA. Public road sample coordinates, never user GPS history.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createLocalRoutingProvider } from '../services/routing/dist/index.js';
const manifest = JSON.parse(readFileSync(process.env.ROUTING_DATASET_FILE, 'utf8'));
assert.equal(manifest.dataset.source, 'osm-geofabrik-kr');
assert.equal(manifest.smokePassed, true);
const provider = createLocalRoutingProvider(process.env.ROUTING_ENGINE_URL, manifest.dataset);
const start = [126.977, 37.5663],
  finish = [126.9769, 37.573];
for (const mode of ['driving', 'walking', 'cycling'])
  test(`Korea public OSM: Seoul ${mode}`, async () => {
    const began = performance.now();
    const [route] = await provider.route({ mode, waypoints: [start, finish] });
    assert(route.coordinates.length > 2);
    assert(route.distanceMeters > 400 && route.distanceMeters < 5000);
    assert(route.durationSeconds > 20 && route.durationSeconds < 4000);
    assert.equal(route.dataset.license, 'ODbL-1.0');
    console.log(
      `${mode}: ${route.distanceMeters} m, ${route.durationSeconds} s, ${route.coordinates.length} vertices, ${(performance.now() - began).toFixed(1)} ms`,
    );
  });
test('Korea public OSM: ordered Seoul via', async () => {
  const [route] = await provider.route({
    mode: 'driving',
    waypoints: [start, [126.9772, 37.57], finish],
  });
  assert.equal(route.matchedWaypoints.length, 3);
  assert(route.distanceMeters > 400);
});
test('Korea public OSM: island no-route/no-segment and separate distance limit', async () => {
  for (const mode of ['driving', 'walking', 'cycling']) {
    await assert.rejects(
      provider.route({
        mode,
        waypoints: [
          [130.907, 37.485],
          [131.869, 37.241],
        ],
      }),
      { code: 'NOT_FOUND' },
    );
    await assert.rejects(provider.route({ mode, waypoints: [start, [131.869, 37.241]] }), {
      code: 'INVALID_ARGUMENT',
      detail: 'ROUTING_DISTANCE_LIMIT',
    });
  }
});
