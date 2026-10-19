import { openDatabase } from '@korea-map-kit/service-geo-data';
import { KitError } from '@korea-map-kit/core';
import { migrateSearch } from './migration.js';
import { createPostgisSearchProvider } from './provider.js';
import { createSearchServer } from './server.js';
async function main() {
  const command = process.argv[2];
  if (command !== 'migrate' && command !== 'serve')
    throw new KitError('INVALID_ARGUMENT', 'EXPECTED_MIGRATE_OR_SERVE');
  const pool = openDatabase(
    process.env.GEO_DATABASE_URL,
    command === 'serve' ? 'kmk_reader' : undefined,
  );
  if (command === 'migrate') {
    try {
      await migrateSearch(pool);
      console.log(JSON.stringify({ status: 'search-migrated', version: 1 }));
    } finally {
      await pool.end();
    }
    return;
  }
  try {
    const port = Number(process.env.KMK_SEARCH_PORT ?? 8100);
    if (!Number.isInteger(port) || port < 1024 || port > 65535)
      throw new KitError('INVALID_ARGUMENT', 'INVALID_PORT');
    const server = createSearchServer(await createPostgisSearchProvider(pool));
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
}
main().catch((error) => {
  console.error(JSON.stringify({ code: error instanceof KitError ? error.code : 'UNAVAILABLE' }));
  process.exitCode = 1;
});
