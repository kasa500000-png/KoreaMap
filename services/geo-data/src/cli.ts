import { readFile } from 'node:fs/promises';
import { KitError } from 'korea-map-core';
import { readOperatorFile } from './operator-files.js';
import {
  openDatabase,
  migrate,
  prepareCsv,
  downloadCsv,
  importPlaces,
  createPostgisPlacesProvider,
  createPlacesServer,
  syntheticImport,
  type CsvImportConfig,
} from './index.js';

async function main(): Promise<void> {
  const command = process.argv[2];
  if (!['migrate', 'fixture', 'import', 'download', 'collect', 'serve'].includes(command ?? ''))
    throw new KitError(
      'INVALID_ARGUMENT',
      'EXPECTED_MIGRATE_FIXTURE_IMPORT_DOWNLOAD_COLLECT_SERVE',
    );
  if (command !== 'download' && !process.env.GEO_DATABASE_URL)
    throw new KitError('INVALID_ARGUMENT', 'DATABASE_CONFIGURATION_REQUIRED');
  let prepared;
  if (command === 'import' || command === 'download' || command === 'collect') {
    const catalog: unknown = JSON.parse(await readFile('data/sources.json', 'utf8'));
    const config = JSON.parse(
      (await readOperatorFile(process.env.KMK_IMPORT_CONFIG, 65536)).toString('utf8'),
    ) as CsvImportConfig;
    let bytes: Uint8Array;
    if (command === 'download' || command === 'collect') {
      const url = process.env.KMK_DOWNLOAD_URL;
      if (!url) throw new KitError('INVALID_ARGUMENT', 'DOWNLOAD_URL_REQUIRED');
      bytes = await downloadCsv(catalog, config, url);
      prepared = prepareCsv(catalog, config, bytes);
      // Original responses (including unused contact/media fields) stay in memory only.
      if (command === 'download') {
        console.log(
          JSON.stringify({
            status: 'downloaded-and-validated',
            source: prepared.source,
            sha256: prepared.sha256,
            rows: prepared.rows.length,
          }),
        );
        return;
      }
    } else {
      bytes = await readOperatorFile(process.env.KMK_SOURCE_FILE, 10 * 1024 * 1024);
      prepared = prepareCsv(catalog, config, bytes);
    }
  }
  const pool = openDatabase(
    process.env.GEO_DATABASE_URL,
    command === 'serve' ? 'kmk_reader' : command === 'migrate' ? undefined : 'kmk_writer',
  );
  if (command === 'serve') {
    try {
      const port = Number(process.env.KMK_POI_PORT ?? 8099);
      if (!Number.isInteger(port) || port < 1024 || port > 65535)
        throw new KitError('INVALID_ARGUMENT', 'INVALID_PORT');
      const server = createPlacesServer(await createPostgisPlacesProvider(pool));
      server.listen(port, '127.0.0.1', () =>
        console.log(JSON.stringify({ status: 'listening', host: '127.0.0.1', port })),
      );
      server.on('error', () => {
        console.error(JSON.stringify({ code: 'SERVER_FAILED' }));
        void pool.end();
        process.exitCode = 1;
      });
      const stop = () => {
        server.close(() => {
          void pool.end();
        });
        server.closeAllConnections();
      };
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    } catch (error) {
      await pool.end();
      throw error;
    }
    return;
  }
  try {
    if (command === 'migrate') {
      await migrate(pool);
      console.log(JSON.stringify({ status: 'migrated', version: 1 }));
    } else
      console.log(
        JSON.stringify(
          await importPlaces(pool, command === 'fixture' ? syntheticImport() : prepared!),
        ),
      );
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      code: error instanceof KitError ? error.code : 'UNAVAILABLE',
      detail: error instanceof KitError ? error.message : 'GEO_COMMAND_FAILED',
    }),
  );
  process.exitCode = 1;
});
