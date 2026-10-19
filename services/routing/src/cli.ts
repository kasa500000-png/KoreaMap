import { readFileSync } from 'node:fs';
import { createLocalRoutingProvider, createRoutingServer } from './index.js';
import { validateRoutingDataset, type RoutingDataset } from '@korea-map-kit/core';
try {
  const endpoint = process.env.ROUTING_ENGINE_URL;
  const file = process.env.ROUTING_DATASET_FILE;
  if (!endpoint || !file) throw new Error();
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as { dataset: RoutingDataset };
  const dataset = validateRoutingDataset(manifest.dataset);
  const server = createRoutingServer(createLocalRoutingProvider(endpoint, dataset));
  server.on('error', () => {
    console.error('Routing listener failed.');
    process.exitCode = 1;
  });
  server.listen(8093, '127.0.0.1', () =>
    console.log('Operator routing gateway ready on loopback port 8093.'),
  );
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      server.close();
      server.closeAllConnections();
    });
} catch {
  console.error('Routing requires an explicit engine URL and validated dataset manifest.');
  process.exitCode = 1;
}
