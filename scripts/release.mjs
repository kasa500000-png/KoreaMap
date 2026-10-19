import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const packageNames = ['core', 'styles', 'data-adapters', 'web', 'native'];
const digest = (bytes, algorithm, encoding) => createHash(algorithm).update(bytes).digest(encoding);
export function artifactRecord(name, version, bytes) {
  assert(packageNames.includes(name), 'Unknown package');
  assert.equal(version, '0.1.0', 'Review release baseline before changing version');
  return {
    name: `korea-map-${name}`,
    version,
    file: `korea-map-${name}-${version}.tgz`,
    bytes: bytes.length,
    sha256: digest(bytes, 'sha256', 'hex'),
    integrity: `sha512-${digest(bytes, 'sha512', 'base64')}`,
  };
}
export function verifyRecord(record, bytes) {
  assert.equal(record.name, `korea-map-${record.name.slice('korea-map-'.length)}`);
  assert.deepEqual(
    record,
    artifactRecord(record.name.slice('korea-map-'.length), record.version, bytes),
    'Artifact integrity mismatch',
  );
}
export function verifyApproval(manifest, { head, dirty, approved }) {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.version, '0.1.0');
  assert.equal(manifest.sourceCommit, head, 'Source commit changed');
  assert.equal(manifest.sourceDirty, false, 'Candidate was generated from a dirty source tree');
  assert.equal(dirty, false, 'Source tree is dirty');
  assert.equal(approved, head, 'Explicit approved commit required');
  assert.deepEqual(
    manifest.packages.map((p) => p.name).sort(),
    packageNames.map((name) => `korea-map-${name}`).sort(),
    'Exactly five packages required',
  );
}
function run(mode) {
  assert(['prepare', 'verify'].includes(mode), 'Use prepare or verify');
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const head = git('rev-parse', 'HEAD');
  const dirty = git('status', '--porcelain').length !== 0;
  const target = resolve('artifacts/release');
  if (mode === 'prepare') {
    const packages = packageNames.map((name) => {
      const pkg = JSON.parse(readFileSync(`packages/${name}/package.json`, 'utf8'));
      assert.equal(pkg.name, `korea-map-${name}`);
      return artifactRecord(
        name,
        pkg.version,
        readFileSync(`artifacts/${pkg.name}-${pkg.version}.tgz`),
      );
    });
    const manifest = {
      schemaVersion: 1,
      version: '0.1.0',
      sourceCommit: head,
      sourceDirty: dirty,
      publicationApproved: false,
      packages,
    };
    mkdirSync(target, { recursive: true });
    writeFileSync(resolve(target, 'integrity.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    writeFileSync(
      resolve(target, 'RELEASE_NOTES.md'),
      `# Korea Map Kit v0.1.0 — UNPUBLISHED CANDIDATE\n\nSource: ${head}; dirty: ${dirty}. No publication approval is implied.\n\n${readFileSync('CHANGELOG.md', 'utf8')}\n\n## Artifact checksums\n\n${packages.map((p) => `- ${p.file}: ${p.sha256}`).join('\n')}\n`,
    );
    console.log(
      `Prepared five local tarballs and release notes; sourceDirty=${dirty}; NOT publication approval.`,
    );
  } else {
    const manifest = JSON.parse(readFileSync(resolve(target, 'integrity.json'), 'utf8'));
    verifyApproval(manifest, { head, dirty, approved: process.env.KMK_APPROVED_COMMIT });
    for (const record of manifest.packages)
      verifyRecord(record, readFileSync(resolve('artifacts', record.file)));
    console.log(
      'Approved commit binding and artifact integrity verified; external security/platform/ownership gates remain mandatory.',
    );
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  run(process.argv[2]);
