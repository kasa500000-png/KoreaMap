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
import { parseMapFrameOptions, evaluateMarkerFrameSeries } from '../scripts/verify-map-frames.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gzipSync } from 'node:zlib';

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
