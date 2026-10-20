// Private fixture export preparation only. This script never deploys or publishes.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const maxFileBytes = 8 * 1024 * 1024;
const maxTreeBytes = 32 * 1024 * 1024;
const maxFiles = 512;
const fixtureRoutes = ['', 'themes', 'walk', 'trip', 'search', 'routing', 'api'];
const publicFiles = ['vendor/maplibre/maplibre-gl-worker.mjs', 'vendor/maplibre/LICENSE.txt'];
const polyfillLicenses = [
  {
    name: 'core-js',
    version: '3.38.1',
    licenseSha256: '51aff0fa92ac49e01ce6ba0fed992b0a34f8afe15203dd5f38c43f9e88b0167b',
  },
  {
    name: 'object-assign',
    version: '4.1.1',
    licenseSha256: '6fb9754611c20f6649f68805e8c990e83261f29316e29de9e6cedae607b8634c',
  },
  {
    name: 'whatwg-fetch',
    version: '3.0.0',
    licenseSha256: '05a4adff1d99954f18ed2ef89d47b4567cdba599635ddbe9393a95b9d48b2643',
  },
];
const installedNotices = [
  'next',
  'react',
  'react-dom',
  'maplibre-gl',
  '@maplibre/maplibre-gl-style-spec',
];
const compiledNotices = ['react', 'react-dom', 'scheduler', 'react-server-dom-webpack'];
const mapLibrePackages = [
  ['@mapbox/point-geometry', '1.1.0'],
  ['@mapbox/tiny-sdf', '2.3.0'],
  ['@mapbox/unitbezier', '1.0.0'],
  ['@mapbox/vector-tile', '3.0.0'],
  ['@maplibre/geojson-vt', '6.3.0'],
  ['@maplibre/maplibre-gl-style-spec', '26.4.4'],
  ['@maplibre/mlt', '1.3.0'],
  ['@maplibre/vt-pbf', '4.3.2'],
  ['bidi-js', '1.1.0'],
  ['earcut', '3.2.4'],
  ['gl-matrix', '3.4.4'],
  ['kdbush', '4.1.0'],
  ['murmurhash-js', '1.0.0'],
  ['pbf', '5.1.2'],
  ['potpack', '2.1.0'],
  ['quickselect', '3.0.0'],
  ['tinyqueue', '3.0.0'],
];
const bundledNoticeName = (name, version) =>
  `maplibre-bundle-${name.replaceAll('/', '-').replace('@', '')}-${version}-LICENSE.txt`;
const noticeFiles = [
  'PROJECT-LICENSE.txt',
  'THIRD_PARTY_NOTICES.txt',
  ...installedNotices.map((name) => `${name.replaceAll('/', '-').replace('@', '')}-LICENSE.txt`),
  ...compiledNotices.map((name) => `next-compiled-${name}-LICENSE.txt`),
  ...polyfillLicenses.map((entry) => `${entry.name}-${entry.version}-LICENSE.txt`),
  ...mapLibrePackages.map(([name, version]) => bundledNoticeName(name, version)),
];
export const fixtureCsp =
  "default-src 'self'; connect-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; img-src 'self' data: blob:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'";
const hash = (value) => createHash('sha256').update(value).digest('hex');
let typescript;
function withoutRegularExpressions(path, text) {
  if (!['.js', '.mjs'].includes(extname(path))) return text;
  typescript ??= createRequire(import.meta.url)('typescript');
  const source = typescript.createSourceFile(
    path,
    text,
    typescript.ScriptTarget.Latest,
    true,
    typescript.ScriptKind.JS,
  );
  const ranges = [];
  function visit(node) {
    if (node.kind === typescript.SyntaxKind.RegularExpressionLiteral)
      ranges.push([node.getStart(source), node.end]);
    typescript.forEachChild(node, visit);
  }
  visit(source);
  for (const [start, end] of ranges.reverse())
    text = text.slice(0, start) + ' '.repeat(end - start) + text.slice(end);
  return text;
}
const safeRelative = (value) =>
  typeof value === 'string' &&
  /^[A-Za-z0-9_./-]+$/.test(value) &&
  !value.startsWith('/') &&
  value.split('/').every((part) => part && part !== '.' && part !== '..');

function contained(boundary, path) {
  const local = relative(boundary, path);
  assert(
    local &&
      local !== '..' &&
      !local.startsWith('../') &&
      !local.startsWith('..\\') &&
      !isAbsolute(local),
    'Path must remain within its declared boundary',
  );
  let current = boundary;
  assert(!lstatSync(boundary).isSymbolicLink(), 'Symlinked boundary rejected');
  for (const part of local.split(/[\\/]/)) {
    current = resolve(current, part);
    if (!existsSync(current)) break;
    assert(!lstatSync(current).isSymbolicLink(), 'Symlinked path rejected');
  }
  return path;
}
function fileBytes(boundary, path) {
  contained(boundary, path);
  const info = lstatSync(path);
  assert(
    info.isFile() && info.size <= maxFileBytes && info.nlink === 1,
    'Bounded unlinked regular file required',
  );
  return readFileSync(path);
}
function walk(directory) {
  const files = [];
  let bytes = 0;
  function visit(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const full = resolve(path, entry.name);
      assert(!entry.isSymbolicLink(), 'Symlinked deployment input rejected');
      const name = relative(directory, full).split('\\').join('/');
      assert(safeRelative(name), 'Portable relative path required');
      if (entry.isDirectory()) visit(full);
      else {
        const data = fileBytes(directory, full);
        bytes += data.length;
        files.push({ path: name, bytes: data.length, sha256: hash(data) });
        assert(bytes <= maxTreeBytes && files.length <= maxFiles, 'Deployment tree limit exceeded');
      }
    }
  }
  assert(
    lstatSync(directory).isDirectory() && !lstatSync(directory).isSymbolicLink(),
    'Regular directory required',
  );
  visit(directory);
  return files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
}

export function fixtureBuildEnvironment(environment) {
  const allowed = [
    'PATH',
    'Path',
    'SystemRoot',
    'WINDIR',
    'COMSPEC',
    'PATHEXT',
    'HOME',
    'USERPROFILE',
    'LOCALAPPDATA',
    'APPDATA',
    'TEMP',
    'TMP',
    'TMPDIR',
    'LANG',
    'LC_ALL',
    'TZ',
  ];
  return {
    ...Object.fromEntries(
      allowed
        .filter((name) => typeof environment[name] === 'string')
        .map((name) => [name, environment[name]]),
    ),
    NEXT_TELEMETRY_DISABLED: '1',
    EXPO_NO_TELEMETRY: '1',
    EXPO_OFFLINE: '1',
    EXPO_NO_DOTENV: '1',
    COREPACK_ENABLE_NETWORK: '0',
    npm_config_offline: 'true',
    npm_config_ignore_scripts: 'true',
    PNPM_DISABLE_SELF_UPDATE_CHECK: '1',
    CI: '1',
  };
}
export function assertNoEnvironmentFiles(root) {
  for (const directory of [root, resolve(root, 'examples/web')]) {
    assert(!lstatSync(directory).isSymbolicLink(), 'Symlinked build directory rejected');
    for (const name of readdirSync(directory))
      assert(
        !/^\.env(?:\.|$)/.test(name) || ['.env.example', '.env.template'].includes(name),
        'Next environment file present; remove it without copying or printing its content',
      );
  }
}
function reviewedReference(value, path) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (
    url.hostname === 'www.w3.org' &&
    [
      '/1998/Math/MathML',
      '/1999/xhtml',
      '/1999/xlink',
      '/2000/svg',
      '/XML/1998/namespace',
    ].includes(url.pathname)
  )
    return true;
  if (url.hostname === 'www.topografix.com' && url.pathname === '/GPX/1/1') return true;
  if (url.hostname === 'react.dev' && url.pathname.startsWith('/errors/')) return true;
  if (url.hostname === 'nextjs.org' && url.pathname.startsWith('/docs/')) return true;
  if (
    url.hostname === 'github.com' &&
    [
      '/mapbox/mapbox-gl-js/issues/2907',
      '/maplibre/maplibre-gl-js/blob/v6.14.0/LICENSE.txt',
      '/zloirock/core-js',
      '/zloirock/core-js/blob/v3.38.1/LICENSE',
    ].includes(url.pathname)
  )
    return true;
  if (url.hostname === 'wiki.openstreetmap.org' && url.pathname === '/wiki/This_map_requires_WebGL')
    return true;
  if (url.hostname === 'maplibre.org' && url.pathname === '/' && !url.search) return true;
  if (url.hostname === 'maplibre.invalid' && url.pathname === '/') return true;
  // Inert URL parser feature tests in the reviewed Next/core-js polyfill and runtime.
  if (
    /^_next\/static\/chunks\/polyfills-[a-f0-9]+\.js$/.test(path) &&
    ['a', 'b', 'x', 'xn--e1aybc'].includes(url.hostname) &&
    ['/', '/c%20d'].includes(url.pathname)
  )
    return true;
  return (
    /^_next\/static\/chunks\/main-[a-f0-9]+\.js$/.test(path) &&
    url.protocol === 'http:' &&
    ['f', 'n'].includes(url.hostname) &&
    url.pathname === '/'
  );
}

/** Heuristic scan plus strict file types; it does not prove arbitrary JavaScript cannot form a URL. */
export function inspectDeploymentBytes(path, bytes) {
  const findings = [];
  const add = (rule) => {
    if (!findings.includes(rule)) findings.push(rule);
  };
  if (
    !safeRelative(path) ||
    !['.html', '.js', '.mjs', '.css', '.txt'].includes(extname(path)) ||
    /(?:^|\/)\.[^/]+|(?:^|\/)(?:tiles|gps)(?:\/|$)/.test(path)
  )
    add('UNAPPROVED_FILE_OR_ROUTE');
  const text = bytes.toString('utf8');
  if (
    !Buffer.from(text).equals(bytes) ||
    text.includes('\0') ||
    /SQLite format 3|wOF2/.test(text) ||
    bytes.includes(Buffer.from([80, 75, 3, 4]))
  )
    add('BINARY_OR_REAL_PAYLOAD_REQUIRES_REVIEW');
  if (
    /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|(?:AKIA|ASIA)[A-Z0-9]{16}|(?:sk_live_|sk-proj-|sb_secret_)[A-Za-z0-9_-]{16,})\b|\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/.test(
      text,
    )
  )
    add('CREDENTIAL');
  if (
    /(?:api[_-]?key|client[_-]?secret|access[_-]?token|service[_-]?role[_-]?key|password)["']?\s*[:=]\s*["'][A-Za-z0-9_./+=-]{12,}["']/i.test(
      text,
    )
  )
    add('NAMED_CREDENTIAL');
  for (const match of text.matchAll(
    /data:(font\/|application\/(?:octet-stream|json)|image\/(?:png|jpe?g|webp))[^\s"']*;base64,([A-Za-z0-9+/=]*)/gi,
  )) {
    const embedded = Buffer.from(match[2], 'base64');
    // MapLibre 6.14.0's 68-byte 1x1 image-release sentinel, not geographic imagery.
    if (
      !['.js', '.mjs'].includes(extname(path)) ||
      match[1] !== 'image/png' ||
      embedded.length !== 68 ||
      hash(embedded) !== '5e89733d8a8e055100cda68bf7a712ab0e1b24fefee7e39792b47cb5ff7c3cb1'
    )
      add('EMBEDDED_BINARY_PAYLOAD');
  }
  if (path.startsWith('notices/')) {
    if (!noticeFiles.some((name) => path === `notices/${name}`)) add('UNAPPROVED_NOTICE_FILE');
    return findings; // Exact, text-only license paths; their references are not resource URLs.
  }
  if (path === publicFiles[1]) return findings;
  const normalized = withoutRegularExpressions(path, text)
    .replace(/\\x([a-f0-9]{2})/gi, (_, digits) => String.fromCharCode(parseInt(digits, 16)))
    .replace(/\\u([a-f0-9]{4})/gi, (_, digits) => String.fromCharCode(parseInt(digits, 16)))
    .replace(/\\\//g, '/');
  for (const match of normalized.matchAll(
    /(?:https?|wss?|postgres(?:ql)?|rediss?|mongodb(?:\+srv)?):\/\/[^\s<>"'`\\)\]}]+/g,
  )) {
    try {
      const url = new URL(match[0]);
      const parserSample =
        /^_next\/static\/chunks\/polyfills-[a-f0-9]+\.js$/.test(path) &&
        url.protocol === 'https:' &&
        url.hostname === 'b' &&
        url.username === 'a' &&
        !url.password &&
        url.pathname === '/' &&
        !url.search &&
        !url.hash;
      if ((url.username || url.password) && !parserSample) add('URL_CREDENTIAL');
      if (
        /[?&](?:api[_-]?key|(?:access[_-]?)?token|secret|password|signature|x-amz-signature)=/i.test(
          url.search,
        )
      )
        add('URL_CREDENTIAL');
    } catch {
      /* Dynamic/incomplete matches are rejected by the reference check. */
    }
    if (!reviewedReference(match[0], path)) add('FOREIGN_URL');
  }
  if (
    /\b(?:src|srcset|href|action)\s*=\s*["']\/\//i.test(normalized) ||
    /\b(?:fetch|WebSocket|EventSource|URL)\s*\(\s*["']\/\//.test(normalized) ||
    /(?:url\(\s*["']?|@import\s*["'])\/\//i.test(normalized)
  )
    add('PROTOCOL_RELATIVE_URL');
  if (extname(path) === '.html') {
    if (!text.includes(`<meta http-equiv="Content-Security-Policy" content="${fixtureCsp}">`))
      add('CSP_MISSING');
    for (const match of text.matchAll(/\bhref="(\/[^"?#]*)/g)) {
      const target = match[1];
      if (
        !target.startsWith('/_next/') &&
        !target.startsWith('/vendor/') &&
        !fixtureRoutes.some((route) => target === `/${route}${route ? '/' : ''}`)
      )
        add('LINK_TO_EXCLUDED_ROUTE');
    }
  }
  return findings;
}

export function inspectDeploymentTree(directory) {
  const files = walk(directory);
  const findings = files.flatMap((entry) =>
    inspectDeploymentBytes(entry.path, fileBytes(directory, resolve(directory, entry.path))).map(
      (rule) => ({ path: entry.path, rule }),
    ),
  );
  for (const route of fixtureRoutes)
    if (!files.some((entry) => entry.path === `${route ? `${route}/` : ''}index.html`))
      findings.push({ path: route || '.', rule: 'FIXTURE_ROUTE_MISSING' });
  for (const path of publicFiles)
    if (!files.some((entry) => entry.path === path))
      findings.push({ path, rule: 'WORKER_OR_LICENSE_MISSING' });
  for (const name of noticeFiles)
    if (!files.some((entry) => entry.path === `notices/${name}`))
      findings.push({ path: 'notices', rule: 'NOTICE_MISSING' });
  return { files, findings };
}

function assertPublicAssets(root) {
  const directory = resolve(root, 'examples/web/public');
  if (!existsSync(directory)) return;
  for (const entry of walk(directory))
    assert(
      publicFiles.includes(entry.path),
      'Unreviewed public asset found; fixture build accepts only its local worker and license',
    );
}
function runBuild(root, environment, log, run) {
  assertNoEnvironmentFiles(root);
  assertPublicAssets(root);
  const cli = environment.npm_execpath;
  assert(typeof cli === 'string' && isAbsolute(cli), 'Invoke preparation through pnpm exec node');
  const isScript = /\.[cm]?js$/.test(cli);
  const env = { ...fixtureBuildEnvironment(environment), npm_execpath: cli };
  const invoke = (args) => {
    const result = run(isScript ? process.execPath : cli, isScript ? [cli, ...args] : args, {
      cwd: root,
      env,
      encoding: 'utf8',
      timeout: 180000,
      maxBuffer: 4 * 1024 * 1024,
    });
    writeFileSync(log, `${result.stdout ?? ''}${result.stderr ?? ''}`, { flag: 'a' });
    assert(
      !result.error && !result.signal && result.status === 0,
      'Fixture build did not complete successfully; inspect ignored build log',
    );
    return result.stdout.trim();
  };
  assert.equal(invoke(['--version']), '12.14.0', 'Pinned pnpm required');
  for (const path of ['examples/web/.next', 'examples/web/out']) {
    const target = contained(root, resolve(root, path));
    rmSync(target, { recursive: true, force: true });
  }
  invoke(['run', 'build:sdk']);
  invoke(['--filter', '@korea-map-kit/example-web', 'build']);
  assertPublicAssets(root);
}

export function verifyPolyfillLicenseEvidence(root) {
  const directory = contained(root, resolve(root, 'artifacts/web-deploy-license-evidence'));
  const evidence = JSON.parse(fileBytes(root, resolve(directory, 'licenses.json')));
  const metadata = fileBytes(root, resolve(directory, 'next-polyfill-package.json'));
  assert(
    hash(metadata) === 'f219fb23c2d3365c1a90db1d169a59247786044addb100e42fda4482e1d55b9e',
    'Reviewed Next polyfill version metadata required',
  );
  assert(
    evidence.schemaVersion === 1 &&
      Array.isArray(evidence.packages) &&
      evidence.packages.length === 3,
    'Three exact manual license evidence records required',
  );
  return polyfillLicenses.map((pin) => {
    const record = evidence.packages.find(
      (entry) => entry.name === pin.name && entry.version === pin.version,
    );
    const licenseFile = `${pin.name}-${pin.version}-LICENSE.txt`;
    assert(
      record?.licenseFile === licenseFile &&
        record.licenseSha256 === pin.licenseSha256 &&
        /^[a-f0-9]{64}$/.test(record.tarballSha256) &&
        /^sha512-[A-Za-z0-9+/]+={0,2}$/.test(record.integrity),
      'Reviewed license identity and provenance required',
    );
    for (const [field, pathname] of [
      ['sourceUrl', `/${pin.name}/${pin.version}`],
      ['tarballUrl', `/${pin.name}/-/${pin.name}-${pin.version}.tgz`],
    ]) {
      const url = new URL(record[field]);
      assert(
        url.protocol === 'https:' &&
          url.hostname === 'registry.npmjs.org' &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash &&
          url.pathname === pathname,
        'Official exact-version provenance required',
      );
    }
    const bytes = fileBytes(root, resolve(directory, licenseFile));
    assert(hash(bytes) === pin.licenseSha256, 'License text SHA mismatch');
    return {
      name: pin.name,
      version: pin.version,
      licenseFile,
      licenseSha256: pin.licenseSha256,
      sourceUrl: record.sourceUrl,
      tarballUrl: record.tarballUrl,
      integrity: record.integrity,
      tarballSha256: record.tarballSha256,
      bytes: bytes.length,
    };
  });
}
export function extractLicenseSection(bytes) {
  const text = bytes.toString('utf8');
  const start = text.search(/^## License(?: \(MIT\))?\s*$/im);
  assert(start >= 0, 'Complete license section required');
  return Buffer.from(text.slice(start));
}
function addNotices(root, site, polyfills) {
  const require = createRequire(resolve(root, 'examples/web/package.json'));
  const notices = resolve(site, 'notices');
  mkdirSync(notices);
  const records = [];
  function copy(name, path, section) {
    const info = lstatSync(path);
    assert(
      info.isFile() && !info.isSymbolicLink() && info.size <= maxFileBytes,
      'Regular notice required',
    );
    let bytes = readFileSync(path);
    if (section) bytes = extractLicenseSection(bytes);
    writeFileSync(resolve(notices, name), bytes);
    records.push({ path: `notices/${name}`, bytes: bytes.length, sha256: hash(bytes) });
  }
  copy('PROJECT-LICENSE.txt', resolve(root, 'LICENSE'));
  copy('THIRD_PARTY_NOTICES.txt', resolve(root, 'THIRD_PARTY_NOTICES.md'));
  for (const name of installedNotices) {
    const directory = dirname(require.resolve(`${name}/package.json`));
    const license = readdirSync(directory).find((file) => /^license(?:\.txt|\.md)?$/i.test(file));
    assert(license, 'Actual installed dependency notice missing');
    copy(`${name.replaceAll('/', '-').replace('@', '')}-LICENSE.txt`, resolve(directory, license));
  }
  const next = dirname(require.resolve('next/package.json'));
  for (const name of compiledNotices) {
    const path = resolve(next, 'dist/compiled', name, 'LICENSE');
    copy(`next-compiled-${name}-LICENSE.txt`, path);
  }
  for (const record of polyfills)
    copy(
      record.licenseFile,
      resolve(root, 'artifacts/web-deploy-license-evidence', record.licenseFile),
    );
  const glDirectory = dirname(require.resolve('maplibre-gl/package.json'));
  const packageIds = new Set();
  for (const name of ['maplibre-gl.mjs.map', 'maplibre-gl-worker.mjs.map']) {
    const path = resolve(glDirectory, 'dist', name);
    const info = lstatSync(path);
    assert(
      info.isFile() && !info.isSymbolicLink() && info.size <= 32 * 1024 * 1024,
      'Bounded installed source map required',
    );
    const map = JSON.parse(readFileSync(path, 'utf8'));
    assert(Array.isArray(map.sources));
    for (const source of map.sources)
      for (const match of source.matchAll(/node_modules\/((?:@[^/]+\/)?[^/]+)/g))
        packageIds.add(match[1]);
  }
  assert.deepEqual(
    [...packageIds].sort(),
    mapLibrePackages.map(([name]) => name).sort(),
    'Changed bundled dependency source inventory requires review',
  );
  const glRequire = createRequire(resolve(glDirectory, 'package.json'));
  const inventory = [];
  for (const [name, version] of mapLibrePackages) {
    const directory = glRequire.resolve
      .paths(name)
      .map((path) => resolve(path, name))
      .find(
        (path) =>
          existsSync(resolve(path, 'package.json')) &&
          JSON.parse(readFileSync(resolve(path, 'package.json'), 'utf8')).name === name,
      );
    assert(directory, 'Actual bundled dependency package unavailable');
    const metadata = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
    assert.equal(metadata.version, version, 'Bundled dependency version changed');
    const license =
      readdirSync(directory).find((file) => /^license(?:\.txt|\.md)?$/i.test(file)) ??
      (name === 'murmurhash-js' ? 'README.md' : null);
    assert(license, 'Bundled dependency original notice missing');
    const file = bundledNoticeName(name, version);
    copy(file, resolve(directory, license), name === 'murmurhash-js');
    inventory.push({
      name,
      version,
      license: metadata.license,
      originalFile: license,
      notice: `notices/${file}`,
      sha256: records.at(-1).sha256,
    });
  }
  return { records, inventory };
}

export function verifyWebDeployment(directory) {
  const manifestBytes = fileBytes(directory, resolve(directory, 'deploy-manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  assert(
    manifest.schemaVersion === 1 &&
      manifest.mode === 'synthetic-fixture-only' &&
      manifest.publicationAuthorized === false &&
      manifest.releaseBlocked === true &&
      /^[a-f0-9]{40}$/.test(manifest.sourceCommit) &&
      typeof manifest.sourceDirty === 'boolean',
    'Explicit preview manifest required',
  );
  const inspection = inspectDeploymentTree(contained(directory, resolve(directory, 'site')));
  assert.deepEqual(inspection.findings, [], 'Deployment policy scan failed');
  assert.deepEqual(inspection.files, manifest.files, 'Deployment file inventory or SHA mismatch');
  assert.deepEqual(
    manifest.routes,
    fixtureRoutes.map((route) => `/${route}${route ? '/' : ''}`),
  );
  assert.equal(manifest.csp, fixtureCsp);
  assert.deepEqual(
    manifest.notices,
    inspection.files
      .filter((entry) => entry.path.startsWith('notices/'))
      .map((entry) => ({ path: entry.path, bytes: entry.bytes, sha256: entry.sha256 })),
    'Notice inventory mismatch',
  );
  for (const pin of polyfillLicenses)
    assert(
      inspection.files.some(
        (entry) =>
          entry.path === `notices/${pin.name}-${pin.version}-LICENSE.txt` &&
          entry.sha256 === pin.licenseSha256,
      ),
      'Pinned polyfill license missing',
    );
  assert(
    Array.isArray(manifest.bundleLicenseInventory) &&
      manifest.bundleLicenseInventory.length === mapLibrePackages.length,
    'Bundle license inventory required',
  );
  for (const [name, version] of mapLibrePackages)
    assert(
      manifest.bundleLicenseInventory.some(
        (entry) =>
          entry.name === name &&
          entry.version === version &&
          entry.notice === `notices/${bundledNoticeName(name, version)}` &&
          inspection.files.some(
            (file) => file.path === entry.notice && file.sha256 === entry.sha256,
          ),
      ),
      'Bundle notice provenance mismatch',
    );
  return {
    status: 'VERIFIED_LOCAL_ONLY',
    publicationAuthorized: false,
    releaseBlocked: true,
    files: inspection.files.length,
    bytes: inspection.files.reduce((sum, entry) => sum + entry.bytes, 0),
    sourceCommit: manifest.sourceCommit,
    sourceDirty: manifest.sourceDirty,
  };
}

export async function smokeWebDeployment(directory, { playwright } = {}) {
  verifyWebDeployment(directory);
  const site = resolve(directory, 'site');
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.txt': 'text/plain; charset=utf-8',
  };
  const server = createServer((request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      assert(!path.includes('\\') && !path.includes('\0'), 'Invalid request path');
      let target = contained(site, resolve(site, path === '/' ? 'index.html' : `.${path}`));
      if (lstatSync(target).isDirectory()) target = contained(site, resolve(target, 'index.html'));
      response.setHeader('Content-Security-Policy', fixtureCsp);
      response.setHeader('Content-Type', mime[extname(target)] ?? 'application/octet-stream');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.end(fileBytes(site, target));
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  let browser;
  let context;
  const errors = [],
    external = [];
  try {
    await new Promise((resolveReady, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolveReady);
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const driver = playwright ?? (await import('@playwright/test'));
    browser = await driver.chromium.launch({
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
      args: ['--enable-unsafe-swiftshader'],
    });
    context = await browser.newContext({
      serviceWorkers: 'block',
      viewport: { width: 390, height: 800 },
    });
    await context.route('**/*', (route) => {
      if (new URL(route.request().url()).origin !== origin) {
        external.push('BLOCKED_EXTERNAL_REQUEST');
        return route.abort();
      }
      return route.continue();
    });
    context.on('page', (page) => page.on('pageerror', () => errors.push('PAGE_ERROR')));
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: 'networkidle', timeout: 30000 });
    await page.getByTestId('status').filter({ hasText: 'ready' }).waitFor({ timeout: 30000 });
    assert.equal(await page.locator('canvas.maplibregl-canvas').count(), 1);
    await page.getByRole('button', { name: '첫 장소 선택', exact: true }).click();
    await page.getByText('합성 장소 1', { exact: true }).first().waitFor();
    await page.screenshot({ path: resolve(directory, 'smoke-390.png') });
    await page
      .getByTestId('camera')
      .filter({ hasText: /\/ [\d.]+ \// })
      .waitFor();
    const priorZoom = Number((await page.getByTestId('camera').textContent()).split('/')[1]);
    assert(Number.isFinite(priorZoom));
    await page.getByRole('button', { name: '확대', exact: true }).click();
    await page
      .getByTestId('camera')
      .filter({ hasText: ` / ${(priorZoom + 1).toFixed(2)} / ` })
      .waitFor();
    await page.getByRole('button', { name: '지도 종료', exact: true }).click();
    await page.getByRole('button', { name: '지도 시작', exact: true }).waitFor();
    assert.equal(await page.locator('canvas.maplibregl-canvas').count(), 0);
    for (const route of fixtureRoutes.filter((value) => value)) {
      await page.goto(`${origin}/${route}/`, { waitUntil: 'networkidle', timeout: 30000 });
      const status =
        route === 'themes'
          ? page.getByTestId('status-standard')
          : page.getByTestId(
              ['walk', 'trip'].includes(route) ? 'scenario-status' : `${route}-status`,
            );
      await status
        .filter({ hasText: route === 'themes' || route === 'api' ? 'ready' : '준비 완료' })
        .waitFor({ timeout: 30000 });
      assert((await page.locator('canvas.maplibregl-canvas').count()) > 0);
    }
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
    return {
      status: 'PASS_LOCAL_BROWSER_ONLY',
      browser: await browser.version(),
      viewport: '390x800',
      externalRequests: external.length,
      pageErrors: errors.length,
      render: 'PASS',
      selection: 'PASS',
      zoom: 'PASS',
      destroy: 'PASS',
      routes: fixtureRoutes.map((route) => `/${route}${route ? '/' : ''}`),
    };
  } finally {
    const cleanup = await Promise.allSettled([
      context?.close(),
      browser?.close(),
      new Promise((done) => {
        server.closeAllConnections();
        server.close(done);
      }),
    ]);
    assert(
      cleanup.every((entry) => entry.status === 'fulfilled'),
      'Smoke cleanup failed',
    );
  }
}

export async function prepareWebDeployment({
  root = rootDirectory,
  output,
  smoke = false,
  environment = process.env,
  run = spawnSync,
} = {}) {
  const boundary = contained(root, resolve(root, 'artifacts/web-deploy'));
  mkdirSync(boundary, { recursive: true });
  const destination = contained(
    boundary,
    resolve(output ?? resolve(boundary, `candidate-${randomUUID()}`)),
  );
  assert(!existsSync(destination), 'Existing deployment candidate must not be overwritten');
  const temporary = contained(boundary, resolve(boundary, `.prepare-${randomUUID()}`));
  mkdirSync(temporary);
  try {
    const polyfills = verifyPolyfillLicenseEvidence(root);
    runBuild(root, environment, resolve(temporary, 'build.log'), run);
    const source = resolve(root, 'examples/web/out');
    const site = resolve(temporary, 'site');
    mkdirSync(site);
    for (const entry of walk(source)) {
      const pieces = entry.path.split('/');
      const routeFile =
        (fixtureRoutes.includes(pieces.length === 1 ? '' : pieces[0]) &&
          !entry.path.startsWith('_next/')) ||
        pieces[0] === '404' ||
        entry.path === '404.html';
      const sharedFile =
        entry.path.startsWith('_next/') &&
        !/^_next\/static\/chunks\/app\/(tiles|gps)\//.test(entry.path);
      if (!routeFile && !sharedFile && !publicFiles.includes(entry.path)) continue;
      if (extname(entry.path) === '.html') {
        const html = fileBytes(source, resolve(source, entry.path)).toString('utf8');
        assert(
          html.includes('<head>') && !/http-equiv=["']Content-Security-Policy/i.test(html),
          'One original HTML head required',
        );
        const target = resolve(site, entry.path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(
          target,
          html.replace(
            '<head>',
            `<head><meta http-equiv="Content-Security-Policy" content="${fixtureCsp}">`,
          ),
        );
      } else {
        const target = resolve(site, entry.path);
        mkdirSync(dirname(target), { recursive: true });
        cpSync(resolve(source, entry.path), target, { errorOnExist: true, force: false });
      }
    }
    const noticeBundle = addNotices(root, site, polyfills);
    const notices = noticeBundle.records.sort((a, b) => a.path.localeCompare(b.path, 'en'));
    const inspection = inspectDeploymentTree(site);
    assert.deepEqual(
      inspection.findings,
      [],
      'Static deployment scan failed; inspect local policy findings without printing payload values',
    );
    const git = (args) => {
      const result = run('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 10000 });
      assert(
        !result.error && !result.signal && result.status === 0,
        'Git source binding unavailable',
      );
      return result.stdout.trim();
    };
    const sourceCommit = git(['rev-parse', 'HEAD']);
    assert(/^[a-f0-9]{40}$/.test(sourceCommit));
    const manifest = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      mode: 'synthetic-fixture-only',
      sourceCommit,
      sourceDirty: git(['status', '--porcelain']).length > 0,
      publicationAuthorized: false,
      releaseBlocked: true,
      routes: fixtureRoutes.map((route) => `/${route}${route ? '/' : ''}`),
      csp: fixtureCsp,
      files: inspection.files,
      notices,
      polyfillLicenseProvenance: polyfills,
      bundleLicenseInventory: noticeBundle.inventory,
    };
    writeFileSync(
      resolve(temporary, 'deploy-manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    verifyWebDeployment(temporary);
    const browser = smoke ? await smokeWebDeployment(temporary) : { status: 'NOT_RUN' };
    writeFileSync(
      resolve(temporary, 'verification.json'),
      `${JSON.stringify({ ...verifyWebDeployment(temporary), browser }, null, 2)}\n`,
    );
    renameSync(temporary, destination);
    return {
      ...verifyWebDeployment(destination),
      directory: relative(root, destination).split('\\').join('/'),
      browser,
    };
  } catch (error) {
    if (existsSync(resolve(temporary, 'build.log')))
      renameSync(resolve(temporary, 'build.log'), resolve(boundary, `failed-${randomUUID()}.log`));
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

export function parseWebDeploymentOptions(args) {
  const [mode, ...flags] = args;
  assert(['prepare', 'verify', 'smoke'].includes(mode), 'Use prepare, verify or smoke');
  const options = { mode, smoke: false };
  for (const flag of flags) {
    if (flag === '--smoke' && mode === 'prepare') {
      assert(!options.smoke);
      options.smoke = true;
    } else {
      const match = /^--directory=(.+)$/.exec(flag);
      assert(
        match && !options.directory && isAbsolute(match[1]),
        'One absolute artifact directory required',
      );
      options.directory = match[1];
    }
  }
  assert(
    mode === 'prepare' || options.directory,
    'Verification requires an explicit local artifact directory',
  );
  return options;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = parseWebDeploymentOptions(process.argv.slice(2));
    const report =
      options.mode === 'prepare'
        ? await prepareWebDeployment({ output: options.directory, smoke: options.smoke })
        : options.mode === 'verify'
          ? verifyWebDeployment(options.directory)
          : await smokeWebDeployment(options.directory);
    console.log(JSON.stringify(report, null, 2));
  } catch {
    console.error(
      JSON.stringify({
        status: 'BLOCKED',
        publicationAuthorized: false,
        releaseBlocked: true,
        reason: 'FIXTURE_DEPLOYMENT_VALIDATION_FAILED',
      }),
    );
    process.exitCode = 1;
  }
}
