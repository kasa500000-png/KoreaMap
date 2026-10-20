import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { resolve } from 'node:path';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { startQualityConsumer } from '../scripts/quality-consumer.mjs';

function get(origin, path, headers = {}, method = 'GET') {
  const url = new URL(origin);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: url.hostname,
        port: url.port,
        method,
        path,
        headers: { host: url.host, ...headers },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            bytes: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}

test('production consumer serves bundled public exports with real gzip/cache semantics and no dev client', async () => {
  const directory = mkdtempSync(resolve('artifacts/qa/production-consumer-test-'));
  const workerPath = resolve(directory, 'input-worker.mjs');
  writeFileSync(workerPath, 'self.onmessage = () => {};\n');
  const consumer = await startQualityConsumer({ root: resolve('.'), directory, workerPath });
  const originalFetch = globalThis.fetch;
  const environmentMarker = process.env.VITE_SYNTHETIC_MARKER;
  process.env.VITE_SYNTHETIC_MARKER = 'quality-env-must-not-enter-bundle';
  // Compilation and static hosting need no provider, metadata lookup or external transport.
  globalThis.fetch = () => {
    throw Error('Unexpected compiler transport');
  };
  try {
    assert.match(consumer.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal((await get(consumer.origin, '/')).status, 404);
    const html = `<!doctype html><html><meta charset="utf-8"><style>body { color: #17252b }</style><body><script type="module">import {distanceMeters} from 'korea-map-core'; document.body.dataset.distance = String(distanceMeters([127,37],[127.001,37])); document.body.dataset.mode = import.meta.env.MODE; document.body.dataset.environment = JSON.stringify(import.meta.env);</script></body></html>`;
    const metadata = await consumer.build(html);
    assert.equal(metadata.mode, 'production');
    assert(metadata.assets.some((asset) => /^assets\/.+-[\w-]{8,}\.js$/.test(asset.file)));
    const index = await get(consumer.origin, '/');
    assert.equal(index.status, 200);
    assert.equal(index.headers['cache-control'], 'no-cache');
    assert.equal(index.headers['x-content-type-options'], 'nosniff');
    assert(!index.bytes.includes('@vite/client'));
    const javascript = metadata.assets.find((asset) => asset.file.endsWith('.js'));
    const js = await get(consumer.origin, `/${javascript.file}`);
    assert.equal(js.status, 200);
    assert.match(js.headers['cache-control'], /immutable/);
    assert(!js.bytes.includes('@vite/client'));
    assert(js.bytes.includes('production'));
    assert(!js.bytes.includes('quality-env-must-not-enter-bundle'));
    assert.equal(js.bytes.length, javascript.bytes);
    const gzip = await get(consumer.origin, `/${javascript.file}`, { 'accept-encoding': 'gzip' });
    assert.equal(gzip.headers['content-encoding'], 'gzip');
    assert.notEqual(gzip.headers.etag, js.headers.etag);
    assert.deepEqual(gunzipSync(gzip.bytes), js.bytes);
    const head = await get(
      consumer.origin,
      `/${javascript.file}`,
      { 'accept-encoding': 'gzip' },
      'HEAD',
    );
    assert.equal(head.status, 200);
    assert.equal(Number(head.headers['content-length']), gzip.bytes.length);
    assert.equal(head.bytes.length, 0);
    const cached = await get(consumer.origin, `/${javascript.file}`, {
      'accept-encoding': 'gzip',
      'if-none-match': gzip.headers.etag,
    });
    assert.equal(cached.status, 304);
    assert.equal(cached.bytes.length, 0);
    assert.equal((await get(consumer.origin, '/worker.mjs')).headers['cache-control'], 'no-cache');
    assert.equal(
      (await get(consumer.origin, `/${javascript.file}`, { 'accept-encoding': 'gzip;q=0, *;q=1' }))
        .headers['content-encoding'],
      undefined,
    );
    assert.equal((await get(consumer.origin, '/', { host: 'untrusted.invalid' })).status, 403);
    assert.equal((await get(consumer.origin, '/', {}, 'POST')).status, 405);
    assert.equal((await get(consumer.origin, '/', { range: 'bytes=0-1' })).status, 416);
    for (const path of [
      '/../package.json',
      '/%2e%2e/package.json',
      '/%5cpackage.json',
      '/%00',
      '/%zz',
      '/?token=synthetic',
      '//untrusted.invalid/path',
    ])
      assert.equal((await get(consumer.origin, path)).status, 400);
    assert.equal((await get(consumer.origin, '/package.json')).status, 404);
    assert.equal((await get(consumer.origin, '/@vite/client')).status, 404);
    const previous = index.bytes;
    const second = await consumer.build(html.replace('dataset.distance', 'dataset.updated'));
    assert(second.assets.some((asset) => asset.file.endsWith('.js')));
    assert.notDeepEqual((await get(consumer.origin, '/')).bytes, previous);
    assert.deepEqual(
      (await get(consumer.origin, `/${javascript.file}`)).bytes,
      js.bytes,
      'Published immutable assets stay stable across regional builds',
    );
    await assert.rejects(
      consumer.build(
        '<script type="module" src="https://external.example.invalid/module.js"></script>',
      ),
      /External consumer/,
    );
    await assert.rejects(
      consumer.build(
        '<script type="module">import "https://external.example.invalid/module.js";</script>',
      ),
      /External production imports/,
    );
    assert.equal(
      (await get(consumer.origin, '/')).status,
      200,
      'Failed builds preserve the last successful consumer',
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (environmentMarker === undefined) delete process.env.VITE_SYNTHETIC_MARKER;
    else process.env.VITE_SYNTHETIC_MARKER = environmentMarker;
    await consumer.close();
    await consumer.close();
    assert.deepEqual(readdirSync(directory), ['input-worker.mjs']);
    rmSync(directory, { recursive: true, force: true });
  }
  await assert.rejects(get(consumer.origin, '/'));
});

test('helper refuses non-artifact output, absent worker and oversized HTML without implicit services', async () => {
  const directory = mkdtempSync(resolve('artifacts/qa/production-consumer-test-'));
  const workerPath = resolve(directory, 'input-worker.mjs');
  writeFileSync(workerPath, '/* Authored synthetic worker. */');
  try {
    await assert.rejects(
      startQualityConsumer({ root: resolve('.'), directory: resolve('.'), workerPath }),
      /ignored artifacts/,
    );
    await assert.rejects(
      startQualityConsumer({
        root: resolve('.'),
        directory,
        workerPath: resolve(directory, 'missing.mjs'),
      }),
    );
    const consumer = await startQualityConsumer({ root: resolve('.'), directory, workerPath });
    try {
      await assert.rejects(consumer.build(' '.repeat(1024 ** 2 + 1)), /Bounded consumer HTML/);
    } finally {
      await consumer.close();
    }
    assert.deepEqual(readFileSync(workerPath), Buffer.from('/* Authored synthetic worker. */'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
