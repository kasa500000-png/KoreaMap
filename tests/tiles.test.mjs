import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { get } from 'node:http';
import { deflateSync, gzipSync } from 'node:zlib';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { inspectArchive, pbfTimestamp, tileRow } from '../services/tiles/dist/archive.js';
import {
  activateGeneration,
  activeGeneration,
  verifyGeneration,
  buildGeneration,
} from '../services/tiles/dist/pipeline.js';
import { startTileServer } from '../services/tiles/dist/server.js';
import { contained, planetiler, regions, sha256, shaText } from '../services/tiles/dist/config.js';

const ownTile = gzipSync(Buffer.from('original-authored-http-test-bytes'));
function authoredPbfHeader(timestamp, compressed = false) {
  const integer = (input) => {
    const out = [];
    let value = input;
    do {
      const byte = value % 128;
      value = Math.floor(value / 128);
      out.push(byte + (value ? 128 : 0));
    } while (value);
    return Buffer.from(out);
  };
  const field = (tag, bytes) => Buffer.concat([integer(tag * 8 + 2), integer(bytes.length), bytes]);
  const body = Buffer.concat([
    field(4, Buffer.from('OsmSchema-V0.6')),
    ...(timestamp === undefined ? [] : [integer(32 * 8), integer(timestamp)]),
  ]);
  const blob = compressed
    ? Buffer.concat([integer(2 * 8), integer(body.length), field(3, deflateSync(body))])
    : field(1, body);
  const header = Buffer.concat([
    field(1, Buffer.from('OSMHeader')),
    integer(3 * 8),
    integer(blob.length),
  ]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length);
  return Buffer.concat([length, header, blob]);
}
async function fixture() {
  const store = mkdtempSync(resolve(tmpdir(), 'kmk-tile-policy-'));
  const generation = `${Date.now()}-1234abcd`;
  const dir = resolve(store, 'seoul/generations', generation);
  mkdirSync(dir, { recursive: true });
  const archive = resolve(dir, 'base.mbtiles');
  const db = new DatabaseSync(archive);
  db.exec(
    'CREATE TABLE metadata(name TEXT, value TEXT); CREATE TABLE tiles(zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);',
  );
  const meta = db.prepare('INSERT INTO metadata VALUES(?,?)');
  for (const [k, v] of Object.entries({
    format: 'pbf',
    minzoom: '0',
    maxzoom: '14',
    json: JSON.stringify({
      vector_layers: Object.keys(
        (await import('../services/tiles/dist/config.js')).sourceLayers,
      ).map((id) => ({ id })),
    }),
  }))
    meta.run(k, v);
  db.prepare('INSERT INTO tiles VALUES(0,0,0,?)').run(ownTile);
  db.close();
  const info = inspectArchive(archive);
  const manifest = {
    schemaVersion: 1,
    schema: 'design-v1',
    generation,
    region: 'seoul',
    bounds: regions.seoul.bounds,
    source: {
      id: 'osm-geofabrik-kr',
      sha256: shaText('authored input'),
      dataAsOf: '2026-10-18T20:25:06.000Z',
      license: 'ODbL-1.0',
      catalogSha256: shaText('authored catalog'),
    },
    tool: {
      version: planetiler.version,
      sha256: planetiler.sha256,
      profileSha256: shaText('authored profile'),
    },
    archive: {
      ...info,
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
  writeFileSync(resolve(dir, 'manifest.json'), JSON.stringify(manifest));
  return {
    store,
    generation,
    dir,
    archive,
    manifest,
    cleanup: () => rmSync(store, { recursive: true, force: true }),
  };
}
test('XYZ coordinates convert to TMS and reject invalid zoom/axis input', () => {
  assert.equal(tileRow(3, 0), 7);
  assert.equal(tileRow(3, 7), 0);
  for (const [z, y] of [
    [15, 0],
    [-1, 0],
    [1, 2],
    [2, -1],
    [1.2, 0],
  ])
    assert.throws(() => tileRow(z, y));
  assert.throws(() => contained('/tmp/own-store', '../other'));
});
test('OSM header timestamp validation rejects non-PBF and absent replication metadata', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'kmk-pbf-header-'));
  try {
    const f = resolve(dir, 'authored.pbf');
    writeFileSync(f, Buffer.from('not a PBF'));
    assert.throws(() => pbfTimestamp(f));
    writeFileSync(f, authoredPbfHeader(undefined));
    assert.throws(() => pbfTimestamp(f), /OSM_REPLICATION_TIME_REQUIRED/);
    writeFileSync(f, authoredPbfHeader(Math.floor(Date.now() / 1000) + 86400));
    assert.throws(() => pbfTimestamp(f), /OSM_REPLICATION_TIME_REQUIRED/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('OSM timestamp reader accepts independently authored raw and zlib header blocks', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'kmk-valid-pbf-header-'));
  try {
    const path = resolve(directory, 'authored.pbf');
    for (const compressed of [false, true]) {
      writeFileSync(path, authoredPbfHeader(1792281600, compressed));
      assert.equal(pbfTimestamp(path), '2026-10-18T00:00:00.000Z');
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test('archive accepts the exact Planetiler normalized tiles view with ordinary backing tables', async () => {
  const f = await fixture();
  try {
    const db = new DatabaseSync(f.archive);
    db.exec(`DROP TABLE tiles;
      CREATE TABLE tiles_shallow(zoom_level INTEGER,tile_column INTEGER,tile_row INTEGER,tile_data_id INTEGER,PRIMARY KEY(zoom_level,tile_column,tile_row)) WITHOUT ROWID;
      CREATE TABLE tiles_data(tile_data_id INTEGER PRIMARY KEY,tile_data BLOB);
      CREATE VIEW tiles AS select tiles_shallow.zoom_level as zoom_level, tiles_shallow.tile_column as tile_column, tiles_shallow.tile_row as tile_row, tiles_data.tile_data as tile_data from tiles_shallow join tiles_data on tiles_shallow.tile_data_id = tiles_data.tile_data_id;
      INSERT INTO tiles_shallow VALUES(0,0,0,1);`);
    db.prepare('INSERT INTO tiles_data VALUES(1,?)').run(ownTile);
    db.close();
    const info = inspectArchive(f.archive);
    assert.equal(info.tileCount, 1);
    assert.equal(info.gzip, true);
    f.manifest.archive = {
      ...info,
      file: 'base.mbtiles',
      sha256: await sha256(f.archive),
      bytes: readFileSync(f.archive).length,
    };
    writeFileSync(resolve(f.dir, 'manifest.json'), JSON.stringify(f.manifest));
    await activateGeneration(f.store, 'seoul', f.generation);
    assert.equal(activeGeneration(f.store, 'seoul'), f.generation);
  } finally {
    f.cleanup();
  }
});
test('archive rejects arbitrary SQL, indirect views and nonunique normalized tile keys', async () => {
  for (const variant of [
    'arbitrary-sql',
    'backing-view',
    'metadata-view',
    'nonunique-data',
    'nonunique-coordinate',
  ]) {
    const f = await fixture();
    try {
      const db = new DatabaseSync(f.archive);
      db.exec('DROP TABLE tiles');
      if (variant === 'arbitrary-sql') {
        db.exec(
          'CREATE VIEW tiles AS SELECT 0 AS zoom_level,0 AS tile_column,0 AS tile_row,randomblob(4) AS tile_data',
        );
      } else {
        const coordinate =
          variant === 'backing-view'
            ? 'CREATE VIEW tiles_shallow AS SELECT 0 AS zoom_level,0 AS tile_column,0 AS tile_row,1 AS tile_data_id'
            : variant === 'nonunique-coordinate'
              ? 'CREATE TABLE tiles_shallow(zoom_level INTEGER,tile_column INTEGER,tile_row INTEGER,tile_data_id INTEGER)'
              : 'CREATE TABLE tiles_shallow(zoom_level INTEGER,tile_column INTEGER,tile_row INTEGER,tile_data_id INTEGER,PRIMARY KEY(zoom_level,tile_column,tile_row)) WITHOUT ROWID';
        const data =
          variant === 'nonunique-data'
            ? 'CREATE TABLE tiles_data(tile_data_id INTEGER,tile_data BLOB)'
            : 'CREATE TABLE tiles_data(tile_data_id INTEGER PRIMARY KEY,tile_data BLOB)';
        db.exec(`${coordinate}; ${data};
          CREATE VIEW tiles AS select tiles_shallow.zoom_level as zoom_level, tiles_shallow.tile_column as tile_column, tiles_shallow.tile_row as tile_row, tiles_data.tile_data as tile_data from tiles_shallow join tiles_data on tiles_shallow.tile_data_id = tiles_data.tile_data_id;`);
        if (variant === 'metadata-view')
          db.exec(
            'ALTER TABLE metadata RENAME TO original_metadata; CREATE VIEW metadata AS SELECT * FROM original_metadata',
          );
      }
      db.close();
      assert.throws(() => inspectArchive(f.archive), /UNSUPPORTED_ARCHIVE_LAYOUT/, variant);
    } finally {
      f.cleanup();
    }
  }
});
test('archive rejects oversized metadata names, aggregate values and tile blobs before materializing them', async () => {
  for (const variant of ['name', 'aggregate', 'tile']) {
    const f = await fixture();
    try {
      const db = new DatabaseSync(f.archive);
      if (variant === 'name')
        db.prepare('INSERT INTO metadata VALUES(?,?)').run('x'.repeat(129), 'value');
      else if (variant === 'aggregate') {
        const insert = db.prepare('INSERT INTO metadata VALUES(?,?)');
        for (let n = 0; n < 3; n++) insert.run(`authored-${n}`, 'x'.repeat(1536 * 1024));
      } else db.exec('INSERT INTO tiles VALUES(1,0,0,zeroblob(8388609))');
      db.close();
      assert.throws(
        () => inspectArchive(f.archive),
        variant === 'tile' ? /OVERSIZE_TILE/ : /OVERSIZE_ARCHIVE_METADATA/,
        variant,
      );
    } finally {
      f.cleanup();
    }
  }
});
test('verified activation is explicit; malformed or changed generations preserve the active pointer', async () => {
  const f = await fixture();
  try {
    await activateGeneration(f.store, 'seoul', f.generation);
    assert.equal(activeGeneration(f.store, 'seoul'), f.generation);
    await assert.rejects(activateGeneration(f.store, 'seoul', '../other'));
    assert.equal(activeGeneration(f.store, 'seoul'), f.generation);
    writeFileSync(f.archive, Buffer.from('corrupt archive'));
    await assert.rejects(
      verifyGeneration(f.store, 'seoul', f.generation),
      /CHECKSUM|SIZE_MISMATCH/,
    );
    await assert.rejects(activateGeneration(f.store, 'seoul', f.generation));
    assert.equal(activeGeneration(f.store, 'seoul'), f.generation);
  } finally {
    f.cleanup();
  }
});
test('archive metadata tampering is rejected even when bytes have not changed', async () => {
  const f = await fixture();
  try {
    f.manifest.archive.minzoom = -1;
    writeFileSync(resolve(f.dir, 'manifest.json'), JSON.stringify(f.manifest));
    await assert.rejects(verifyGeneration(f.store, 'seoul', f.generation));
  } finally {
    f.cleanup();
  }
});
test('build does not read or download an input without explicit operator opt-in', async () => {
  await assert.rejects(buildGeneration({ operatorOptIn: false }), /OPERATOR_OPT_IN_REQUIRED/);
});
test('real SQLite XYZ service handles styles, gzip tiles, missing coverage, origin/host/method errors and cleanup', async () => {
  const f = await fixture();
  let service;
  try {
    await activateGeneration(f.store, 'seoul', f.generation);
    service = await startTileServer({
      store: f.store,
      region: 'seoul',
      allowedOrigins: ['http://127.0.0.1:4173'],
    });
    const style = await globalThis.fetch(service.origin + '/styles/standard.json', {
      headers: { Origin: 'http://127.0.0.1:4173' },
    });
    assert.equal(style.status, 200);
    assert.equal(style.headers.get('access-control-allow-origin'), 'http://127.0.0.1:4173');
    const json = await style.json();
    assert.equal(json.version, 8);
    assert.equal(json.metadata['korea:schema'], 'design-v1');
    assert.equal(json.sources['korea-base'].tiles[0], service.origin + '/tiles/{z}/{x}/{y}.pbf');
    assert.match(
      json.sources['korea-base'].attribution,
      /^<a href="https:\/\/www\.openstreetmap\.org\/copyright" target="_blank" rel="noopener noreferrer">/,
    );
    assert(json.sources['korea-base'].attribution.includes('OpenStreetMap'));
    const tile = await globalThis.fetch(service.origin + '/tiles/0/0/0.pbf');
    assert.equal(tile.status, 200);
    assert.equal(tile.headers.get('content-encoding'), 'gzip');
    assert.equal(await tile.text(), 'original-authored-http-test-bytes');
    assert.equal((await globalThis.fetch(service.origin + '/tiles/14/0/0.pbf')).status, 204);
    assert.equal((await globalThis.fetch(service.origin + '/tiles/0/0/9.pbf')).status, 400);
    assert.equal(
      (
        await globalThis.fetch(service.origin + '/styles/dark.json', {
          headers: { Origin: 'https://unapproved.example.invalid' },
        })
      ).status,
      403,
    );
    const rawHost = await new Promise((ok, fail) => {
      const request = get(
        new URL('/status', service.origin),
        { headers: { Host: 'unapproved.example.invalid' } },
        (response) => {
          response.resume();
          ok(response.statusCode);
        },
      );
      request.once('error', fail);
    });
    assert.equal(rawHost, 403);
    assert.equal(
      (await globalThis.fetch(service.origin + '/status', { method: 'POST' })).status,
      405,
    );
    assert.equal((await globalThis.fetch(service.origin + '/status?secret=unused')).status, 400);
    assert.equal((await globalThis.fetch(service.origin + '/missing')).status, 404);
    assert(service.counts.styles > 0 && service.counts.tiles > 0);
  } finally {
    await service?.close();
    f.cleanup();
  }
});
