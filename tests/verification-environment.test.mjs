import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { observedPnpmVersion } from '../scripts/verification-environment.mjs';

test('receipt identifies the executing runtime without copying private environment values', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { verificationEnvironment } from './scripts/verification-environment.mjs';
    console.log(JSON.stringify(verificationEnvironment()));
  `,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, KMK_PRIVATE_TEST_SENTINEL: 'private-test-value' },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    platform: process.platform,
    architecture: process.arch,
    node: process.versions.node,
    pnpm: null,
  });
  assert(!result.stdout.includes('private-test-value'));
});

test('pnpm identity accepts only an observed stable version, never arbitrary command output', () => {
  assert.equal(observedPnpmVersion('12.14.0\r\n'), '12.14.0');
  for (const output of ['', 'unknown', '12.14.0\nprivate-test-value', '12.14.0-beta.1'])
    assert.throws(() => observedPnpmVersion(output), /Unable to identify stable pnpm version/);
});
