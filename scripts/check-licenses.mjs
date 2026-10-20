import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Metadata gate, not a replacement for reviewing notices, native binaries or data rights.
const cli = process.env.npm_execpath;
assert(cli, 'Run via pnpm check:licenses');
const scripted = /\.[cm]?js$/.test(cli);
const args = ['-r', '--include-workspace-root', 'licenses', 'list', '--json'];
const result = spawnSync(scripted ? process.execPath : cli, scripted ? [cli, ...args] : args, {
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});
assert.equal(result.status, 0, result.stderr);
const permissive = new Set([
  'MIT',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'Unlicense',
  'BlueOak-1.0.0',
  '(MIT OR Apache-2.0)',
  '(MIT OR CC0-1.0)',
]);
function reviewed(name, version, license) {
  if (license === 'LGPL-3.0-or-later')
    return /^@img\/sharp-libvips-/.test(name) && version === '1.3.4';
  if (license === 'MPL-2.0') return /^lightningcss(?:-|$)/.test(name) && version === '1.33.0';
  if (license === 'CC-BY-4.0') return name === 'caniuse-lite' && version === '1.0.30001816';
  if (license === 'Python-2.0') return name === 'argparse' && version === '2.0.1';
  // Select the BSD option, not the GPL alternative.
  if (license === '(BSD-3-Clause OR GPL-2.0)') return name === 'node-forge' && version === '1.4.0';
  return false;
}
const inventory = Object.entries(JSON.parse(result.stdout))
  .flatMap(([license, packages]) =>
    packages.flatMap(({ name, versions }) =>
      versions.map((version) => ({
        name,
        version,
        license,
        reviewed: permissive.has(license) || reviewed(name, version, license),
      })),
    ),
  )
  .sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
const rejected = inventory.filter((entry) => !entry.reviewed);
mkdirSync('artifacts/qa', { recursive: true });
writeFileSync('artifacts/qa/licenses.json', `${JSON.stringify(inventory, null, 2)}\n`);
assert.deepEqual(rejected, [], 'New/unknown license metadata requires explicit review');
console.log(
  `PASS: ${inventory.length} installed dependency versions across all workspaces; metadata policy only. See docs/qa-report.md for notice/source obligations.`,
);
