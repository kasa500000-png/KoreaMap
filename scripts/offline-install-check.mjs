import { mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
const temp = mkdtempSync(resolve(tmpdir(), 'koreamap-offline-'));
const cli = process.env.npm_execpath;
if (!cli) throw new Error('Run via pnpm offline:check');
try {
  const files = [
    'package.json',
    'pnpm-workspace.yaml',
    'pnpm-lock.yaml',
    '.npmrc',
    ...['core', 'web', 'native', 'styles', 'data-adapters'].map(
      (name) => `packages/${name}/package.json`,
    ),
    ...['web', 'expo'].map((name) => `examples/${name}/package.json`),
    ...['geo-data', 'search', 'routing'].map((name) => `services/${name}/package.json`),
  ];
  for (const file of files) {
    const target = resolve(temp, file);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(resolve(file), target);
  }
  const scripted = /\.[cm]?js$/.test(cli);
  const query = spawnSync(
    scripted ? process.execPath : cli,
    scripted ? [cli, 'store', 'path'] : ['store', 'path'],
    { encoding: 'utf8' },
  );
  if (query.status !== 0) throw new Error('Cannot locate pnpm store');
  const args = [
    'install',
    '--offline',
    '--frozen-lockfile',
    '--store-dir',
    dirname(query.stdout.trim()),
    '--package-import-method',
    'copy',
  ];
  const result = spawnSync(scripted ? process.execPath : cli, scripted ? [cli, ...args] : args, {
    cwd: temp,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      'Fresh offline install failed; prime the pnpm store with the locked online install first.',
    );
  console.log('PASS: fresh workspace install from local store; no lifecycle scripts');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
