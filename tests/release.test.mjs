import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { artifactRecord, verifyRecord, verifyApproval, packageNames } from '../scripts/release.mjs';
const bytes = Buffer.from('authored test archive bytes');
const record = artifactRecord('core', '0.1.0', bytes);
const head = 'a'.repeat(40);
const manifest = {
  schemaVersion: 1,
  version: '0.1.0',
  sourceCommit: head,
  sourceDirty: false,
  packages: packageNames.map((name) => artifactRecord(name, '0.1.0', bytes)),
};
test('artifact mutation, identity and path tampering fail integrity checks', () => {
  verifyRecord(record, bytes);
  assert.throws(() => verifyRecord(record, Buffer.from('changed')));
  assert.throws(() => verifyRecord({ ...record, file: '../secret' }, bytes));
  assert.throws(() => verifyRecord({ ...record, name: 'korea-map-unknown' }, bytes));
  assert.throws(() => artifactRecord('core', '0.2.0', bytes));
});
test('release validation fails closed without exact explicit commit and clean five-package source', () => {
  const context = { head, dirty: false, approved: head };
  verifyApproval(manifest, context);
  for (const change of [
    { approved: undefined },
    { approved: 'b'.repeat(40) },
    { dirty: true },
    { head: 'b'.repeat(40) },
  ])
    assert.throws(() => verifyApproval(manifest, { ...context, ...change }));
  assert.throws(() => verifyApproval({ ...manifest, sourceDirty: true }, context));
  assert.throws(() =>
    verifyApproval({ ...manifest, packages: manifest.packages.slice(1) }, context),
  );
});
test('manual publication is disabled by default and binds the approved commit', () => {
  const workflow = readFileSync('.github/workflows/npm-publish.yml', 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n {2}(push|pull_request|release|schedule):/);
  for (const required of [
    "vars.NPM_PUBLISH_ENABLED == 'true'",
    'vars.NPM_APPROVED_COMMIT',
    'environment: npm-release',
    'id-token: write',
    'pnpm audit:dependencies',
    'pnpm release:verify',
    '--provenance --access public',
    'persist-credentials: false',
  ])
    assert(workflow.includes(required), required);
  assert.doesNotMatch(workflow, /secrets\.|NPM_TOKEN|npm version|gh release|git push/);
});
test('documented shared API sample matches the strict compiled type fixture', () => {
  const docs = readFileSync('docs/web-guide.md', 'utf8').split('```ts\n')[1].split('```')[0];
  assert.equal(docs.trim(), readFileSync('tests/release-guide.types.ts', 'utf8').trim());
});
