import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import {
  createLocalRoutingProvider,
  createRoutingServer,
  createValhallaHttpTransport,
} from '../services/routing/dist/index.js';
import {
  createCancellationSource,
  distanceMeters,
  roadRouteToGeoJSON,
} from '../packages/core/dist/index.js';
import { fixturePoints as p } from '../scripts/routing-fixture.mjs';
const endpoint = process.env.KMK_TEST_ROUTING_URL;
assert(endpoint, 'Run through pnpm test:routing; no skipped engine tests.');
const dataset = JSON.parse(process.env.KMK_TEST_ROUTING_DATASET);
const provider = createLocalRoutingProvider(endpoint, dataset);
const request = (mode = 'driving', waypoints = [p.start, p.finish]) => ({ mode, waypoints });
for (const mode of ['driving', 'walking', 'cycling'])
  test(`real Valhalla ${mode}: geometry, meters, estimated seconds`, async () => {
    const [route] = await provider.route(request(mode));
    assert.equal(route.mode, mode);
    assert(route.distanceMeters > 400);
    assert(route.durationSeconds > 20);
    assert.deepEqual(route.coordinates[0], p.start);
    assert.deepEqual(route.coordinates.at(-1), p.finish);
    assert(route.coordinates.length >= 3);
    if (mode === 'driving') {
      assert.deepEqual(route.coordinates[1], p.corner);
      assert(route.distanceMeters > distanceMeters(p.start, p.finish) * 1.2);
    }
    if (mode === 'walking') assert.deepEqual(route.coordinates[1], [127.002, 37.501]);
    if (mode === 'cycling') assert.deepEqual(route.coordinates[1], p.via);
    assert.equal(roadRouteToGeoJSON(route).features[0].geometry.type, 'LineString');
  });
test('real ordered waypoint, one-way driving and no connection to an island/broken OSM segment', async () => {
  const [via] = await provider.route(request('driving', [p.start, p.via, p.finish]));
  assert.deepEqual(via.matchedWaypoints, [p.start, p.via, p.finish]);
  assert(via.coordinates.some((c) => c[0] === p.via[0] && c[1] === p.via[1]));
  const [reverse] = await provider.route(request('driving', [p.finish, p.start]));
  assert(reverse.coordinates.some((c) => c[0] === p.corner[0] && c[1] === p.corner[1]));
  for (const mode of ['driving', 'walking', 'cycling'])
    for (const end of [p.island, p.broken, [128, 37]])
      await assert.rejects(provider.route(request(mode, [p.start, end])), { code: 'NOT_FOUND' });
});
test('engine timeout and cancellation have safe codes', async () => {
  const cancel = createCancellationSource();
  cancel.cancel();
  await assert.rejects(provider.route(request(), { signal: cancel.signal }), { code: 'ABORTED' });
  const hanging = createServer(() => {});
  await new Promise((r) => hanging.listen(0, '127.0.0.1', r));
  try {
    const delayed = createLocalRoutingProvider(
      `http://127.0.0.1:${hanging.address().port}/route`,
      dataset,
    );
    await assert.rejects(delayed.route(request(), { timeoutMs: 30 }), { code: 'TIMEOUT' });
  } finally {
    hanging.closeAllConnections();
    await new Promise((r) => hanging.close(r));
  }
});
test('private gateway: no Origin, GET, arbitrary host, huge body, raw engine errors or fallback', async () => {
  const server = createRoutingServer(provider);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/route`;
  try {
    const post = (body, headers = {}) =>
      globalThis.fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      });
    const ok = await post(request());
    assert.equal(ok.status, 200);
    assert.equal((await ok.json())[0].kind, 'road-route');
    assert.equal((await globalThis.fetch(url)).status, 404);
    assert.equal((await post(request(), { origin: 'http://localhost:4173' })).status, 403);
    const hostStatus = await new Promise((resolve, reject) => {
      const r = httpRequest(
        url,
        {
          method: 'POST',
          headers: { host: 'untrusted.invalid', 'content-type': 'application/json' },
        },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      );
      r.on('error', reject);
      r.end(JSON.stringify(request()));
    });
    assert.equal(hostStatus, 403);
    assert.equal((await post('bad-json')).status, 400);
    assert.equal((await post('x'.repeat(4097))).status, 413);
    const noPath = await post(request('walking', [p.start, p.island]));
    assert.equal(noPath.status, 404);
    assert.deepEqual(await noPath.json(), { code: 'NOT_FOUND' });
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
test('no implicit endpoint, redirects, insecure remote URL or URL credentials', () => {
  const credentials = new URL('https://routing.invalid/route');
  credentials.username = 'synthetic';
  for (const url of [
    '',
    'http://routing.invalid/route',
    credentials.href,
    'https://routing.invalid/route?key=private',
    'https://routing.invalid/other',
  ])
    assert.throws(() => createValhallaHttpTransport(url));
});
