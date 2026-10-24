import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isReviewedLicense } from './license-policy.mjs';

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
const inventory = Object.entries(JSON.parse(result.stdout))
  .flatMap(([license, packages]) =>
    packages.flatMap(({ name, versions }) =>
      versions.map((version) => ({
        name,
        version,
        license,
        reviewed: isReviewedLicense(name, version, license),
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
