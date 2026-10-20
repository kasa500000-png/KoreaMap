import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { evaluateServiceQuality, normalizeQualityQuery } from '../scripts/service-quality.mjs';

const now = new Date('2026-10-21T00:00:00.000Z');
const catalog = JSON.parse(
  await readFile(new URL('../data/sources.json', import.meta.url), 'utf8'),
);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const searchKinds = ['road-address', 'parcel-address', 'place', 'ambiguous', 'not-found'];
const routeKinds = [
  'connected',
  'oneway',
  'disconnected',
  'island',
  'mode-restriction',
  'via',
  'snap-limit',
];

// Authored reference/response mutations only; these are not public facility or real-road facts.
function authored() {
  const dataset = (domain) => ({
    kind: 'synthetic',
    sourceId: `authored-${domain}`,
    sourceUrl: null,
    sha256: hash(`authored-${domain}-data`),
    license: 'MIT',
    attribution: 'Korea Map Kit authored evaluation fixtures; not actual records',
    dataAsOf: '2026-10-18T00:00:00.000Z',
  });
  const reference = {
    schemaVersion: 1,
    search: {
      dataset: dataset('search'),
      cases: Array.from({ length: 100 }, (_, index) => ({
        id: `search-${index}`,
        kind: searchKinds[index % searchKinds.length],
        text: `서울 합성 질의 ${index}`,
        expectedIds:
          index % 5 === 4
            ? []
            : index % 5 === 3
              ? [`place-${index}-a`, `place-${index}-b`]
              : [`place-${index}`],
      })),
    },
    routing: {
      dataset: dataset('routing'),
      cases: Array.from({ length: 30 }, (_, index) => {
        const west = 126.5 + index * 0.01;
        const start = [west, 35],
          turn = [west + 0.001, 35.002],
          end = [west + 0.003, 35.002];
        const kind = routeKinds[index % routeKinds.length];
        const failure =
          ['disconnected', 'island', 'snap-limit'].includes(kind) ||
          (kind === 'mode-restriction' && index % 2 === 1);
        return {
          id: `route-${index}`,
          kind,
          mode: ['walking', 'cycling', 'driving'][index % 3],
          waypoints: kind === 'via' ? [start, turn, end] : [start, end],
          expected: failure
            ? { outcome: 'error', code: 'NOT_FOUND' }
            : {
                outcome: 'route',
                maxSnapMeters: 30,
                distanceMeters: { min: 300, max: 600 },
                durationSeconds: { min: 100, max: 500 },
                orderedCheckpoints: (kind === 'oneway' ? [start, turn, end] : [turn]).map(
                  (coordinate) => ({ coordinate, toleranceMeters: 5 }),
                ),
              },
        };
      }),
    },
  };
  return bind(reference);
}
function bind(reference) {
  const observations = {
    schemaVersion: 1,
    referenceSha256: hash(JSON.stringify(reference)),
    observedAt: '2026-10-20T00:00:00.000Z',
    sourceCommit: '259d75e116a2de456f546c736014d50197774a4d',
    search: {
      datasetSha256: reference.search.dataset.sha256,
      provider: { name: 'private-test-search-provider', version: 'test-only' },
      results: reference.search.cases.map((item, index) => ({
        caseId: item.id,
        status: 'ok',
        resultIds: [...item.expectedIds],
        elapsedMs: index + 1,
      })),
    },
    routing: {
      datasetSha256: reference.routing.dataset.sha256,
      provider: { name: 'authored-routing', version: 'test-only' },
      results: reference.routing.cases.map((item, index) => {
        if (item.expected.outcome === 'error')
          return { caseId: item.id, status: 'error', code: 'NOT_FOUND', elapsedMs: index + 1 };
        const start = item.waypoints[0],
          end = item.waypoints.at(-1);
        return {
          caseId: item.id,
          status: 'ok',
          elapsedMs: index + 1,
          route: {
            kind: 'road-route',
            mode: item.mode,
            coordinates: globalThis.structuredClone([start, [start[0] + 0.001, end[1]], end]),
            matchedWaypoints: globalThis.structuredClone(item.waypoints),
            distanceMeters: 420,
            durationSeconds: 180,
          },
        };
      }),
    },
  };
  return { reference, observations };
}
function evaluate(input) {
  return evaluateServiceQuality(input.reference, input.observations, {
    now,
    catalog,
    referenceSha256: hash(JSON.stringify(input.reference)),
  });
}
function realAttestationMutation() {
  // Exercise validation of an operator assertion; never claim these authored rows became real.
  const input = authored();
  for (const [domain, sourceId] of [
    ['search', 'yongsan-parking'],
    ['routing', 'osm-geofabrik-kr'],
  ]) {
    const source = catalog.sources.find((entry) => entry.id === sourceId);
    Object.assign(input.reference[domain].dataset, {
      kind: 'real',
      sourceId,
      sourceUrl: source.sourceUrl,
      license: source.license,
      independentReferenceAcknowledged: true,
      reviewMethod:
        'Authored schema mutation exercising an operator review assertion, not real-data evidence.',
      reviewedAt: '2026-10-19',
      reviewBy: '2027-01-17',
    });
  }
  return bind(input.reference);
}

test('complete authored 100-query/30-route evaluation stays NON_ACCEPTANCE and aggregate-only', () => {
  const input = authored();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw Error('Network forbidden');
  };
  let report;
  try {
    report = evaluate(input);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(report.status, 'NON_ACCEPTANCE');
  assert.equal(report.evaluationStatus, 'PASS');
  assert.equal(report.releaseAcceptance, false);
  assert.equal(report.search.completed, 100);
  assert.equal(report.search.koreanQueries, 100);
  assert.equal(report.search.otherQueries, 0);
  assert.equal(report.search.korean.top5Recall, 1);
  assert.equal(report.search.top5Recall, 1);
  assert.equal(report.search.noResultAccuracy, 1);
  assert.equal(report.search.latencyP95Ms, 95);
  assert.equal(report.routing.completed, 30);
  assert.equal(report.routing.passed, 30);
  assert.equal(report.routing.latencyP95Ms, 29);
  const serialized = JSON.stringify(report);
  for (const secret of [
    '서울 합성 질의',
    'place-0',
    'search-0',
    'route-0',
    '126.5',
    'private-test-search-provider',
    'https://',
  ])
    assert(!serialized.includes(secret), `No raw evaluation data: ${secret}`);
});
test('synthetic dataset identifiers remain private in aggregate reports', () => {
  const reference = authored().reference;
  const privateMarkers = ['private-home-user123', ['010', '0000', '0000'].join('-')];
  reference.search.dataset.sourceId = privateMarkers[0];
  reference.routing.dataset.sourceId = privateMarkers[1];
  const report = evaluate(bind(reference));
  assert.equal(report.status, 'NON_ACCEPTANCE');
  assert.equal(report.datasets.search.sourceId, 'authored-synthetic');
  assert.equal(report.datasets.routing.sourceId, 'authored-synthetic');
  for (const marker of privateMarkers) assert(!JSON.stringify(report).includes(marker));
});
test('English, CJK, emoji or invisible Hangul fillers cannot satisfy 100 Korean queries', () => {
  for (const prefix of [
    'english-query',
    '東京地点',
    '中文地名',
    '🗺️ search',
    '\u115f\u1160',
    '\u3164',
    '\uffa0',
  ]) {
    const reference = authored().reference;
    reference.search.cases.forEach((item, index) => {
      item.text = `${prefix}-${index}`;
    });
    const report = evaluate(bind(reference));
    assert.equal(report.status, 'NOT_RUN');
    assert.equal(report.search.koreanQueries, 0);
    assert.equal(report.search.otherQueries, 100);
  }
  const short = authored().reference;
  short.search.cases[0].text = 'only-english-query';
  const deficient = evaluate(bind(short));
  assert.equal(deficient.status, 'NOT_RUN');
  assert.equal(deficient.search.koreanQueries, 99);
  const missingKind = authored().reference;
  for (const item of missingKind.search.cases)
    if (item.kind === 'parcel-address') item.text = `english-parcel-${item.id}`;
  for (let index = 0; index < 20; index++)
    missingKind.search.cases.push({
      ...missingKind.search.cases[0],
      id: `korean-extra-${index}`,
      kind: 'place',
      text: `한국어 보충 시설 ${index}`,
    });
  const coverage = evaluate(bind(missingKind));
  assert.equal(coverage.search.koreanQueries, 100);
  assert.equal(coverage.search.korean.coverage['parcel-address'], 0);
  assert.equal(coverage.status, 'NOT_RUN');
});
test('NFD mixed-language Korean and English extras are separated without diluting Korean recall', () => {
  const reference = authored().reference;
  reference.search.cases.forEach((item, index) => {
    item.text = `Seoul 서울 한글 ${index}`.normalize('NFD');
  });
  const originals = reference.search.cases.slice();
  reference.search.cases.push(
    ...originals.map((item, index) => ({
      ...item,
      id: `english-extra-${index}`,
      text: `english-extra-query-${index}`,
    })),
  );
  const input = bind(reference);
  const complete = evaluate(input);
  assert.equal(complete.status, 'NON_ACCEPTANCE');
  assert.equal(complete.search.koreanQueries, 100);
  assert.equal(complete.search.otherQueries, 100);
  assert.equal(complete.search.korean.completed, 100);
  for (const item of originals.filter((entry) => entry.expectedIds.length === 1).slice(0, 20))
    input.observations.search.results.find((result) => result.caseId === item.id).resultIds = [];
  const degraded = evaluate(input);
  assert.equal(degraded.search.top5Recall, 0.9);
  assert.equal(degraded.search.korean.top5Recall, 0.8);
  assert.equal(degraded.status, 'FAIL');
});
test('NFC/ASCII case/whitespace identity rejects padded duplicate queries and duplicate road segments', () => {
  assert.equal(normalizeQualityQuery('서 울\t가\u3000상 ABC'.normalize('NFD')), '서울가상abc');
  const input = authored();
  input.reference.search.cases[1].text = input.reference.search.cases[0].text
    .replaceAll(' ', '\u3000')
    .normalize('NFD');
  assert.throws(() => evaluate(input), /DUPLICATE_NORMALIZED_CASE/u);
  const roads = authored();
  Object.assign(roads.reference.routing.cases[1], {
    mode: roads.reference.routing.cases[0].mode,
    waypoints: roads.reference.routing.cases[0].waypoints.map((point) => [
      point[0] + 1e-10,
      point[1],
    ]),
  });
  assert.throws(() => evaluate(roads), /DUPLICATE_NORMALIZED_CASE/u);
});
test('minimum distinct samples, all requested classes/modes and completed observations are mandatory', () => {
  for (const change of [
    (r) => {
      r.search.cases.pop();
    },
    (r) => {
      r.routing.cases.pop();
    },
    (r) => {
      for (const item of r.search.cases) if (item.kind === 'parcel-address') item.kind = 'place';
    },
    (r) => {
      for (const item of r.routing.cases) item.mode = 'walking';
    },
    (r) => {
      for (const item of r.routing.cases) if (item.kind === 'via') item.kind = 'connected';
    },
    (r) => {
      for (const item of r.routing.cases)
        if (item.mode === 'cycling' && item.expected.outcome === 'route') item.mode = 'walking';
    },
  ]) {
    const input = authored();
    change(input.reference);
    assert.equal(evaluate(bind(input.reference)).status, 'NOT_RUN');
  }
  const missing = authored();
  missing.observations.search.results.pop();
  assert.equal(evaluate(missing).status, 'NOT_RUN');
  const unfinished = authored();
  unfinished.observations.routing.results[0] = { caseId: 'route-0', status: 'not-run' };
  assert.equal(evaluate(unfinished).status, 'NOT_RUN');
});
test('top-five recall has its own denominator, rank cutoff and independent empty-result accuracy', () => {
  const input = authored();
  const singles = input.reference.search.cases
    .filter((item) => item.expectedIds.length === 1)
    .slice(0, 10);
  for (const item of singles)
    input.observations.search.results.find((result) => result.caseId === item.id).resultIds = [];
  let report = evaluate(input);
  assert.equal(report.search.top5Recall, 0.9);
  assert.equal(report.search.top5QueryHitRate, 70 / 80);
  assert.equal(report.evaluationStatus, 'PASS');
  const extra = input.reference.search.cases.find(
    (item) => item.expectedIds.length === 1 && !singles.includes(item),
  );
  input.observations.search.results.find((result) => result.caseId === extra.id).resultIds = [
    'wrong-1',
    'wrong-2',
    'wrong-3',
    'wrong-4',
    'wrong-5',
    ...extra.expectedIds,
  ];
  report = evaluate(input);
  assert.equal(report.search.top5Recall, 0.89);
  assert.equal(report.status, 'FAIL');
  const empty = authored();
  empty.observations.search.results.find((result) => result.caseId === 'search-4').resultIds = [
    'false-positive',
  ];
  assert.equal(evaluate(empty).search.top5Recall, 1);
  assert.equal(evaluate(empty).search.noResultAccuracy, 0.95);
  assert.equal(evaluate(empty).status, 'FAIL');
});
test('timeouts are measured failures, not silently dropped successful search observations', () => {
  const input = authored();
  input.observations.search.results[0] = {
    caseId: 'search-0',
    status: 'error',
    code: 'TIMEOUT',
    elapsedMs: 2500,
  };
  const report = evaluate(input);
  assert.equal(report.status, 'FAIL');
  assert.equal(report.search.completed, 100);
  assert.equal(report.search.errors, 1);
  assert.equal(report.search.top5Recall, 0.99);
});
test('source review, provenance, exact reference/observation binding and timestamps fail closed', () => {
  for (const change of [
    (i) => {
      i.reference.search.dataset.independentReferenceAcknowledged = false;
    },
    (i) => {
      i.reference.search.dataset.reviewBy = '2026-10-20';
    },
    (i) => {
      i.reference.routing.dataset.license = 'MIT';
    },
    (i) => {
      i.reference.search.dataset.sourceId = 'parks-standard';
    },
    (i) => {
      i.reference.search.dataset.sourceUrl = 'https://unreviewed.invalid/data';
    },
    (i) => {
      i.reference.routing.dataset.sha256 = 'missing';
    },
    (i) => {
      i.reference.search.dataset.dataAsOf = '2026-02-30T00:00:00.000Z';
    },
  ]) {
    const input = realAttestationMutation();
    change(input);
    assert.throws(() => evaluate(bind(input.reference)));
  }
  const mismatch = authored();
  mismatch.observations.referenceSha256 = hash('wrong reference');
  assert.throws(() => evaluate(mismatch), /REFERENCE_HASH_MISMATCH/u);
  const dataset = authored();
  dataset.observations.routing.datasetSha256 = hash('wrong dataset');
  assert.throws(() => evaluate(dataset), /OBSERVATION_DATASET_MISMATCH/u);
  const time = authored();
  time.observations.observedAt = '2026-10-17T00:00:00.000Z';
  assert.throws(() => evaluate(time), /DATASET_NEWER_THAN_OBSERVATION/u);
  const attested = evaluate(realAttestationMutation());
  assert.equal(attested.status, 'PASS');
  assert.equal(attested.releaseAcceptance, false);
  assert.match(attested.originVerification, /not-independent-original-proof/u);
});
test('unknown/duplicate result IDs, invalid measured latency and duplicated candidates are rejected', () => {
  for (const change of [
    (i) => {
      i.observations.search.results[0].caseId = 'unknown';
    },
    (i) => {
      i.observations.routing.results[1].caseId = 'route-0';
    },
    (i) => {
      i.observations.search.results[0].elapsedMs = Number.NaN;
    },
    (i) => {
      i.observations.search.results[0].resultIds = ['same', 'same'];
    },
  ]) {
    const input = authored();
    change(input);
    assert.throws(() => evaluate(input));
  }
});
test('actual route geometry checks mode, snap, endpoints, distance/duration and independent detour checkpoints', () => {
  for (const [check, change] of [
    [
      'mode',
      (route) => {
        route.mode = 'driving';
      },
    ],
    [
      'snap',
      (route) => {
        route.matchedWaypoints[0][0] += 0.002;
      },
    ],
    [
      'endpoint',
      (route) => {
        route.coordinates[0][1] += 0.0001;
      },
    ],
    [
      'distance',
      (route) => {
        route.distanceMeters = 900;
      },
    ],
    [
      'duration',
      (route) => {
        route.durationSeconds = 900;
      },
    ],
    [
      'geometryDistance',
      (route) => {
        route.distanceMeters = 580;
      },
    ],
    [
      'referencePath',
      (route) => {
        route.coordinates.splice(1, 1);
      },
    ],
  ]) {
    const input = authored();
    const route = input.observations.routing.results[0].route;
    change(route);
    const report = evaluate(input);
    assert.equal(report.status, 'FAIL');
    assert.equal(report.routing.failedChecks[check], 1, check);
  }
});
test('via stops must occur in order, including order within a single geometry segment', () => {
  const input = authored();
  const item = input.reference.routing.cases.find((entry) => entry.kind === 'via');
  const result = input.observations.routing.results.find((entry) => entry.caseId === item.id);
  const middle = item.waypoints[1];
  result.route.matchedWaypoints[1] = [middle[0], middle[1] + 0.00005];
  const stops = evaluate(input);
  assert.equal(stops.status, 'FAIL');
  assert.equal(stops.routing.failedChecks.orderedStops, 1);
  assert.equal(stops.routing.failedChecks.referencePath, undefined);
  const reverse = authored();
  const oneWay = reverse.reference.routing.cases.find((entry) => entry.kind === 'oneway');
  oneWay.expected.orderedCheckpoints.reverse();
  const report = evaluate(bind(reverse.reference));
  assert.equal(report.status, 'FAIL');
  assert.equal(report.routing.failedChecks.referencePath, 1);
  const sameEdge = authored();
  const first = sameEdge.reference.routing.cases[0];
  const start = first.waypoints[0],
    finish = first.waypoints[1];
  const along = (fraction) => [
    start[0] + (finish[0] - start[0]) * fraction,
    start[1] + (finish[1] - start[1]) * fraction,
  ];
  first.expected.orderedCheckpoints = [along(0.8), along(0.2)].map((coordinate) => ({
    coordinate,
    toleranceMeters: 1,
  }));
  const bound = bind(sameEdge.reference);
  bound.observations.routing.results[0].route.coordinates = globalThis.structuredClone([
    start,
    finish,
  ]);
  assert.equal(evaluate(bound).routing.failedChecks.referencePath, 1);
});
test('disconnected/island/mode-restricted/snap-limit references never accept a route or wrong error fallback', () => {
  for (const kind of ['disconnected', 'island', 'mode-restriction', 'snap-limit']) {
    const input = authored();
    const item = input.reference.routing.cases.find(
      (entry) => entry.kind === kind && entry.expected.outcome === 'error',
    );
    const result = input.observations.routing.results.find((entry) => entry.caseId === item.id);
    result.code = 'UNAVAILABLE';
    assert.equal(evaluate(input).routing.failedChecks.noFallback, 1);
    result.code = 'NOT_FOUND';
    result.route = globalThis.structuredClone(input.observations.routing.results[0].route);
    assert.equal(evaluate(input).status, 'FAIL');
  }
});

test('CLI defaults to zero-request NOT_RUN, binds actual files, preserves privacy and replaces stale PASS on failure', async () => {
  const directory = await realpath(await mkdtemp(resolve(tmpdir(), 'kmk-quality-cli-')));
  try {
    const scripts = resolve(directory, 'scripts');
    const store = resolve(directory, 'artifacts/service-quality');
    await mkdir(scripts, { recursive: true });
    await mkdir(store, { recursive: true });
    await mkdir(resolve(directory, 'data'));
    for (const file of ['service-quality.mjs', 'verify-real-poi.mjs'])
      await cp(new URL(`../scripts/${file}`, import.meta.url), resolve(scripts, file));
    await writeFile(resolve(directory, 'data/sources.json'), JSON.stringify(catalog));
    const guard = resolve(directory, 'no-network.mjs');
    await writeFile(guard, 'globalThis.fetch=()=>{throw new Error("No network allowed")};\n');
    const run = (config) =>
      spawnSync(
        process.execPath,
        ['--import', guard, resolve(scripts, 'service-quality.mjs'), ...(config ? [config] : [])],
        { cwd: directory, encoding: 'utf8', timeout: 5000 },
      );
    const reportFile = resolve(store, 'report.json');
    await writeFile(reportFile, '{"status":"PASS"}');
    const absent = run();
    assert.equal(absent.status, 2);
    assert.equal(JSON.parse(await readFile(reportFile, 'utf8')).status, 'NOT_RUN');
    const reference = authored().reference;
    reference.search.dataset.sourceId = 'private-home-user123';
    reference.routing.dataset.sourceId = ['010', '0000', '0000'].join('-');
    const input = bind(reference);
    const referenceFile = resolve(store, 'reference.json'),
      observationsFile = resolve(store, 'observations.json');
    await writeFile(referenceFile, JSON.stringify(input.reference));
    await writeFile(observationsFile, JSON.stringify(input.observations));
    const configFile = resolve(store, 'config.json');
    await writeFile(
      configFile,
      JSON.stringify({ operatorOptIn: true, referenceFile, observationsFile }),
    );
    const synthetic = run(configFile);
    assert.equal(synthetic.status, 2, synthetic.stderr);
    assert.equal(JSON.parse(synthetic.stdout).status, 'NON_ACCEPTANCE');
    assert(!synthetic.stdout.includes('서울 합성 질의'));
    assert(!synthetic.stdout.includes(directory));
    assert(!synthetic.stdout.includes('private-home-user123'));
    assert(!synthetic.stdout.includes(['010', '0000', '0000'].join('-')));
    input.observations.referenceSha256 = hash('mismatch');
    await writeFile(observationsFile, JSON.stringify(input.observations));
    const failed = run(configFile);
    assert.equal(failed.status, 1);
    assert.equal(JSON.parse(await readFile(reportFile, 'utf8')).reason, 'REFERENCE_HASH_MISMATCH');
    await writeFile(
      configFile,
      JSON.stringify({ operatorOptIn: false, referenceFile, observationsFile }),
    );
    assert.equal(JSON.parse(run(configFile).stdout).reason, 'OPERATOR_OPT_IN_REQUIRED');
    await writeFile(configFile, Buffer.from([0xc3, 0x28]));
    assert.equal(JSON.parse(run(configFile).stdout).reason, 'INPUT_READ_OR_PARSE_FAILED');
    if (process.platform !== 'win32') {
      const link = resolve(store, 'linked-config.json');
      await symlink(configFile, link);
      const rejected = run(link);
      assert.equal(rejected.status, 1);
      assert.equal(JSON.parse(rejected.stdout).reason, 'INPUT_READ_OR_PARSE_FAILED');
      assert(!rejected.stdout.includes(directory));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
