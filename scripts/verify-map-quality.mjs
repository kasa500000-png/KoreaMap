// Opt-in real-data observations. Never downloads data and never runs during SDK installation.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { gzipSync } from 'node:zlib';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  evaluateFrames,
  evaluateScene,
  evaluateTiming,
  mapQualityCases,
  percentile,
  qualityTargets,
} from './map-quality-cases.mjs';
import { startQualityConsumer } from './quality-consumer.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function tileSizeSummary(path) {
  const db = new DatabaseSync(path, { readOnly: true, allowExtension: false });
  try {
    const sizes = [];
    for (const row of db.prepare('SELECT tile_data FROM tiles').iterate()) {
      assert(sizes.length < 1_000_000, 'Bounded quality archive required');
      const data = row.tile_data;
      assert(
        data instanceof Uint8Array && data.length <= 16 * 1024 * 1024,
        'Bounded MVT payload required',
      );
      sizes.push(data[0] === 0x1f && data[1] === 0x8b ? data.length : gzipSync(data).length);
    }
    assert(sizes.length > 0, 'Nonempty tile archive required');
    const p95Bytes = percentile(sizes, 0.95);
    return {
      count: sizes.length,
      p95Bytes,
      maxBytes: sizes.reduce((max, value) => Math.max(max, value), 0),
      targetBytes: qualityTargets.tileGzipP95Bytes,
      status: p95Bytes <= qualityTargets.tileGzipP95Bytes ? 'PASS' : 'FAIL',
    };
  } finally {
    db.close();
  }
}
export function parseQualityOptions(args) {
  assert(args.includes('--operator-opt-in'), 'Explicit --operator-opt-in required');
  const values = new Map();
  for (const arg of args) {
    if (arg === '--operator-opt-in') continue;
    if (arg === '--performance' || arg === '--context') {
      assert(!values.has(arg), 'Duplicate flag');
      values.set(arg, true);
      continue;
    }
    const match = /^--(store|glyphs)=(.+)$/.exec(arg);
    assert(match && !values.has(match[1]), 'Unique --store and --glyphs required');
    values.set(match[1], match[2]);
  }
  for (const key of ['store', 'glyphs'])
    assert(isAbsolute(values.get(key) ?? ''), 'Absolute local paths required');
  return {
    store: values.get('store'),
    glyphs: values.get('glyphs'),
    performance: values.has('--performance'),
    context: values.has('--context'),
  };
}

function consumerHtml(payload) {
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; img-src 'self' data: blob:; connect-src 'self' ${payload.tileOrigin}"><link rel="icon" href="data:,"><title>지도 품질 관찰</title>
<style>body{margin:0}#map{position:fixed;inset:0}</style><div id="map" role="region" aria-label="실제 한국 지도"></div>
<script type="module">
import {createMap,createMapState} from 'korea-map-web';
import {defineMapStyle} from 'korea-map-core';
import 'maplibre-gl/dist/maplibre-gl.css';
const input=${JSON.stringify(payload).replaceAll('<', '\\u003c')};
const state=createMapState({camera:input.camera});
let map, idle=false;
globalThis.quality={errors:[],ready:false};
const start=performance.now();
map=await createMap({container:document.getElementById('map'),state,workerUrl:'/worker.mjs',useLocalIdeographs:false,clustering:{radius:48,maxZoom:13},loadTimeoutMs:45000,config:{mode:'operator',styleUrl:input.styleUrl,allowedOrigins:[input.tileOrigin],attribution:input.attribution,costAcknowledged:true}});
map.on('error', error=>globalThis.quality.errors.push({code:error.code,fatal:error.fatal}));
map.on('camera',()=>{idle=false});
map.on('idle',()=>{idle=true});
await map.ready;
globalThis.quality={...globalThis.quality,ready:true,get idle(){return idle},map,state,initialMs:performance.now()-start,
 async scene(scene){
  idle=false;
  await map.api.setStyle(defineMapStyle(input.styles[scene.theme],input.attribution));
  await map.interactions.transitionCamera(scene.camera,{durationMs:0});
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 },
 summary(){const rendered=map.getRenderedFeatures(input.layers),labels=rendered.filter(f=>f.layerId.startsWith('korea-label-')||f.layerId.startsWith('korea-poi-priority-'));return {
  roads:rendered.filter(f=>f.layerId.startsWith('korea-road-')).length,
  buildings:rendered.filter(f=>f.layerId==='korea-building').length,
  labels:labels.length,
  cityLabels:labels.filter(f=>f.layerId.startsWith('korea-label-place-city')).length,
  korean:labels.some(f=>/[가-힣]/.test(String(f.properties['name:ko']??f.properties.name??''))),
  diagnostics:map.diagnostics()
 }},
 async markers(){const c=state.getSnapshot().camera.center;await map.interactions.setMarkers(Array.from({length:1000},(_,i)=>({id:'synthetic-'+i,label:'합성 '+i,coordinate:[c[0]+((i%40)-20)*0.0001,c[1]+(Math.floor(i/40)-12)*0.0001]})));},
 async frames(){const deltas=[],began=performance.now();let last=began,running=true;function sample(now){deltas.push(now-last);last=now;if(running)requestAnimationFrame(sample)}requestAnimationFrame(sample);const c=state.getSnapshot().camera,target=[c.center[0]+0.005,c.center[1]+0.002];try{await map.interactions.transitionCamera({...c,center:target},{durationMs:1000})}finally{running=false}const end=state.getSnapshot().camera;return {deltas:deltas.slice(1),elapsedMs:performance.now()-began,sourceCount:state.getSnapshot().markers.length,renderedCount:map.diagnostics().renderedMarkers,completed:end.center.every((v,i)=>Math.abs(v-target[i])<0.000001)}},
 destroy(){map.destroy();return map.diagnostics()}
};
</script></html>`;
}

export async function verifyMapQuality(options) {
  const { startTileServer } = await import('../services/tiles/dist/server.js');
  const { chromium, expect } = await import('@playwright/test');
  const directory = resolve(root, 'artifacts/qa/map-quality');
  mkdirSync(directory, { recursive: true });
  const temporary = mkdtempSync(resolve(directory, 'consumer-'));
  const glyphBytes = readFileSync(resolve(realpathSync(options.glyphs), 'manifest.json'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const report = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    sourceCommit: git('rev-parse', 'HEAD'),
    sourceDirty: git('status', '--porcelain').length > 0,
    verifierSha256: sha(readFileSync(fileURLToPath(import.meta.url))),
    consumerHelperSha256: sha(readFileSync(resolve(root, 'scripts/quality-consumer.mjs'))),
    casesSha256: sha(readFileSync(resolve(root, 'scripts/map-quality-cases.mjs'))),
    glyphManifestSha256: sha(glyphBytes),
    renderer:
      'Chromium software WebGL; production-bundled public workspace dist exports; operator OSM data',
    targets: qualityTargets,
    contextRequested: options.context,
    regions: [],
    cases: [],
    performance: { status: 'NOT_RUN' },
    network: { unexpected: 0, httpFailures: [], pageErrors: [] },
    status: 'RUNNING',
    limitations: [
      'Screenshots and feature counts do not establish surveyed map accuracy or commercial-service parity',
      'Visual hierarchy/overlap/coastline need manual review of ignored captures',
      'Android/iOS, physical touch, Safari/Firefox and nationwide coverage not certified',
      'Host software WebGL timings are not physical mobile performance measurements',
    ],
  };
  let browser, consumer, tiles, context;
  try {
    const require = createRequire(import.meta.url);
    consumer = await startQualityConsumer({
      root,
      directory: temporary,
      workerPath: resolve(
        dirname(require.resolve('maplibre-gl/package.json')),
        'dist/maplibre-gl-worker.mjs',
      ),
    });
    const webOrigin = consumer.origin;
    browser = await chromium.launch({
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
      args: ['--enable-unsafe-swiftshader'],
    });
    for (const region of ['seoul', 'ulsan', 'busan', 'jeju']) {
      tiles = await startTileServer({
        store: realpathSync(options.store),
        glyphs: realpathSync(options.glyphs),
        region,
        port: 0,
        allowedOrigins: [webOrigin],
        ...(options.context ? { context: {} } : {}),
      });
      const status = await (await globalThis.fetch(`${tiles.origin}/status`)).json();
      const manifestBytes = readFileSync(
        resolve(options.store, region, 'generations', status.generation, 'manifest.json'),
      );
      const manifest = JSON.parse(manifestBytes);
      assert.equal(
        manifest.schema,
        'design-v2',
        'Quality comparisons require explicit design-v2 data',
      );
      const styles = {};
      for (const theme of ['standard', 'dark', 'pastel', 'outdoor'])
        styles[theme] = await (
          await globalThis.fetch(`${tiles.origin}/styles/${theme}.json`)
        ).json();
      const layers = [
        ...new Set(Object.values(styles).flatMap((style) => style.layers.map((layer) => layer.id))),
      ];
      const first = mapQualityCases().find((item) => item.region === region);
      const payload = {
        camera: { ...first.camera, zoom: 14 },
        styles,
        layers,
        tileOrigin: tiles.origin,
        styleUrl: `${tiles.origin}/styles/standard.json`,
        attribution: '© OpenStreetMap contributors · ODbL-1.0',
      };
      const bundle = await consumer.build(consumerHtml(payload));
      const url = `${webOrigin}/`;
      report.regions.push({
        region,
        generation: status.generation,
        manifestSha256: sha(manifestBytes),
        sourceSha256: manifest.source.sha256,
        dataAsOf: manifest.source.dataAsOf,
        archiveSha256: manifest.archive.sha256,
        capabilities: manifest.capabilities,
        bundle,
        tileSizes: tileSizeSummary(
          resolve(options.store, region, 'generations', status.generation, manifest.archive.file),
        ),
      });
      context = await browser.newContext({
        viewport: { width: 390, height: 800 },
        serviceWorkers: 'block',
      });
      await context.route('**/*', (route) => {
        const u = new URL(route.request().url());
        if (
          ['http:', 'https:'].includes(u.protocol) &&
          ![webOrigin, tiles.origin].includes(u.origin)
        ) {
          report.network.unexpected++;
          return route.abort();
        }
        return route.continue();
      });
      context.on('response', (response) => {
        if (response.status() >= 400)
          report.network.httpFailures.push({
            status: response.status(),
            path: new URL(response.url()).pathname,
          });
      });
      const page = await context.newPage();
      page.on('pageerror', (error) => report.network.pageErrors.push(String(error.name)));
      await page.goto(url);
      await page.waitForFunction(() => globalThis.quality?.ready, {}, { timeout: 45000 });
      for (const item of mapQualityCases().filter((item) => item.region === region)) {
        await page.setViewportSize({ width: item.width, height: item.height });
        await page.waitForFunction(({ width, height }) => {
          const canvas = globalThis.document.querySelector('#map canvas');
          return (
            canvas &&
            parseFloat(canvas.style.width) === width &&
            parseFloat(canvas.style.height) === height
          );
        }, item);
        await page.evaluate((scene) => globalThis.quality.scene(scene), item);
        await page.waitForFunction(() => globalThis.quality?.idle, {}, { timeout: 45000 });
        await expect
          .poll(async () =>
            page.evaluate(async ({ width, zoom }) => {
              const bounds = await globalThis.quality.map.api.getVisibleBounds();
              const span = (bounds.east - bounds.west + 360) % 360;
              return (
                Math.abs(span - (360 * width) / (512 * 2 ** zoom)) <
                ((360 * width) / (512 * 2 ** zoom)) * 0.01
              );
            }, item),
          )
          .toBe(true);
        const summary = await page.evaluate(() => globalThis.quality.summary());
        assert.equal(summary.diagnostics.status, 'ready');
        const attribution = page.locator('.maplibregl-ctrl-attrib');
        await expect(attribution).toBeVisible();
        await expect(
          attribution.locator('a').filter({ hasText: 'OpenStreetMap contributors' }),
        ).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
        const errors = await page.evaluate(() => globalThis.quality.errors);
        assert.equal(errors.length, 0, 'Map errors prevent a rendering pass');
        const rendering = evaluateScene(summary, item.zoom, options.context);
        assert.notEqual(
          rendering,
          'FAIL',
          `Scene ${item.id} requires zoom-appropriate actual features and Korean symbol labels`,
        );
        const image = `${item.id}.png`;
        await page.screenshot({ path: resolve(directory, image) });
        report.cases.push({
          id: item.id,
          summary,
          screenshot: image,
          sha256: sha(readFileSync(resolve(directory, image))),
          rendering,
          cartographicReview: 'NOT_RUN',
        });
      }
      console.log(`Quality matrix: ${region} 60/60 rendered`);
      if (options.performance && region === 'seoul') {
        await page.setViewportSize({ width: 390, height: 800 });
        await page.evaluate(() =>
          globalThis.quality.scene({
            theme: 'standard',
            camera: { center: [126.978, 37.5665], zoom: 14, bearing: 0, pitch: 0 },
          }),
        );
        await page.waitForFunction(() => globalThis.quality.idle);
        await page.evaluate(() => globalThis.quality.markers());
        await page.waitForFunction(
          () => globalThis.quality.map.diagnostics().renderedMarkers === 1000,
        );
        const frameSample = await page.evaluate(() => globalThis.quality.frames());
        const frameResult = evaluateFrames(
          frameSample.deltas,
          frameSample.elapsedMs,
          frameSample.sourceCount,
          frameSample.renderedCount,
          frameSample.completed,
        );
        // Routing interception disables Chromium HTTP cache. Close this context for genuine warm-cache trials.
        await context.close();
        context = await browser.newContext({
          viewport: { width: 390, height: 800 },
          serviceWorkers: 'block',
        });
        context.on('request', (request) => {
          const u = new URL(request.url());
          if (
            ['http:', 'https:'].includes(u.protocol) &&
            ![webOrigin, tiles.origin].includes(u.origin)
          )
            report.network.unexpected++;
        });
        context.on('response', (response) => {
          if (response.status() >= 400)
            report.network.httpFailures.push({
              status: response.status(),
              path: new URL(response.url()).pathname,
            });
        });
        const performancePage = await context.newPage();
        performancePage.on('pageerror', (error) =>
          report.network.pageErrors.push(String(error.name)),
        );
        const cdp = await context.newCDPSession(performancePage);
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions', {
          offline: false,
          latency: qualityTargets.latencyMs,
          downloadThroughput: qualityTargets.downloadBitsPerSecond / 8,
          uploadThroughput: qualityTargets.downloadBitsPerSecond / 8,
        });
        const cold = [],
          warm = [];
        // The same production bundle is used for matrix and cache-enabled timing; local-only CSP stays active.
        for (let trial = 0; trial < qualityTargets.trials; trial++) {
          for (const [samples, clear] of [
            [cold, true],
            [warm, false],
          ]) {
            if (clear) await cdp.send('Network.clearBrowserCache');
            const began = Date.now();
            await performancePage.goto(url);
            await performancePage.waitForFunction(
              () => globalThis.quality?.ready && globalThis.quality.idle,
              {},
              { timeout: 60000 },
            );
            assert.equal(await performancePage.evaluate(() => globalThis.quality.errors.length), 0);
            samples.push(Date.now() - began);
            await performancePage.evaluate(() => globalThis.quality.destroy());
          }
          if ((trial + 1) % 5 === 0) console.log(`Performance cold/warm: ${trial + 1}/30`);
        }
        const coldResult = evaluateTiming(cold, qualityTargets.coldP95Ms),
          warmResult = evaluateTiming(warm, qualityTargets.warmP95Ms);
        report.performance = {
          status:
            coldResult.status === 'PASS' &&
            warmResult.status === 'PASS' &&
            frameResult.status === 'PASS'
              ? 'PASS'
              : 'FAIL',
          cold: { ...coldResult, samples: cold },
          warm: { ...warmResult, samples: warm },
          markers: frameResult,
          scope:
            'Seoul Standard z14 390px, 30 HTTP-cache cold/warm production-bundle navigation-to-idle trials; process/GPU/server caches warm; production JS/CSS/glyph/MVT gzip+immutable caching; software WebGL; local-only CSP. Frame observation: one completed 1s move with 1000 visible individual points (above cluster maxZoom13), minimum20 deltas.',
        };
      }
      await context.close();
      context = undefined;
      await tiles.close();
      tiles = undefined;
    }
    assert.equal(report.cases.length, 240);
    assert.equal(report.network.unexpected, 0);
    assert.deepEqual(report.network.httpFailures, []);
    assert.deepEqual(report.network.pageErrors, []);
    report.status =
      report.performance.status === 'FAIL' ||
      report.regions.some((item) => item.tileSizes.status === 'FAIL')
        ? 'FAIL'
        : 'PARTIAL_PASS';
    // Rendering pass is separate from cartographic review and physical-device gates.
    report.rendering = report.cases.every((item) => item.rendering === 'PASS')
      ? 'PASS'
      : 'PARTIAL_PASS';
  } catch (error) {
    report.status = 'FAIL';
    report.failure = String(error.message).replace(/https?:\/\/[^\s]+/g, '[URL]');
    throw error;
  } finally {
    await context?.close();
    await browser?.close();
    await tiles?.close();
    await consumer?.close();
    rmSync(temporary, { recursive: true, force: true });
    writeFileSync(resolve(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const report = await verifyMapQuality(parseQualityOptions(process.argv.slice(2)));
    console.log(`Map quality: ${report.status}; rendering ${report.cases.length}/240`);
    if (report.status === 'FAIL') process.exitCode = 1;
  } catch (error) {
    console.error(
      `Map quality failed: ${String(error.message).replace(/https?:\/\/[^\s]+/g, '[URL]')}`,
    );
    process.exitCode = 1;
  }
}
