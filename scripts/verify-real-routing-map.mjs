// Optional, operator-owned real-data QA. Never part of installation or the default test suite.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const redact = (value) => String(value).replace(/https?:\/\/[^\s"'<>]+/g, '[URL]');

export function parseRealRoutingMapOptions(args) {
  assert(args.includes('--operator-opt-in'), 'Explicit --operator-opt-in is required');
  const values = new Map();
  for (const arg of args) {
    if (arg === '--operator-opt-in') continue;
    const match = /^--(store|glyphs|engine-url|dataset-file)=(.+)$/.exec(arg);
    assert(match && !values.has(match[1]), 'Use unique explicit --name=value flags');
    values.set(match[1], match[2]);
  }
  for (const name of ['store', 'glyphs', 'dataset-file'])
    assert(
      values.has(name) && isAbsolute(values.get(name)),
      'Explicit absolute operator paths required',
    );
  assert(values.has('engine-url'), 'Explicit --engine-url is required');
  const endpoint = new URL(values.get('engine-url'));
  assert(
    (endpoint.protocol === 'https:' ||
      (endpoint.protocol === 'http:' &&
        ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname))) &&
      !endpoint.username &&
      !endpoint.password &&
      !endpoint.search &&
      !endpoint.hash &&
      ['/', '/route'].includes(endpoint.pathname),
    'Explicit HTTPS or loopback HTTP routing endpoint required; credentials/query/fragment forbidden',
  );
  endpoint.pathname = '/route';
  return {
    store: values.get('store'),
    glyphs: values.get('glyphs'),
    datasetFile: values.get('dataset-file'),
    endpoint: endpoint.href,
  };
}

function readJson(path) {
  assert(
    statSync(path).isFile() && statSync(path).size <= 1024 * 1024,
    'Bounded local JSON file required',
  );
  const bytes = readFileSync(path);
  return { bytes, value: JSON.parse(bytes.toString('utf8')) };
}

function consumerHtml(payload) {
  const json = JSON.stringify(payload).replaceAll('<', '\\u003c');
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><title>한국 실제 경로 통합 QA</title>
<style>*{box-sizing:border-box}body{margin:0;color:#17252b;font:16px/1.5 system-ui,sans-serif;background:#f6f8fa}main{padding:16px;max-width:1440px;margin:auto}h1{font-size:23px;margin:0 0 8px}p{margin:6px 0}#map{height:72vh;min-height:440px;position:relative;overflow:hidden;border:1px solid #b9c9ce;border-radius:12px}#routes{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0}#routes li{background:#fff;border:1px solid #bdcbd3;padding:7px 12px;border-radius:6px}#status{font-weight:600}small{display:block;margin-top:8px}@media(max-width:500px){main{padding:10px}h1{font-size:20px}#map{height:64vh;min-height:410px}#routes{font-size:13px;gap:5px}#routes li{padding:5px 8px}}</style>
<main><h1>서울 실제 도로 경로 · SDK 통합 검증</h1><p>운영자 OSM 지도와 Valhalla 결과 · 공개 도로 표본 · 개인 GPS 기록 아님</p><ul id="routes" aria-label="경로 결과"></ul><p id="status" role="status">지도 연결 중</p><div id="map" aria-label="실제 서울 경로 지도"></div><small id="source"></small><small>예상 시간에 실시간 교통은 반영되지 않으며, 실제 통행 가능성과 보행 안전을 보장하지 않습니다.</small></main>
<script type="module">
import { createMap, createMapState } from 'korea-map-web';
import 'maplibre-gl/dist/maplibre-gl.css';
const input = ${json};
const state = createMapState();
state.setCamera({ center: [126.977, 37.57], zoom: 14, bearing: 0, pitch: 0 });
const map = await createMap({ container: document.getElementById('map'), state, workerUrl: '/worker.mjs', useLocalIdeographs: false, loadTimeoutMs: 45000, config: { mode: 'operator', styleUrl: input.styleUrl, allowedOrigins: [input.tileOrigin], attribution: input.attribution, costAcknowledged: true } });
window.routingMap = map;
window.mapErrors = [];
map.on('error', error => window.mapErrors.push(error));
await map.ready;
for (const route of input.routes) {
  await map.api.showRoute(route);
  const item = document.createElement('li');
  item.textContent = route.label + ' · ' + route.distanceMeters + ' m · ' + route.durationSeconds + ' s';
  document.getElementById('routes').append(item);
}
for (const marker of input.markers) await map.api.addMarker(marker);
const coordinates = input.routes.flatMap(route => route.coordinates);
window.routingCoordinates = coordinates;
const bounds = { west: Math.min(...coordinates.map(p => p[0])), south: Math.min(...coordinates.map(p => p[1])), east: Math.max(...coordinates.map(p => p[0])), north: Math.max(...coordinates.map(p => p[1])) };
window.fitRoutingMap = () => map.api.fitBounds(bounds, { padding: 48 });
await window.fitRoutingMap();
document.getElementById('source').textContent = input.attribution;
document.getElementById('status').textContent = '준비 완료 · 차량 / 도보 / 자전거 / 경유지';
document.body.dataset.ready = 'true';
</script></html>`;
}

export async function verifyRealRoutingMap(options) {
  for (const key of ['store', 'glyphs']) {
    options[key] = realpathSync(options[key]);
    assert(statSync(options[key]).isDirectory(), 'Operator store directory required');
  }
  const manifest = readJson(realpathSync(options.datasetFile));
  assert.equal(
    manifest.value.dataset?.source,
    'osm-geofabrik-kr',
    'Real public OSM dataset required',
  );
  assert.equal(manifest.value.dataset?.license, 'ODbL-1.0');
  assert.equal(manifest.value.smokePassed, true, 'Dataset graph smoke must pass');
  assert.match(manifest.value.sourceHash, /^[a-f0-9]{64}$/);
  assert(Number.isFinite(Date.parse(manifest.value.sourceAsOf)), 'Dataset source date required');
  const glyph = readJson(resolve(options.glyphs, 'manifest.json'));
  const { createLocalRoutingProvider } = await import('../services/routing/dist/index.js');
  const { startTileServer } = await import('../services/tiles/dist/server.js');
  const { sourceEligibility } = await import('../services/tiles/dist/config.js');
  const { createServer } = await import('vite');
  const { chromium, expect } = await import('@playwright/test');
  sourceEligibility(root);
  const directory = resolve(root, 'artifacts/tiles/qa/routing-map');
  mkdirSync(directory, { recursive: true });
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const report = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    sourceCommit: git('rev-parse', 'HEAD'),
    sourceDirty: git('status', '--porcelain').length !== 0,
    verifierSha256: sha(readFileSync(fileURLToPath(import.meta.url))),
    consumer: 'Workspace public dist exports, not an isolated npm installation',
    renderer: 'Chromium software WebGL, actual operator Seoul MVT and Korean PBF glyphs',
    routingDataset: {
      ...manifest.value.dataset,
      sourceSha256: manifest.value.sourceHash,
      sourceAsOf: manifest.value.sourceAsOf,
      manifestSha256: sha(manifest.bytes),
      engineImage: manifest.value.engineImage,
    },
    glyphPack: {
      manifestSha256: sha(glyph.bytes),
      fontstack: glyph.value.fontstack,
      fontSha256: glyph.value.fontSha256,
      license: glyph.value.license,
    },
    routes: [],
    errors: [],
    screenshots: [],
    network: {
      unexpectedRequests: 0,
      httpFailures: [],
      requestFailures: [],
      pageErrors: [],
      mapErrors: [],
      responses: { styles: 0, tiles: 0, glyphs: 0 },
    },
    cleanup: 'NOT_RUN',
    limitations: [
      'Public-road samples, not field-tested directions or real-time traffic/safety guarantees',
      'Single Chromium desktop and mobile viewport; Android/iOS and physical mobile browsers not tested',
      'OSM graph gaps can prevent routes; no straight-line or mode fallback is permitted',
    ],
    stage: 'routing',
    status: 'RUNNING',
  };
  let vite, tiles, browser, context, page, temporary;
  let disposing = false;
  try {
    const provider = createLocalRoutingProvider(options.endpoint, manifest.value.dataset);
    // Authored public-road QA points, already used by routing-korea.test.mjs. No personal locations.
    const start = [126.977, 37.5663],
      finish = [126.9769, 37.573],
      via = [126.9772, 37.57];
    const routes = [];
    for (const mode of ['driving', 'walking', 'cycling']) {
      const began = performance.now();
      const [route] = await provider.route(
        { mode, waypoints: [start, finish] },
        { timeoutMs: 15000 },
      );
      assert(
        route.coordinates.length > 2 && route.distanceMeters > 400 && route.distanceMeters < 5000,
        'Real road geometry and plausible distance required',
      );
      assert(
        route.durationSeconds > 20 && route.durationSeconds < 4000,
        'Plausible routing duration required',
      );
      assert.equal(route.dataset.license, 'ODbL-1.0');
      routes.push({
        ...route,
        id: `actual-${mode}`,
        label: { driving: '차량', walking: '도보', cycling: '자전거' }[mode],
      });
      report.routes.push({
        mode,
        distanceMeters: route.distanceMeters,
        durationSeconds: route.durationSeconds,
        vertices: route.coordinates.length,
        observedMs: Math.round(performance.now() - began),
      });
    }
    const [viaRoute] = await provider.route(
      { mode: 'driving', waypoints: [start, via, finish] },
      { timeoutMs: 15000 },
    );
    assert.equal(viaRoute.matchedWaypoints.length, 3, 'Ordered via waypoint required');
    assert(viaRoute.coordinates.length > 2 && viaRoute.distanceMeters > 400);
    routes.push({ ...viaRoute, id: 'actual-via', label: '차량 경유지' });
    report.routes.push({
      mode: 'driving-via',
      distanceMeters: viaRoute.distanceMeters,
      durationSeconds: viaRoute.durationSeconds,
      vertices: viaRoute.coordinates.length,
      matchedWaypoints: viaRoute.matchedWaypoints.length,
    });
    for (const mode of ['driving', 'walking', 'cycling']) {
      await assert.rejects(
        provider.route(
          {
            mode,
            waypoints: [
              [130.907, 37.485],
              [131.869, 37.241],
            ],
          },
          { timeoutMs: 15000 },
        ),
        { code: 'NOT_FOUND' },
      );
      report.errors.push({
        mode,
        case: 'island-without-connected-road',
        code: 'NOT_FOUND',
        status: 'PASS',
      });
      await assert.rejects(
        provider.route({ mode, waypoints: [start, [131.869, 37.241]] }, { timeoutMs: 15000 }),
        { code: 'INVALID_ARGUMENT', detail: 'ROUTING_DISTANCE_LIMIT' },
      );
      report.errors.push({
        mode,
        case: 'distance-limit',
        code: 'INVALID_ARGUMENT',
        detail: 'ROUTING_DISTANCE_LIMIT',
        status: 'PASS',
      });
    }
    report.stage = 'local-consumer';
    temporary = mkdtempSync(resolve(directory, 'consumer-'));
    const publicDir = resolve(temporary, 'public');
    mkdirSync(publicDir);
    const require = createRequire(import.meta.url);
    const maplibre = dirname(require.resolve('maplibre-gl/package.json'));
    cpSync(resolve(maplibre, 'dist/maplibre-gl-worker.mjs'), resolve(publicDir, 'worker.mjs'));
    vite = await createServer({
      configFile: false,
      root,
      publicDir,
      server: { host: '127.0.0.1', port: 0 },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
    await vite.listen();
    const webOrigin = new URL(vite.resolvedUrls.local[0]).origin;
    tiles = await startTileServer({
      store: options.store,
      glyphs: options.glyphs,
      region: 'seoul',
      port: 0,
      allowedOrigins: [webOrigin],
    });
    const statusResponse = await globalThis.fetch(`${tiles.origin}/status`, {
      redirect: 'error',
      signal: globalThis.AbortSignal.timeout(10000),
    });
    assert(statusResponse.ok, 'Local tile status required');
    const status = await statusResponse.json();
    const tileManifest = readJson(
      resolve(options.store, 'seoul/generations', status.generation, 'manifest.json'),
    );
    assert.equal(
      tileManifest.value.source.sha256,
      manifest.value.sourceHash,
      'Routing graph and map must use the same reviewed OSM snapshot',
    );
    report.tiles = {
      region: 'seoul',
      generation: status.generation,
      sourceSha256: tileManifest.value.source.sha256,
      dataAsOf: tileManifest.value.source.dataAsOf,
      archiveSha256: tileManifest.value.archive.sha256,
      tileCount: tileManifest.value.archive.tileCount,
    };
    const markers = viaRoute.matchedWaypoints.map((coordinate, index) => ({
      id: `waypoint-${index}`,
      label: ['출발', '경유지', '도착'][index],
      coordinate,
    }));
    writeFileSync(
      resolve(temporary, 'index.html'),
      consumerHtml({
        routes,
        markers,
        styleUrl: `${tiles.origin}/styles/standard.json`,
        tileOrigin: tiles.origin,
        attribution: manifest.value.dataset.attribution,
      }),
    );
    browser = await chromium.launch({
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
      args: ['--enable-unsafe-swiftshader'],
    });
    context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block',
    });
    const allowed = new Set([webOrigin, tiles.origin]);
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (['http:', 'https:'].includes(url.protocol) && !allowed.has(url.origin)) {
        report.network.unexpectedRequests++;
        return route.abort();
      }
      return route.continue();
    });
    const kind = (url) =>
      url.origin !== tiles.origin
        ? 'consumer'
        : url.pathname.startsWith('/styles/')
          ? 'styles'
          : url.pathname.startsWith('/tiles/')
            ? 'tiles'
            : url.pathname.startsWith('/glyphs/')
              ? 'glyphs'
              : 'other';
    context.on('response', (response) => {
      const resource = kind(new URL(response.url()));
      if (response.status() >= 400)
        report.network.httpFailures.push({ resource, status: response.status() });
      if (response.status() === 200 && Object.hasOwn(report.network.responses, resource))
        report.network.responses[resource]++;
    });
    context.on('requestfailed', (request) =>
      report.network.requestFailures.push({
        resource: kind(new URL(request.url())),
        failure: redact(request.failure()?.errorText ?? 'UNKNOWN'),
        disposing,
      }),
    );
    page = await context.newPage();
    page.on('pageerror', (error) => report.network.pageErrors.push(redact(error.message)));
    report.stage = 'browser';
    await page.goto(`${webOrigin}/${relative(root, temporary).replaceAll('\\', '/')}/index.html`);
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true', { timeout: 60000 });
    for (const width of [1440, 390]) {
      report.stage = `viewport-${width}`;
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      // The SDK ResizeObserver runs after viewport CSS changes. Fitting against the old
      // canvas dimensions can clip the route even when some line fragments still render.
      await page.waitForFunction(
        async (expectedWidth) => {
          const container = globalThis.document.getElementById('map');
          const canvas = container.querySelector('canvas');
          const dimensions = () => [
            container.clientWidth,
            container.clientHeight,
            canvas?.clientWidth,
            canvas?.clientHeight,
            canvas?.width,
            canvas?.height,
          ];
          const before = dimensions();
          if (
            !canvas ||
            globalThis.innerWidth !== expectedWidth ||
            before[0] > expectedWidth ||
            before[0] !== before[2] ||
            before[1] !== before[3]
          )
            return false;
          await new Promise((resolve) =>
            globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve)),
          );
          const after = dimensions();
          return before.every((value, index) => value === after[index]);
        },
        width,
        { timeout: 15000 },
      );
      await page.evaluate(() => globalThis.fitRoutingMap());
      const measure = () =>
        page.evaluate(async () => {
          const map = globalThis.routingMap;
          const count = (id) => map.getRenderedFeatures([id]).length;
          const visibleBounds = await map.api.getVisibleBounds();
          const container = globalThis.document.getElementById('map');
          const canvas = container.querySelector('canvas');
          const markerIds = [
            ...new Set(
              map
                .getRenderedFeatures(['kmk-marker-points'])
                .map((feature) => feature.properties.id),
            ),
          ].sort();
          return {
            routes: Object.fromEntries(
              ['driving', 'walking', 'cycling', 'via'].map((mode) => [
                mode,
                count(`kmk-data-actual-${mode}-line`),
              ]),
            ),
            markers: markerIds.length,
            markerIds,
            visibleBounds,
            canvas: {
              viewportWidth: globalThis.innerWidth,
              containerWidth: container.clientWidth,
              containerHeight: container.clientHeight,
              clientWidth: canvas.clientWidth,
              clientHeight: canvas.clientHeight,
              width: canvas.width,
              height: canvas.height,
              devicePixelRatio: globalThis.devicePixelRatio,
            },
            allCoordinatesInBounds: globalThis.routingCoordinates.every(
              ([longitude, latitude]) =>
                longitude >= visibleBounds.west &&
                longitude <= visibleBounds.east &&
                latitude >= visibleBounds.south &&
                latitude <= visibleBounds.north,
            ),
            roads: count('korea-road-major') + count('korea-road-minor'),
            buildings: count('korea-building'),
            labels:
              count('korea-label-road') + count('korea-label-place') + count('korea-label-poi'),
          };
        });
      const complete = (sample) =>
        Object.values(sample.routes).every((value) => value > 0) &&
        sample.markers === 3 &&
        sample.markerIds.join(',') === 'waypoint-0,waypoint-1,waypoint-2' &&
        sample.allCoordinatesInBounds &&
        sample.canvas.viewportWidth === width &&
        sample.canvas.containerWidth <= width &&
        sample.canvas.clientWidth === sample.canvas.containerWidth &&
        sample.canvas.clientHeight === sample.canvas.containerHeight &&
        sample.roads > 0 &&
        sample.buildings > 0 &&
        sample.labels > 0;
      await expect
        .poll(
          async () => {
            const sample = await measure();
            report.lastObservation = { width, ...sample };
            return complete(sample);
          },
          { timeout: 45000 },
        )
        .toBe(true);
      await expect(page.locator('.maplibregl-ctrl-attrib')).toBeVisible();
      await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText(
        'OpenStreetMap contributors',
      );
      assert(
        await page.evaluate(
          () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth,
        ),
        'No horizontal overflow',
      );
      const screenshot = `seoul-routing-${width}.png`;
      await page.screenshot({ path: resolve(directory, screenshot), fullPage: true });
      const captured = await measure();
      report.lastObservation = { width, ...captured };
      assert(
        complete(captured),
        'Full route extent and actual markers must remain visible at capture',
      );
      report.screenshots.push({ width, screenshot, rendered: captured, status: 'PASS' });
      console.log(`PASS actual Seoul routing overlay: ${width}px / 4 road routes / 3 waypoints`);
    }
    report.network.mapErrors = await page.evaluate(() => globalThis.mapErrors);
    assert.equal(report.network.unexpectedRequests, 0, 'Unexpected browser network request');
    assert.deepEqual(report.network.httpFailures, [], 'HTTP failure');
    assert.deepEqual(report.network.pageErrors, [], 'Browser runtime error');
    assert.deepEqual(report.network.mapErrors, [], 'SDK map resource error');
    assert.deepEqual(
      report.network.requestFailures,
      [],
      'Unexpected request failure before cleanup',
    );
    for (const resource of ['styles', 'tiles', 'glyphs'])
      assert(
        report.network.responses[resource] > 0,
        'Actual style/tile/glyph HTTP response required',
      );
    report.stage = 'cleanup';
    disposing = true;
    const cleanup = await page.evaluate(() => {
      const map = globalThis.routingMap;
      map.api.destroy();
      return {
        ...map.diagnostics(),
        canvases: globalThis.document.querySelectorAll('canvas').length,
      };
    });
    assert.equal(cleanup.status, 'destroyed');
    assert.equal(cleanup.listeners, 0);
    assert.equal(cleanup.observing, false);
    assert.equal(cleanup.canvases, 0);
    report.cleanup = cleanup;
    report.stage = 'complete';
    report.status = 'PASS';
    return report;
  } catch (error) {
    report.status = 'FAIL';
    report.failure = /^[A-Z_]+$/.test(error?.code ?? '') ? error.code : 'VERIFICATION_FAILED';
    throw error;
  } finally {
    disposing = true;
    await context?.close();
    await browser?.close();
    await tiles?.close();
    await vite?.close();
    if (temporary) rmSync(temporary, { recursive: true, force: true });
    writeFileSync(resolve(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const report = await verifyRealRoutingMap(parseRealRoutingMapOptions(process.argv.slice(2)));
    console.log(
      `PASS actual routing/map integration: ${report.routes.length} routes, ${report.errors.length} expected errors, ${report.screenshots.length} screenshots; ignored report in artifacts/tiles/qa/routing-map/report.json`,
    );
  } catch (error) {
    console.error(
      `Real routing/map verification failed: ${/^[A-Z_]+$/.test(error?.code ?? '') ? error.code : 'VERIFICATION_FAILED'}. Explicit settings are not echoed.`,
    );
    process.exitCode = 1;
  }
}
