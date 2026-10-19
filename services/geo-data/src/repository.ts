import type pg from 'pg';
import {
  KitError,
  validatePlacesQuery,
  validatePublicPlace,
  type PlacesProvider,
} from 'korea-map-core';
import { postgisNamespace } from './database.js';

/** Read-only pool with operator-provisioned credentials. Query limit and SQL statement timeout bound work. */
export async function createPostgisPlacesProvider(pool: pg.Pool): Promise<PlacesProvider> {
  const g = await postgisNamespace(pool);
  return {
    async query(input, context) {
      const q = validatePlacesQuery(input);
      if (context.signal.aborted) throw new KitError('ABORTED', 'OPERATION_ABORTED');
      const values: unknown[] = [];
      const parameter = (v: unknown) => {
        values.push(v);
        return `$${values.length}`;
      };
      const clauses: string[] = [];
      let order = 'p.id';
      if (q.category !== undefined) clauses.push(`p.category=${parameter(q.category)}`);
      if (q.kind === 'nearby') {
        const point = `${g}.ST_SetSRID(${g}.ST_MakePoint(${parameter(q.center[0])},${parameter(q.center[1])}),4326)::${g}.geography`;
        clauses.push(`${g}.ST_DWithin(p.location,${point},${parameter(q.radiusMeters)})`);
        order = `${g}.ST_Distance(p.location,${point}),p.id`;
      }
      if (q.kind === 'bounds') {
        const b = q.bounds;
        const envelope = (west: number, east: number) =>
          `${g}.ST_Intersects(p.location::${g}.geometry,${g}.ST_MakeEnvelope(${parameter(west)},${parameter(b.south)},${parameter(east)},${parameter(b.north)},4326))`;
        clauses.push(
          b.west > b.east
            ? `(${envelope(b.west, 180)} OR ${envelope(-180, b.east)})`
            : envelope(b.west, b.east),
        );
      }
      try {
        const result = await pool.query<{ place: unknown }>(
          `SELECT jsonb_build_object('id',p.id,'name',p.name,'category',p.category,'location',CASE WHEN p.location IS NULL THEN NULL ELSE jsonb_build_array(${g}.ST_X(p.location::${g}.geometry),${g}.ST_Y(p.location::${g}.geometry)) END,'address',p.address,'source',p.source,'source_id',p.source_id,'license',p.license,'attribution',p.attribution,'updated_at',to_char(p.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'metadata',p.metadata) AS place FROM kmk.places p WHERE ${clauses.join(' AND ') || 'true'} ORDER BY ${order} LIMIT ${parameter(q.limit ?? 20)}`,
          values,
        );
        if (context.signal.aborted) throw new KitError('ABORTED', 'OPERATION_ABORTED');
        return result.rows.map((row) => validatePublicPlace(row.place));
      } catch (error) {
        if (error instanceof KitError) throw error;
        throw new KitError('UNAVAILABLE', 'POI_QUERY_FAILED');
      }
    },
  };
}
