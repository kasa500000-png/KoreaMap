import pg from 'pg';
import { KitError } from 'korea-map-core';

export function openDatabase(
  connection: string | undefined,
  role?: 'kmk_reader' | 'kmk_writer',
): pg.Pool {
  if (!connection) throw new KitError('INVALID_ARGUMENT', 'DATABASE_CONFIGURATION_REQUIRED');
  let url: URL;
  try {
    url = new URL(connection);
  } catch {
    throw new KitError('INVALID_ARGUMENT', 'INVALID_DATABASE_CONFIGURATION');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.hostname ||
    !url.username ||
    !url.password ||
    !url.pathname.slice(1) ||
    url.search ||
    url.hash
  )
    throw new KitError('INVALID_ARGUMENT', 'INVALID_DATABASE_CONFIGURATION');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const pool = new pg.Pool({
    host: url.hostname.replace(/^\[|\]$/gu, ''),
    port: Number(url.port || 5432),
    database: decodeURIComponent(url.pathname.slice(1)),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl: local ? false : { rejectUnauthorized: true },
    max: 3,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    statement_timeout: 5000,
    lock_timeout: 2000,
    query_timeout: 10000,
    ...(role ? { options: `-c role=${role}` } : {}),
  });
  // Idle connection failures are observable through the next query; never print connection details.
  pool.on('error', () => {});
  return pool;
}

export async function postgisNamespace(db: pg.Pool | pg.PoolClient): Promise<string> {
  const r = await db.query<{ name: string }>(
    "SELECT n.nspname AS name FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='postgis'",
  );
  if (!r.rows[0]) throw new KitError('UNAVAILABLE', 'POSTGIS_REQUIRED');
  return '"' + r.rows[0].name.replaceAll('"', '""') + '"';
}

/** Run explicitly as the operator's migration administrator, never on SDK import/server startup. */
export async function migrate(pool: pg.Pool): Promise<void> {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended('kmk-schema-v1',0))");
    await db.query(
      'CREATE SCHEMA IF NOT EXISTS kmk_extensions; CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA kmk_extensions',
    );
    const g = await postgisNamespace(db);
    await db.query(`
      CREATE SCHEMA IF NOT EXISTS kmk;
      REVOKE ALL ON SCHEMA kmk FROM PUBLIC;
      CREATE TABLE IF NOT EXISTS kmk.schema_version (version integer PRIMARY KEY CHECK(version=1));
      INSERT INTO kmk.schema_version VALUES (1) ON CONFLICT DO NOTHING;
      DO $roles$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='kmk_reader') THEN CREATE ROLE kmk_reader NOLOGIN; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='kmk_writer') THEN CREATE ROLE kmk_writer NOLOGIN; END IF;
      END $roles$;
      CREATE TABLE IF NOT EXISTS kmk.places (
        id text PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 256),
        name text NOT NULL CHECK(length(name) BETWEEN 1 AND 500),
        category text NOT NULL CHECK(category IN ('park','tourism','parking','toilet','pet_facility','trail','other')),
        location ${g}.geography(Point,4326),
        address text CHECK(length(address)<=1000),
        source text NOT NULL CHECK(length(source) BETWEEN 1 AND 100),
        source_id text NOT NULL CHECK(length(source_id) BETWEEN 1 AND 256),
        license text NOT NULL CHECK(length(license) BETWEEN 1 AND 100),
        attribution text NOT NULL CHECK(length(attribution) BETWEEN 1 AND 2000),
        updated_at timestamptz NOT NULL CHECK(isfinite(updated_at)),
        metadata jsonb NOT NULL CHECK(jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=16384),
        ingested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        UNIQUE(source,source_id)
      );
      CREATE INDEX IF NOT EXISTS places_location_gist ON kmk.places USING gist(location);
      CREATE INDEX IF NOT EXISTS places_geometry_gist ON kmk.places USING gist((location::${g}.geometry));
      CREATE INDEX IF NOT EXISTS places_category_id ON kmk.places(category,id);
      CREATE TABLE IF NOT EXISTS kmk.import_runs (
        id uuid PRIMARY KEY, source text NOT NULL, snapshot_sha256 text NOT NULL CHECK(snapshot_sha256 ~ '^[0-9a-f]{64}$'),
        status text NOT NULL CHECK(status IN ('running','succeeded','failed','interrupted')),
        started_at timestamptz NOT NULL DEFAULT clock_timestamp(), finished_at timestamptz,
        rows_total integer NOT NULL DEFAULT 0, rows_written integer NOT NULL DEFAULT 0,
        duplicate_rows integer NOT NULL DEFAULT 0, nearby_candidates integer NOT NULL DEFAULT 0,
        error_code text CHECK(error_code IN ('IMPORT_FAILED','PROCESS_INTERRUPTED'))
      );
      CREATE INDEX IF NOT EXISTS import_runs_source_status ON kmk.import_runs(source,status);
      REVOKE ALL ON ALL TABLES IN SCHEMA kmk FROM PUBLIC;
      ALTER TABLE kmk.places ENABLE ROW LEVEL SECURITY;
      ALTER TABLE kmk.import_runs ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS places_reader ON kmk.places;
      CREATE POLICY places_reader ON kmk.places FOR SELECT TO kmk_reader USING(true);
      DROP POLICY IF EXISTS places_writer ON kmk.places;
      CREATE POLICY places_writer ON kmk.places TO kmk_writer USING(true) WITH CHECK(true);
      DROP POLICY IF EXISTS runs_writer ON kmk.import_runs;
      CREATE POLICY runs_writer ON kmk.import_runs TO kmk_writer USING(true) WITH CHECK(true);
      GRANT USAGE ON SCHEMA kmk, ${g} TO kmk_reader, kmk_writer;
      GRANT SELECT ON kmk.places TO kmk_reader;
      GRANT SELECT,INSERT,UPDATE ON kmk.places,kmk.import_runs TO kmk_writer;
    `);
    await db.query('COMMIT');
  } catch {
    await db.query('ROLLBACK').catch(() => {});
    throw new KitError('UNAVAILABLE', 'MIGRATION_FAILED');
  } finally {
    db.release();
  }
}
