import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isReviewedLicense } from '../scripts/license-policy.mjs';

test('Windows sharp metadata review covers only the inspected name, version and expression', () => {
  const name = '@img/sharp-win32-x64';
  const license = 'Apache-2.0 AND LGPL-3.0-or-later';
  assert.equal(isReviewedLicense(name, '0.35.5', license), true);
  for (const other of ['@img/sharp-win32-arm64', '@img/sharp-win32-ia32', 'sharp', `${name}-other`])
    assert.equal(isReviewedLicense(other, '0.35.5', license), false);
  for (const version of ['0.35.4', '0.35.6', '0.35.5-custom'])
    assert.equal(isReviewedLicense(name, version, license), false);
  for (const expression of ['LGPL-3.0-or-later', 'Apache-2.0 OR LGPL-3.0-or-later', 'UNKNOWN'])
    assert.equal(isReviewedLicense(name, '0.35.5', expression), false);
});

test('existing explicit reviews and unreviewed license rejection remain intact', () => {
  for (const [name, version, license] of [
    ['@img/sharp-libvips-linux-x64', '1.3.4', 'LGPL-3.0-or-later'],
    ['lightningcss', '1.33.0', 'MPL-2.0'],
    ['caniuse-lite', '1.0.30001816', 'CC-BY-4.0'],
    ['argparse', '2.0.1', 'Python-2.0'],
    ['node-forge', '1.4.0', '(BSD-3-Clause OR GPL-2.0)'],
  ]) {
    assert.equal(isReviewedLicense(name, version, license), true);
    assert.equal(isReviewedLicense(name, `${version}-unknown`, license), false);
    assert.equal(isReviewedLicense('unreviewed', version, license), false);
  }
  assert.equal(isReviewedLicense('unreviewed', '1.0.0', 'GPL-3.0-only'), false);
  assert.equal(isReviewedLicense('unreviewed', '1.0.0', 'MIT'), true);
});

test('CLI persists rejected metadata and exits nonzero even alongside a reviewed package', () => {
  const directory = mkdtempSync(join(tmpdir(), 'kmk-license-'));
  try {
    const cli = join(directory, 'pnpm-fixture.mjs');
    const license = 'Apache-2.0 AND LGPL-3.0-or-later';
    for (const version of ['0.35.5', '0.35.6']) {
      const input = {
        MIT: [{ name: 'permissive-fixture', versions: ['1.0.0'] }],
        [license]: [{ name: '@img/sharp-win32-x64', versions: [version] }],
      };
      writeFileSync(cli, `console.log(${JSON.stringify(JSON.stringify(input))});\n`);
      const result = spawnSync(
        process.execPath,
        [fileURLToPath(new URL('../scripts/check-licenses.mjs', import.meta.url))],
        {
          cwd: directory,
          env: { ...process.env, npm_execpath: cli },
          encoding: 'utf8',
          timeout: 10000,
        },
      );
      assert.ifError(result.error);
      assert.equal(result.signal, null);
      assert.equal(result.status, version === '0.35.5' ? 0 : 1);
      const inventory = JSON.parse(readFileSync(join(directory, 'artifacts/qa/licenses.json')));
      assert.equal(inventory.length, 2);
      assert.equal(
        inventory.find((entry) => entry.license === license).reviewed,
        version === '0.35.5',
      );
      if (version !== '0.35.5') assert.match(result.stderr, /New\/unknown license metadata/);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
