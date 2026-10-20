import { mkdtempSync, mkdirSync, cpSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
const temp = mkdtempSync(resolve(tmpdir(), 'koreamap-offline-'));
const cli = process.env.npm_execpath;
if (!cli) throw new Error('Run via pnpm offline:check');
try {
  const projects = [
    '.',
    ...['packages', 'examples', 'services'].flatMap((group) =>
      readdirSync(group, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${group}/${entry.name}`),
    ),
  ];
  const manifests = projects.map((directory) => ({
    directory,
    manifest: JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8')),
  }));
  const names = new Set(manifests.map(({ manifest }) => manifest.name));
  const edges = manifests.flatMap(({ directory, manifest }) =>
    Object.entries({
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.optionalDependencies,
    })
      .filter(([, version]) => version.startsWith('workspace:'))
      .map(([name]) => {
        assert(names.has(name), `Missing workspace manifest: ${name}`);
        return { directory, name };
      }),
  );
  const files = [
    'pnpm-workspace.yaml',
    'pnpm-lock.yaml',
    '.npmrc',
    ...projects.map((directory) => `${directory}/package.json`),
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
  for (const { directory, name } of edges) {
    const installed = JSON.parse(
      readFileSync(resolve(temp, directory, 'node_modules', name, 'package.json'), 'utf8'),
    );
    assert.equal(installed.name, name, 'Workspace link must resolve to an installed manifest');
  }
  console.log(
    `PASS: fresh offline install; ${projects.length} manifests and ${edges.length} workspace links verified; no lifecycle scripts`,
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
