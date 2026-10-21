import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertDeclarationProbe, summarizeDeclarationProbe } from './declaration-probe.mjs';
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

async function verifyPackages() {
  const root = process.cwd();
  const cli = process.env.npm_execpath;
  function pnpm(args, cwd = root) {
    const scripted = /\.[cm]?js$/.test(cli);
    const result = spawnSync(scripted ? process.execPath : cli, scripted ? [cli, ...args] : args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      timeout: 180000,
    });
    assert(!result.error && !result.signal, 'Package verification command did not finish');
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    return result.stdout;
  }
  const names = ['core', 'web', 'native', 'styles', 'data-adapters'];
  const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const directory = resolve('artifacts/qa/repro');
  mkdirSync(directory, { recursive: true });
  const report = {
    schemaVersion: 2,
    sourceCommit: null,
    sourceDirty: null,
    status: 'NOT_RUN',
    blocked: true,
    packages: [],
    checks: {
      reproducibility: 'NOT_RUN',
      offlineConsumerInstall: 'NOT_RUN',
      supportedBundlerTypes: 'NOT_RUN',
      webLayerTypes: 'NOT_RUN',
      coreNodeNextTypes: 'NOT_RUN',
      ssrImport: 'NOT_RUN',
      browser: 'NOT_RUN',
    },
    nodeNextProbe: summarizeDeclarationProbe(undefined),
    nativeConsumer: 'not executed',
  };
  let before = new Map(),
    temp,
    server,
    browser;
  let stage = 'reproducibility';
  try {
    assert(cli, 'Run via pnpm verify:packages after pnpm pack:check');
    const git = (...args) => {
      const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 10000 });
      assert(!result.error && !result.signal && result.status === 0, 'Source identity unavailable');
      return result.stdout.trim();
    };
    report.sourceCommit = git('rev-parse', 'HEAD');
    report.sourceDirty = git('status', '--porcelain').length !== 0;
    before = new Map(
      names.map((name) => {
        const { version } = JSON.parse(readFileSync(`packages/${name}/package.json`, 'utf8'));
        const file = `korea-map-${name}-${version}.tgz`;
        return [file, readFileSync(resolve('artifacts', file))];
      }),
    );
    // Remove only generated SDK outputs; do not touch operator data or other artifacts.
    for (const name of names)
      rmSync(resolve('packages', name, 'dist'), { recursive: true, force: true });
    pnpm(['run', 'build:sdk']);
    for (const name of names)
      pnpm(['pack', '--pack-destination', directory], resolve('packages', name));
    const packages = [...before].map(([file, bytes]) => {
      assert.deepEqual(
        readFileSync(resolve(directory, file)),
        bytes,
        `Non-reproducible SDK tarball: ${file}`,
      );
      return { file, gzipBytes: bytes.length, sha256: sha(bytes) };
    });
    report.packages = packages;
    report.checks.reproducibility = 'PASS';
    report.reproducibility = 'same Linux host, clean SDK rebuild, byte-identical five tarballs';
    stage = 'offlineConsumerInstall';
    temp = mkdtempSync(resolve(tmpdir(), 'kmk-consumer-'));
    const dependencies = Object.fromEntries(
      names
        .filter((name) => name !== 'native')
        .map((name) => {
          const file = packages.find((entry) => entry.file.startsWith(`korea-map-${name}-`)).file;
          return [`korea-map-${name}`, `file:${resolve('artifacts', file).replaceAll('\\', '/')}`];
        }),
    );
    writeFileSync(
      resolve(temp, 'package.json'),
      JSON.stringify({
        name: 'isolated-kmk-consumer',
        private: true,
        type: 'module',
        dependencies: { ...dependencies, 'maplibre-gl': '6.14.0' },
      }),
    );
    // Local unpublished packages resolve only to the audited tarballs, never workspace source.
    writeFileSync(
      resolve(temp, 'pnpm-workspace.yaml'),
      `ignoreScripts: true\ncacheDir: '${resolve(temp, 'empty-metadata-cache').replaceAll('\\', '/')}'\noverrides:\n${Object.entries(
        dependencies,
      )
        .map(([name, value]) => `  '${name}': '${value}'`)
        .join('\n')}\n`,
    );
    const store = dirname(pnpm(['store', 'path']).trim());
    // A new consumer needs registry metadata even when package files are cached.
    // Prepare its lock explicitly, then verify installation with networking forbidden by --offline.
    // Seed from the repository lock and reject any third-party version outside the reviewed graph.
    cpSync(resolve(root, 'pnpm-lock.yaml'), resolve(temp, 'pnpm-lock.yaml'));
    console.log('Preparing consumer lock from public registry metadata; no lifecycle scripts');
    pnpm(
      [
        'install',
        '--lockfile-only',
        '--no-frozen-lockfile',
        '--ignore-scripts',
        '--store-dir',
        store,
      ],
      temp,
    );
    pnpm(
      ['install', '--offline', '--frozen-lockfile', '--ignore-scripts', '--store-dir', store],
      temp,
    );
    const reviewedGraph = new Set(
      Object.values(
        JSON.parse(pnpm(['-r', '--include-workspace-root', 'licenses', 'list', '--json'])),
      ).flatMap((entries) =>
        entries.flatMap(({ name, versions }) => versions.map((version) => `${name}@${version}`)),
      ),
    );
    for (const entries of Object.values(JSON.parse(pnpm(['licenses', 'list', '--json'], temp)))) {
      for (const { name, versions } of entries) {
        if (Object.hasOwn(dependencies, name)) continue;
        for (const version of versions)
          assert(
            reviewedGraph.has(`${name}@${version}`),
            `Unreviewed consumer dependency: ${name}@${version}`,
          );
      }
    }
    report.checks.offlineConsumerInstall = 'PASS';
    stage = 'supportedBundlerTypes';
    const source = `import type { Coordinate, MapMarker } from 'korea-map-core';
import { normalizeSearchText } from 'korea-map-core';
import { createMapState, createMap } from 'korea-map-web';
import * as adapters from 'korea-map-data-adapters';
import { createFixtureStyle } from 'korea-map-styles';
const coordinate: Coordinate = [127, 37];
const marker: MapMarker = { id: 'synthetic', label: '합성 장소', coordinate };
const state = createMapState(); state.setMarkers([marker]);
if (normalizeSearchText('서 울') !== '서울' || typeof createMap !== 'function' || !Object.keys(adapters).length) throw Error('Import/API smoke failed');
createFixtureStyle({ mode: 'local-fixture', fixtureId: 'synthetic-v1' });
`;
    writeFileSync(resolve(temp, 'consumer.ts'), source);
    const tsc = resolve('node_modules/typescript/bin/tsc');
    const typed = spawnSync(
      process.execPath,
      [
        tsc,
        '--ignoreConfig',
        '--strict',
        '--skipLibCheck',
        'false',
        '--module',
        'ESNext',
        '--moduleResolution',
        'Bundler',
        '--target',
        'ES2022',
        '--outDir',
        'compiled',
        'consumer.ts',
      ],
      { cwd: temp, encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024 },
    );
    report.checks.supportedBundlerTypes = summarizeDeclarationProbe(typed, { roots: [temp, root] });
    assertDeclarationProbe(
      report.checks.supportedBundlerTypes,
      'Web supported Bundler declarations',
    );
    stage = 'webLayerTypes';
    cpSync(
      resolve(root, 'tests/fixtures/web-layer-consumer.ts'),
      resolve(temp, 'web-layer-consumer.ts'),
    );
    const layerTypes = spawnSync(
      process.execPath,
      [
        tsc,
        '--ignoreConfig',
        '--strict',
        '--skipLibCheck',
        'false',
        '--module',
        'ESNext',
        '--moduleResolution',
        'Bundler',
        '--target',
        'ES2022',
        '--noEmit',
        'web-layer-consumer.ts',
      ],
      { cwd: temp, encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024 },
    );
    report.checks.webLayerTypes = summarizeDeclarationProbe(layerTypes, { roots: [temp, root] });
    assertDeclarationProbe(report.checks.webLayerTypes, 'Web custom/style layer compatibility');
    stage = 'coreNodeNextTypes';
    writeFileSync(
      resolve(temp, 'core-consumer.ts'),
      "import { normalizeSearchText, type Coordinate } from 'korea-map-core'; const point: Coordinate = [127, 37]; if (point[0] !== 127 || normalizeSearchText('서 울') !== '서울') throw Error('core');",
    );
    writeFileSync(
      resolve(temp, 'core-tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          skipLibCheck: false,
          target: 'ES2022',
          module: 'NodeNext',
          lib: ['ES2022'],
          types: [],
          noEmit: true,
        },
        files: ['core-consumer.ts'],
      }),
    );
    const coreTypes = spawnSync(process.execPath, [tsc, '-p', 'core-tsconfig.json'], {
      cwd: temp,
      encoding: 'utf8',
      timeout: 180000,
      maxBuffer: 8 * 1024 * 1024,
    });
    report.checks.coreNodeNextTypes = summarizeDeclarationProbe(coreTypes, { roots: [temp, root] });
    assertDeclarationProbe(
      report.checks.coreNodeNextTypes,
      'Platform-free core NodeNext declarations',
    );
    report.coreNodeNextTypes = 'passed without DOM or ambient types';
    stage = 'nodeNextProbe';
    const nodeNext = spawnSync(
      process.execPath,
      [
        tsc,
        '--ignoreConfig',
        '--strict',
        '--skipLibCheck',
        'false',
        '--module',
        'NodeNext',
        '--target',
        'ES2022',
        '--noEmit',
        'consumer.ts',
        'web-layer-consumer.ts',
      ],
      { cwd: temp, encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024 },
    );
    const nodeNextProbe = summarizeDeclarationProbe(nodeNext, { roots: [temp, root] });
    report.nodeNextProbe = nodeNextProbe;
    console.log(
      'WEB_NODENEXT_PROBE',
      JSON.stringify(nodeNextProbe),
      '(separate from Bundler; an incomplete or failed public declaration probe blocks this verifier)',
    );
    stage = 'ssrImport';
    writeFileSync(
      resolve(temp, 'smoke.mjs'),
      "globalThis.fetch = () => { throw Error('Unexpected network'); }; await import('./compiled/consumer.js');",
    );
    const smoke = spawnSync(process.execPath, ['smoke.mjs'], {
      cwd: temp,
      encoding: 'utf8',
      timeout: 180000,
      maxBuffer: 8 * 1024 * 1024,
    });
    report.checks.ssrImport = summarizeDeclarationProbe(smoke, { roots: [temp, root] });
    assertDeclarationProbe(report.checks.ssrImport, 'Node SSR import');
    stage = 'browser';
    const require = createRequire(resolve(temp, 'package.json'));
    const maplibre = dirname(require.resolve('maplibre-gl/package.json'));
    mkdirSync(resolve(temp, 'public'));
    cpSync(resolve(maplibre, 'dist/maplibre-gl-worker.mjs'), resolve(temp, 'public/worker.mjs'));
    writeFileSync(
      resolve(temp, 'index.html'),
      `<!doctype html><html lang="ko"><meta charset="utf-8"><title>Isolated SDK consumer</title><div id="map" style="height:400px"></div><script type="module">
import { createMap, createMapState } from 'korea-map-web';
import 'maplibre-gl/dist/maplibre-gl.css';
const state = createMapState(); state.setMarkers([{ id: 'fixture', label: '합성 장소', coordinate: [126.978, 37.5665] }]);
const map = await createMap({ container: document.getElementById('map'), state, workerUrl: '/worker.mjs', config: { mode: 'local-fixture', fixtureId: 'synthetic-v1' } });
await map.ready; document.body.dataset.ready = 'true'; window.consumerMap = map;
</script></html>`,
    );
    server = await createServer({
      configFile: false,
      root: temp,
      server: { host: '127.0.0.1', port: 0 },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
    await server.listen();
    const url = server.resolvedUrls.local[0];
    browser = await chromium.launch({
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
      args: ['--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage();
    const external = [],
      errors = [];
    await page.route('**/*', (route) => {
      if (new URL(route.request().url()).origin !== new URL(url).origin) {
        external.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(url);
    await page.locator('body[data-ready="true"]').waitFor();
    assert.equal(await page.locator('canvas').count(), 1);
    await page.getByRole('combobox', { name: '지도 장소 선택' }).selectOption('fixture');
    await page.getByRole('article', { name: '장소 카드' }).waitFor();
    await page.evaluate(() => {
      globalThis.consumerMap.destroy();
    });
    assert.equal(await page.locator('canvas').count(), 0);
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
    report.checks.browser = {
      status: 'PASS',
      externalRequests: external.length,
      pageErrors: errors.length,
      render: 'PASS',
      selection: 'PASS',
      destroy: 'PASS',
    };
    report.isolatedConsumer =
      'four Web packages: explicit registry metadata preparation, frozen offline install, reviewed dependency graph, strict declarations and custom/style layer compatibility, Node SSR import, Chromium render/select/destroy; zero external requests';
    report.blocked = nodeNextProbe.status !== 'PASS';
    report.status = report.blocked ? 'PARTIAL_PASS' : 'PASS';
    console.log(
      `${report.status}: rebuilt tarballs; isolated Bundler/custom-layer/core/SSR/browser checks passed; public NodeNext declarations ${nodeNextProbe.status}`,
    );
    console.log(JSON.stringify(packages));
  } catch (error) {
    report.status = 'FAIL';
    report.blocked = true;
    if (report.checks[stage] === 'NOT_RUN') report.checks[stage] = 'FAIL';
    report.failure = { stage, code: String(error?.code ?? 'VERIFICATION_FAILED') };
    throw error;
  } finally {
    // Persist all completed and unexecuted checks even when the compiler or cleanup fails.
    try {
      writeFileSync(
        resolve(root, 'artifacts/qa/packages.json'),
        `${JSON.stringify(report, null, 2)}\n`,
      );
    } finally {
      try {
        await browser?.close();
      } finally {
        try {
          await server?.close();
        } finally {
          if (temp) rmSync(temp, { recursive: true, force: true });
          // Retain hashes and the primary audited tarballs, not duplicate archives.
          for (const file of readdirSync(directory))
            if (before.has(file)) rmSync(resolve(directory, file));
        }
      }
    }
  }
  // Keep supported checks and the overall PARTIAL_PASS report, then fail closed for every non-pass.
  assertDeclarationProbe(report.nodeNextProbe, 'Web public NodeNext declarations');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await verifyPackages();
  } catch (error) {
    console.error(`Package verification failed: ${String(error?.code ?? error?.name ?? 'ERROR')}`);
    process.exitCode = 1;
  }
}
