import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, stripVTControlCharacters } from 'node:util';
import { tileFixtureBounds, tileFixturePbf } from './fixture.mjs';

// Explicit operator invocation only. No download, install hook, Docker or paid service.
const { values } = parseArgs({
  options: {
    jar: { type: 'string' },
    java: { type: 'string', default: 'java' },
    javac: { type: 'string', default: 'javac' },
  },
});
assert(values.jar, 'Pass --jar=<verified Planetiler 0.10.2 jar>');
const jar = resolve(values.jar);
const digest = createHash('sha256').update(readFileSync(jar)).digest('hex');
assert.equal(
  digest,
  'f310bd0413e2e4512b27f4046d418664e8e1d3bf31603c2a70e23de06c167e4d',
  'Unreviewed Planetiler binary',
);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const profile = resolve(root, 'services/tiles/profile');
const artifacts = resolve(root, 'artifacts/tiles');
mkdirSync(artifacts, { recursive: true });
const temp = mkdtempSync(resolve(artifacts, 'profile-test-'));
const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: temp,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return stripVTControlCharacters(result.stdout);
};
try {
  const classes = resolve(temp, 'classes');
  mkdirSync(classes);
  run(values.javac, [
    '-proc:none',
    '-cp',
    jar,
    '-d',
    classes,
    ...[
      'KoreaProfile',
      'KoreaProfileV2',
      'KoreaProfileTest',
      'KoreaProfileV2Test',
      'KoreaArchiveTest',
    ].map((name) => resolve(profile, `${name}.java`)),
  ]);
  const classpath = [classes, jar].join(delimiter);
  const unit = run(values.java, ['-cp', classpath, 'KoreaProfileTest']);
  const unitV2 = run(values.java, ['-cp', classpath, 'KoreaProfileV2Test']);
  const input = resolve(temp, 'fixture.osm.pbf');
  const output = resolve(temp, 'fixture.mbtiles');
  const fixture = tileFixturePbf();
  writeFileSync(input, fixture);
  run(values.java, [
    '-Xmx512m',
    '-cp',
    classpath,
    'KoreaProfile',
    `--osm-path=${input}`,
    `--output=${output}`,
    `--tmpdir=${resolve(temp, 'work')}`,
    `--bounds=${tileFixtureBounds.join(',')}`,
    '--maxzoom=14',
    '--threads=1',
    '--download=false',
    '--debug-url=http://localhost/',
    '--color=false',
  ]);
  const archive = run(values.java, ['-cp', classpath, 'KoreaArchiveTest', output]);
  const fixtureV2 = tileFixturePbf(true);
  const inputV2 = resolve(temp, 'fixture-v2.osm.pbf');
  const outputV2 = resolve(temp, 'fixture-v2.mbtiles');
  writeFileSync(inputV2, fixtureV2);
  run(values.java, [
    '-Xmx512m',
    '-cp',
    classpath,
    'KoreaProfileV2',
    `--osm-path=${inputV2}`,
    `--output=${outputV2}`,
    `--tmpdir=${resolve(temp, 'work-v2')}`,
    `--bounds=${tileFixtureBounds.join(',')}`,
    '--maxzoom=16',
    '--threads=1',
    '--download=false',
    '--debug-url=http://localhost/',
    '--color=false',
  ]);
  const archiveV2 = run(values.java, ['-cp', classpath, 'KoreaArchiveTest', outputV2, 'design-v2']);
  const { inspectArchive } = await import('../dist/archive.js');
  assert.equal(inspectArchive(outputV2, 'design-v2').maxzoom, 16);
  assert.throws(() => inspectArchive(outputV2), /SCHEMA|ZOOM/);
  const summary = [
    unit.split('\n').find((line) => line.startsWith('PASS KoreaProfile:')),
    archive.trim(),
    unitV2.split('\n').find((line) => line.startsWith('PASS KoreaProfileV2:')),
    archiveV2.trim(),
  ];
  assert(summary.every(Boolean), 'Actual test summaries required');
  writeFileSync(
    resolve(artifacts, 'profile-validation.json'),
    `${JSON.stringify({ profileSchemas: ['design-v1', 'design-v2'], planetiler: '0.10.2', binarySha256: digest, fixtureSha256: createHash('sha256').update(fixture).digest('hex'), fixtureBytes: fixture.length, fixtureV2Sha256: createHash('sha256').update(fixtureV2).digest('hex'), fixtureV2Bytes: fixtureV2.length, results: summary, scope: 'Original synthetic OSM-format input passed through the actual pinned Planetiler binary and normalized MBTiles/schema inspection; not real Korea rendering or Native QA.' }, null, 2)}\n`,
  );
  for (const line of summary) console.log(line);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
