import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { KitError, validatePublicPlace } from '@korea-map-kit/core';
import { assertPrepared, type PreparedImport } from './ingestion.js';
import { postgisNamespace } from './database.js';

export interface ImportResult {
  readonly runId: string;
  readonly status: 'succeeded';
  readonly total: number;
  readonly written: number;
  readonly duplicates: number;
  readonly nearbyCandidates: number;
}
/** Whole-file atomicity, source lock, sanitized durable run log, replay-safe upsert. No retry loop. */
export async function importPlaces(pool: pg.Pool, input: PreparedImport): Promise<ImportResult> {
  assertPrepared(input);
  const db = await pool.connect();
  const runId = randomUUID();
  let locked = false,
    recorded = false;
  try {
    const lock = await db.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',
      [`kmk-import:${input.source}`],
    );
    locked = lock.rows[0]?.locked === true;
    if (!locked) throw new KitError('UNAVAILABLE', 'SOURCE_IMPORT_BUSY');
    await db.query(
      "UPDATE kmk.import_runs SET status='interrupted',finished_at=clock_timestamp(),error_code='PROCESS_INTERRUPTED' WHERE source=$1 AND status='running'",
      [input.source],
    );
    await db.query(
      "INSERT INTO kmk.import_runs(id,source,snapshot_sha256,status,rows_total,duplicate_rows) VALUES($1,$2,$3,'running',$4,$5)",
      [runId, input.source, input.sha256, input.rows.length, input.duplicates],
    );
    recorded = true;
    const g = await postgisNamespace(db);
    await db.query('BEGIN');
    let written = 0,
      nearbyCandidates = 0;
    for (const row of input.rows) {
      let location = null;
      if (row.projected) {
        const transformed = await db.query<{ x: number; y: number }>(
          `SELECT ${g}.ST_X(p) AS x,${g}.ST_Y(p) AS y FROM (SELECT ${g}.ST_Transform(${g}.ST_SetSRID(${g}.ST_MakePoint($1,$2),$3),4326) AS p) AS point`,
          [...row.projected, row.srid],
        );
        const p = transformed.rows[0];
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y))
          throw new KitError('INVALID_ARGUMENT', 'TRANSFORM_FAILED');
        if (!input.synthetic && (p.x < 124 || p.x > 132 || p.y < 33 || p.y > 39))
          throw new KitError('INVALID_ARGUMENT', 'TRANSFORM_OUTSIDE_DATASET_AREA');
        location = [p.x, p.y] as const;
      }
      const p = validatePublicPlace({ ...row.place, location });
      if (location) {
        const duplicates = await db.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM kmk.places WHERE id<>$1 AND name=$2 AND category=$3 AND ${g}.ST_DWithin(location,${g}.ST_SetSRID(${g}.ST_MakePoint($4,$5),4326)::${g}.geography,15)`,
          [p.id, p.name, p.category, ...location],
        );
        nearbyCandidates += duplicates.rows[0]?.count ?? 0;
      }
      const upsert = await db.query(
        `INSERT INTO kmk.places(id,name,category,location,address,source,source_id,license,attribution,updated_at,metadata)
        VALUES($1,$2,$3,CASE WHEN $4::float8 IS NULL THEN NULL ELSE ${g}.ST_SetSRID(${g}.ST_MakePoint($4,$5),4326)::${g}.geography END,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT(source,source_id) DO UPDATE SET name=excluded.name,category=excluded.category,location=excluded.location,address=excluded.address,license=excluded.license,attribution=excluded.attribution,updated_at=excluded.updated_at,metadata=excluded.metadata,ingested_at=clock_timestamp()
        WHERE excluded.updated_at>=kmk.places.updated_at`,
        [
          p.id,
          p.name,
          p.category,
          location?.[0] ?? null,
          location?.[1] ?? null,
          p.address,
          p.source,
          p.source_id,
          p.license,
          p.attribution,
          p.updated_at,
          JSON.stringify(p.metadata),
        ],
      );
      written += upsert.rowCount ?? 0;
    }
    await db.query(
      "UPDATE kmk.import_runs SET status='succeeded',finished_at=clock_timestamp(),rows_written=$2,nearby_candidates=$3 WHERE id=$1",
      [runId, written, nearbyCandidates],
    );
    await db.query('COMMIT');
    return {
      runId,
      status: 'succeeded',
      total: input.rows.length,
      written,
      duplicates: input.duplicates,
      nearbyCandidates,
    };
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    if (recorded)
      await db
        .query(
          "UPDATE kmk.import_runs SET status='failed',finished_at=clock_timestamp(),error_code='IMPORT_FAILED' WHERE id=$1 AND status='running'",
          [runId],
        )
        .catch(() => {});
    if (error instanceof KitError) throw error;
    throw new KitError('UNAVAILABLE', 'IMPORT_FAILED');
  } finally {
    let broken = false;
    if (locked)
      await db
        .query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [`kmk-import:${input.source}`])
        .catch(() => {
          broken = true;
        });
    db.release(broken);
  }
}
