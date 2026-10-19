import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('regional update guards preserve active generation; verified rollback is explicit', () => {
  const region = `policy-${randomBytes(5).toString('hex')}`;
  const root = join('artifacts', 'routing', region);
  mkdirSync(root, { recursive: true });
  const image =
    'ghcr.io/valhalla/valhalla:3.9.1@sha256:4fd114eb1d26b8fc2f43bcb3df234c1b63a0bf13c277405e5943d5361dc575de';
  const invoke = (...args) =>
    spawnSync(process.execPath, ['scripts/routing-local.mjs', ...args, '--region', region], {
      encoding: 'utf8',
    });
  const active = () => JSON.parse(readFileSync(join(root, 'active.json'), 'utf8')).generation;
  try {
    writeFileSync(join(root, 'active.json'), JSON.stringify({ generation: 'old' }));
    assert.equal(invoke('build', '--input', 'missing.osm.pbf').status, 1);
    assert.equal(active(), 'old');
    assert.equal(
      invoke('build', '--accept-odbl', '--sha256', 'bad', '--as-of', '2026-10-18T20:25:06Z').status,
      1,
    );
    assert.equal(active(), 'old');
    for (const [id, smokePassed, engineImage] of [
      ['failed', false, image],
      ['incompatible', true, 'other'],
    ]) {
      mkdirSync(join(root, id));
      writeFileSync(join(root, id, 'manifest.json'), JSON.stringify({ smokePassed, engineImage }));
      assert.equal(invoke('activate', '--generation', id).status, 1);
      assert.equal(active(), 'old');
    }
    assert.equal(invoke('activate', '--generation', '../escape').status, 1);
    mkdirSync(join(root, 'verified'));
    writeFileSync(
      join(root, 'verified', 'manifest.json'),
      JSON.stringify({ smokePassed: true, engineImage: image }),
    );
    assert.equal(invoke('activate', '--generation', 'verified').status, 0);
    assert.equal(active(), 'verified');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
