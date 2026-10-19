import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { openDatabase } from '../services/geo-data/dist/index.js';
import {
  migrateSearch,
  createPostgisSearchProvider,
  createSearchServer,
} from '../services/search/dist/index.js';
import { extensionNamespace } from '../services/search/dist/migration.js';
import {
  createKoreanSearchFixturePlaces,
  createRemoteKoreanSearchProvider,
} from '../packages/data-adapters/dist/index.js';
import { createCancellationSource } from '../packages/core/dist/index.js';
const q = (text) => ({ text, language: 'ko', limit: 10 });
test('PostGIS Korean search, actual pg_trgm and cancellation', async (t) => {
  assert.ok(process.env.GEO_DATABASE_URL, 'Run pnpm test:geo');
  const admin = openDatabase(process.env.GEO_DATABASE_URL);
  let reader;
  try {
    await t.test('migration is repeatable; normalized columns follow upserts', async () => {
      await migrateSearch(admin);
      await migrateSearch(admin);
      const g = await extensionNamespace(admin, 'postgis');
      for (const p of createKoreanSearchFixturePlaces())
        await admin.query(
          `INSERT INTO kmk.places(id,name,category,location,address,source,source_id,license,attribution,updated_at,metadata) VALUES($1,$2,$3,CASE WHEN $4::float8 IS NULL THEN NULL ELSE ${g}.ST_SetSRID(${g}.ST_MakePoint($4,$5),4326)::${g}.geography END,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(source,source_id) DO UPDATE SET name=excluded.name,address=excluded.address`,
          [
            p.id,
            p.name,
            p.category,
            p.location?.[0] ?? null,
            p.location?.[1] ?? null,
            p.address,
            p.source,
            p.source_id,
            p.license,
            p.attribution,
            p.updated_at,
            JSON.stringify(p.metadata),
          ],
        );
      assert.equal(
        (await admin.query("SELECT search_name FROM kmk.places WHERE id='search-fixture-0'"))
          .rows[0].search_name,
        '서울합성공원',
      );
      await admin.query("UPDATE kmk.places SET name='서울\t합성공원' WHERE id='search-fixture-0'");
      assert.equal(
        (await admin.query("SELECT search_name FROM kmk.places WHERE id='search-fixture-0'"))
          .rows[0].search_name,
        '서울합성공원',
      );
      await admin.query("UPDATE kmk.places SET name='서울 합성공원' WHERE id='search-fixture-0'");
    });
    reader = openDatabase(process.env.GEO_DATABASE_URL, 'kmk_reader');
    const provider = await createPostgisSearchProvider(reader);
    await t.test('Seoul/Ulsan/Jeju, Korean typo, whitespace and POI address', async () => {
      for (const city of ['서울', '울산', '제주'])
        assert.ok(
          (await provider.searchPage(q(city))).hits.some((h) => h.place.name.includes(city)),
        );
      for (const query of [
        '서울합성공원',
        '서 울 합 성 공 원',
        '서울합성공웜',
        '서울 가상로 101',
        '서울합성공원'.normalize('NFD'),
      ])
        assert.equal((await provider.searchPage(q(query))).hits[0].place.id, 'search-fixture-0');
      assert.equal(
        (await provider.searchPage(q('울산합성산책공웜'))).hits[0].place.id,
        'search-fixture-2',
      );
      assert.equal(
        (await provider.searchPage(q('제주합성공웜'))).hits[0].place.id,
        'search-fixture-4',
      );
      const empty = await provider.searchPage(q('없는장소zzz'));
      assert.deepEqual(empty, { hits: [], nextOffset: null });
      assert.deepEqual(await provider.searchPage(q(' ')), { hits: [], nextOffset: null });
      assert.deepEqual((await provider.searchPage(q("%_'; DROP TABLE kmk.places;--"))).hits, []);
    });
    await t.test(
      'area, radius, category, distance sorting, pagination and attribution',
      async () => {
        const region = await provider.searchPage({
          ...q('합성'),
          category: 'park',
          bounds: { west: 129, south: 35, east: 130, north: 36 },
        });
        assert.deepEqual(
          region.hits.map((h) => h.place.id),
          ['search-fixture-2'],
        );
        const near = await provider.searchPage({
          ...q('합성'),
          center: [126.5, 33.5],
          radiusMeters: 200,
          sort: 'distance',
        });
        assert.equal(near.hits[0].place.id, 'search-fixture-4');
        assert.equal(near.hits.length, 2);
        assert.ok(near.hits[1].distanceMeters > 0);
        const query = { ...q('제주'), limit: 1 };
        const all = [];
        let offset = 0;
        for (let i = 0; i < 5; i++) {
          const page = await provider.searchPage({ ...query, offset });
          all.push(...page.hits.map((h) => h.place.id));
          if (page.nextOffset === null) break;
          offset = page.nextOffset;
        }
        assert.equal(new Set(all).size, all.length);
        assert.equal(all.length, 3);
        assert.equal(near.hits[0].place.license, 'MIT');
        assert.match(near.hits[0].place.attribution, /합성/);
        assert.deepEqual(
          (
            await provider.searchPage({
              ...q('합성'),
              bounds: { west: 170, east: -170, south: -1, north: 1 },
              category: 'park',
            })
          ).hits,
          [],
        );
      },
    );
    await t.test('autocomplete uses own prefix index; reverse is nearby POI only', async () => {
      assert.equal((await provider.autocomplete(q('서울합'))).hits.length, 2);
      assert.deepEqual((await provider.autocomplete(q('서'))).hits, []);
      assert.deepEqual((await provider.autocomplete(q('울산합성공웜'))).hits, []);
      const reverse = await provider.reverseNearby({ center: [129.3, 35.5] });
      assert.equal(reverse.kind, 'nearby-poi');
      assert.equal(reverse.place.address, '울산 가상로 201');
      assert.equal(reverse.distanceMeters, 0);
      assert.equal(await provider.reverseNearby({ center: [0, 0] }), null);
      const trgm = await extensionNamespace(admin, 'pg_trgm');
      const db = await reader.connect();
      try {
        await db.query('SET enable_seqscan=off');
        const plan = await db.query(
          `EXPLAIN SELECT id FROM kmk.places WHERE search_name OPERATOR(${trgm}.%) $1`,
          ['서울합성공웜'],
        );
        assert.match(JSON.stringify(plan.rows), /places_name_trgm/);
        const prefix = await db.query(
          "EXPLAIN SELECT id FROM kmk.places WHERE search_name LIKE '서울%'",
        );
        assert.match(JSON.stringify(prefix.rows), /places_name_(trgm|prefix)/);
      } finally {
        await db.query('RESET enable_seqscan');
        db.release();
      }
    });
    await t.test(
      'locked database request times out/cancels promptly, pool remains usable',
      async () => {
        const blocker = await admin.connect();
        await blocker.query('BEGIN');
        await blocker.query('LOCK TABLE kmk.places IN ACCESS EXCLUSIVE MODE');
        try {
          let start = performance.now();
          await assert.rejects(provider.searchPage(q('서울'), { timeoutMs: 40 }), {
            code: 'TIMEOUT',
          });
          assert.ok(performance.now() - start < 500);
          const source = createCancellationSource();
          const pending = provider.searchPage(q('울산'), { signal: source.signal });
          const rejection = assert.rejects(pending, { code: 'ABORTED' });
          await new Promise((resolve) => globalThis.setTimeout(resolve, 20));
          start = performance.now();
          source.cancel();
          await rejection;
          assert.ok(performance.now() - start < 500);
        } finally {
          await blocker.query('ROLLBACK');
          blocker.release();
        }
        assert.ok((await provider.searchPage(q('서울'))).hits.length > 0);
        assert.equal(reader.waitingCount, 0);
      },
    );
    await t.test('real HTTP transport and bounded response timing', async () => {
      const server = createSearchServer(provider);
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const endpoint = `http://127.0.0.1:${server.address().port}/search`;
      const remote = createRemoteKoreanSearchProvider(
        async (request, context) => {
          const controller = new globalThis.AbortController();
          const off = context.signal.subscribe(() => controller.abort());
          try {
            const response = await globalThis.fetch(endpoint, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(request),
              signal: controller.signal,
            });
            assert.equal(response.status, 200);
            assert.equal(response.headers.get('cache-control'), 'no-store');
            return await response.json();
          } finally {
            off();
          }
        },
        {
          schedule(fn, ms) {
            const id = globalThis.setTimeout(fn, ms);
            return () => globalThis.clearTimeout(id);
          },
        },
      );
      try {
        const times = [];
        for (let i = 0; i < 10; i++) {
          const start = performance.now();
          assert.ok((await remote.searchPage(q('서울합성공웜'))).hits.length);
          times.push(performance.now() - start);
        }
        times.sort((a, b) => a - b);
        console.log(JSON.stringify({ syntheticRows: 7, httpP50Ms: times[4], httpP95Ms: times[9] }));
        assert.ok(times[9] < 2000);
        const denied = await globalThis.fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: 'https://unapproved.invalid' },
          body: '{}',
        });
        assert.equal(denied.status, 403);
      } finally {
        await new Promise((resolve) => {
          server.close(resolve);
          server.closeAllConnections();
        });
      }
    });
  } finally {
    await Promise.all([reader?.end(), admin.end()]);
  }
});
