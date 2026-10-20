import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';
import { readOperatorFile } from './verify-real-poi.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const storage = resolve(root, 'artifacts/service-quality');
const hashPattern = /^[a-f0-9]{64}$/u;
const searchKinds = ['road-address', 'parcel-address', 'place', 'ambiguous', 'not-found'];
const modes = ['walking', 'cycling', 'driving'];
const routeKinds = [
  'connected',
  'oneway',
  'disconnected',
  'island',
  'mode-restriction',
  'via',
  'snap-limit',
];
const errorCodes = ['NOT_FOUND', 'INVALID_ARGUMENT', 'TIMEOUT', 'ABORTED', 'UNAVAILABLE'];

class QualityInputError extends Error {}
function check(condition, code) {
  if (!condition) throw new QualityInputError(code);
}
function record(value, code) {
  check(value && typeof value === 'object' && !Array.isArray(value), code);
}
function boundedText(value, min, max) {
  return typeof value === 'string' && value.length >= min && value.length <= max;
}
function timestamp(value, now) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value &&
    Date.parse(value) <= now.getTime()
  );
}
function day(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
function currentReview(value, now) {
  const today = now.toISOString().slice(0, 10);
  return (
    day(value.reviewedAt) &&
    day(value.reviewBy) &&
    value.reviewedAt <= today &&
    value.reviewBy >= today &&
    Date.parse(value.reviewBy) >= Date.parse(value.reviewedAt) &&
    Date.parse(value.reviewBy) - Date.parse(value.reviewedAt) <= 90 * 86400000
  );
}
function coordinate(point) {
  return (
    Array.isArray(point) &&
    point.length === 2 &&
    point.every(Number.isFinite) &&
    point[0] >= 124 &&
    point[0] <= 132 &&
    point[1] >= 33 &&
    point[1] <= 39
  );
}
function meters(a, b) {
  const radians = Math.PI / 180;
  const latitude = (b[1] - a[1]) * radians;
  const longitude = (b[0] - a[0]) * radians;
  const h =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * Math.sin(longitude / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
/** Same documented NFC/ASCII case/whitespace identity used by Korean search cases. */
export function normalizeQualityQuery(value) {
  return value
    .normalize('NFC')
    .replace(/[\t-\r \u00a0\u3000]/gu, '')
    .replace(/[A-Z]/gu, (c) => c.toLowerCase());
}
function hasKoreanLetters(value) {
  return [...normalizeQualityQuery(value)].some(
    (character) =>
      /\p{Script=Hangul}/u.test(character) &&
      /\p{Letter}/u.test(character) &&
      !/[\u115f\u1160\u3164\uffa0]/u.test(character),
  );
}
function ids(values, limit) {
  return (
    Array.isArray(values) &&
    values.length <= limit &&
    values.every((value) => boundedText(value, 1, 256)) &&
    new Set(values).size === values.length
  );
}
function unique(values, key, code) {
  check(new Set(values.map(key)).size === values.length, code);
}
function range(value) {
  return (
    value &&
    Number.isFinite(value.min) &&
    Number.isFinite(value.max) &&
    value.min > 0 &&
    value.max >= value.min &&
    value.max <= 864000
  );
}
function provenance(value, catalog, now) {
  record(value, 'DATASET_PROVENANCE_REQUIRED');
  check(['real', 'synthetic'].includes(value.kind), 'DATASET_KIND_REQUIRED');
  check(hashPattern.test(value.sha256), 'DATASET_HASH_REQUIRED');
  check(timestamp(value.dataAsOf, now), 'VALID_DATASET_TIME_REQUIRED');
  check(boundedText(value.attribution, 1, 400), 'DATASET_ATTRIBUTION_REQUIRED');
  check(
    typeof value.sourceId === 'string' && /^[a-z0-9-]{1,80}$/u.test(value.sourceId),
    'DATASET_SOURCE_REQUIRED',
  );
  if (value.kind === 'synthetic') {
    check(value.license === 'MIT' && value.sourceUrl === null, 'AUTHORED_FIXTURE_REQUIRED');
    return;
  }
  check(value.independentReferenceAcknowledged === true, 'INDEPENDENT_REFERENCE_REQUIRED');
  check(boundedText(value.reviewMethod, 24, 600), 'REFERENCE_REVIEW_METHOD_REQUIRED');
  check(currentReview(value, now), 'REFERENCE_REVIEW_EXPIRED');
  const source = catalog?.sources?.find((entry) => entry.id === value.sourceId);
  check(
    source?.grade === 'A' &&
      source.collectionEligible === true &&
      source.defaultEnabled === false &&
      source.sourceUrl === value.sourceUrl &&
      source.license === value.license &&
      ['commercial', 'store', 'modify', 'redistribute'].every(
        (right) => source.rights?.[right] === 'allowed',
      ) &&
      currentReview(source, now),
    'REVIEWED_A_SOURCE_REQUIRED',
  );
}

/** Validate operator-owned reference inputs; declarations of origin are not independent proof. */
export function validateQualityReference(reference, catalog, now = new Date()) {
  record(reference, 'REFERENCE_REQUIRED');
  check(reference.schemaVersion === 1, 'REFERENCE_SCHEMA_REQUIRED');
  for (const domain of ['search', 'routing']) {
    record(reference[domain], 'QUALITY_DOMAIN_REQUIRED');
    provenance(reference[domain].dataset, catalog, now);
    const cases = reference[domain].cases;
    check(Array.isArray(cases) && cases.length <= 1000, 'BOUNDED_CASES_REQUIRED');
    for (const item of cases) {
      record(item, 'CASE_REQUIRED');
      check(
        typeof item.id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/u.test(item.id),
        'CASE_ID_REQUIRED',
      );
      if (domain === 'search') {
        check(searchKinds.includes(item.kind), 'SEARCH_KIND_REQUIRED');
        check(boundedText(item.text, 1, 120), 'BOUNDED_QUERY_REQUIRED');
        check(normalizeQualityQuery(item.text).length >= 2, 'SEARCH_QUERY_TOO_SHORT');
        check(ids(item.expectedIds, 5), 'TOP5_REFERENCE_IDS_REQUIRED');
        check(
          item.kind === 'not-found'
            ? item.expectedIds.length === 0
            : item.expectedIds.length >= (item.kind === 'ambiguous' ? 2 : 1),
          'POSITIVE_AND_NEGATIVE_REFERENCE_REQUIRED',
        );
      } else {
        check(modes.includes(item.mode) && routeKinds.includes(item.kind), 'ROUTING_KIND_REQUIRED');
        check(
          Array.isArray(item.waypoints) &&
            item.waypoints.length >= 2 &&
            item.waypoints.length <= 10 &&
            item.waypoints.every(coordinate),
          'KOREAN_WGS84_WAYPOINTS_REQUIRED',
        );
        for (let index = 1; index < item.waypoints.length; index++)
          check(
            meters(item.waypoints[index - 1], item.waypoints[index]) >= 1,
            'DISTINCT_WAYPOINTS_REQUIRED',
          );
        record(item.expected, 'ROUTE_REFERENCE_REQUIRED');
        check(['route', 'error'].includes(item.expected.outcome), 'ROUTE_OUTCOME_REQUIRED');
        if (item.kind === 'via') check(item.waypoints.length >= 3, 'VIA_REFERENCE_REQUIRED');
        if (['connected', 'via'].includes(item.kind))
          check(item.expected.outcome === 'route', 'CONNECTED_ROUTE_REFERENCE_REQUIRED');
        if (['disconnected', 'island', 'snap-limit'].includes(item.kind))
          check(item.expected.outcome === 'error', 'NO_PATH_REFERENCE_REQUIRED');
        if (item.expected.outcome === 'error') {
          check(item.expected.code === 'NOT_FOUND', 'NO_ROAD_RESULT_MUST_BE_NOT_FOUND');
        } else {
          check(
            range(item.expected.distanceMeters) && range(item.expected.durationSeconds),
            'INDEPENDENT_ROUTE_RANGES_REQUIRED',
          );
          check(
            Number.isFinite(item.expected.maxSnapMeters) &&
              item.expected.maxSnapMeters >= 1 &&
              item.expected.maxSnapMeters <= 100,
            'SNAP_LIMIT_REQUIRED',
          );
          const points = item.expected.orderedCheckpoints;
          check(
            Array.isArray(points) &&
              points.length >= (item.kind === 'oneway' ? 3 : 1) &&
              points.length <= 20 &&
              points.every(
                (point) =>
                  coordinate(point.coordinate) &&
                  Number.isFinite(point.toleranceMeters) &&
                  point.toleranceMeters >= 1 &&
                  point.toleranceMeters <= 50,
              ),
            'ORDERED_REFERENCE_CHECKPOINTS_REQUIRED',
          );
        }
      }
    }
    unique(cases, (item) => item.id, 'DUPLICATE_CASE_ID');
    unique(
      cases,
      domain === 'search'
        ? (item) => normalizeQualityQuery(item.text)
        : (item) =>
            JSON.stringify([
              item.mode,
              item.waypoints.map((point) => point.map((v) => Number(v.toFixed(6)))),
            ]),
      'DUPLICATE_NORMALIZED_CASE',
    );
  }
}

function coverage(cases, key, required) {
  return Object.fromEntries(
    required.map((value) => [value, cases.filter((item) => item[key] === value).length]),
  );
}
function p95(values) {
  if (!values.length) return null;
  return [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];
}
function completedResults(domain, reference) {
  check(Array.isArray(domain.results) && domain.results.length <= 1000, 'BOUNDED_RESULTS_REQUIRED');
  for (const result of domain.results) record(result, 'RESULT_REQUIRED');
  unique(domain.results, (item) => item.caseId, 'DUPLICATE_RESULT_ID');
  const known = new Set(reference.cases.map((item) => item.id));
  for (const result of domain.results) {
    record(result, 'RESULT_REQUIRED');
    check(known.has(result.caseId), 'UNKNOWN_RESULT_CASE');
    check(['ok', 'error', 'not-run'].includes(result.status), 'RESULT_STATUS_REQUIRED');
    if (result.status !== 'not-run')
      check(
        Number.isFinite(result.elapsedMs) && result.elapsedMs >= 0 && result.elapsedMs <= 86400000,
        'OBSERVED_LATENCY_REQUIRED',
      );
    if (result.status === 'error')
      check(errorCodes.includes(result.code), 'SAFE_ERROR_CODE_REQUIRED');
  }
  return new Map(domain.results.map((item) => [item.caseId, item]));
}

function scoreSearchCases(cases, results) {
  let completed = 0,
    errors = 0,
    positives = 0,
    negatives = 0;
  let correctEmpty = 0,
    relevant = 0,
    found = 0,
    hitQueries = 0;
  const times = [];
  for (const item of cases) {
    const result = results.get(item.id);
    if (!result || result.status === 'not-run') continue;
    completed++;
    times.push(result.elapsedMs);
    if (item.expectedIds.length) {
      positives++;
      relevant += item.expectedIds.length;
    } else negatives++;
    if (result.status === 'error') {
      errors++;
      continue;
    }
    check(ids(result.resultIds, 50), 'UNIQUE_BOUNDED_RESULT_IDS_REQUIRED');
    const top5 = new Set(result.resultIds.slice(0, 5));
    const matching = item.expectedIds.filter((id) => top5.has(id)).length;
    found += matching;
    if (matching) hitQueries++;
    if (!item.expectedIds.length && result.resultIds.length === 0) correctEmpty++;
  }
  const recall = relevant ? found / relevant : null;
  const emptyAccuracy = negatives ? correctEmpty / negatives : null;
  return {
    referenceCases: cases.length,
    completed,
    notRun: cases.length - completed,
    errors,
    positiveQueries: positives,
    noResultQueries: negatives,
    top5Recall: recall,
    top5QueryHitRate: positives ? hitQueries / positives : null,
    noResultAccuracy: emptyAccuracy,
    latencyP95Ms: p95(times),
  };
}
function searchQuality(reference, observation) {
  const results = completedResults(observation, reference);
  const counts = coverage(reference.cases, 'kind', searchKinds);
  const koreanCases = reference.cases.filter((item) => hasKoreanLetters(item.text));
  const korean = {
    ...scoreSearchCases(koreanCases, results),
    coverage: coverage(koreanCases, 'kind', searchKinds),
  };
  const overall = scoreSearchCases(reference.cases, results);
  const complete =
    koreanCases.length >= 100 &&
    Object.values(korean.coverage).every((n) => n > 0) &&
    overall.completed === reference.cases.length;
  const successful = [overall, korean].every(
    (scores) => scores.errors === 0 && scores.top5Recall >= 0.9 && scores.noResultAccuracy === 1,
  );
  return {
    status: !complete ? 'NOT_RUN' : successful ? 'PASS' : 'FAIL',
    requiredCases: 100,
    requiredKoreanQueries: 100,
    ...overall,
    koreanQueries: koreanCases.length,
    otherQueries: reference.cases.length - koreanCases.length,
    coverage: counts,
    korean,
    targetTop5Recall: 0.9,
    targetNoResultAccuracy: 1,
  };
}

function segmentDistance(point, a, b) {
  const scaleY = (6371008.8 * Math.PI) / 180;
  const scaleX = scaleY * Math.cos((point[1] * Math.PI) / 180);
  const x = (b[0] - a[0]) * scaleX,
    y = (b[1] - a[1]) * scaleY;
  const px = (point[0] - a[0]) * scaleX,
    py = (point[1] - a[1]) * scaleY;
  const square = x * x + y * y;
  const fraction = square ? Math.max(0, Math.min(1, (px * x + py * y) / square)) : 0;
  return { fraction, distance: Math.hypot(px - fraction * x, py - fraction * y) };
}
function orderedPoints(points, geometry) {
  let cursor = 0;
  for (const point of points) {
    let matched = false;
    for (let index = Math.floor(cursor); index < geometry.length - 1; index++) {
      const result = segmentDistance(point.coordinate, geometry[index], geometry[index + 1]);
      const progress = index + result.fraction;
      if (progress + 1e-9 >= cursor && result.distance <= point.toleranceMeters) {
        cursor = progress;
        matched = true;
        break;
      }
    }
    if (!matched) return false;
  }
  return true;
}
function routeChecks(item, route) {
  const shape =
    route &&
    route.kind === 'road-route' &&
    Array.isArray(route.coordinates) &&
    route.coordinates.length >= 2 &&
    route.coordinates.length <= 10000 &&
    route.coordinates.every(coordinate) &&
    Array.isArray(route.matchedWaypoints) &&
    route.matchedWaypoints.length === item.waypoints.length &&
    route.matchedWaypoints.every(coordinate);
  if (!shape) return { geometry: false };
  const expected = item.expected;
  const geometryMeters = route.coordinates
    .slice(1)
    .reduce((sum, point, index) => sum + meters(route.coordinates[index], point), 0);
  return {
    geometry: true,
    mode: route.mode === item.mode,
    distance:
      Number.isFinite(route.distanceMeters) &&
      route.distanceMeters >= expected.distanceMeters.min &&
      route.distanceMeters <= expected.distanceMeters.max,
    duration:
      Number.isFinite(route.durationSeconds) &&
      route.durationSeconds >= expected.durationSeconds.min &&
      route.durationSeconds <= expected.durationSeconds.max,
    geometryDistance:
      geometryMeters >= 1 &&
      Math.abs(geometryMeters - route.distanceMeters) <= Math.max(5, geometryMeters * 0.2),
    snap: route.matchedWaypoints.every(
      (point, index) => meters(point, item.waypoints[index]) <= expected.maxSnapMeters,
    ),
    endpoint:
      meters(route.coordinates[0], route.matchedWaypoints[0]) <= 2 &&
      meters(route.coordinates.at(-1), route.matchedWaypoints.at(-1)) <= 2,
    orderedStops: orderedPoints(
      route.matchedWaypoints.map((point) => ({ coordinate: point, toleranceMeters: 2 })),
      route.coordinates,
    ),
    referencePath: orderedPoints(expected.orderedCheckpoints, route.coordinates),
  };
}
function routingQuality(reference, observation) {
  const results = completedResults(observation, reference);
  const kinds = coverage(reference.cases, 'kind', routeKinds);
  const modeCounts = coverage(reference.cases, 'mode', modes);
  const positiveModes = coverage(
    reference.cases.filter((item) => item.expected.outcome === 'route'),
    'mode',
    modes,
  );
  const failedChecks = {};
  const times = [];
  let completed = 0,
    passed = 0;
  for (const item of reference.cases) {
    const result = results.get(item.id);
    if (!result || result.status === 'not-run') continue;
    completed++;
    times.push(result.elapsedMs);
    const checks =
      item.expected.outcome === 'error'
        ? {
            noFallback:
              result.status === 'error' &&
              result.code === item.expected.code &&
              result.route === undefined,
          }
        : result.status === 'ok'
          ? routeChecks(item, result.route)
          : { availability: false };
    for (const [name, valid] of Object.entries(checks))
      if (!valid) failedChecks[name] = (failedChecks[name] ?? 0) + 1;
    if (Object.values(checks).every(Boolean)) passed++;
  }
  const complete =
    reference.cases.length >= 30 &&
    Object.values(kinds).every((n) => n > 0) &&
    Object.values(modeCounts).every((n) => n > 0) &&
    Object.values(positiveModes).every((n) => n > 0) &&
    completed === reference.cases.length;
  return {
    status: !complete ? 'NOT_RUN' : passed === completed ? 'PASS' : 'FAIL',
    requiredCases: 30,
    referenceCases: reference.cases.length,
    completed,
    notRun: reference.cases.length - completed,
    passed,
    failed: completed - passed,
    coverage: kinds,
    modes: modeCounts,
    positiveModes,
    failedChecks,
    latencyP95Ms: p95(times),
    geography:
      'Korean WGS84; ordered checkpoint proximity, not independent road-network verification',
  };
}

/** Offline evaluation only: never creates providers, sends requests or establishes real-data origin. */
export function evaluateServiceQuality(reference, observations, options = {}) {
  const now = options.now ?? new Date();
  check(Number.isFinite(now.getTime()), 'VALID_EVALUATION_TIME_REQUIRED');
  validateQualityReference(reference, options.catalog, now);
  record(observations, 'OBSERVATIONS_REQUIRED');
  check(observations.schemaVersion === 1, 'OBSERVATION_SCHEMA_REQUIRED');
  check(
    hashPattern.test(options.referenceSha256) &&
      observations.referenceSha256 === options.referenceSha256,
    'REFERENCE_HASH_MISMATCH',
  );
  check(timestamp(observations.observedAt, now), 'VALID_OBSERVATION_TIME_REQUIRED');
  check(
    typeof observations.sourceCommit === 'string' &&
      /^[a-f0-9]{40}$/u.test(observations.sourceCommit),
    'SOURCE_COMMIT_REQUIRED',
  );
  for (const domain of ['search', 'routing']) {
    record(observations[domain], 'OBSERVATION_DOMAIN_REQUIRED');
    check(
      observations[domain].datasetSha256 === reference[domain].dataset.sha256,
      'OBSERVATION_DATASET_MISMATCH',
    );
    check(
      Date.parse(reference[domain].dataset.dataAsOf) <= Date.parse(observations.observedAt),
      'DATASET_NEWER_THAN_OBSERVATION',
    );
    check(
      boundedText(observations[domain].provider?.name, 1, 80) &&
        boundedText(observations[domain].provider?.version, 1, 80),
      'PROVIDER_VERSION_REQUIRED',
    );
  }
  const search = searchQuality(reference.search, observations.search);
  const routing = routingQuality(reference.routing, observations.routing);
  const evaluationStatus = [search.status, routing.status].includes('FAIL')
    ? 'FAIL'
    : [search.status, routing.status].includes('NOT_RUN')
      ? 'NOT_RUN'
      : 'PASS';
  const synthetic = [reference.search.dataset.kind, reference.routing.dataset.kind].includes(
    'synthetic',
  );
  return {
    schemaVersion: 1,
    status: evaluationStatus === 'PASS' && synthetic ? 'NON_ACCEPTANCE' : evaluationStatus,
    evaluationStatus,
    releaseAcceptance: false,
    originVerification:
      'operator-attested-reference-and-observations-not-independent-original-proof',
    evaluatedAt: now.toISOString(),
    observedAt: observations.observedAt,
    sourceCommit: observations.sourceCommit,
    referenceSha256: options.referenceSha256,
    datasets: Object.fromEntries(
      ['search', 'routing'].map((domain) => [
        domain,
        {
          kind: reference[domain].dataset.kind,
          sourceId:
            reference[domain].dataset.kind === 'synthetic'
              ? 'authored-synthetic'
              : reference[domain].dataset.sourceId,
          sourceUrl: reference[domain].dataset.sourceUrl,
          license: reference[domain].dataset.license,
          sha256: reference[domain].dataset.sha256,
          dataAsOf: reference[domain].dataset.dataAsOf,
        },
      ]),
    ),
    search,
    routing,
    privacy:
      'aggregate-only; no queries, result IDs, addresses, coordinates, service endpoints or raw provider errors',
    limits:
      'Local offline evaluation; not nationwide recall, field access/safety, live traffic, source licensing proof or release approval. Latencies are operator-recorded, not independently measured by this evaluator.',
  };
}

async function saveReport(report) {
  await mkdir(storage, { recursive: true, mode: 0o700 });
  const target = resolve(storage, 'report.json');
  const temporary = resolve(storage, `report-${process.pid}.tmp`);
  await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600, flag: 'w' });
  await rename(temporary, target);
}
async function main() {
  const attemptedAt = new Date().toISOString();
  let report;
  try {
    if (!process.argv[2]) {
      report = {
        status: 'NOT_RUN',
        releaseAcceptance: false,
        attemptedAt,
        reason: 'IGNORED_OPERATOR_CONFIG_REQUIRED',
      };
    } else {
      const decode = (bytes) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      const config = decode(await readOperatorFile(process.argv[2], 65536, storage));
      check(config.operatorOptIn === true, 'OPERATOR_OPT_IN_REQUIRED');
      const bytes = await readOperatorFile(config.referenceFile, 2 * 1024 * 1024, storage);
      const observed = await readOperatorFile(config.observationsFile, 10 * 1024 * 1024, storage);
      report = evaluateServiceQuality(decode(bytes), decode(observed), {
        referenceSha256: createHash('sha256').update(bytes).digest('hex'),
        catalog: JSON.parse(await readFile(resolve(root, 'data/sources.json'), 'utf8')),
      });
      report.observationsSha256 = createHash('sha256').update(observed).digest('hex');
      report.evaluatorSha256 = createHash('sha256')
        .update(await readFile(fileURLToPath(import.meta.url)))
        .digest('hex');
    }
  } catch (error) {
    report = {
      status: 'FAIL',
      releaseAcceptance: false,
      attemptedAt,
      reason: error instanceof QualityInputError ? error.message : 'INPUT_READ_OR_PARSE_FAILED',
    };
  }
  await saveReport(report);
  console.log(JSON.stringify(report));
  process.exitCode = report.status === 'PASS' ? 0 : report.status === 'FAIL' ? 1 : 2;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error(
      JSON.stringify({
        status: 'FAIL',
        releaseAcceptance: false,
        reason: 'QUALITY_REPORT_WRITE_FAILED',
      }),
    );
    process.exitCode = 1;
  });
}
