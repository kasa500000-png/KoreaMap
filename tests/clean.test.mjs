import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { cleanBuildOutputs } from '../scripts/clean-build-outputs.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function write(root, file, text = 'synthetic retained operator content') {
  const target = resolve(root, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
  return target;
}
function temporary(run) {
  const root = mkdtempSync(resolve(tmpdir(), 'kmk-clean-'));
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('actual clean task deletes build output and preserves operator data, secrets, receipts and worktrees', () => {
  temporary((root) => {
    const retained = [
      'artifacts/tiles/generation/archive.mbtiles',
      'artifacts/geo-dev/.env',
      'artifacts/qa/report.json',
      'artifacts/native/app-debug.apk',
      'artifacts/korea-map-core-0.1.0.tgz',
      'artifacts/worktrees/review/.git',
      'data/raw/source.csv',
      '.env',
      'packages/core/src/index.ts',
    ].map((file) => write(root, file));
    const generated = [
      ...['core', 'web', 'native', 'styles', 'data-adapters'].map(
        (name) => `packages/${name}/dist/index.js`,
      ),
      ...['geo-data', 'search', 'routing', 'tiles'].map((name) => `services/${name}/dist/index.js`),
      'examples/web/.next/build.txt',
      'examples/web/out/index.html',
      'examples/web/tsconfig.tsbuildinfo',
      'examples/expo/dist/index.js',
      'test-results/result.txt',
      'playwright-report/index.html',
    ].map((file) => write(root, file, 'synthetic generated output'));
    mkdirSync(resolve(root, 'scripts'));
    for (const name of ['tasks.mjs', 'clean-build-outputs.mjs'])
      cpSync(resolve(repository, 'scripts', name), resolve(root, 'scripts', name));
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = spawnSync(process.execPath, [resolve(root, 'scripts/tasks.mjs'), 'clean'], {
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr);
      for (const path of generated) assert(!existsSync(path));
      for (const path of retained)
        assert.equal(readFileSync(path, 'utf8'), 'synthetic retained operator content');
    }
  });
});

test('link or junction ancestor rejects the whole cleanup before any output is removed', () => {
  temporary((root) => {
    const workspace = resolve(root, 'workspace');
    mkdirSync(workspace);
    const preserved = write(workspace, 'packages/core/dist/index.js');
    const outside = resolve(root, 'outside');
    const external = write(outside, 'web/.next/private.txt');
    symlinkSync(
      outside,
      resolve(workspace, 'examples'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    assert.throws(() => cleanBuildOutputs(workspace), /CLEAN_LINK_PATH_REJECTED/);
    assert(existsSync(preserved));
    assert.equal(readFileSync(external, 'utf8'), 'synthetic retained operator content');
  });
});

test('linked output is rejected and a canonical workspace alias is accepted', () => {
  temporary((root) => {
    const workspace = resolve(root, 'workspace');
    mkdirSync(resolve(workspace, 'packages/core'), { recursive: true });
    const outside = resolve(root, 'outside');
    const external = write(outside, 'private.txt');
    const output = resolve(workspace, 'packages/core/dist');
    symlinkSync(outside, output, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => cleanBuildOutputs(workspace), /CLEAN_LINK_PATH_REJECTED/);
    assert(existsSync(external));
    unlinkSync(output);
    write(workspace, 'packages/core/dist/index.js', 'generated');
    const alias = resolve(root, 'alias');
    symlinkSync(workspace, alias, process.platform === 'win32' ? 'junction' : 'dir');
    cleanBuildOutputs(alias);
    assert(!existsSync(resolve(workspace, 'packages/core/dist')));
    assert(existsSync(external));
  });
});
