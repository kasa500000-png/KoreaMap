import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { authoredMvt } from './tiles-fixture.mjs';
import { inspectArchive, tileRow } from '../services/tiles/dist/archive.js';
import {
  buildLimits,
  verifyGeneration,
  activateGeneration,
  activeGeneration,
} from '../services/tiles/dist/pipeline.js';
import {
  archiveCapabilities,
  planetiler,
  regions,
  sha256,
  shaText,
  tileSchema,
} from '../services/tiles/dist/config.js';

async function fixture() {
  const store = mkdtempSync(resolve(tmpdir(), 'kmk-tiles-v2-'));
  const generation = `${Date.now()}-abcdf012`;
  const directory = resolve(store, 'seoul/generations', generation);
  mkdirSync(directory, { recursive: true });
  const archive = resolve(directory, 'base.mbtiles');
  const db = new DatabaseSync(archive);
  // Normalized Planetiler MBTiles layout with project-authored synthetic MVT geometry.
  db.exec(`CREATE TABLE metadata(name TEXT,value TEXT);
    CREATE TABLE tiles_shallow(zoom_level INTEGER,tile_column INTEGER,tile_row INTEGER,tile_data_id INTEGER,PRIMARY KEY(zoom_level,tile_column,tile_row)) WITHOUT ROWID;
    CREATE TABLE tiles_data(tile_data_id INTEGER PRIMARY KEY,tile_data BLOB);
    CREATE VIEW tiles AS select tiles_shallow.zoom_level as zoom_level, tiles_shallow.tile_column as tile_column, tiles_shallow.tile_row as tile_row, tiles_data.tile_data as tile_data from tiles_shallow join tiles_data on tiles_shallow.tile_data_id = tiles_data.tile_data_id;`);
  const fields = {
    kind: 'String',
    fid: 'String',
    subclass: 'String',
    rank: 'Number',
    minzoom: 'Number',
  };
  const put = db.prepare('INSERT INTO metadata VALUES(?,?)');
  for (const [key, value] of Object.entries({
    minzoom: '0',
    maxzoom: '16',
    version: '2.1.0',
    json: JSON.stringify({
      vector_layers: ['road', 'rail', 'waterway', 'transport'].map((id) => ({ id, fields })),
    }),
  }))
    put.run(key, value);
  db.prepare('INSERT INTO tiles_data VALUES(1,?)').run(
    authoredMvt('original authored normalized layout test', 'design-v2'),
  );
  db.exec('INSERT INTO tiles_shallow VALUES(16,0,0,1)');
  db.close();
  const source = {
    id: 'osm-geofabrik-kr',
    sha256: shaText('authored source'),
    dataAsOf: '2026-10-18T00:00:00.000Z',
    license: 'ODbL-1.0',
    catalogSha256: shaText('authored catalog'),
  };
  const info = inspectArchive(archive, 'design-v2');
  const manifest = {
    schemaVersion: 2,
    schema: 'design-v2',
    schemaRevision: 1,
    generation,
    region: 'seoul',
    bounds: regions.seoul.bounds,
    source,
    sources: [source],
    capabilities: archiveCapabilities(info.layers),
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
test('v1 remains the default; explicit v2 supports z16 and normalized MBTiles', async () => {
  const f = await fixture();
  try {
    assert.equal(tileSchema(), 'design-v1');
    assert.throws(() => tileSchema('design-v3'), /UNREVIEWED/);
    assert.throws(() => inspectArchive(f.archive), /UNREVIEWED_TILE_SCHEMA/);
    const info = inspectArchive(f.archive, 'design-v2');
    assert.equal(info.maxzoom, 16);
    assert.equal(info.tileCount, 1);
    assert.equal(tileRow(16, 0, 16), 65535);
    assert.throws(() => tileRow(16, 0), /INVALID_TILE_COORDINATE/);
    const verified = await verifyGeneration(f.store, 'seoul', f.generation);
    assert.equal(verified.manifest.schemaRevision, 1);
  } finally {
    f.cleanup();
  }
});
test('context is explicit v2 overview capped z9 and detailed Korea preserves 8GiB gate', () => {
  assert.equal(buildLimits('context', 'design-v2', 9).minimumDisk, 1024 ** 3);
  assert.equal(buildLimits('korea', 'design-v2', 16).minimumDisk, 8 * 1024 ** 3);
  assert.equal(buildLimits('seoul', 'design-v2', 16).minimumDisk, 512 * 1024 ** 2);
  assert.throws(() => buildLimits('context', 'design-v2', 10), /CONTEXT_ZOOM_LIMIT/);
  assert.throws(() => buildLimits('context', 'design-v1', 9), /CONTEXT_ZOOM_LIMIT/);
  assert.throws(() => buildLimits('seoul', 'design-v1', 16), /ZOOM_LIMIT/);
  assert.throws(() => buildLimits('seoul', 'design-v2', 17), /ZOOM_LIMIT/);
});
test('CLI defaults preserve v1, and invalid schema/context fail before reading source or starting Java', () => {
  const buildArgs = [
    'build',
    '--region',
    'seoul',
    '--input',
    'does-not-exist.pbf',
    '--sha256',
    'a'.repeat(64),
    '--operator-opt-in',
  ];
  for (const [extra, error] of [
    [['--maxzoom', '16'], 'ZOOM_LIMIT'],
    [['--schema', 'unreviewed'], 'UNREVIEWED_TILE_SCHEMA'],
    [['--region', 'context'], 'CONTEXT_ZOOM_LIMIT'],
    [['--schema', 'design-v2', '--region', 'context', '--maxzoom', '10'], 'CONTEXT_ZOOM_LIMIT'],
  ]) {
    // Keep each case to one explicit region flag.
    const args = [...buildArgs];
    const regionAt = extra.indexOf('--region');
    if (regionAt >= 0) args[args.indexOf('--region') + 1] = extra[regionAt + 1];
    const flags = extra.filter(
      (_, index) => regionAt < 0 || (index !== regionAt && index !== regionAt + 1),
    );
    const result = spawnSync(process.execPath, ['services/tiles/dist/cli.js', ...args, ...flags], {
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(result.status, 1);
    assert.equal(result.stderr.trim(), error);
  }
});
test('capability, schema revision, additional source tampering cannot replace active v2 generation', async () => {
  const f = await fixture();
  try {
    await activateGeneration(f.store, 'seoul', f.generation);
    const original = globalThis.structuredClone(f.manifest);
    for (const mutate of [
      (m) => (m.capabilities.rail = false),
      (m) => (m.capabilities.ocean = true),
      (m) => (m.capabilities.landmask = true),
      (m) => delete m.capabilities.transport,
      (m) => (m.capabilities.extra = true),
      (m) => (m.schemaRevision = 2),
      (m) => m.sources.push({ ...m.source, id: 'unreviewed' }),
      (m) => (m.sources[0].license = 'MIT'),
    ]) {
      const changed = globalThis.structuredClone(original);
      mutate(changed);
      writeFileSync(resolve(f.directory, 'manifest.json'), JSON.stringify(changed));
      await assert.rejects(activateGeneration(f.store, 'seoul', f.generation));
      assert.equal(activeGeneration(f.store, 'seoul'), f.generation);
    }
    f.save();
    await verifyGeneration(f.store, 'seoul', f.generation);
  } finally {
    f.cleanup();
  }
});
test('v2 field declarations reject unknown payload fields, wrong types and missing stable identities', async () => {
  for (const variant of ['missing-fid', 'unknown-field', 'rank-type', 'revision']) {
    const f = await fixture();
    try {
      const db = new DatabaseSync(f.archive);
      if (variant === 'revision')
        db.prepare('UPDATE metadata SET value=? WHERE name=?').run('2.2.0', 'version');
      else {
        const json = JSON.parse(
          db.prepare("SELECT value FROM metadata WHERE name='json'").get().value,
        );
        if (variant === 'missing-fid') delete json.vector_layers[0].fields.fid;
        else if (variant === 'rank-type') json.vector_layers[0].fields.rank = 'String';
        else json.vector_layers[0].fields.unreviewed_payload = 'String';
        db.prepare('UPDATE metadata SET value=? WHERE name=?').run(JSON.stringify(json), 'json');
      }
      db.close();
      assert.throws(() => inspectArchive(f.archive, 'design-v2'), /FIELDS|REVISION/);
    } finally {
      f.cleanup();
    }
  }
});
test('v2 normalized tiles reject out-of-range and fractional coordinates', async () => {
  for (const row of [
    [17, 0, 0],
    [16, 65536, 0],
    [16, 0, -1],
    [15, 0.5, 0],
  ]) {
    const f = await fixture();
    try {
      const db = new DatabaseSync(f.archive);
      db.prepare('UPDATE tiles_shallow SET zoom_level=?,tile_column=?,tile_row=?').run(...row);
      db.close();
      assert.throws(() => inspectArchive(f.archive, 'design-v2'), /INVALID_TILE_COORDINATE/);
    } finally {
      f.cleanup();
    }
  }
});
test('archive inspection rejects unhashed SQLite journal/WAL/shared-memory sidecars', async () => {
  const f = await fixture();
  try {
    for (const suffix of ['-wal', '-journal', '-shm']) {
      writeFileSync(f.archive + suffix, 'authored sidecar test');
      assert.throws(() => inspectArchive(f.archive, 'design-v2'), /UNHASHED_ARCHIVE_SIDECAR/);
      await assert.rejects(
        verifyGeneration(f.store, 'seoul', f.generation),
        /UNHASHED_ARCHIVE_SIDECAR/,
      );
      rmSync(f.archive + suffix);
    }
  } finally {
    f.cleanup();
  }
});
test('v2 metadata cannot hide tiles outside declared zoom coverage', async () => {
  for (const [key, value] of [
    ['maxzoom', '9'],
    ['minzoom', '9'],
  ]) {
    const f = await fixture();
    try {
      const db = new DatabaseSync(f.archive);
      db.prepare('UPDATE metadata SET value=? WHERE name=?').run(value, key);
      if (key === 'minzoom') db.exec('UPDATE tiles_shallow SET zoom_level=8');
      db.close();
      assert.throws(() => inspectArchive(f.archive, 'design-v2'), /ARCHIVE_ZOOM_COVERAGE_MISMATCH/);
    } finally {
      f.cleanup();
    }
  }
});
