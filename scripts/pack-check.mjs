import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
const root = process.cwd();
const destination = resolve(root, 'artifacts');
mkdirSync(destination, { recursive: true });
for (const name of readdirSync(destination))
  if (name.endsWith('.tgz')) rmSync(resolve(destination, name));
const cli = process.env.npm_execpath;
if (!cli) throw new Error('Use pnpm pack:check');
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
for (const name of ['core', 'web', 'native', 'styles', 'data-adapters']) {
  const args = ['pack', '--pack-destination', destination];
  const scripted = /\.[cm]?js$/.test(cli);
  run(
    scripted ? process.execPath : cli,
    scripted ? [cli, ...args] : args,
    resolve(root, 'packages', name),
  );
}
const files = readdirSync(destination).filter((name) => name.endsWith('.tgz'));
if (files.length !== 5) throw new Error('Expected five SDK tarballs');
run(process.execPath, [
  'scripts/python.mjs',
  'scripts/audit-cost-security.py',
  ...files.flatMap((name) => ['--artifact', resolve(destination, name)]),
]);

run(process.execPath, ['scripts/python.mjs', 'scripts/check-data.py', '--artifacts']);
