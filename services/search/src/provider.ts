import type pg from 'pg';
import {
  createKoreanSearchProvider,
  KitError,
  type OperationContext,
  type SearchPort,
  type Scheduler,
} from 'korea-map-core';
import { extensionNamespace } from './migration.js';
const scheduler: Scheduler = {
  schedule(fn, ms) {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  },
};
async function read(pool: pg.Pool, context: OperationContext, sql: string, values: unknown[]) {
  if (context.signal.aborted) throw new KitError('ABORTED', 'OPERATION_ABORTED');
  const db = await pool.connect();
  let released = false;
  const release = (destroy = false) => {
    if (!released) {
      released = true;
      db.release(destroy);
    }
  };
  const off = context.signal.subscribe(() => release(true));
  try {
    if (context.signal.aborted) throw new KitError('ABORTED', 'OPERATION_ABORTED');
    await db.query('BEGIN READ ONLY');
    await db.query(
      "SET LOCAL statement_timeout='1500ms'; SET LOCAL lock_timeout='500ms'; SET LOCAL pg_trgm.similarity_threshold=0.25",
    );
    const result = await db.query<{ hit: unknown }>(sql, values);
    await db.query('COMMIT');
    return result.rows.map((r) => r.hit);
  } catch {
    if (!released) await db.query('ROLLBACK').catch(() => release(true));
    throw new KitError(
      context.signal.aborted ? 'ABORTED' : 'UNAVAILABLE',
      context.signal.aborted ? 'OPERATION_ABORTED' : 'SEARCH_QUERY_FAILED',
    );
  } finally {
    off();
    release();
  }
}
export async function createPostgisSearchProvider(pool: pg.Pool) {
  const g = await extensionNamespace(pool, 'postgis'),
    t = await extensionNamespace(pool, 'pg_trgm');
  const port: SearchPort = {
    async request(request, context) {
      const q = request.query,
        values: unknown[] = [],
        where: string[] = [];
      const param = (v: unknown) => {
        values.push(v);
        return '$' + values.length;
      };
      let distance = 'NULL::float8',
        rank = '1::float8';
      if (q.category) where.push(`p.category=${param(q.category)}`);
      if (q.center) {
        const point = `${g}.ST_SetSRID(${g}.ST_MakePoint(${param(q.center[0])},${param(q.center[1])}),4326)::${g}.geography`;
        distance = `${g}.ST_Distance(p.location,${point})`;
        if (q.radiusMeters !== undefined)
          where.push(`${g}.ST_DWithin(p.location,${point},${param(q.radiusMeters)})`);
      }
      let limit = 1,
        offset = 0,
        order = `${distance} ASC NULLS LAST,p.id`;
      if (request.kind !== 'reverse') {
        const query = request.query,
          text = param(query.text),
          escaped = query.text.replace(/[\\%_]/gu, '\\$&'),
          prefix = param(escaped + '%'),
          contains = param('%' + escaped + '%');
        const similarity = `greatest(${t}.similarity(p.search_name,${text}),${t}.similarity(p.search_address,${text}))`;
        where.push(
          request.kind === 'autocomplete'
            ? `p.search_name LIKE ${prefix}`
            : `(p.search_name LIKE ${contains} OR p.search_address LIKE ${contains}${query.text.length >= 3 ? ` OR p.search_name OPERATOR(${t}.%) ${text} OR p.search_address OPERATOR(${t}.%) ${text}` : ''})`,
        );
        rank = `CASE WHEN p.search_name=${text} THEN 3 ELSE (CASE WHEN p.search_name LIKE ${prefix} THEN 2 WHEN p.search_name LIKE ${contains} OR p.search_address LIKE ${contains} THEN 1 ELSE 0 END)+${similarity} END`;
        if (query.bounds) {
          const b = query.bounds;
          const box = (west: number, east: number) =>
            `${g}.ST_Intersects(p.location::${g}.geometry,${g}.ST_MakeEnvelope(${param(west)},${param(b.south)},${param(east)},${param(b.north)},4326))`;
          where.push(
            b.west > b.east ? `(${box(b.west, 180)} OR ${box(-180, b.east)})` : box(b.west, b.east),
          );
        }
        limit = query.limit + (request.kind === 'search' ? 1 : 0);
        offset = query.offset ?? 0;
        order =
          (query.sort === 'distance' ? `${distance} ASC NULLS LAST,` : '') + `${rank} DESC,p.id`;
      }
      const place = `jsonb_build_object('id',p.id,'name',p.name,'category',p.category,'location',CASE WHEN p.location IS NULL THEN NULL ELSE jsonb_build_array(${g}.ST_X(p.location::${g}.geometry),${g}.ST_Y(p.location::${g}.geometry)) END,'address',p.address,'source',p.source,'source_id',p.source_id,'license',p.license,'attribution',p.attribution,'updated_at',to_char(p.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'metadata',p.metadata)`;
      const hits = await read(
        pool,
        context,
        `SELECT jsonb_build_object('place',${place},'distanceMeters',${distance},'relevance',${rank}) AS hit FROM kmk.places p WHERE ${where.join(' AND ') || 'true'} ORDER BY ${order} LIMIT ${param(limit)} OFFSET ${param(offset)}`,
        values,
      );
      if (request.kind === 'reverse') {
        const h = hits[0] as { place: unknown; distanceMeters: number } | undefined;
        return h ? { kind: 'nearby-poi', ...h } : null;
      }
      const count = request.query.limit,
        next = offset + count;
      return {
        hits: hits.slice(0, count),
        nextOffset: request.kind === 'search' && hits.length > count && next <= 1000 ? next : null,
      };
    },
  };
  return createKoreanSearchProvider(port, scheduler);
}
