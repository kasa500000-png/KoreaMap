// Optional fixed-protocol operator QA; no downloads, default providers or personal GPS data.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { qualityTargets, percentile } from './map-quality-cases.mjs';
import { startQualityConsumer } from './quality-consumer.mjs';
import { collectFrameRendererMetadata } from './frame-renderer-metadata.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const requiredSamples = 30,
  trialCount = 5,
  durationMs = 1000;
export function parseMapFrameOptions(args) {
  assert(
    args.filter((arg) => arg === '--operator-opt-in').length === 1,
    'One explicit --operator-opt-in required',
  );
  const values = new Map();
  for (const arg of args) {
    if (arg === '--operator-opt-in') continue;
    if (arg === '--profile') {
      assert(!values.has(arg), 'Duplicate --profile flag');
      values.set(arg, true);
      continue;
    }
    const match = /^--(store|glyphs)=(.+)$/.exec(arg);
    assert(match && !values.has(match[1]), 'Unique explicit --store and --glyphs required');
    values.set(match[1], match[2]);
  }
  for (const key of ['store', 'glyphs'])
    assert(isAbsolute(values.get(key) ?? ''), 'Absolute operator paths required');
  return {
    store: values.get('store'),
    glyphs: values.get('glyphs'),
    ...(values.has('--profile') ? { profile: true } : {}),
  };
}
export function frameReportPolicy(profile = false) {
  assert(typeof profile === 'boolean', 'Boolean profile option required');
  return profile
    ? { file: 'frames-profile-report.json', acceptanceEligible: false, status: 'NON_ACCEPTANCE' }
    : { file: 'frames-report.json', acceptanceEligible: true };
}
const maxProfileBytes = 64 * 1024 ** 2;
const profileCommandTimeoutMs = 30000;
function profileDeadline(promise) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('PROFILE_COMMAND_TIMEOUT')),
        profileCommandTimeoutMs,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Diagnostic-only CDP capture; the supplied directory must be new and empty. */
export async function startFrameProfile(session, directory, { maxBytes = maxProfileBytes } = {}) {
  assert(
    Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= maxProfileBytes,
    'Invalid profile size bound',
  );
  assert(
    statSync(directory).isDirectory() && readdirSync(directory).length === 0,
    'Empty owned profile directory required',
  );
  let cpuEnabled = false,
    cpuRunning = false,
    traceRunning = false,
    closed = false;
  let completeListener, traceHandle;
  const command = (method, params) => profileDeadline(session.send(method, params));
  async function endTrace() {
    const complete = new Promise((resolve) => {
      completeListener = resolve;
      session.once('Tracing.tracingComplete', completeListener);
    });
    try {
      await command('Tracing.end');
      const event = await profileDeadline(complete);
      traceRunning = false;
      traceHandle = event.stream;
      assert(
        typeof traceHandle === 'string' && traceHandle.length > 0 && !event.dataLossOccurred,
        'PROFILE_TRACE_INCOMPLETE',
      );
      return traceHandle;
    } finally {
      session.off('Tracing.tracingComplete', completeListener);
      completeListener = undefined;
    }
  }
  async function cleanup(removeFiles) {
    if (closed) return;
    closed = true;
    try {
      if (traceRunning) {
        try {
          await endTrace();
        } catch {
          /* Browser teardown may already have stopped tracing. */
        }
      }
      if (traceHandle) {
        try {
          await command('IO.close', { handle: traceHandle });
        } catch {
          /* Continue releasing the CDP session. */
        }
      }
      if (cpuRunning) {
        try {
          await command('Profiler.stop');
        } catch {
          /* Continue cleanup after a failed capture. */
        }
      }
      if (cpuEnabled) {
        try {
          await command('Profiler.disable');
        } catch {
          /* Detach also releases profiler state. */
        }
      }
    } finally {
      try {
        await profileDeadline(session.detach());
      } catch {
        /* Closed browser sessions are already detached. */
      }
      if (removeFiles) rmSync(directory, { recursive: true, force: true });
    }
  }
  try {
    await command('Profiler.enable');
    cpuEnabled = true;
    await command('Profiler.setSamplingInterval', { interval: 1000 });
    await command('Profiler.start');
    cpuRunning = true;
    await command('Tracing.start', {
      categories:
        'toplevel,devtools.timeline,v8.execute,blink.user_timing,cc,gpu,disabled-by-default-devtools.timeline',
      transferMode: 'ReturnAsStream',
    });
    traceRunning = true;
  } catch (error) {
    await cleanup(true);
    throw error;
  }
  return {
    async stop() {
      assert(!closed, 'Profiler already closed');
      try {
        const { profile } = await command('Profiler.stop');
        cpuRunning = false;
        assert(
          profile &&
            Array.isArray(profile.nodes) &&
            Array.isArray(profile.samples) &&
            profile.samples.length > 0,
          'PROFILE_CPU_INCOMPLETE',
        );
        const cpu = JSON.stringify(profile);
        const cpuBytes = Buffer.byteLength(cpu);
        assert(cpuBytes <= maxBytes, 'PROFILE_SIZE_LIMIT');
        writeFileSync(resolve(directory, 'cpu.cpuprofile'), cpu, { flag: 'wx', mode: 0o600 });
        const handle = await endTrace();
        const digest = createHash('sha256');
        let bytes = 0;
        let reads = 0;
        const fd = openSync(resolve(directory, 'trace.json'), 'wx', 0o600);
        try {
          for (;;) {
            assert(++reads <= 4096, 'PROFILE_STREAM_LIMIT');
            const part = await command('IO.read', {
              handle,
              size: Math.min(1024 ** 2, maxBytes - cpuBytes - bytes + 1),
            });
            const chunk = Buffer.from(part.data, part.base64Encoded ? 'base64' : 'utf8');
            assert(cpuBytes + bytes + chunk.length <= maxBytes, 'PROFILE_SIZE_LIMIT');
            assert(chunk.length > 0 || part.eof, 'PROFILE_STREAM_NO_PROGRESS');
            let offset = 0;
            while (offset < chunk.length) {
              const written = writeSync(fd, chunk, offset, chunk.length - offset);
              assert(written > 0, 'PROFILE_WRITE_FAILED');
              offset += written;
            }
            digest.update(chunk);
            bytes += chunk.length;
            if (part.eof) break;
          }
        } finally {
          closeSync(fd);
        }
        assert(bytes > 0, 'PROFILE_TRACE_EMPTY');
        await command('IO.close', { handle });
        traceHandle = undefined;
        const files = [
          { file: 'cpu.cpuprofile', bytes: cpuBytes, sha256: sha(cpu) },
          { file: 'trace.json', bytes, sha256: digest.digest('hex') },
        ];
        await cleanup(false);
        return { status: 'CAPTURED', maxBytes, totalBytes: cpuBytes + bytes, files };
      } catch (error) {
        await cleanup(true);
        throw error;
      }
    },
    async abort() {
      await cleanup(true);
    },
  };
}
function jsonFile(path) {
  assert(
    statSync(path).isFile() && statSync(path).size <= 1024 ** 2,
    'Bounded local manifest required',
  );
  const bytes = readFileSync(path);
  return { value: JSON.parse(bytes.toString('utf8')), sha256: sha(bytes) };
}
export function evaluateMarkerFrameSeries(trials) {
  const deltas = trials.flatMap((trial) => trial.deltas);
  const valid =
    trials.length === trialCount &&
    trials.every(
      (trial) =>
        trial.sourceCount === 1000 &&
        trial.before.renderedCount === 1000 &&
        trial.after.renderedCount === 1000 &&
        trial.before.allMarkersInBounds &&
        trial.after.allMarkersInBounds &&
        trial.completed &&
        trial.elapsedMs >= 800,
    );
  if (
    !valid ||
    deltas.length < requiredSamples ||
    deltas.some((delta) => !Number.isFinite(delta) || delta <= 0)
  )
    return {
      status: 'NOT_RUN',
      samples: deltas.length,
      requiredSamples,
      trials: trials.length,
      targetMs: qualityTargets.frameP95Ms,
      validCoverageAndCompletion: valid,
    };
  const frameP95Ms = percentile(deltas, 0.95);
  return {
    status: frameP95Ms <= qualityTargets.frameP95Ms ? 'PASS' : 'FAIL',
    samples: deltas.length,
    requiredSamples,
    trials: trials.length,
    targetMs: qualityTargets.frameP95Ms,
    frameP95Ms,
    minMs: Math.min(...deltas),
    maxMs: Math.max(...deltas),
    validCoverageAndCompletion: true,
  };
}
function html(payload) {
  const data = JSON.stringify(payload).replaceAll('<', '\\u003c');
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self';script-src 'self';style-src 'self' 'unsafe-inline';worker-src 'self' blob:;img-src 'self' data: blob:;font-src 'self';connect-src 'self' ${payload.tileOrigin};object-src 'none';base-uri 'self'"><link rel="icon" href="data:,"><title>지도 프레임 실측</title><style>body{margin:0}#map{position:fixed;inset:0}</style><div id="map"></div><script type="module">
import {createMap,createMapState} from 'korea-map-web';
import 'maplibre-gl/dist/maplibre-gl.css';
const input=${data},home=[126.978,37.5665],near=[126.983,37.5685];
const state=createMapState({camera:{center:home,zoom:14,bearing:0,pitch:0}});
const probe=globalThis.frameProbe={ready:false,idle:false,errors:[]};
const map=await createMap({container:document.getElementById('map'),state,workerUrl:'/worker.mjs',useLocalIdeographs:false,clustering:{radius:48,maxZoom:13},loadTimeoutMs:45000,config:{mode:'operator',styleUrl:input.styleUrl,allowedOrigins:[input.tileOrigin],attribution:input.attribution,costAcknowledged:true}});
probe.map=map;
map.on('camera',()=>{probe.idle=false});map.on('idle',()=>{probe.idle=true});map.on('error',error=>probe.errors.push(error));
await map.ready;
const markers=Array.from({length:1000},(_,i)=>({id:'synthetic-'+i,label:'합성 '+i,coordinate:[home[0]+((i%40)-20)*0.0001,home[1]+(Math.floor(i/40)-12)*0.0001]}));
await map.interactions.setMarkers(markers);
const extent={west:Math.min(...markers.map(m=>m.coordinate[0])),east:Math.max(...markers.map(m=>m.coordinate[0])),south:Math.min(...markers.map(m=>m.coordinate[1])),north:Math.max(...markers.map(m=>m.coordinate[1]))};
async function observation(){const bounds=await map.api.getVisibleBounds();return {renderedCount:map.diagnostics().renderedMarkers,bounds,allMarkersInBounds:extent.west>=bounds.west&&extent.east<=bounds.east&&extent.south>=bounds.south&&extent.north<=bounds.north}};
probe.observation=observation;probe.markerExtent=extent;
probe.trial=async(index)=>{
 const before=await observation(),target=index%2===0?near:home,deltas=[];
 let running=true,last,frame;
 const sample=now=>{if(!running)return;if(last!==undefined)deltas.push(now-last);last=now;frame=requestAnimationFrame(sample)};
 const began=performance.now();frame=requestAnimationFrame(sample);
 try{await map.interactions.transitionCamera({center:target,zoom:14,bearing:0,pitch:0},{durationMs:1000,reducedMotion:false})}finally{running=false;cancelAnimationFrame(frame)}
 const elapsedMs=performance.now()-began,current=state.getSnapshot().camera;
 return {index,durationMs:1000,elapsedMs,deltas,sourceCount:state.getSnapshot().markers.length,before,after:await observation(),completed:current.center.every((value,i)=>Math.abs(value-target[i])<0.000001)&&Math.abs(current.zoom-14)<0.0001};
};
probe.summary=()=>{const ids=input.layers.filter(id=>id.startsWith('korea-road-')||id==='korea-building'||id.startsWith('korea-label-')||id.startsWith('korea-poi-priority-')),features=map.getRenderedFeatures(ids);return {roads:features.filter(f=>f.layerId.startsWith('korea-road-')).length,buildings:features.filter(f=>f.layerId==='korea-building').length,labels:features.filter(f=>f.layerId.startsWith('korea-label-')||f.layerId.startsWith('korea-poi-priority-')).length}};
const collectRendererMetadata=${collectFrameRendererMetadata.toString()};
probe.rendererMetadata=()=>collectRendererMetadata(document.querySelector('canvas'),{userAgent:navigator.userAgent,devicePixelRatio:globalThis.devicePixelRatio,viewportWidth:globalThis.innerWidth,viewportHeight:globalThis.innerHeight,platform:navigator.platform,hardwareConcurrency:navigator.hardwareConcurrency,deviceMemory:navigator.deviceMemory});
probe.ready=true;
</script></html>`;
}

export async function verifyMapFrames(options) {
  const policy = frameReportPolicy(options.profile ?? false);
  const { startTileServer } = await import('../services/tiles/dist/server.js');
  const { sourceEligibility } = await import('../services/tiles/dist/config.js');
  const { chromium, expect } = await import('@playwright/test');
  options.store = realpathSync(options.store);
  options.glyphs = realpathSync(options.glyphs);
  sourceEligibility(root);
  const glyph = jsonFile(resolve(options.glyphs, 'manifest.json'));
  const output = resolve(root, 'artifacts/qa/map-quality');
  mkdirSync(output, { recursive: true });
  const temporary = mkdtempSync(resolve(output, 'frames-consumer-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const report = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    sourceCommit: git('rev-parse', 'HEAD'),
    sourceDirty: git('status', '--porcelain').length > 0,
    verifierSha256: sha(readFileSync(fileURLToPath(import.meta.url))),
    consumerSha256: sha(readFileSync(resolve(root, 'scripts/quality-consumer.mjs'))),
    rendererMetadataSha256: sha(readFileSync(resolve(root, 'scripts/frame-renderer-metadata.mjs'))),
    glyph: {
      manifestSha256: glyph.sha256,
      fontstack: glyph.value.fontstack,
      fontSha256: glyph.value.fontSha256,
      license: glyph.value.license,
    },
    protocol: {
      region: 'seoul',
      theme: 'standard',
      density: 'balanced',
      zoom: 14,
      width: 390,
      height: 800,
      markerCount: 1000,
      clusterMaxZoom: 13,
      trials: trialCount,
      durationMs,
      requiredSamples,
      targetMs: 33,
      timing:
        'Unthrottled lightweight requestAnimationFrame intervals during actual public camera transitions; the first callback per trial supplies only the baseline timestamp',
    },
    trials: [],
    samples: [],
    network: { unexpected: 0, httpFailures: [], requestFailures: [], pageErrors: [] },
    status: 'RUNNING',
    cleanup: 'NOT_RUN',
    limitations: [
      'Host Chromium software WebGL observations, not physical Android/iOS or field performance',
      'Five fixed nearby forward/return movements share warmed process, GPU, tile and font caches; no cold-start claim',
      'Marker source count and actual rendered unique IDs plus geometric coverage verified at both ends of each fixed-zoom/bearing/pitch affine pan; per-frame feature queries are omitted to limit instrumentation overhead',
      'RAF intervals include browser scheduling and software rendering; p95 goal remains 33ms and sample minimum remains 30',
    ],
    ...(!policy.acceptanceEligible
      ? {
          status: policy.status,
          acceptanceEligible: false,
          profiling: {
            status: 'NOT_STARTED',
            mode: 'cpu-and-chrome-trace',
            samplingIntervalUs: 1000,
            maxArtifactBytes: maxProfileBytes,
            qualifiesAsBenchmark: false,
          },
        }
      : {}),
  };
  let consumer, tiles, browser, context, page, profiler;
  let disposing = false;
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
    tiles = await startTileServer({
      store: options.store,
      glyphs: options.glyphs,
      region: 'seoul',
      quality: 'balanced',
      port: 0,
      allowedOrigins: [consumer.origin],
    });
    const statusResponse = await globalThis.fetch(`${tiles.origin}/status`, {
      redirect: 'error',
      signal: globalThis.AbortSignal.timeout(10000),
    });
    assert(statusResponse.ok, 'Local tile status failed');
    const status = await statusResponse.json();
    assert.match(status.generation, /^[0-9]{13}-[a-f0-9]{8}$/);
    const manifest = jsonFile(
      resolve(options.store, 'seoul/generations', status.generation, 'manifest.json'),
    );
    assert.equal(manifest.value.schema, 'design-v2', 'Same design-v2 balanced data required');
    report.tiles = {
      region: 'seoul',
      generation: status.generation,
      manifestSha256: manifest.sha256,
      source: manifest.value.source,
      archiveSha256: manifest.value.archive.sha256,
    };
    const styleResponse = await globalThis.fetch(`${tiles.origin}/styles/standard.json`, {
      redirect: 'error',
      signal: globalThis.AbortSignal.timeout(10000),
    });
    assert(styleResponse.ok, 'Local balanced style failed');
    const style = await styleResponse.text();
    report.styleSha256 = sha(style);
    report.bundle = await consumer.build(
      html({
        tileOrigin: tiles.origin,
        styleUrl: `${tiles.origin}/styles/standard.json`,
        attribution: '© OpenStreetMap contributors · ODbL-1.0',
        layers: JSON.parse(style).layers.map((layer) => layer.id),
      }),
    );
    browser = await chromium.launch({
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
      args: ['--enable-unsafe-swiftshader'],
    });
    context = await browser.newContext({
      viewport: { width: 390, height: 800 },
      deviceScaleFactor: 1,
      reducedMotion: 'no-preference',
      serviceWorkers: 'block',
    });
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (
        ['http:', 'https:'].includes(url.protocol) &&
        ![consumer.origin, tiles.origin].includes(url.origin)
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
          kind: new URL(response.url()).origin === consumer.origin ? 'consumer' : 'tiles',
        });
    });
    context.on('requestfailed', (request) => {
      report.network.requestFailures.push({
        disposing,
        kind: new URL(request.url()).origin === consumer.origin ? 'consumer' : 'tiles',
      });
    });
    page = await context.newPage();
    page.on('pageerror', (error) => report.network.pageErrors.push(error.name));
    await page.goto(consumer.origin);
    await page.waitForFunction(
      () => globalThis.frameProbe?.ready && globalThis.frameProbe.idle,
      {},
      { timeout: 60000 },
    );
    await expect
      .poll(() => page.evaluate(() => globalThis.frameProbe.map.diagnostics().renderedMarkers), {
        timeout: 30000,
      })
      .toBe(1000);
    report.initialScene = await page.evaluate(() => globalThis.frameProbe.summary());
    assert(
      report.initialScene.roads > 0 &&
        report.initialScene.buildings > 0 &&
        report.initialScene.labels > 0,
      'Actual balanced Seoul scene must render',
    );
    if (!policy.acceptanceEligible) {
      const directory = mkdtempSync(resolve(output, 'frame-profile-'));
      try {
        const session = await context.newCDPSession(page);
        profiler = await startFrameProfile(session, directory);
      } catch (error) {
        rmSync(directory, { recursive: true, force: true });
        throw error;
      }
      report.profiling.status = 'RECORDING';
      report.profiling.directory = relative(output, directory).split('\\').join('/');
    }
    for (let index = 0; index < trialCount; index++) {
      const sample = await page.evaluate((index) => globalThis.frameProbe.trial(index), index);
      report.trials.push(sample);
      report.samples.push(...sample.deltas);
      console.log(
        `Frame trial ${index + 1}/${trialCount}: ${sample.deltas.length} deltas, ${sample.after.renderedCount} visible markers, completion ${sample.completed}`,
      );
      await page.waitForFunction(() => globalThis.frameProbe.idle, {}, { timeout: 30000 });
    }
    if (profiler) Object.assign(report.profiling, await profiler.stop());
    report.renderer = {
      ...(await page.evaluate(() => globalThis.frameProbe.rendererMetadata())),
      capturePhase: 'AFTER_TIMED_TRIALS_AND_PROFILE_STOP',
      browserVersion: browser.version(),
    };
    report.result = evaluateMarkerFrameSeries(report.trials);
    report.mapErrors = await page.evaluate(() => globalThis.frameProbe.errors);
    assert.equal(report.network.unexpected, 0, 'Unexpected browser origin');
    assert.deepEqual(report.network.httpFailures, [], 'HTTP failure');
    assert.deepEqual(report.network.pageErrors, [], 'Browser runtime failure');
    assert.deepEqual(report.network.requestFailures, [], 'Network request failure');
    assert.deepEqual(report.mapErrors, [], 'SDK map resource failure');
    disposing = true;
    report.cleanup = await page.evaluate(() => {
      const map = globalThis.frameProbe.map;
      map.destroy();
      return map.diagnostics();
    });
    assert.equal(report.cleanup.status, 'destroyed');
    assert.equal(report.cleanup.listeners, 0);
    assert.equal(report.cleanup.observing, false);
    report.status = policy.status ?? report.result.status;
    return report;
  } catch (error) {
    report.status = policy.status ?? 'FAIL';
    if (report.profiling && report.profiling.status !== 'CAPTURED')
      report.profiling.status = 'FAILED';
    report.failure = /^[A-Z_]+$/.test(error?.code ?? '') ? error.code : 'VERIFICATION_FAILED';
    throw error;
  } finally {
    disposing = true;
    for (const [name, close] of [
      ['profiler', () => profiler?.abort()],
      ['context', () => context?.close()],
      ['browser', () => browser?.close()],
      ['tiles', () => tiles?.close()],
      ['consumer', () => consumer?.close()],
    ]) {
      try {
        await close();
      } catch {
        (report.cleanupFailures ??= []).push(name);
        report.status = policy.status ?? 'FAIL';
        report.failure = 'CLEANUP_FAILED';
      }
    }
    try {
      rmSync(temporary, { recursive: true, force: true });
    } finally {
      writeFileSync(resolve(output, policy.file), `${JSON.stringify(report, null, 2)}\n`);
    }
  }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const report = await verifyMapFrames(parseMapFrameOptions(process.argv.slice(2)));
    console.log(
      `${report.status}: ${report.result.samples} frame samples; p95 ${report.result.frameP95Ms ?? 'unverified'}ms; fixed goal 33ms${report.acceptanceEligible === false ? '; profiler overhead, not an acceptance benchmark' : ''}`,
    );
    if (report.failure) process.exitCode = 1;
    else if (report.acceptanceEligible === false) process.exitCode = 2;
    else if (report.status !== 'PASS') process.exitCode = 1;
  } catch {
    console.error(
      'Map frame probe failed; explicit settings are not echoed. See the ignored frame report for the selected mode when available.',
    );
    process.exitCode = 1;
  }
}
