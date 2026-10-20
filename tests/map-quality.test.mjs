import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateFrames,
  evaluateScene,
  evaluateTiming,
  mapQualityCases,
  percentile,
  qualityTargets,
} from '../scripts/map-quality-cases.mjs';
import { parseQualityOptions, tileSizeSummary } from '../scripts/verify-map-quality.mjs';
import {
  parseMapFrameOptions,
  evaluateMarkerFrameSeries,
  frameReportPolicy,
  startFrameProfile,
} from '../scripts/verify-map-frames.mjs';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gzipSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';
import { collectFrameRendererMetadata } from '../scripts/frame-renderer-metadata.mjs';

function rendererFixture({
  attributes = {},
  extension = true,
  renderer = 'ANGLE SwiftShader',
} = {}) {
  const calls = [];
  const actual = {
    alpha: true,
    antialias: false,
    depth: true,
    desynchronized: false,
    failIfMajorPerformanceCaveat: false,
    powerPreference: 'high-performance',
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    stencil: true,
    xrCompatible: false,
    ...attributes,
  };
  const gl = {
    RENDERER: 1,
    VENDOR: 2,
    VERSION: 3,
    SHADING_LANGUAGE_VERSION: 4,
    getContextAttributes: () => actual,
    isContextLost: () => false,
    getExtension(name) {
      calls.push(['extension', name]);
      return extension ? { UNMASKED_RENDERER_WEBGL: 5, UNMASKED_VENDOR_WEBGL: 6 } : null;
    },
    getParameter(key) {
      calls.push(['parameter', key]);
      return {
        1: 'WebKit WebGL',
        2: 'WebKit',
        3: 'WebGL 2.0 (synthetic)',
        4: 'WebGL GLSL ES 3.00 (synthetic)',
        5: renderer,
        6: 'Synthetic vendor',
      }[key];
    },
  };
  const canvas = {
    width: 390,
    height: 800,
    getContext(type, ...options) {
      calls.push(['context', type, options]);
      return gl;
    },
  };
  const environment = {
    userAgent: 'Synthetic Chromium QA',
    devicePixelRatio: 1,
    viewportWidth: 390,
    viewportHeight: 800,
    platform: 'Synthetic platform',
    hardwareConcurrency: 8,
    deviceMemory: 4,
  };
  return { canvas, gl, actual, calls, environment };
}

test('renderer evidence reads actual attributes without applying defaults or changing the existing context', () => {
  const fixture = rendererFixture({
    attributes: {
      desynchronized: true,
      preserveDrawingBuffer: true,
      antialias: true,
      alpha: false,
      powerPreference: 'low-power',
    },
  });
  const before = globalThis.structuredClone(fixture.actual);
  const result = collectFrameRendererMetadata(fixture.canvas, fixture.environment);
  assert.equal(result.webgl.status, 'AVAILABLE');
  assert.equal(result.webgl.contextType, 'webgl2');
  assert.equal(result.webgl.attributes.status, 'AVAILABLE');
  assert.deepEqual(result.webgl.attributes.values, before);
  assert.deepEqual(fixture.actual, before);
  assert.deepEqual(
    fixture.calls.filter(([name]) => name === 'context'),
    [['context', 'webgl2', []]],
  );
  assert.equal(result.webglRenderer, 'ANGLE SwiftShader');
  assert.equal(result.webgl.renderer.masked.value, 'WebKit WebGL');
  assert.equal(result.webgl.vendor.unmasked.value, 'Synthetic vendor');
  assert.equal(result.softwareRendering.status, 'DETECTED');
  assert.deepEqual(result.softwareRendering.evidence, ['swiftshader']);
  assert.equal(result.browser, fixture.environment.userAgent);
  assert.equal(result.canvasWidth, 390);
  assert.equal(result.canvasHeight, 800);
  assert.equal(result.devicePixelRatio, 1);
  assert.deepEqual(result.viewport, { width: 390, height: 800 });
  assert.deepEqual(result.device, {
    platform: 'Synthetic platform',
    hardwareConcurrency: 8,
    memoryGiB: 4,
  });
});

test('absent contexts and failed context reads remain unavailable rather than reporting default attributes or hardware', () => {
  for (const canvas of [
    undefined,
    { width: 0, height: 0 },
    { getContext: () => null },
    {
      getContext: () => {
        throw Error('Synthetic blocked context');
      },
    },
  ]) {
    const result = collectFrameRendererMetadata(canvas);
    assert.equal(result.webgl.status, 'NOT_AVAILABLE');
    assert.equal(result.webgl.contextType, null);
    assert.equal(result.webgl.attributes.status, 'NOT_AVAILABLE');
    assert(Object.values(result.webgl.attributes.values).every((value) => value === null));
    assert.equal(result.softwareRendering.status, 'NOT_AVAILABLE');
    assert.equal(result.webglRenderer, 'UNAVAILABLE');
    assert.equal(result.devicePixelRatio, null);
    assert.deepEqual(result.viewport, { width: null, height: null });
  }
  const blocked = collectFrameRendererMetadata({
    getContext: () => {
      throw Error('Do not echo');
    },
  });
  assert.equal(blocked.webgl.reason, 'READ_FAILED');
  assert(!JSON.stringify(blocked).includes('Do not echo'));
});

test('missing debug extension keeps masked identity separate and cannot establish hardware acceleration', () => {
  const fixture = rendererFixture({ extension: false });
  const result = collectFrameRendererMetadata(fixture.canvas, fixture.environment);
  assert.equal(result.webgl.debugRendererInfo.status, 'NOT_AVAILABLE');
  assert.equal(result.webgl.renderer.unmasked.status, 'NOT_AVAILABLE');
  assert.equal(result.webgl.vendor.unmasked.status, 'NOT_AVAILABLE');
  assert.equal(result.webglRenderer, 'WebKit WebGL');
  assert.equal(result.softwareRendering.status, 'UNCONFIRMED');
  assert.equal(result.softwareRendering.source, 'masked-renderer');
  assert(!fixture.calls.some(([name, key]) => name === 'parameter' && ![1, 2, 3, 4].includes(key)));
  const namedGpu = rendererFixture({ renderer: 'ANGLE Synthetic GPU' });
  assert.equal(
    collectFrameRendererMetadata(namedGpu.canvas).softwareRendering.status,
    'UNCONFIRMED',
  );
});

test('partially supported attributes, failed extension/parameter reads and context loss are reported independently', () => {
  const fixture = rendererFixture({
    attributes: { desynchronized: undefined, xrCompatible: 'false' },
  });
  fixture.gl.getExtension = () => {
    throw Error('Synthetic extension denial');
  };
  fixture.gl.getParameter = () => {
    throw Error('Synthetic parameter denial');
  };
  let result = collectFrameRendererMetadata(fixture.canvas);
  assert.equal(result.webgl.attributes.status, 'PARTIAL');
  assert.deepEqual(result.webgl.attributes.unavailable, ['desynchronized', 'xrCompatible']);
  assert.equal(result.webgl.attributes.values.desynchronized, null);
  assert.equal(result.webgl.attributes.values.preserveDrawingBuffer, false);
  assert.equal(result.webgl.debugRendererInfo.reason, 'READ_FAILED');
  assert.equal(result.webgl.renderer.masked.reason, 'READ_FAILED');
  assert.equal(result.softwareRendering.status, 'NOT_AVAILABLE');
  fixture.gl.getContextAttributes = () => {
    throw Error('Synthetic attributes denial');
  };
  result = collectFrameRendererMetadata(fixture.canvas);
  assert.equal(result.webgl.attributes.status, 'NOT_AVAILABLE');
  assert.equal(result.webgl.attributes.reason, 'READ_FAILED');
  fixture.gl.getContextAttributes = () => fixture.actual;
  fixture.gl.isContextLost = () => true;
  result = collectFrameRendererMetadata(fixture.canvas);
  assert.equal(result.webgl.status, 'NOT_AVAILABLE');
  assert.equal(result.webgl.reason, 'CONTEXT_LOST');
  assert.equal(result.webgl.attributes.reason, 'CONTEXT_LOST');
  assert(Object.values(result.webgl.attributes.values).every((value) => value === null));
  assert.equal(result.webgl.renderer.masked.reason, 'CONTEXT_LOST');
});

test('renderer helper stays self-contained when serialized into the production QA consumer', () => {
  const fixture = rendererFixture();
  const browserFunction = runInNewContext(`(${collectFrameRendererMetadata.toString()})`);
  assert.deepEqual(
    JSON.parse(JSON.stringify(browserFunction(fixture.canvas, fixture.environment))),
    collectFrameRendererMetadata(fixture.canvas, fixture.environment),
  );
});

test('software, unconfirmed and unavailable renderer metadata cannot relax the fixed frame acceptance gate', () => {
  const fixture = rendererFixture();
  const noExtension = rendererFixture({ extension: false });
  const metadata = [
    collectFrameRendererMetadata(fixture.canvas),
    collectFrameRendererMetadata(noExtension.canvas),
    collectFrameRendererMetadata(undefined),
  ];
  for (const renderer of metadata) {
    const trials = Array.from({ length: 5 }, () => ({
      deltas: Array(6).fill(100),
      sourceCount: 1000,
      before: { renderedCount: 1000, allMarkersInBounds: true },
      after: { renderedCount: 1000, allMarkersInBounds: true },
      completed: true,
      elapsedMs: 1000,
      renderer,
    }));
    const result = evaluateMarkerFrameSeries(trials);
    assert.equal(result.status, 'FAIL');
    assert.equal(result.targetMs, 33);
    assert.equal(result.requiredSamples, 30);
    assert.equal(result.samples, 30);
    assert.equal(result.frameP95Ms, 100);
  }
});

test('actual renderer metadata is collected after the timed loop and optional profiler stop, before map destruction', () => {
  const source = readFileSync(new URL('../scripts/verify-map-frames.mjs', import.meta.url), 'utf8');
  const loop = source.indexOf('for (let index = 0; index < trialCount; index++)');
  const stop = source.indexOf(
    'if (profiler) Object.assign(report.profiling, await profiler.stop())',
  );
  const collect = source.indexOf(
    'await page.evaluate(() => globalThis.frameProbe.rendererMetadata())',
  );
  const destroy = source.indexOf('map.destroy()');
  assert(loop >= 0 && stop > loop && collect > stop && destroy > collect);
  assert.equal(source.split('globalThis.frameProbe.rendererMetadata()').length - 1, 1);
  assert.match(source, /capturePhase: 'AFTER_TIMED_TRIALS_AND_PROFILE_STOP'/);
});

test('quality matrix includes all 240 fixed region/theme/zoom/viewport combinations', () => {
  const cases = mapQualityCases();
  assert.equal(cases.length, 240);
  assert.equal(new Set(cases.map(({ id }) => id)).size, 240);
  for (const region of ['seoul', 'ulsan', 'busan', 'jeju']) {
    assert.equal(cases.filter((value) => value.region === region).length, 60);
    for (const theme of ['standard', 'dark', 'pastel', 'outdoor'])
      assert.equal(
        cases.filter((value) => value.region === region && value.theme === theme).length,
        15,
      );
  }
  for (const item of cases) {
    assert(Object.isFrozen(item.camera.center));
    assert(item.camera.center[0] > 120 && item.camera.center[1] < 40);
    assert.equal(item.camera.bearing, 0);
    assert.equal(item.camera.pitch, 0);
  }
});

test('timing gates reject incomplete observations and compute nearest-rank p95 without mutating samples', () => {
  const samples = Array.from({ length: 30 }, (_, index) => 30 - index);
  assert.equal(percentile(samples, 0.95), 29);
  assert.equal(samples[0], 30);
  assert.equal(evaluateTiming(samples.slice(1), 30).status, 'NOT_RUN');
  assert.equal(evaluateTiming(samples, 28).status, 'FAIL');
  assert.equal(evaluateTiming(samples, 29).status, 'PASS');
  for (const input of [[], [NaN], [-1], [Infinity], new Array(30)])
    assert.throws(() => percentile(input, 0.95));
  assert.equal(qualityTargets.downloadBitsPerSecond / 8, 2_500_000);
});

test('real quality QA has no default data, endpoint, collection or performance opt-in', () => {
  const flags = ['--operator-opt-in', '--store=/operator/tiles', '--glyphs=/operator/glyphs'];
  assert.deepEqual(parseQualityOptions(flags), {
    store: '/operator/tiles',
    glyphs: '/operator/glyphs',
    context: false,
    performance: false,
  });
  assert.equal(parseQualityOptions([...flags, '--context', '--performance']).performance, true);
  for (const args of [
    flags.slice(1),
    flags.slice(0, -1),
    [...flags, '--endpoint=https://example.invalid'],
    [...flags, '--store=/duplicate'],
    [...flags, '--context', '--context'],
  ])
    assert.throws(() => parseQualityOptions(args));
});

test('tile budget measures gzip bytes once for both compressed and uncompressed tiles', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'kmk-size-'));
  try {
    const path = resolve(directory, 'synthetic.db');
    const db = new DatabaseSync(path);
    db.exec('CREATE TABLE tiles(tile_data BLOB NOT NULL)');
    const data = Buffer.from('Project-authored synthetic payload. '.repeat(20));
    const compressed = gzipSync(data);
    db.prepare('INSERT INTO tiles VALUES(?)').run(data);
    db.prepare('INSERT INTO tiles VALUES(?)').run(compressed);
    db.close();
    const result = tileSizeSummary(path);
    assert.equal(result.count, 2);
    assert.equal(result.p95Bytes, compressed.length);
    assert.equal(result.maxBytes, compressed.length);
    assert.equal(result.status, 'PASS');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('empty low zoom, missing Korean symbol labels and insufficient frame observations cannot pass', () => {
  const actual = { roads: 10, buildings: 20, labels: 3, cityLabels: 1, korean: true };
  assert.equal(evaluateScene(actual, 6, false), 'BLOCKED');
  assert.equal(evaluateScene({ ...actual, labels: 0 }, 6, true), 'FAIL');
  assert.equal(evaluateScene({ ...actual, cityLabels: 0 }, 6, true), 'FAIL');
  assert.equal(evaluateScene({ ...actual, korean: false }, 12, true), 'FAIL');
  assert.equal(evaluateScene({ ...actual, roads: 0 }, 10, true), 'FAIL');
  assert.equal(evaluateScene({ ...actual, buildings: 0 }, 16, true), 'FAIL');
  assert.equal(evaluateScene(actual, 14, true), 'PASS');
  assert.equal(evaluateFrames([16], 1000, 1000, 1000, true).status, 'NOT_RUN');
  assert.equal(evaluateFrames(Array(60).fill(16), 1000, 1000, 0, true).status, 'NOT_RUN');
  assert.equal(evaluateFrames(Array(60).fill(16), 1000, 1000, 1000, false).status, 'NOT_RUN');
  assert.equal(evaluateFrames(Array(60).fill(16), 1000, 1000, 1000, true).status, 'PASS');
  assert.equal(evaluateFrames(Array(30).fill(40), 1000, 1000, 1000, true).status, 'FAIL');
});

test('frame-only probe keeps opt-in explicit and cannot pass incomplete or insufficient samples', () => {
  const flags = ['--operator-opt-in', '--store=/operator/tiles', '--glyphs=/operator/glyphs'];
  assert.equal(parseMapFrameOptions(flags).store, '/operator/tiles');
  for (const args of [
    flags.slice(1),
    [...flags, '--unknown=1'],
    [...flags, '--store=/duplicate'],
    ['--operator-opt-in', '--store=relative', '--glyphs=/operator/glyphs'],
  ])
    assert.throws(() => parseMapFrameOptions(args));
  const trial = {
    deltas: [16, 16, 16, 16, 16, 16],
    sourceCount: 1000,
    before: { renderedCount: 1000, allMarkersInBounds: true },
    after: { renderedCount: 1000, allMarkersInBounds: true },
    completed: true,
    elapsedMs: 1000,
  };
  const trials = Array.from({ length: 5 }, () => ({ ...trial }));
  assert.equal(evaluateMarkerFrameSeries(trials).status, 'PASS');
  assert.equal(evaluateMarkerFrameSeries(trials.slice(1)).status, 'NOT_RUN');
  assert.equal(
    evaluateMarkerFrameSeries(trials.map((t) => ({ ...t, deltas: [16] }))).status,
    'NOT_RUN',
  );
  assert.equal(
    evaluateMarkerFrameSeries(trials.map((t) => ({ ...t, sourceCount: 999 }))).status,
    'NOT_RUN',
  );
  assert.equal(
    evaluateMarkerFrameSeries(trials.map((t) => ({ ...t, completed: false }))).status,
    'NOT_RUN',
  );
  assert.equal(
    evaluateMarkerFrameSeries(trials.map((t) => ({ ...t, deltas: Array(6).fill(150) }))).status,
    'FAIL',
  );
});

test('optional CPU/trace profiling requires explicit inputs and always selects a separate non-acceptance report', () => {
  const flags = ['--operator-opt-in', '--store=/operator/tiles', '--glyphs=/operator/glyphs'];
  assert.deepEqual(parseMapFrameOptions(flags), {
    store: '/operator/tiles',
    glyphs: '/operator/glyphs',
  });
  assert.equal(parseMapFrameOptions([...flags, '--profile']).profile, true);
  for (const args of [
    [...flags.slice(1), '--profile'],
    [...flags, '--profile', '--profile'],
    [...flags, '--profile=true'],
  ])
    assert.throws(() => parseMapFrameOptions(args));
  assert.deepEqual(frameReportPolicy(), { file: 'frames-report.json', acceptanceEligible: true });
  assert.deepEqual(frameReportPolicy(true), {
    file: 'frames-profile-report.json',
    acceptanceEligible: false,
    status: 'NON_ACCEPTANCE',
  });
  assert.equal(qualityTargets.frameP95Ms, 33);
  assert.throws(() => frameReportPolicy('false'));
});

class ProfileSession extends EventEmitter {
  calls = [];
  detached = 0;
  index = 0;
  cpu = { nodes: [{ id: 1 }], samples: [1], timeDeltas: [1000], startTime: 0, endTime: 1000 };
  constructor({
    chunks = [
      {
        data: Buffer.from('{"traceEvents":[]}').toString('base64'),
        base64Encoded: true,
        eof: true,
      },
    ],
    fail,
    dataLossOccurred = false,
  } = {}) {
    super();
    this.chunks = chunks;
    this.fail = fail;
    this.dataLossOccurred = dataLossOccurred;
  }
  async send(method, options) {
    this.calls.push({ method, options });
    if (method === this.fail) throw Error('Synthetic CDP failure');
    if (method === 'Profiler.stop') return { profile: this.cpu };
    if (method === 'Tracing.end')
      Promise.resolve().then(() =>
        this.emit('Tracing.tracingComplete', {
          stream: 'synthetic-stream',
          dataLossOccurred: this.dataLossOccurred,
        }),
      );
    if (method === 'IO.read') return this.chunks[this.index++];
    return {};
  }
  async detach() {
    this.detached++;
  }
}

test('profile capture streams bounded ignored artifacts and detaches without changing normal reports', async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'kmk-profile-'));
  const session = new ProfileSession();
  try {
    const capture = await startFrameProfile(session, directory);
    const result = await capture.stop();
    assert.equal(result.status, 'CAPTURED');
    assert.equal(result.maxBytes, 64 * 1024 ** 2);
    assert(result.totalBytes <= result.maxBytes);
    assert.deepEqual(JSON.parse(readFileSync(resolve(directory, 'cpu.cpuprofile'))), session.cpu);
    assert.deepEqual(JSON.parse(readFileSync(resolve(directory, 'trace.json'))), {
      traceEvents: [],
    });
    for (const file of result.files) {
      assert.match(file.sha256, /^[a-f0-9]{64}$/);
      assert.equal(readFileSync(resolve(directory, file.file)).length, file.bytes);
    }
    assert(
      session.calls.some(
        (call) => call.method === 'Tracing.start' && call.options.transferMode === 'ReturnAsStream',
      ),
    );
    assert(
      session.calls
        .filter((call) => call.method === 'IO.read')
        .every((call) => call.options.size <= 1024 ** 2),
    );
    assert.equal(session.listenerCount('Tracing.tracingComplete'), 0);
    assert.equal(session.detached, 1);
    await capture.abort();
    assert(
      existsSync(resolve(directory, 'trace.json')),
      'Completed artifacts must survive idempotent teardown',
    );
    assert.equal(session.detached, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('profile size overflow and interrupted streams remove partial artifacts, preserve acceptance evidence and detach CDP', async () => {
  for (const setup of [
    { chunks: [{ data: 'x'.repeat(2048), eof: true }] },
    { fail: 'IO.read' },
    { dataLossOccurred: true },
    { chunks: [{ data: '', eof: false }] },
  ]) {
    const directory = mkdtempSync(resolve(tmpdir(), 'kmk-profile-failure-'));
    const report = resolve(directory, 'frames-report.json');
    writeFileSync(report, 'Authored acceptance evidence must remain unchanged');
    const owned = mkdtempSync(resolve(directory, 'capture-'));
    const session = new ProfileSession(setup);
    try {
      const capture = await startFrameProfile(session, owned, { maxBytes: 512 });
      await assert.rejects(capture.stop());
      assert.equal(existsSync(owned), false);
      assert.equal(
        readFileSync(report, 'utf8'),
        'Authored acceptance evidence must remain unchanged',
      );
      assert.equal(session.listenerCount('Tracing.tracingComplete'), 0);
      assert.equal(session.detached, 1);
      assert(session.calls.some((call) => call.method === 'IO.close'));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

test('failed profile initialization and caller abort stop profiler/trace state and remove their owned directory', async () => {
  for (const fail of ['Tracing.start', undefined]) {
    const directory = mkdtempSync(resolve(tmpdir(), 'kmk-profile-abort-'));
    const session = new ProfileSession({ fail });
    if (fail) await assert.rejects(startFrameProfile(session, directory));
    else {
      const capture = await startFrameProfile(session, directory);
      await capture.abort();
      await capture.abort();
    }
    assert.equal(session.detached, 1);
    assert(session.calls.some((call) => call.method === 'Profiler.stop'));
    assert(session.calls.some((call) => call.method === 'Profiler.disable'));
    assert.equal(session.listenerCount('Tracing.tracingComplete'), 0);
    assert.equal(existsSync(directory), false);
  }
});
