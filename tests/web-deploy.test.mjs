import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  readdirSync,
  linkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  fixtureCsp,
  fixtureBuildEnvironment,
  assertNoEnvironmentFiles,
  inspectDeploymentBytes,
  inspectDeploymentTree,
  parseWebDeploymentOptions,
  prepareWebDeployment,
  verifyPolyfillLicenseEvidence,
  verifyWebDeployment,
  extractLicenseSection,
} from '../scripts/prepare-web-deploy.mjs';

const html = (body = '') =>
  Buffer.from(
    `<html><head><meta http-equiv="Content-Security-Policy" content="${fixtureCsp}"></head><body>${body}</body></html>`,
  );
test('original README license sections retain MIT-labelled headings and the full trailing notice', () => {
  for (const heading of ['## License', '## License (MIT)']) {
    const section = `${heading}\n\nAuthored notice fixture and full trailing text.\n`;
    assert.equal(
      extractLicenseSection(Buffer.from(`Unrelated README\n${section}`)).toString(),
      section,
    );
  }
  assert.throws(() => extractLicenseSection(Buffer.from('README without a license section')));
});
function temporary(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'korea-map-web-deploy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(resolve(root, 'examples/web'), { recursive: true });
  return root;
}
test('build environment drops operator values, NODE_OPTIONS and npm authentication without copying values to reports', () => {
  const env = fixtureBuildEnvironment({
    PATH: '/safe/bin',
    HOME: '/safe/home',
    NODE_OPTIONS: '--require=/operator-hook',
    NEXT_PUBLIC_TILE_URL: 'private',
    DATABASE_URL: 'private',
    NPM_TOKEN: 'private',
    HTTPS_PROXY: 'private',
    npm_execpath: 'unreviewed',
  });
  assert.equal(env.PATH, '/safe/bin');
  assert.equal(env.HOME, '/safe/home');
  for (const name of [
    'NODE_OPTIONS',
    'NEXT_PUBLIC_TILE_URL',
    'DATABASE_URL',
    'NPM_TOKEN',
    'HTTPS_PROXY',
    'npm_execpath',
  ])
    assert.equal(env[name], undefined);
  assert.equal(env.COREPACK_ENABLE_NETWORK, '0');
  assert.equal(env.npm_config_offline, 'true');
  assert.equal(env.NEXT_TELEMETRY_DISABLED, '1');
});
test('Next environment files are rejected by filename, while non-loaded examples are permitted', (t) => {
  const root = temporary(t);
  writeFileSync(resolve(root, '.env.example'), 'authored placeholder');
  assert.doesNotThrow(() => assertNoEnvironmentFiles(root));
  for (const path of ['.env', 'examples/web/.env.local', 'examples/web/.env.production']) {
    writeFileSync(resolve(root, path), 'authored private-looking fixture');
    assert.throws(() => assertNoEnvironmentFiles(root), /environment file present/);
    rmSync(resolve(root, path));
  }
});
test('HTML enforces same-origin resource CSP and rejects links to deliberately excluded routes', () => {
  assert.deepEqual(inspectDeploymentBytes('index.html', html('<a href="/walk/">walk</a>')), []);
  assert(
    inspectDeploymentBytes('index.html', Buffer.from('<html><head></head></html>')).includes(
      'CSP_MISSING',
    ),
  );
  for (const path of ['/tiles/', '/gps/', '/unreviewed/'])
    assert(
      inspectDeploymentBytes('index.html', html(`<a href="${path}">unsafe route</a>`)).includes(
        'LINK_TO_EXCLUDED_ROUTE',
      ),
    );
});
test('foreign URLs, escaped URLs and protocol-relative requests are rejected without echoing matched values', () => {
  for (const text of [
    'fetch("https://foreign.invalid/tiles")',
    'fetch("https:\\/\\/foreign.invalid/tiles")',
    'fetch("\\u0068ttps://foreign.invalid/tiles")',
    'fetch("\\x68ttps://foreign.invalid/tiles")',
    'new WebSocket("wss://foreign.invalid")',
    'fetch("//foreign.invalid/path")',
  ]) {
    const findings = inspectDeploymentBytes('_next/static/chunks/test.js', Buffer.from(text));
    assert(findings.includes('FOREIGN_URL') || findings.includes('PROTOCOL_RELATIVE_URL'));
    assert(!JSON.stringify(findings).includes('foreign.invalid'));
  }
});
test('URL-validation regular expressions are not endpoint literals while adjacent URL strings still fail', () => {
  const rule = 'const allowed = /https:\\/\\/[^ ]+/;';
  assert.deepEqual(
    inspectDeploymentBytes('_next/static/chunks/validator.js', Buffer.from(rule)),
    [],
  );
  assert(
    inspectDeploymentBytes(
      '_next/static/chunks/validator.js',
      Buffer.from(`${rule} fetch("https://foreign.invalid")`),
    ).includes('FOREIGN_URL'),
  );
  assert(
    inspectDeploymentBytes(
      '_next/static/chunks/test.css',
      Buffer.from('a{background:url(//foreign.invalid/image)}'),
    ).includes('PROTOCOL_RELATIVE_URL'),
  );
});
test('known credentials and real binary/data payload formats cannot enter the deployment tree', () => {
  const token = `ghp_${'x'.repeat(40)}`;
  assert(
    inspectDeploymentBytes('_next/static/chunks/test.js', Buffer.from(token)).includes(
      'CREDENTIAL',
    ),
  );
  assert(
    inspectDeploymentBytes(
      '_next/static/chunks/test.js',
      Buffer.from(JSON.stringify({ ['api_' + 'key']: 'authored-'.repeat(3) })),
    ).includes('NAMED_CREDENTIAL'),
  );
  for (const path of [
    'source.osm.pbf',
    'tiles.pmtiles',
    'font.woff2',
    'data.geojson',
    '.env',
    'tiles/index.html',
    'gps/index.html',
  ])
    assert(
      inspectDeploymentBytes(path, Buffer.from('authored')).includes('UNAPPROVED_FILE_OR_ROUTE'),
    );
  for (const bytes of [
    Buffer.from([0, 255]),
    Buffer.from('SQLite format 3'),
    Buffer.from([80, 75, 3, 4]),
  ])
    assert(
      inspectDeploymentBytes('data.txt', bytes).includes('BINARY_OR_REAL_PAYLOAD_REQUIRES_REVIEW'),
    );
});
test('credential-bearing URLs and embedded binary fonts are rejected', () => {
  const credentialUrl = new URL('https://foreign.invalid');
  credentialUrl.username = 'authored';
  credentialUrl.password = ['synthetic', 'authored'].join('-');
  const tokenUrl = new URL('https://foreign.invalid');
  tokenUrl.searchParams.set('token', 'synthetic');
  for (const url of [credentialUrl.href, tokenUrl.href])
    assert(
      inspectDeploymentBytes('code.js', Buffer.from(`fetch("${url}")`)).includes('URL_CREDENTIAL'),
    );
  assert(
    inspectDeploymentBytes(
      'code.css',
      Buffer.from('src:url(data:font/woff2;base64,AAAA)'),
    ).includes('EMBEDDED_BINARY_PAYLOAD'),
  );
});
test('license exemptions are exact text-only paths and cannot conceal active JavaScript, HTML or arbitrary text', () => {
  assert.deepEqual(
    inspectDeploymentBytes('notices/PROJECT-LICENSE.txt', Buffer.from('Authored license notice')),
    [],
  );
  for (const path of [
    'notices/evil.js',
    'notices/evil.html',
    'notices/arbitrary.txt',
    'notices/subdir/PROJECT-LICENSE.txt',
  ])
    assert(
      inspectDeploymentBytes(path, Buffer.from('fetch("https://foreign.invalid")')).includes(
        'UNAPPROVED_NOTICE_FILE',
      ),
    );
});
test('filesystem traversal, symlinks, hardlinks and missing notices fail closed before an export is verified', (t) => {
  const root = temporary(t);
  const outside = resolve(root, 'outside.txt');
  writeFileSync(outside, 'not deployment material');
  const site = resolve(root, 'site');
  mkdirSync(site);
  writeFileSync(resolve(site, 'index.html'), html());
  const report = inspectDeploymentTree(site);
  assert(report.findings.some((entry) => entry.rule === 'NOTICE_MISSING'));
  symlinkSync(outside, resolve(site, 'linked.txt'), 'file');
  assert.throws(() => inspectDeploymentTree(site), /Symlink/);
  rmSync(resolve(site, 'linked.txt'));
  linkSync(outside, resolve(site, 'hardlinked.txt'));
  assert.throws(() => inspectDeploymentTree(site), /regular file/);
  rmSync(resolve(site, 'hardlinked.txt'));
  for (const path of ['../outside.txt', '/absolute.txt', 'C:\\private.txt', 'a/../../private.txt'])
    assert(
      inspectDeploymentBytes(path, Buffer.from('authored')).includes('UNAPPROVED_FILE_OR_ROUTE'),
    );
  writeFileSync(
    resolve(root, 'deploy-manifest.json'),
    JSON.stringify({
      schemaVersion: 1,
      mode: 'synthetic-fixture-only',
      publicationAuthorized: false,
      releaseBlocked: true,
      sourceCommit: 'a'.repeat(40),
      sourceDirty: false,
      files: [{ path: '../../outside.txt' }],
    }),
  );
  assert.throws(() => verifyWebDeployment(root));
});
test('missing manually reviewed exact-version polyfill licenses block before any build or candidate replacement', async (t) => {
  const root = temporary(t);
  assert.throws(() => verifyPolyfillLicenseEvidence(root));
  const destination = resolve(root, 'artifacts/web-deploy/previous');
  mkdirSync(destination, { recursive: true });
  writeFileSync(resolve(destination, 'keep.txt'), 'prior successful output');
  let calls = 0;
  await assert.rejects(
    prepareWebDeployment({
      root,
      output: destination,
      run: () => {
        calls++;
      },
    }),
    /must not be overwritten/,
  );
  await assert.rejects(
    prepareWebDeployment({
      root,
      run: () => {
        calls++;
      },
    }),
  );
  assert.equal(calls, 0);
  assert.deepEqual(readdirSync(destination), ['keep.txt']);
  assert(
    !readdirSync(resolve(root, 'artifacts/web-deploy')).some((name) =>
      name.startsWith('.prepare-'),
    ),
  );
});
test('preparation rejects ignored artifact boundary symlinks and outside destinations', async (t) => {
  const root = temporary(t);
  await assert.rejects(prepareWebDeployment({ root, output: resolve(root, '../outside') }));
  const alternative = resolve(root, 'elsewhere');
  mkdirSync(alternative);
  rmSync(resolve(root, 'artifacts'), { recursive: true, force: true });
  symlinkSync(alternative, resolve(root, 'artifacts'), 'junction');
  await assert.rejects(prepareWebDeployment({ root }), /Symlink/);
});
test('portable CLI has explicit local modes and cannot accidentally select a publish or deploy operation', () => {
  assert.deepEqual(parseWebDeploymentOptions(['prepare']), { mode: 'prepare', smoke: false });
  for (const args of [
    [],
    ['deploy'],
    ['publish'],
    ['verify'],
    ['prepare', '--smoke', '--smoke'],
    ['verify', '--directory=relative'],
    ['prepare', '--token=secret'],
  ])
    assert.throws(() => parseWebDeploymentOptions(args));
  const result = spawnSync(process.execPath, ['scripts/prepare-web-deploy.mjs', 'publish'], {
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stderr);
  assert.equal(report.status, 'BLOCKED');
  assert.equal(report.publicationAuthorized, false);
});
