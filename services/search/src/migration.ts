import type pg from 'pg';
import { KitError } from 'korea-map-core';
import { migrate } from '@korea-map-kit/service-geo-data';
export async function extensionNamespace(
  pool: pg.Pool | pg.PoolClient,
  extension: string,
): Promise<string> {
  const result = await pool.query<{ name: string }>(
    'SELECT n.nspname AS name FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname=$1',
    [extension],
  );
  if (!result.rows[0]) throw new KitError('UNAVAILABLE', 'SEARCH_EXTENSION_REQUIRED');
  return '"' + result.rows[0].name.replaceAll('"', '""') + '"';
}
export async function migrateSearch(pool: pg.Pool): Promise<void> {
  await migrate(pool);
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended('kmk-search-v1',0))");
    await db.query('CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA kmk_extensions');
    const t = await extensionNamespace(db, 'pg_trgm');
    await db.query(`
      CREATE OR REPLACE FUNCTION kmk.normalize_search(value text) RETURNS text
      LANGUAGE sql IMMUTABLE PARALLEL SAFE SECURITY INVOKER SET search_path=pg_catalog
      AS $fn$ SELECT translate(translate(normalize(coalesce(value,''),NFC),chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(12288),''),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz') $fn$;
      REVOKE ALL ON FUNCTION kmk.normalize_search(text) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION kmk.normalize_search(text) TO kmk_reader,kmk_writer;
      GRANT USAGE ON SCHEMA ${t} TO kmk_reader,kmk_writer;
      ALTER TABLE kmk.places ADD COLUMN IF NOT EXISTS search_name text GENERATED ALWAYS AS (kmk.normalize_search(name)) STORED;
      ALTER TABLE kmk.places ADD COLUMN IF NOT EXISTS search_address text GENERATED ALWAYS AS (kmk.normalize_search(address)) STORED;
      CREATE INDEX IF NOT EXISTS places_name_trgm ON kmk.places USING gin(search_name ${t}.gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS places_address_trgm ON kmk.places USING gin(search_address ${t}.gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS places_name_prefix ON kmk.places(search_name text_pattern_ops);
      CREATE TABLE IF NOT EXISTS kmk.search_schema_version(version integer PRIMARY KEY CHECK(version=1));
      INSERT INTO kmk.search_schema_version VALUES(1) ON CONFLICT DO NOTHING;
      REVOKE ALL ON kmk.search_schema_version FROM PUBLIC;
    `);
    await db.query('COMMIT');
  } catch {
    await db.query('ROLLBACK').catch(() => {});
    throw new KitError('UNAVAILABLE', 'SEARCH_MIGRATION_FAILED');
  } finally {
    db.release();
  }
}
