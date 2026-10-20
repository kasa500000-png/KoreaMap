import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  artifactRecord,
  artifactPath,
  verifyRecord,
  verifyApproval,
  packageNames,
} from '../scripts/release.mjs';
import { resolve } from 'node:path';
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
test('artifact paths are validated before reading manifest-selected files', () => {
  assert.equal(artifactPath(record), resolve('artifacts', record.file));
  for (const file of ['../private', '/tmp/private', 'C:\\private', 'korea-map-web-0.1.0.tgz'])
    assert.throws(() => artifactPath({ ...record, file }));
  assert.throws(() => artifactPath({ ...record, name: 'other-map-core' }));
  assert.throws(() => artifactPath({ ...record, version: '0.2.0' }));
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
    verifyApproval(
      { ...manifest, sourceCommit: 'main' },
      { head: 'main', approved: 'main', dirty: false },
    ),
  );
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
    "github.ref == 'refs/heads/main'",
    'git merge-base --is-ancestor "$KMK_APPROVED_COMMIT" origin/main',
    'environment: npm-release',
    'id-token: write',
    'pnpm audit:dependencies',
    'pnpm test:web',
    'pnpm release:verify',
    '--provenance --access public',
    'persist-credentials: false',
  ])
    assert(workflow.includes(required), required);
  assert.doesNotMatch(workflow, /secrets\.|NPM_TOKEN|npm version|gh release|git push/);
  assert(workflow.indexOf('pnpm test:web') < workflow.indexOf('pnpm release:prepare'));
  assert(workflow.indexOf('git merge-base --is-ancestor') < workflow.indexOf('pnpm install'));
  assert(workflow.indexOf('pnpm release:verify') < workflow.indexOf('npm publish artifacts/'));
  assert.doesNotMatch(workflow, /continue-on-error:|\|\|\s*true|--prod\b|--ignore-registry-errors/);
});
test('dependency audit runs independently of functional CI and fails closed', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const securityJob = workflow.split('\n  dependency-audit:\n')[1]?.split('\n  linux:\n')[0];
  assert(securityJob, 'Independent dependency audit job required');
  assert.match(securityJob, /name: Dependency audit/);
  assert.match(securityJob, /pnpm install --frozen-lockfile/);
  assert.match(securityJob, /pnpm audit:dependencies/);
  const script = JSON.parse(readFileSync('package.json', 'utf8')).scripts['audit:dependencies'];
  assert.equal(script, 'pnpm audit --audit-level=high');
  assert.doesNotMatch(
    securityJob,
    /needs:|continue-on-error:|\|\|\s*true|--prod\b|--ignore-registry-errors/,
  );
});

function ciJobs(workflow) {
  const source = workflow.split('\njobs:\n')[1];
  assert(source, 'CI jobs are required');
  const headings = [...source.matchAll(/^ {2}([a-z][a-z0-9-]*):\n/gm)];
  return new Map(
    headings.map((heading, index) => [
      heading[1],
      source.slice(heading.index, headings[index + 1]?.index),
    ]),
  );
}
function assertSeparatedConsumerGates(workflow) {
  const jobs = ciJobs(workflow);
  const linux = jobs.get('linux');
  assert(linux, 'Linux functional job is required');
  assert.doesNotMatch(linux, /pnpm verify:(?:packages|native-consumer)/);
  for (const command of ['pnpm test:web', 'pnpm test:geo', 'pnpm test:routing'])
    assert(linux.includes(`- run: ${command}\n`), `Functional QA missing: ${command}`);
  for (const [id, command] of [
    ['web-consumer', 'pnpm verify:packages'],
    ['native-consumer', 'pnpm verify:native-consumer'],
  ]) {
    const job = jobs.get(id);
    assert(job, `Independent ${id} gate required`);
    assert.match(job, /runs-on: ubuntu-24\.04\n/);
    assert.match(job, /timeout-minutes: 20\n/);
    for (const step of [
      'pnpm install --frozen-lockfile',
      'pnpm build:sdk',
      'pnpm pack:check',
      command,
    ])
      assert(job.includes(`- run: ${step}\n`), `Self-contained ${id} step missing: ${step}`);
    assert(job.indexOf('pnpm build:sdk') < job.indexOf('pnpm pack:check'));
    assert(job.indexOf('pnpm pack:check') < job.indexOf(command));
    assert.equal(workflow.split(`- run: ${command}\n`).length - 1, 1);
  }
  for (const id of ['linux', 'web-consumer', 'native-consumer'])
    assert.doesNotMatch(
      jobs.get(id),
      /^\s*(?:needs|if|continue-on-error):|\|\|\s*true|--prod\b|--ignore-registry-errors/m,
      `${id} must run independently and preserve failure`,
    );
}
test('both consumer declaration gates run independently without blocking Linux Web/database/routing QA', () => {
  assertSeparatedConsumerGates(readFileSync('.github/workflows/ci.yml', 'utf8'));
});
test('CI isolation policy rejects skipped, hidden, incomplete and re-serialized consumer gates', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const native = ciJobs(workflow).get('native-consumer');
  for (const mutation of [
    workflow.replace('  web-consumer:\n', '  web-consumer:\n    needs: [linux]\n'),
    workflow.replace(
      '  native-consumer:\n',
      "  native-consumer:\n    if: github.ref == 'refs/heads/main'\n",
    ),
    workflow.replace(
      '- run: pnpm verify:native-consumer\n',
      '- run: pnpm verify:native-consumer || true\n',
    ),
    workflow.replace(native, native.replace('      - run: pnpm pack:check\n', '')),
    workflow.replace('      - run: pnpm test:routing\n', ''),
    workflow.replace('  linux:\n', '  linux:\n    needs: [web-consumer, native-consumer]\n'),
  ])
    assert.throws(() => assertSeparatedConsumerGates(mutation));
});
test('documented shared API sample matches the strict compiled type fixture', () => {
  const docs = readFileSync('docs/web-guide.md', 'utf8').split('```ts\n')[1].split('```')[0];
  assert.equal(docs.trim(), readFileSync('tests/release-guide.types.ts', 'utf8').trim());
});
