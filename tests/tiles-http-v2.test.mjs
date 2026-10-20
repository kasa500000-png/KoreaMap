import assert from 'node:assert/strict';
import { test } from 'node:test';
import { request } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { gzipSync, gunzipSync } from 'node:zlib';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
  copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { startTileServer } from '../services/tiles/dist/server.js';
import { ByteCache, chooseEncoding } from '../services/tiles/dist/http-assets.js';
import { inspectArchive } from '../services/tiles/dist/archive.js';
import { activateGeneration } from '../services/tiles/dist/pipeline.js';
import { planetiler, regions, sha256, shaText } from '../services/tiles/dist/config.js';

let sequence = 0;
function storage() {
  return mkdtempSync(resolve(tmpdir(), 'kmk-http-v2-'));
}
async function generation(store, text, schema = 'design-v1', region = 'seoul') {
  const id = `${Date.now()}-${(++sequence).toString(16).padStart(8, '0')}`;
  const directory = resolve(store, region, 'generations', id);
  mkdirSync(directory, { recursive: true });
  const path = resolve(directory, 'base.mbtiles');
  const db = new DatabaseSync(path);
  const names = ['land', 'park', 'water', 'building', 'boundary', 'road', 'trail', 'place', 'poi'];
  const maxzoom = region === 'context' ? 9 : schema === 'design-v2' ? 16 : 14;
  db.exec(
    'CREATE TABLE metadata(name TEXT,value TEXT); CREATE TABLE tiles(zoom_level INTEGER,tile_column INTEGER,tile_row INTEGER,tile_data BLOB)',
  );
  const put = db.prepare('INSERT INTO metadata VALUES(?,?)');
  const fields = {
    kind: 'String',
    fid: 'String',
    subclass: 'String',
    rank: 'Number',
    minzoom: 'Number',
  };
  for (const [key, value] of Object.entries({
    minzoom: '0',
    maxzoom: String(maxzoom),
    ...(schema === 'design-v2' ? { version: '2.1.0' } : {}),
    json: JSON.stringify({ vector_layers: names.map((id) => ({ id, fields })) }),
  }))
    put.run(key, value);
  const bytes = gzipSync(Buffer.from(text));
  db.prepare('INSERT INTO tiles VALUES(0,0,0,?)').run(bytes);
  if (maxzoom === 16) db.prepare('INSERT INTO tiles VALUES(16,0,65535,?)').run(bytes);
  db.close();
  const source = {
    id: 'osm-geofabrik-kr',
    sha256: shaText('authored source marker, not actual OSM'),
    dataAsOf: '2026-10-18T00:00:00.000Z',
    license: 'ODbL-1.0',
    catalogSha256: shaText('authored catalog marker'),
  };
  const manifest = {
    schemaVersion: schema === 'design-v2' ? 2 : 1,
    schema,
    generation: id,
    region,
    bounds: regions[region].bounds,
    source,
    tool: {
      version: planetiler.version,
      sha256: planetiler.sha256,
      profileSha256: shaText('authored HTTP test profile'),
    },
    archive: {
      ...inspectArchive(path, schema),
      file: 'base.mbtiles',
      sha256: await sha256(path),
      bytes: readFileSync(path).length,
    },
    metrics: {
      elapsedMs: 1,
      maxHeapMiB: 512,
      availableMemoryBefore: 1024 ** 3,
      freeDiskBefore: 1024 ** 3,
    },
    ...(schema === 'design-v2'
      ? {
          schemaRevision: 1,
          capabilities: {
            rail: false,
            waterway: false,
            transport: false,
            landmask: false,
            ocean: false,
          },
          sources: [source],
        }
      : {}),
  };
  writeFileSync(resolve(directory, 'manifest.json'), JSON.stringify(manifest));
  return { id, directory, path, manifest, bytes };
}
function glyphPack(store) {
  const directory = resolve(store, 'authored-glyph-http');
  const fontstack = 'Authored HTTP';
  mkdirSync(resolve(directory, fontstack), { recursive: true });
  const blocks = [0, 0x1100, 0x3100];
  for (let first = 0xac00; first <= 0xd7a3; first += 256) blocks.push(first);
  // Original test bytes verify HTTP/integrity only; this is not a rendered or redistributed font.
  const files = blocks.map((first) => {
    const file = `${fontstack}/${first}-${first + 255}.pbf`,
      bytes = Buffer.from(`authored-glyph-range-${first}|`.repeat(30));
    writeFileSync(resolve(directory, file), bytes);
    return { file, bytes: bytes.length, sha256: shaText(bytes) };
  });
  const notice = 'Authored HTTP test notice: SIL OPEN FONT LICENSE Version 1.1';
  writeFileSync(resolve(directory, 'LICENSE.txt'), notice);
  const manifest = Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      format: 'maplibre-glyph-pbf',
      fontstack,
      license: 'OFL-1.1',
      licenseFile: 'LICENSE.txt',
      licenseSha256: shaText(notice),
      files,
    }),
  );
  writeFileSync(resolve(directory, 'manifest.json'), manifest);
  return { directory, fontstack, files, hash: shaText(manifest) };
}
function http(origin, path, options = {}) {
  return new Promise((ok, fail) => {
    const req = request(new URL(path, origin), options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () =>
        ok({ status: res.statusCode, headers: res.headers, bytes: Buffer.concat(chunks) }),
      );
      res.on('error', fail);
    });
    req.on('error', fail);
    req.end();
  });
}

test('byte LRU evicts by retained bytes and encoding negotiation respects q=0', () => {
  const cache = new ByteCache(8, 2);
  cache.set('a', Buffer.alloc(4));
  cache.set('b', Buffer.alloc(4));
  assert.equal(cache.bytes, 8);
  cache.get('a');
  cache.set('c', Buffer.alloc(4));
  assert.equal(cache.get('b'), undefined);
  assert(cache.get('a'));
  assert.equal(cache.size, 2);
  cache.set('oversized', Buffer.alloc(9));
  assert.equal(cache.bytes, 8);
  cache.clear();
  assert.equal(cache.size, 0);
  assert.equal(cache.bytes, 0);
  assert.equal(chooseEncoding(undefined), 'identity');
  assert.equal(chooseEncoding('gzip;q=0, identity;q=1'), 'identity');
  assert.equal(chooseEncoding('gzip;q=1, identity;q=0'), 'gzip');
  assert.equal(chooseEncoding('gzip ; q=1, identity;q=0'), 'gzip');
  assert.equal(chooseEncoding('br, gzip;q=0.5'), 'identity');
  assert.equal(chooseEncoding('*;q=0'), null);
  assert.equal(chooseEncoding('gzip;q=0,identity;q=0'), null);
});

test('v1 aliases preserve source URLs while immutable styles and datasets use strong conditional caching', async () => {
  const store = storage();
  let service;
  try {
    const a = await generation(store, 'authored legacy tile');
    await activateGeneration(store, 'seoul', a.id);
    service = await startTileServer({ store, region: 'seoul' });
    const alias = await http(service.origin, '/styles/standard.json');
    assert.equal(alias.status, 200);
    assert.equal(alias.headers['cache-control'], 'no-cache');
    const spec = JSON.parse(alias.bytes);
    assert.equal(spec.sources['korea-base'].tiles[0], service.origin + '/tiles/{z}/{x}/{y}.pbf');
    assert.equal(spec.metadata['korea:schema'], 'design-v1');
    const path = `/styles/${spec.metadata['korea:style-revision']}/standard.json`;
    const style = await http(service.origin, path);
    assert.equal(style.status, 200);
    assert.match(style.headers['cache-control'], /max-age=31536000, immutable/u);
    assert.match(
      JSON.parse(style.bytes).sources['korea-base'].tiles[0],
      new RegExp(`/datasets/${a.id}/tiles/`),
    );
    const tilePath = `/datasets/${a.id}/tiles/0/0/0.pbf`;
    const tile = await http(service.origin, tilePath, { headers: { 'Accept-Encoding': 'gzip' } });
    assert.deepEqual(tile.bytes, a.bytes);
    assert.equal(tile.headers.etag, `"${shaText(tile.bytes)}"`);
    const cached = await http(service.origin, tilePath, {
      headers: { 'Accept-Encoding': 'gzip', 'If-None-Match': `W/${tile.headers.etag}` },
    });
    assert.equal(cached.status, 304);
    assert.equal(cached.bytes.length, 0);
    const head = await http(service.origin, tilePath, {
      method: 'HEAD',
      headers: { 'Accept-Encoding': 'gzip' },
    });
    assert.equal(head.status, 200);
    assert.equal(head.headers.etag, tile.headers.etag);
    assert.equal(Number(head.headers['content-length']), a.bytes.length);
    assert.equal(head.bytes.length, 0);
    const absent = await http(service.origin, `/datasets/${a.id}/tiles/14/0/0.pbf`);
    assert.equal(absent.status, 204);
    assert(absent.headers.etag);
    assert.equal(
      (await http(service.origin, path, { headers: { 'If-None-Match': style.headers.etag } }))
        .status,
      304,
    );
  } finally {
    await service?.close();
    rmSync(store, { recursive: true, force: true });
  }
});

test('current and previous datasets stay distinct across rollback; unknown IDs never alias active data', async () => {
  const store = storage();
  let service;
  try {
    const a = await generation(store, 'generation A only'),
      b = await generation(store, 'generation B only'),
      c = await generation(store, 'unactivated generation C');
    await activateGeneration(store, 'seoul', a.id);
    await activateGeneration(store, 'seoul', b.id);
    service = await startTileServer({ store, region: 'seoul' });
    assert.equal(service.diagnostics().archives, 2);
    for (const value of [a, b])
      assert.equal(
        (await http(service.origin, `/datasets/${value.id}/tiles/0/0/0.pbf`)).bytes.toString(),
        gunzipSync(value.bytes).toString(),
      );
    assert.equal((await http(service.origin, `/datasets/${c.id}/tiles/0/0/0.pbf`)).status, 404);
    assert.equal(
      (await http(service.origin, '/tiles/0/0/0.pbf')).bytes.toString(),
      'generation B only',
    );
    await service.close();
    assert.equal(service.diagnostics().archives, 0);
    assert(service.diagnostics().closed);
    await service.close();
    await activateGeneration(store, 'seoul', a.id);
    service = await startTileServer({ store, region: 'seoul' });
    assert.equal(
      (await http(service.origin, '/tiles/0/0/0.pbf')).bytes.toString(),
      'generation A only',
    );
    assert.equal(
      (await http(service.origin, `/datasets/${b.id}/tiles/0/0/0.pbf`)).bytes.toString(),
      'generation B only',
    );
  } finally {
    await service?.close();
    rmSync(store, { recursive: true, force: true });
  }
});

test('glyph URLs bind the manifest hash; gzip/identity HEAD/304 retain bounded cache and integrity checks', async () => {
  const store = storage();
  let service;
  try {
    const a = await generation(store, 'authored glyph service tile');
    const glyphs = glyphPack(store);
    await activateGeneration(store, 'seoul', a.id);
    service = await startTileServer({
      store,
      region: 'seoul',
      glyphs: glyphs.directory,
      glyphCacheBytes: 128,
      allowedOrigins: ['http://127.0.0.1:4173'],
    });
    const path = `/glyphs/${glyphs.hash}/Authored%20HTTP/0-255.pbf`;
    const identity = await http(service.origin, path, {
      headers: { 'Accept-Encoding': 'identity' },
    });
    assert.match(identity.headers.vary, /Origin/u);
    const zipped = await http(service.origin, path, {
      headers: { 'Accept-Encoding': 'gzip', Origin: 'http://127.0.0.1:4173' },
    });
    assert.equal(zipped.status, 200);
    assert.equal(zipped.headers['content-encoding'], 'gzip');
    assert.deepEqual(gunzipSync(zipped.bytes), identity.bytes);
    assert.notEqual(zipped.headers.etag, identity.headers.etag);
    assert.match(zipped.headers.vary, /Origin/u);
    assert.match(zipped.headers.vary, /Accept-Encoding/u);
    assert.match(zipped.headers['cache-control'], /immutable/u);
    assert.equal(
      (
        await http(service.origin, path, {
          headers: {
            'Accept-Encoding': 'gzip',
            'If-None-Match': `"unrelated", W/${zipped.headers.etag}`,
          },
        })
      ).status,
      304,
    );
    const head = await http(service.origin, path, {
      method: 'HEAD',
      headers: { 'Accept-Encoding': 'gzip' },
    });
    assert.equal(head.headers.etag, zipped.headers.etag);
    assert.equal(head.bytes.length, 0);
    assert.equal(Number(head.headers['content-length']), zipped.bytes.length);
    for (const file of glyphs.files.slice(0, 5))
      await http(
        service.origin,
        `/glyphs/${glyphs.hash}/${encodeURIComponent(file.file.split('/')[0])}/${file.file.split('/')[1]}`,
        { headers: { 'Accept-Encoding': 'gzip' } },
      );
    assert(service.diagnostics().glyphCacheBytes <= 128);
    assert.equal(
      (await http(service.origin, path, { headers: { 'Accept-Encoding': '*;q=0' } })).status,
      406,
    );
    assert.equal(
      (await http(service.origin, `/glyphs/${'f'.repeat(64)}/Authored%20HTTP/0-255.pbf`)).status,
      404,
    );
    writeFileSync(
      resolve(glyphs.directory, glyphs.files[0].file),
      Buffer.alloc(glyphs.files[0].bytes, 1),
    );
    const changed = await http(service.origin, path, {
      headers: { 'Accept-Encoding': 'gzip', 'If-None-Match': zipped.headers.etag },
    });
    assert.equal(changed.status, 400);
    assert.equal(changed.headers['cache-control'], 'no-store');
    await service.close();
    assert.equal(service.diagnostics().glyphCacheBytes, 0);
  } finally {
    await service?.close();
    rmSync(store, { recursive: true, force: true });
  }
});

test('v2 uses balanced cartography and generation z16 URLs; quality changes invalidate style revisions', async () => {
  const store = storage();
  let service;
  try {
    const a = await generation(store, 'v2 z16 authored tile', 'design-v2');
    await activateGeneration(store, 'seoul', a.id);
    service = await startTileServer({ store, region: 'seoul' });
    const first = JSON.parse((await http(service.origin, '/styles/standard.json')).bytes);
    assert.equal(first.metadata['korea:quality'], 'balanced');
    assert.equal(first.metadata['korea:schema'], 'design-v2');
    assert(
      Object.values(first.sources).some((value) =>
        value.tiles?.[0].includes(`/datasets/${a.id}/tiles/`),
      ),
    );
    assert.equal((await http(service.origin, `/datasets/${a.id}/tiles/16/0/0.pbf`)).status, 200);
    const oldRevision = first.metadata['korea:style-revision'];
    const port = Number(new URL(service.origin).port);
    await service.close();
    service = await startTileServer({ store, region: 'seoul', port, quality: 'dense' });
    const second = JSON.parse((await http(service.origin, '/styles/standard.json')).bytes);
    assert.equal(second.metadata['korea:quality'], 'dense');
    assert.notEqual(second.metadata['korea:style-revision'], oldRevision);
    assert.equal((await http(service.origin, `/styles/${oldRevision}/standard.json`)).status, 404);
  } finally {
    await service?.close();
    rmSync(store, { recursive: true, force: true });
  }
});

test('context is explicitly selected, bounded and uses its own immutable dataset', async () => {
  const store = storage();
  let service;
  try {
    const a = await generation(store, 'detail data', 'design-v2'),
      context = await generation(store, 'context data', 'design-v2', 'context');
    await activateGeneration(store, 'seoul', a.id);
    await activateGeneration(store, 'context', context.id);
    service = await startTileServer({ store, region: 'seoul' });
    assert.equal(service.diagnostics().archives, 1);
    assert.equal(
      (await http(service.origin, `/datasets/${context.id}/tiles/0/0/0.pbf`)).status,
      404,
    );
    await service.close();
    service = await startTileServer({ store, region: 'seoul', context: {} });
    assert.equal(service.diagnostics().archives, 2);
    const style = JSON.parse((await http(service.origin, '/styles/standard.json')).bytes);
    assert(
      Object.values(style.sources).some((value) =>
        value.tiles?.[0].includes(`/datasets/${context.id}/tiles/`),
      ),
    );
    assert.equal(
      (await http(service.origin, `/datasets/${context.id}/tiles/0/0/0.pbf`)).bytes.toString(),
      'context data',
    );
  } finally {
    await service?.close();
    rmSync(store, { recursive: true, force: true });
  }
});

test('new routes retain exact Host/CORS/method/query restrictions and bounded conditional preflight', async () => {
  const store = storage();
  let service;
  try {
    const a = await generation(store, 'HTTP safety tile');
    await activateGeneration(store, 'seoul', a.id);
    service = await startTileServer({
      store,
      region: 'seoul',
      allowedOrigins: ['http://127.0.0.1:4173'],
    });
    const path = `/datasets/${a.id}/tiles/0/0/0.pbf`;
    assert.equal(
      (await http(service.origin, path, { headers: { Host: 'unapproved.invalid' } })).status,
      403,
    );
    assert.equal(
      (await http(service.origin, path, { headers: { Origin: 'https://unapproved.invalid' } }))
        .status,
      403,
    );
    assert.equal((await http(service.origin, path, { method: 'POST' })).status, 405);
    assert.equal((await http(service.origin, path + '?unexpected=1')).status, 400);
    const headers = {
      Origin: 'http://127.0.0.1:4173',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'If-None-Match',
    };
    assert.equal((await http(service.origin, path, { method: 'OPTIONS', headers })).status, 204);
    assert.equal(
      (
        await http(service.origin, path, {
          method: 'OPTIONS',
          headers: { ...headers, 'Access-Control-Request-Headers': 'Authorization' },
        })
      ).status,
      403,
    );
    assert.equal((await http(service.origin, `/datasets/${a.id}/tiles/17/0/0.pbf`)).status, 400);
  } finally {
    await service?.close();
    rmSync(store, { recursive: true, force: true });
  }
});

test('immutable generation mutations and symlink replacements are rejected before cached 304', async (t) => {
  const store = storage();
  let service;
  try {
    const a = await generation(store, 'immutable original');
    await activateGeneration(store, 'seoul', a.id);
    service = await startTileServer({ store, region: 'seoul' });
    const style = await http(service.origin, '/styles/standard.json');
    writeFileSync(a.path + '-shm', 'authored sidecar marker, not hashed data');
    assert.equal(
      (
        await http(service.origin, '/styles/standard.json', {
          headers: { 'If-None-Match': style.headers.etag },
        })
      ).status,
      400,
    );
    rmSync(a.path + '-shm');
    const path = `/datasets/${a.id}/tiles/0/0/0.pbf`,
      original = await http(service.origin, path);
    const db = new DatabaseSync(a.path);
    db.prepare('UPDATE tiles SET tile_data=?').run(gzipSync(Buffer.from('changed input')));
    db.close();
    assert.equal(
      (await http(service.origin, path, { headers: { 'If-None-Match': original.headers.etag } }))
        .status,
      400,
    );
    await service.close();
    service = undefined;
    const b = await generation(store, 'symlink fixture');
    await activateGeneration(store, 'seoul', b.id);
    service = await startTileServer({ store, region: 'seoul' });
    const copy = resolve(store, 'same-bytes-outside-generation.mbtiles');
    copyFileSync(b.path, copy);
    rmSync(b.path);
    try {
      symlinkSync(copy, b.path, 'file');
    } catch (error) {
      if (error.code === 'EPERM') {
        t.skip('Host disallowed symlink creation; path replacement case unverified');
        return;
      }
      throw error;
    }
    assert.equal((await http(service.origin, `/datasets/${b.id}/tiles/0/0/0.pbf`)).status, 400);
  } finally {
    await service?.close();
    rmSync(store, { recursive: true, force: true });
  }
});

test('an invalid retained previous generation is unavailable and cannot return the active payload', async () => {
  const store = storage();
  let service;
  try {
    const a = await generation(store, 'previous immutable bytes'),
      b = await generation(store, 'current immutable bytes');
    await activateGeneration(store, 'seoul', a.id);
    await activateGeneration(store, 'seoul', b.id);
    writeFileSync(a.path, 'corrupt retained archive');
    service = await startTileServer({ store, region: 'seoul' });
    assert.equal(service.diagnostics().archives, 1);
    assert.equal(service.diagnostics().previousAvailable, false);
    assert.equal((await http(service.origin, `/datasets/${a.id}/tiles/0/0/0.pbf`)).status, 404);
    assert.equal(
      (await http(service.origin, `/datasets/${b.id}/tiles/0/0/0.pbf`)).bytes.toString(),
      'current immutable bytes',
    );
  } finally {
    await service?.close();
    rmSync(store, { recursive: true, force: true });
  }
});
