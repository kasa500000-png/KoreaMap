import test from 'node:test';
import assert from 'node:assert/strict';
import {
  openDatabase,
  migrate,
  importPlaces,
  syntheticImport,
  createPostgisPlacesProvider,
  createPlacesServer,
} from '../services/geo-data/dist/index.js';
import { registerImport } from '../services/geo-data/dist/ingestion.js';
import { postgisNamespace } from '../services/geo-data/dist/database.js';
import { createCancellationSource, createPlacesClient } from '../packages/core/dist/index.js';
import { createRemotePlacesProvider } from '../packages/data-adapters/dist/index.js';

test('real isolated PostgreSQL/PostGIS integration', async (t) => {
  assert.ok(process.env.GEO_DATABASE_URL, 'Run pnpm test:geo; never silently skip DB tests.');
  const admin = openDatabase(process.env.GEO_DATABASE_URL);
  let writer, reader;
  const context = () => ({ signal: createCancellationSource().signal });
  try {
    await t.test('transactional schema is repeatable and creates spatial indexes/RLS', async () => {
      await migrate(admin);
      await migrate(admin);
      const versions = await admin.query(
        'SELECT version(), public.postgis_full_version() AS postgis',
      );
      console.log(versions.rows[0].postgis);
      const result = await admin.query(
        "SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname='kmk' AND indexdef LIKE '%gist%'",
      );
      assert.equal(result.rows[0].n, 2);
      const rls = await admin.query(
        "SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='kmk' AND c.relname='places'",
      );
      assert.equal(rls.rows[0].relrowsecurity, true);
    });
    writer = openDatabase(process.env.GEO_DATABASE_URL, 'kmk_writer');
    reader = openDatabase(process.env.GEO_DATABASE_URL, 'kmk_reader');
    const provider = await createPostgisPlacesProvider(reader);
    const g = await postgisNamespace(admin);
    await t.test('imports authored fixture and replays without duplicate records', async () => {
      assert.equal((await importPlaces(writer, syntheticImport())).written, 7);
      assert.equal((await importPlaces(writer, syntheticImport())).written, 7);
      assert.equal((await reader.query('SELECT count(*)::int AS n FROM kmk.places')).rows[0].n, 7);
    });
    await t.test('real meters, bounded geography, category and unlocated records', async () => {
      const near = await provider.query(
        { kind: 'nearby', center: [127, 37.5], radiusMeters: 150 },
        context(),
      );
      assert.deepEqual(
        near.map((p) => p.category),
        ['park', 'tourism'],
      );
      assert.equal(
        (
          await provider.query(
            {
              kind: 'bounds',
              bounds: { west: 126.99, south: 37.49, east: 127.0001, north: 37.51 },
            },
            context(),
          )
        ).length,
        1,
      );
      const trails = await provider.query({ kind: 'category', category: 'trail' }, context());
      assert.equal(trails[0].location, null);
      assert.equal(trails[0].license, 'MIT');
      assert.equal(trails[0].updated_at, '2026-10-18T00:00:00.000Z');
      await assert.rejects(
        provider.query({ kind: 'category', category: "park'; DROP TABLE kmk.places" }, context()),
      );
    });
    await t.test('least privilege rejects reader writes and writer DELETE/DDL', async () => {
      await assert.rejects(reader.query("UPDATE kmk.places SET name='changed'"));
      await assert.rejects(reader.query('SELECT * FROM kmk.import_runs'));
      await assert.rejects(writer.query('DELETE FROM kmk.places'));
      await assert.rejects(writer.query('CREATE TABLE kmk.forbidden (id int)'));
      await admin.query('CREATE ROLE kmk_outsider NOLOGIN');
      const session = await admin.connect();
      try {
        await session.query('SET ROLE kmk_outsider');
        await assert.rejects(session.query('SELECT * FROM kmk.places'));
      } finally {
        await session.query('RESET ROLE');
        session.release();
      }
    });
    await t.test(
      'mid-file failure rolls all places back and records only a safe error',
      async () => {
        await admin.query(
          "ALTER TABLE kmk.places ADD CONSTRAINT test_failure CHECK(category<>'parking') NOT VALID",
        );
        await assert.rejects(importPlaces(writer, syntheticImport(2)), /IMPORT_FAILED/);
        await admin.query('ALTER TABLE kmk.places DROP CONSTRAINT test_failure');
        assert.equal(
          (await reader.query("SELECT count(*)::int AS n FROM kmk.places WHERE name LIKE '%갱신%'"))
            .rows[0].n,
          0,
        );
        const runs = await writer.query(
          "SELECT error_code,rows_written FROM kmk.import_runs WHERE status='failed'",
        );
        assert.equal(runs.rows[0].error_code, 'IMPORT_FAILED');
        assert.equal(runs.rows[0].rows_written, 0);
      },
    );
    await t.test(
      'recovery marks abandoned run interrupted and refresh prevents stale overwrite',
      async () => {
        await writer.query(
          "INSERT INTO kmk.import_runs(id,source,snapshot_sha256,status) VALUES(gen_random_uuid(),'synthetic-fixture',$1,'running')",
          ['0'.repeat(64)],
        );
        assert.equal((await importPlaces(writer, syntheticImport(2))).written, 7);
        assert.equal(
          (
            await writer.query(
              "SELECT count(*)::int AS n FROM kmk.import_runs WHERE status='interrupted'",
            )
          ).rows[0].n,
          1,
        );
        assert.equal((await importPlaces(writer, syntheticImport(1))).written, 0);
        assert.equal(
          (await provider.query({ kind: 'category', category: 'park' }, context()))[0].name,
          '합성 park 갱신',
        );
      },
    );
    await t.test(
      'source lock prevents concurrent import and unadmitted data fails closed',
      async () => {
        const db = await admin.connect();
        try {
          await db.query(
            "SELECT pg_advisory_lock(hashtextextended('kmk-import:synthetic-fixture',0))",
          );
          await assert.rejects(importPlaces(writer, syntheticImport()), /SOURCE_IMPORT_BUSY/);
        } finally {
          await db.query(
            "SELECT pg_advisory_unlock(hashtextextended('kmk-import:synthetic-fixture',0))",
          );
          db.release();
        }
        await assert.rejects(
          importPlaces(writer, globalThis.structuredClone(syntheticImport())),
          /IMPORT_NOT_ADMITTED/,
        );
      },
    );
    await t.test(
      'EPSG:5174 transformation uses a known projection-origin control point',
      async () => {
        const input = globalThis.structuredClone(syntheticImport(2));
        input.rows = [input.rows[0]];
        input.rows[0].projected = [200000, 500000];
        input.rows[0].srid = 5174;
        await importPlaces(writer, registerImport(input));
        const p = (await provider.query({ kind: 'category', category: 'park' }, context()))[0];
        assert.ok(Math.abs(p.location[0] - 127.0007835) < 0.00001);
        assert.ok(Math.abs(p.location[1] - 38.0027461) < 0.00001);
      },
    );
    await t.test(
      'antimeridian bounds split correctly and nearby candidates never merge identities',
      async () => {
        await admin.query(
          `INSERT INTO kmk.places SELECT 'synthetic:date-east',name,category,${g}.ST_SetSRID(${g}.ST_MakePoint(179.9,0),4326)::${g}.geography,address,source,'date-east',license,attribution,updated_at,metadata,ingested_at FROM kmk.places WHERE id='synthetic:other'`,
        );
        await admin.query(
          `INSERT INTO kmk.places SELECT 'synthetic:date-west',name,category,${g}.ST_SetSRID(${g}.ST_MakePoint(-179.9,0),4326)::${g}.geography,address,source,'date-west',license,attribution,updated_at,metadata,ingested_at FROM kmk.places WHERE id='synthetic:other'`,
        );
        const places = await provider.query(
          { kind: 'bounds', bounds: { west: 179, east: -179, south: -1, north: 1 } },
          context(),
        );
        assert.equal(places.length, 2);
        await admin.query(
          "INSERT INTO kmk.places SELECT 'synthetic:duplicate',name,category,location,address,source,'duplicate',license,attribution,updated_at,metadata,ingested_at FROM kmk.places WHERE id='synthetic:tourism'",
        );
        assert.ok((await importPlaces(writer, syntheticImport(2))).nearbyCandidates > 0);
        assert.equal(
          (await provider.query({ kind: 'category', category: 'tourism' }, context())).length,
          2,
        );
      },
    );
    await t.test('spatial index is usable for radius and geometry queries', async () => {
      const db = await reader.connect();
      try {
        await db.query('SET enable_seqscan=off');
        const plan = await db.query(
          `EXPLAIN SELECT id FROM kmk.places WHERE ${g}.ST_DWithin(location,${g}.ST_SetSRID(${g}.ST_MakePoint(127,37.5),4326)::${g}.geography,200)`,
        );
        assert.match(JSON.stringify(plan.rows), /places_location_gist/);
        const bounds = await db.query(
          `EXPLAIN SELECT id FROM kmk.places WHERE ${g}.ST_Intersects(location::${g}.geometry,${g}.ST_MakeEnvelope(126,37,128,38,4326))`,
        );
        assert.match(JSON.stringify(bounds.rows), /places_geometry_gist/);
      } finally {
        await db.query('RESET enable_seqscan');
        db.release();
      }
    });
    await t.test('SDK → local HTTP → read-only PostGIS with no external requests', async () => {
      const server = createPlacesServer(provider);
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      const endpoint = `http://127.0.0.1:${server.address().port}/places/query`;
      let calls = 0;
      const remote = createRemotePlacesProvider(async (query, ctx) => {
        assert.equal(new URL(endpoint).hostname, '127.0.0.1');
        calls++;
        const abort = new globalThis.AbortController();
        const off = ctx.signal.subscribe(() => abort.abort());
        try {
          const response = await globalThis.fetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(query),
            signal: abort.signal,
          });
          assert.equal(response.status, 200);
          assert.equal(response.headers.get('cache-control'), 'no-store');
          return await response.json();
        } finally {
          off();
        }
      });
      const client = createPlacesClient(remote, {
        schedule(fn, ms) {
          const id = globalThis.setTimeout(fn, ms);
          return () => globalThis.clearTimeout(id);
        },
      });
      try {
        assert.equal((await client.getPlacesByCategory({ category: 'parking' })).length, 1);
        assert.equal(
          (await client.getNearbyPlaces({ center: [127, 37.5], radiusMeters: 20 })).length,
          1,
        );
        assert.equal(
          (
            await client.getPlacesInBounds({
              bounds: { west: 179, east: -179, south: -1, north: 1 },
            })
          ).length,
          2,
        );
        const rejected = await globalThis.fetch(endpoint, {
          method: 'POST',
          headers: { origin: 'https://unapproved.invalid', 'content-type': 'application/json' },
          body: '{}',
        });
        assert.equal(rejected.status, 403);
        const invalid = await globalThis.fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{',
        });
        assert.equal(invalid.status, 400);
        assert.equal(calls, 3);
      } finally {
        await new Promise((resolve) => {
          server.close(resolve);
          server.closeAllConnections();
        });
      }
    });
  } finally {
    await Promise.all([reader?.end(), writer?.end(), admin.end()]);
  }
});
