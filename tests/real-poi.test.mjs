import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, rm, writeFile, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import {
  readOperatorFile,
  validateEvidence,
  validateSmokeDatabase,
} from '../scripts/verify-real-poi.mjs';

const catalog = JSON.parse(readFileSync('data/sources.json', 'utf8'));
const now = new Date('2026-10-20T00:00:00.000Z');
function config() {
  const source = catalog.sources.find((value) => value.id === 'yongsan-parking');
  const original = new URL(source.sourceUrl);
  original.pathname = '/operator-reviewed-original.csv';
  return {
    sourceId: source.id,
    operatorOptIn: true,
    realSourceAcknowledged: true,
    sourcePageUrl: source.sourceUrl,
    reviewedLicense: source.license,
    originalUrl: original.href,
    expectedHeader: ['합성명칭', '합성주소', '합성경도', '합성위도'],
    retrievedAt: '2026-10-19T00:00:00.000Z',
    sourceFile: 'artifacts/real-poi/operator-original.csv',
    controlPoints: [
      {
        source_id: 'authored-test-only',
        wgs84: [127, 37.5],
        toleranceMeters: 10,
        referenceNote: 'Authored test control only; not a real facility verification.',
      },
    ],
  };
}
test('actual-file evidence requires exact source/license/header and independently reviewed location controls', () => {
  assert.equal(validateEvidence(config(), catalog, now).profile.srid, 4326);
  const keyedOriginal = new URL(config().originalUrl);
  keyedOriginal.searchParams.set('secret', '<test-only>');
  for (const change of [
    { sourceId: 'parks-standard' },
    { realSourceAcknowledged: false },
    { operatorOptIn: false },
    { sourcePageUrl: catalog.sources[0].sourceUrl },
    { reviewedLicense: 'MIT' },
    { expectedHeader: [] },
    { expectedHeader: ['name', 'name'] },
    { retrievedAt: '2026-10-21T00:00:00Z' },
    { originalUrl: catalog.sources.find((value) => value.id === 'yongsan-parking').sourceUrl },
    { originalUrl: 'https://unapproved.invalid/file.csv' },
    { originalUrl: keyedOriginal.href },
    { controlPoints: [] },
    { controlPoints: [{ ...config().controlPoints[0], toleranceMeters: 31 }] },
    { controlPoints: [{ ...config().controlPoints[0], wgs84: [37.5, 127] }] },
  ])
    assert.throws(() => validateEvidence({ ...config(), ...change }, catalog, now));
});
test('database smoke cannot use a remote, ordinary, credential-less or unacknowledged database', () => {
  const url = new URL('postgresql://127.0.0.1/kmk_real_poi');
  url.username = 'operator';
  url.password = randomBytes(16).toString('hex');
  validateSmokeDatabase(url.href, 'disposable-real-poi');
  for (const change of [
    { hostname: 'db.unapproved.invalid' },
    { pathname: '/kmk' },
    { pathname: '/postgres' },
    { search: '?sslmode=disable' },
    { password: '' },
  ]) {
    const changed = new URL(url);
    for (const [key, value] of Object.entries(change)) changed[key] = value;
    assert.throws(() => validateSmokeDatabase(changed.href, 'disposable-real-poi'));
  }
  assert.throws(() => validateSmokeDatabase(url.href));
});
test('raw-file verifier bounds reads and refuses paths or links outside ignored operator storage', async () => {
  await mkdir('artifacts/real-poi', { recursive: true });
  const directory = await mkdtemp(resolve('artifacts/real-poi/check-'));
  const outside = `${directory}-outside-authored-test.txt`;
  try {
    const file = resolve(directory, 'authored-only.csv');
    await writeFile(file, 'authored test bytes');
    assert.equal((await readOperatorFile(file, 100, directory)).toString(), 'authored test bytes');
    await assert.rejects(readOperatorFile(file, 2, directory), /OPERATOR_FILE_TOO_LARGE/u);
    await writeFile(outside, 'authored outside bytes');
    await assert.rejects(
      readOperatorFile(outside, 100, directory),
      /USE_IGNORED_REAL_POI_STORAGE/u,
    );
    if (process.platform !== 'win32') {
      const link = resolve(directory, 'symlink.csv');
      await symlink(outside, link);
      await assert.rejects(
        readOperatorFile(link, 100, directory),
        /REGULAR_OPERATOR_FILE_REQUIRED/u,
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(outside, { force: true });
  }
});
