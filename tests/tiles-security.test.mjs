import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  readdirSync,
  symlinkSync,
  copyFileSync,
  existsSync,
  realpathSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { inspectArchive } from '../services/tiles/dist/archive.js';
import {
  contained,
  planetiler,
  readBoundedFile,
  regions,
  sha256,
  shaText,
} from '../services/tiles/dist/config.js';
import {
  activateGeneration,
  activeGeneration,
  verifyGeneration,
  downloadVerifiedFile,
  downloadSource,
  executeTileTool,
} from '../services/tiles/dist/pipeline.js';
import { startTileServer } from '../services/tiles/dist/server.js';

async function fixture() {
  const store = mkdtempSync(resolve(tmpdir(), 'kmk-tiles-security-'));
  const generation = `${Date.now()}-abcd1234`;
  const directory = resolve(store, 'seoul/generations', generation);
  mkdirSync(directory, { recursive: true });
  const archive = resolve(directory, 'base.mbtiles');
  const db = new DatabaseSync(archive);
  db.exec(
    'CREATE TABLE metadata(name TEXT,value TEXT); CREATE TABLE tiles(zoom_level INTEGER,tile_column INTEGER,tile_row INTEGER,tile_data BLOB)',
  );
  const put = db.prepare('INSERT INTO metadata VALUES(?,?)');
  for (const [name, value] of Object.entries({
    minzoom: '0',
    maxzoom: '14',
    json: JSON.stringify({ vector_layers: [{ id: 'road' }] }),
  }))
    put.run(name, value);
  db.prepare('INSERT INTO tiles VALUES(0,0,0,?)').run(Buffer.from('authored test tile'));
  db.close();
  const manifest = {
    schemaVersion: 1,
    schema: 'design-v1',
    generation,
    region: 'seoul',
    bounds: regions.seoul.bounds,
    source: {
      id: 'osm-geofabrik-kr',
      sha256: shaText('authored source'),
      dataAsOf: '2026-10-18T00:00:00.000Z',
      license: 'ODbL-1.0',
      catalogSha256: shaText('authored catalog'),
    },
    tool: {
      version: planetiler.version,
      sha256: planetiler.sha256,
      profileSha256: shaText('authored profile'),
    },
    archive: {
      ...inspectArchive(archive),
      file: 'base.mbtiles',
      sha256: await sha256(archive),
      bytes: readFileSync(archive).length,
    },
    metrics: {
      elapsedMs: 1,
      maxHeapMiB: 512,
      availableMemoryBefore: 1024 ** 3,
      freeDiskBefore: 1024 ** 3,
    },
  };
  const save = () => writeFileSync(resolve(directory, 'manifest.json'), JSON.stringify(manifest));
  save();
  return {
    store,
    generation,
    directory,
    archive,
    manifest,
    save,
    cleanup: () => rmSync(store, { recursive: true, force: true }),
  };
}
function glyphFixture(store) {
  const root = resolve(store, 'authored-glyph-test');
  const fontstack = 'Authored Test';
  mkdirSync(resolve(root, fontstack), { recursive: true });
  const blocks = [0, 0x1100, 0x3100];
  for (let first = 0xac00; first <= 0xd7a3; first += 256) blocks.push(first);
  // These bytes test HTTP/integrity controls only; they are not rendered font glyphs.
  const bytes = Buffer.from('authored HTTP glyph test');
  const files = blocks.map((first) => {
    const file = `${fontstack}/${first}-${first + 255}.pbf`;
    writeFileSync(resolve(root, file), bytes);
    return { file, sha256: shaText(bytes), bytes: bytes.length };
  });
  const notice = 'Authored test notice: SIL OPEN FONT LICENSE Version 1.1';
  writeFileSync(resolve(root, 'LICENSE.txt'), notice);
  const manifest = {
    schemaVersion: 1,
    format: 'maplibre-glyph-pbf',
    fontstack,
    license: 'OFL-1.1',
    licenseFile: 'LICENSE.txt',
    licenseSha256: shaText(notice),
    files,
  };
  const save = () => writeFileSync(resolve(root, 'manifest.json'), JSON.stringify(manifest));
  save();
  return { root, manifest, save, bytes };
}
function originalPbfHeader() {
  const integer = (input) => {
    const out = [];
    let value = input;
    do {
      const b = value % 128;
      value = Math.floor(value / 128);
      out.push(b + (value ? 128 : 0));
    } while (value);
    return Buffer.from(out);
  };
  const bytes = (tag, value) => Buffer.concat([integer(tag * 8 + 2), integer(value.length), value]);
  const body = Buffer.concat([
    integer(32 * 8),
    integer(Math.floor(Date.parse('2026-10-18T00:00:00Z') / 1000)),
  ]);
  const blob = bytes(1, body);
  const header = Buffer.concat([
    bytes(1, Buffer.from('OSMHeader')),
    integer(3 * 8),
    integer(blob.length),
  ]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length);
  return Buffer.concat([length, header, blob]);
}

test('store containment rejects symlinked generation files before activation and preserves the pointer', async (context) => {
  const f = await fixture();
  const outside = mkdtempSync(resolve(tmpdir(), 'kmk-outside-store-'));
  try {
    await activateGeneration(f.store, 'seoul', f.generation);
    const pointer = readFileSync(resolve(f.store, 'seoul/active.json'));
    copyFileSync(f.archive, resolve(outside, 'base.mbtiles'));
    rmSync(f.archive);
    try {
      symlinkSync(resolve(outside, 'base.mbtiles'), f.archive, 'file');
    } catch (error) {
      if (error.code === 'EPERM') {
        context.skip('OS did not permit a symlink; containment case unverified');
        return;
      }
      throw error;
    }
    await assert.rejects(
      verifyGeneration(f.store, 'seoul', f.generation),
      /SYMLINK|PATH_OUTSIDE_STORE/,
    );
    await assert.rejects(
      activateGeneration(f.store, 'seoul', f.generation),
      /SYMLINK|PATH_OUTSIDE_STORE/,
    );
    assert.deepEqual(readFileSync(resolve(f.store, 'seoul/active.json')), pointer);
    assert.throws(
      () => contained(f.store, 'seoul/generations/' + f.generation + '/base.mbtiles'),
      /SYMLINK/,
    );
  } finally {
    f.cleanup();
    rmSync(outside, { recursive: true, force: true });
  }
});
test('bounded file reads reject oversized files and manifest metadata changes cannot replace an active generation', async () => {
  const f = await fixture();
  try {
    await activateGeneration(f.store, 'seoul', f.generation);
    writeFileSync(resolve(f.store, 'oversized'), Buffer.alloc(17));
    assert.throws(() => readBoundedFile(f.store, 'oversized', 16), /INVALID_FILE_SIZE/);
    for (const [field, value] of [
      ['minzoom', -1],
      ['bytes', 1],
      ['layers', ['road', 'unreviewed']],
    ]) {
      const old = f.manifest.archive[field];
      f.manifest.archive[field] = value;
      f.save();
      await assert.rejects(activateGeneration(f.store, 'seoul', f.generation));
      assert.equal(activeGeneration(f.store, 'seoul'), f.generation);
      f.manifest.archive[field] = old;
    }
    f.save();
    await activateGeneration(f.store, 'seoul', f.generation);
    assert.equal(JSON.parse(readFileSync(resolve(f.store, 'seoul/active.json'))).previous, null);
  } finally {
    f.cleanup();
  }
});
test('glyph packs require declared bounded files, required ranges and a verified license before startup', async () => {
  const f = await fixture();
  try {
    await activateGeneration(f.store, 'seoul', f.generation);
    const g = glyphFixture(f.store);
    delete g.manifest.files[0].sha256;
    g.save();
    await assert.rejects(
      startTileServer({ store: f.store, region: 'seoul', glyphs: g.root }),
      /INVALID_GLYPH_PACK/,
    );
    g.manifest.files[0].sha256 = shaText(g.bytes);
    g.manifest.files = g.manifest.files.slice(1);
    g.save();
    await assert.rejects(
      startTileServer({ store: f.store, region: 'seoul', glyphs: g.root }),
      /REQUIRED_GLYPH_RANGE_MISSING/,
    );
  } finally {
    f.cleanup();
  }
});
test('glyph HTTP responses verify checksums on every read and reject undeclared ranges', async () => {
  const f = await fixture();
  let service;
  try {
    await activateGeneration(f.store, 'seoul', f.generation);
    const g = glyphFixture(f.store);
    const font = Buffer.from(g.manifest.fontstack);
    const range = Buffer.from('512-767');
    const emptyStack = Buffer.concat([
      Buffer.from([10, font.length]),
      font,
      Buffer.from([18, range.length]),
      range,
    ]);
    const emptyRange = Buffer.concat([Buffer.from([10, emptyStack.length]), emptyStack]);
    const emptyFile = `${g.manifest.fontstack}/512-767.pbf`;
    writeFileSync(resolve(g.root, emptyFile), emptyRange);
    g.manifest.files.push({
      file: emptyFile,
      sha256: shaText(emptyRange),
      bytes: emptyRange.length,
      glyphCount: 0,
    });
    g.save();
    service = await startTileServer({ store: f.store, region: 'seoul', glyphs: g.root });
    const path = '/glyphs/Authored%20Test/0-255.pbf';
    assert.equal(await (await globalThis.fetch(service.origin + path)).text(), g.bytes.toString());
    assert.equal(
      (await globalThis.fetch(service.origin + '/glyphs/Authored%20Test/256-511.pbf')).status,
      404,
    );
    const empty = await globalThis.fetch(service.origin + '/glyphs/Authored%20Test/512-767.pbf');
    assert.equal(empty.status, 200);
    assert.deepEqual(Buffer.from(await empty.arrayBuffer()), emptyRange);
    writeFileSync(resolve(g.root, g.manifest.files[0].file), Buffer.alloc(g.bytes.length, 1));
    assert.equal((await globalThis.fetch(service.origin + path)).status, 400);
    assert.equal(
      await (await globalThis.fetch(service.origin + '/font-license', { method: 'HEAD' })).text(),
      '',
    );
  } finally {
    await service?.close();
    f.cleanup();
  }
});
test('operator downloads reject redirect, oversize and checksum failures without final or partial files', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'kmk-bounded-download-'));
  const original = globalThis.fetch;
  let calls = 0;
  const file = resolve(root, 'input.pbf');
  const options = {
    url: 'https://operator.example.invalid/input.pbf',
    file,
    expectedSha256: shaText('expected'),
    maxBytes: 16,
    operatorOptIn: true,
  };
  try {
    globalThis.fetch = async () => {
      calls++;
      return new globalThis.Response(null, {
        status: 302,
        headers: { location: 'http://127.0.0.1/private' },
      });
    };
    await assert.rejects(
      downloadVerifiedFile({ ...options, operatorOptIn: false }),
      /OPERATOR_OPT_IN_REQUIRED/,
    );
    await assert.rejects(
      downloadSource({
        root: process.cwd(),
        store: root,
        expectedSha256: options.expectedSha256,
        operatorOptIn: false,
      }),
      /OPERATOR_OPT_IN_REQUIRED/,
    );
    assert.equal(calls, 0);
    await assert.rejects(downloadVerifiedFile(options), /REDIRECT_NOT_ALLOWED/);
    assert.equal(calls, 1);
    await assert.rejects(
      downloadVerifiedFile({ ...options, url: planetiler.url, toolRedirects: true }),
      /INVALID_DOWNLOAD_URL|TOOL_REDIRECT_NOT_ALLOWED/,
    );
    assert.equal(calls, 2, 'A redirect must not request a private HTTP destination');
    globalThis.fetch = async () =>
      new globalThis.Response('x', { headers: { 'content-length': '17' } });
    await assert.rejects(downloadVerifiedFile(options), /DOWNLOAD_TOO_LARGE/);
    globalThis.fetch = async () => new globalThis.Response(Buffer.alloc(17));
    await assert.rejects(downloadVerifiedFile(options), /DOWNLOAD_TOO_LARGE/);
    globalThis.fetch = async () => new globalThis.Response('wrong');
    await assert.rejects(downloadVerifiedFile(options), /DOWNLOAD_CHECKSUM_MISMATCH/);
    await assert.rejects(
      downloadVerifiedFile({
        ...options,
        expectedSha256: shaText('wrong'),
        validate: () => {
          throw new Error('INVALID_OSM_PBF');
        },
      }),
      /INVALID_OSM_PBF/,
    );
    assert.equal(existsSync(file), false);
    assert.deepEqual(readdirSync(root), []);
    writeFileSync(file, 'existing operator file');
    await assert.rejects(
      downloadVerifiedFile(options),
      /INVALID_FILE_SIZE|DOWNLOAD_CHECKSUM_MISMATCH/,
    );
    assert.equal(readFileSync(file, 'utf8'), 'existing operator file');
  } finally {
    globalThis.fetch = original;
    rmSync(root, { recursive: true, force: true });
  }
});
test('source download uses only the reviewed URL after opt-in and verifies PBF timestamp before reuse', async () => {
  const store = mkdtempSync(resolve(tmpdir(), 'kmk-source-download-'));
  const original = globalThis.fetch;
  const body = originalPbfHeader();
  let calls = 0;
  try {
    globalThis.fetch = async (url, options) => {
      calls++;
      assert.equal(String(url), 'https://download.geofabrik.de/asia/south-korea-latest.osm.pbf');
      assert.equal(options.redirect, 'manual');
      return new globalThis.Response(body, { headers: { 'content-length': String(body.length) } });
    };
    const options = {
      root: process.cwd(),
      store,
      expectedSha256: shaText(body),
      operatorOptIn: true,
    };
    const result = await downloadSource(options);
    assert.equal(result.dataAsOf, '2026-10-18T00:00:00.000Z');
    assert.equal(result.input, resolve(realpathSync(store), 'source.pbf'));
    assert.equal(JSON.parse(readFileSync(result.manifestPath)).verified, true);
    await downloadSource(options);
    assert.equal(calls, 1);
    assert.deepEqual(readFileSync(result.input), body);
  } finally {
    globalThis.fetch = original;
    rmSync(store, { recursive: true, force: true });
  }
});
test('a timed-out tile child process is terminated and reports cancellation', async () => {
  const started = globalThis.performance.now();
  await assert.rejects(
    executeTileTool(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)'],
      process.cwd(),
      globalThis.AbortSignal.timeout(75),
    ),
    /TILE_BUILD_CANCELLED/,
  );
  assert(globalThis.performance.now() - started < 3000);
});
