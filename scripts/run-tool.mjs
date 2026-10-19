import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
const require = createRequire(resolve(process.cwd(), 'package.json'));
const [tool, ...args] = process.argv.slice(2);
const bins = { next: 'dist/bin/next', expo: 'bin/cli' };
if (!tool || !Object.hasOwn(bins, tool)) throw new Error('Unknown tool');
const bin = resolve(dirname(require.resolve(`${tool}/package.json`)), bins[tool]);
if (tool === 'next' && ['build', 'dev'].includes(args[0])) {
  const libre = dirname(require.resolve('maplibre-gl/package.json'));
  const target = resolve('public/vendor/maplibre');
  mkdirSync(target, { recursive: true });
  copyFileSync(
    resolve(libre, 'dist/maplibre-gl-worker.mjs'),
    resolve(target, 'maplibre-gl-worker.mjs'),
  );
  copyFileSync(resolve(libre, 'LICENSE.txt'), resolve(target, 'LICENSE.txt'));
}
const result = spawnSync(process.execPath, [bin, ...args], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
    EXPO_NO_TELEMETRY: '1',
    EXPO_OFFLINE: '1',
    EXPO_NO_DOTENV: '1',
  },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
