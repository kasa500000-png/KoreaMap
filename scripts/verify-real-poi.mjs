import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createReadStream } from 'node:fs';
import { mkdir, lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const storage = resolve(root, 'artifacts/real-poi');
const maxBytes = 10 * 1024 * 1024;
const profiles = new Map([
  ['yongsan-parking', { category: 'parking', srid: 4326 }],
  ['mois-animal-hospitals', { category: 'pet_facility', srid: 5174 }],
  ['bukgu-walking', { category: 'trail', srid: null }],
]);
const serviceRequire = createRequire(new URL('../services/geo-data/package.json', import.meta.url));

class VerificationError extends Error {}
function check(value, code) {
  if (!value) throw new VerificationError(code);
}
function inside(base, file) {
  const path = relative(base, file);
  return (
    path !== '' &&
    path !== '..' &&
    !path.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) &&
    !isAbsolute(path)
  );
}

/** Operator files must be bounded regular files below the ignored real-poi directory. */
export async function readOperatorFile(file, limit, directory = storage) {
  const absolute = resolve(file);
  const base = await realpath(directory);
  check(inside(base, absolute), 'USE_IGNORED_REAL_POI_STORAGE');
  const info = await lstat(absolute);
  check(info.isFile() && !info.isSymbolicLink(), 'REGULAR_OPERATOR_FILE_REQUIRED');
  check(inside(base, await realpath(absolute)), 'OPERATOR_SYMLINK_ESCAPE');
  check(info.size <= limit, 'OPERATOR_FILE_TOO_LARGE');
  const chunks = [];
  let size = 0;
  for await (const chunk of createReadStream(absolute)) {
    size += chunk.byteLength;
    check(size <= limit, 'OPERATOR_FILE_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function validateEvidence(config, catalog, now = new Date()) {
  const source = catalog.sources?.find((candidate) => candidate.id === config.sourceId);
  const profile = profiles.get(config.sourceId);
  check(source && profile, 'SUPPORTED_REAL_CSV_SOURCE_REQUIRED');
  check(
    config.operatorOptIn === true && config.realSourceAcknowledged === true,
    'REAL_SOURCE_OPT_IN_REQUIRED',
  );
  check(config.sourcePageUrl === source.sourceUrl, 'EXACT_SOURCE_PAGE_REQUIRED');
  check(config.reviewedLicense === source.license, 'REVIEWED_LICENSE_REQUIRED');
  check(
    Array.isArray(config.expectedHeader) &&
      config.expectedHeader.length > 1 &&
      config.expectedHeader.length < 256,
    'EXACT_HEADER_REQUIRED',
  );
  check(
    config.expectedHeader.every(
      (value) => typeof value === 'string' && value.length > 0 && value.length <= 200,
    ),
    'INVALID_EXPECTED_HEADER',
  );
  check(
    new Set(config.expectedHeader).size === config.expectedHeader.length,
    'DUPLICATE_EXPECTED_HEADER',
  );
  const acquired = Date.parse(config.retrievedAt);
  check(Number.isFinite(acquired) && acquired <= now.getTime(), 'VALID_RETRIEVAL_TIME_REQUIRED');
  const url = new URL(config.originalUrl);
  const official = new URL(source.sourceUrl);
  const allowed = [official.hostname];
  if (source.id === 'mois-animal-hospitals') allowed.push('file.localdata.go.kr');
  check(
    url.protocol === 'https:' &&
      allowed.includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      !/(?:key|token|secret|password|signature|credential)/iu.test(url.search),
    'OFFICIAL_KEYLESS_ORIGINAL_URL_REQUIRED',
  );
  // A portal detail page is evidence, not the downloaded CSV itself.
  check(
    url.href !== source.sourceUrl && !url.pathname.endsWith('/info'),
    'DIRECT_ORIGINAL_FILE_URL_REQUIRED',
  );
  check(
    typeof config.sourceFile === 'string' && config.sourceFile.length > 0,
    'SOURCE_FILE_REQUIRED',
  );
  const points = config.controlPoints ?? [];
  check(Array.isArray(points) && points.length <= 20, 'INVALID_CONTROL_POINTS');
  if (profile.srid !== null) check(points.length > 0, 'REAL_LOCATION_CONTROL_POINT_REQUIRED');
  else check(points.length === 0, 'UNLOCATED_SOURCE_HAS_NO_CONTROL_POINTS');
  for (const point of points) {
    check(
      typeof point.source_id === 'string' && point.source_id.length > 0,
      'CONTROL_SOURCE_ID_REQUIRED',
    );
    check(
      Array.isArray(point.wgs84) &&
        point.wgs84.length === 2 &&
        point.wgs84.every(Number.isFinite) &&
        point.wgs84[0] >= 124 &&
        point.wgs84[0] <= 132 &&
        point.wgs84[1] >= 33 &&
        point.wgs84[1] <= 39,
      'KOREAN_WGS84_CONTROL_POINT_REQUIRED',
    );
    check(
      Number.isFinite(point.toleranceMeters) &&
        point.toleranceMeters > 0 &&
        point.toleranceMeters <= 30,
      'CONTROL_TOLERANCE_AT_MOST_30_METERS',
    );
    check(
      typeof point.referenceNote === 'string' && point.referenceNote.trim().length >= 24,
      'INDEPENDENT_CONTROL_REFERENCE_REQUIRED',
    );
  }
  check(
    new Set(points.map((point) => point.source_id)).size === points.length,
    'DUPLICATE_CONTROL_SOURCE_ID',
  );
  return { source, profile, points };
}

/** Only a deliberately created, empty-schema local DB may receive verification imports. */
export function validateSmokeDatabase(connection, acknowledged) {
  check(acknowledged === 'disposable-real-poi', 'DISPOSABLE_DATABASE_ACK_REQUIRED');
  const url = new URL(connection);
  check(
    ['postgres:', 'postgresql:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      /^\/kmk_real_poi(?:_[a-z0-9]+)?$/u.test(url.pathname),
    'DEDICATED_LOOPBACK_DATABASE_REQUIRED',
  );
  check(
    !url.search && !url.hash && url.username && url.password,
    'INVALID_LOCAL_DATABASE_CONFIGURATION',
  );
}

async function inspect(configPath) {
  const config = JSON.parse((await readOperatorFile(configPath, 65536)).toString('utf8'));
  const catalog = JSON.parse(await readFile(resolve(root, 'data/sources.json'), 'utf8'));
  const evidence = validateEvidence(config, catalog);
  const { admitSource, prepareCsv } = await import('../services/geo-data/dist/index.js');
  admitSource(catalog, config.sourceId, config.operatorOptIn);
  const bytes = await readOperatorFile(config.sourceFile, maxBytes);
  const { parse } = serviceRequire('csv-parse/sync');
  const header = parse(new TextDecoder(config.encoding, { fatal: true }).decode(bytes), {
    bom: true,
    skip_empty_lines: true,
    max_record_size: 65536,
    to: 1,
  })[0];
  check(
    JSON.stringify(header) === JSON.stringify(config.expectedHeader),
    'ORIGINAL_HEADER_MISMATCH',
  );
  const prepared = prepareCsv(catalog, config, bytes);
  check(prepared.synthetic === false && prepared.rows.length > 0, 'REAL_SOURCE_ROWS_REQUIRED');
  for (const point of evidence.points) {
    const row = prepared.rows.find((candidate) => candidate.place.source_id === point.source_id);
    check(row?.projected, 'CONTROL_POINT_NOT_IN_SOURCE');
  }
  return { config, prepared, ...evidence };
}

async function smoke(input) {
  check(input.prepared.rows.length <= 5000, 'SMOKE_MAX_5000_ROWS');
  validateSmokeDatabase(process.env.GEO_DATABASE_URL, process.env.KMK_REAL_POI_DATABASE_ACK);
  const geo = await import('../services/geo-data/dist/index.js');
  const search = await import('../services/search/dist/index.js');
  const { postgisNamespace } = await import('../services/geo-data/dist/database.js');
  const core = await import('../packages/core/dist/index.js');
  const admin = geo.openDatabase(process.env.GEO_DATABASE_URL);
  let writer, reader;
  try {
    check(
      (await admin.query("SELECT to_regnamespace('kmk') AS schema")).rows[0].schema === null,
      'EMPTY_DATABASE_SCHEMA_REQUIRED',
    );
    await geo.migrate(admin);
    await search.migrateSearch(admin);
    writer = geo.openDatabase(process.env.GEO_DATABASE_URL, 'kmk_writer');
    reader = geo.openDatabase(process.env.GEO_DATABASE_URL, 'kmk_reader');
    const result = await geo.importPlaces(writer, input.prepared);
    const repeat = await geo.importPlaces(writer, input.prepared);
    assert.equal(result.total, input.prepared.rows.length);
    assert.equal(repeat.total, result.total);
    const count = await reader.query('SELECT count(*)::integer AS total FROM kmk.places');
    assert.equal(count.rows[0].total, input.prepared.rows.length);
    const g = await postgisNamespace(admin);
    for (const point of input.points) {
      const distance = await reader.query(
        `SELECT ${g}.ST_Distance(location,${g}.ST_SetSRID(${g}.ST_MakePoint($1,$2),4326)::${g}.geography) AS meters FROM kmk.places WHERE source=$3 AND source_id=$4`,
        [...point.wgs84, input.source.id, point.source_id],
      );
      check(
        Number.isFinite(distance.rows[0]?.meters) &&
          distance.rows[0].meters <= point.toleranceMeters,
        'REAL_CONTROL_POINT_FAILED',
      );
    }
    const scheduler = {
      schedule(fn, ms) {
        const timer = globalThis.setTimeout(fn, ms);
        return () => globalThis.clearTimeout(timer);
      },
    };
    const places = core.createPlacesClient(
      await geo.createPostgisPlacesProvider(reader),
      scheduler,
    );
    const sample = (
      await places.getPlacesByCategory({ category: input.profile.category, limit: 1 })
    )[0];
    check(
      sample?.source === input.source.id &&
        sample.license === input.source.license &&
        sample.attribution === input.source.attribution,
      'SOURCE_PROVENANCE_NOT_PRESERVED',
    );
    if (sample.location) {
      const nearby = await places.getNearbyPlaces({
        center: sample.location,
        category: input.profile.category,
        radiusMeters: 50,
      });
      check(
        nearby.some((place) => place.id === sample.id),
        'SDK_NEARBY_MISSING_IMPORTED_RECORD',
      );
      const [x, y] = sample.location;
      const inBounds = await places.getPlacesInBounds({
        category: input.profile.category,
        bounds: { west: x - 0.001, east: x + 0.001, south: y - 0.001, north: y + 0.001 },
      });
      check(
        inBounds.some((place) => place.id === sample.id),
        'SDK_BOUNDS_MISSING_IMPORTED_RECORD',
      );
    }
    const provider = await search.createPostgisSearchProvider(reader);
    const hits = await provider.searchPage({
      text: sample.name,
      language: 'ko',
      category: input.profile.category,
      limit: 50,
      ...(sample.location ? { center: sample.location, radiusMeters: 50 } : {}),
    });
    check(
      hits.hits.some(
        (hit) =>
          hit.place.id === sample.id &&
          hit.place.source === input.source.id &&
          hit.place.license === input.source.license,
      ),
      'SDK_SEARCH_MISSING_IMPORTED_RECORD',
    );
    return {
      database: 'passed',
      sdkSearch: 'passed',
      sdkCategory: 'passed',
      sdkSpatial: sample.location ? 'passed' : 'not-applicable-no-coordinates',
      locationControlPoints: input.points.length,
      repeatedImport: 'passed',
    };
  } finally {
    await Promise.all([writer?.end(), reader?.end(), admin.end()]);
  }
}

async function probe() {
  const catalog = JSON.parse(await readFile(resolve(root, 'data/sources.json'), 'utf8'));
  const { admitSource } = await import('../services/geo-data/dist/index.js');
  const results = [];
  for (const id of profiles.keys()) {
    const source = admitSource(catalog, id, true);
    const controller = new globalThis.AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), 25000);
    try {
      const response = await globalThis.fetch(source.sourceUrl, {
        redirect: 'error',
        credentials: 'omit',
        signal: controller.signal,
        headers: { Accept: 'text/html' },
      });
      results.push({
        source: id,
        sourcePageUrl: source.sourceUrl,
        checkedAt: new Date().toISOString(),
        status: response.status,
        contentType: response.headers.get('content-type'),
        result: response.ok ? 'page-only-not-original-csv' : 'http-error',
      });
      await response.body?.cancel();
    } catch {
      results.push({
        source: id,
        sourcePageUrl: source.sourceUrl,
        checkedAt: new Date().toISOString(),
        status: null,
        result: 'network-timeout-or-redirect-error',
      });
    } finally {
      globalThis.clearTimeout(timer);
    }
  }
  await writeFile(resolve(storage, 'portal-probe.json'), `${JSON.stringify(results, null, 2)}\n`, {
    mode: 0o600,
  });
  console.log(JSON.stringify({ status: 'probed-official-pages-only', results }));
  if (results.some((result) => result.status !== 200)) process.exitCode = 1;
}

export async function main(args = process.argv.slice(2)) {
  const [command, configPath, ...extra] = args;
  check(
    ['probe', 'validate', 'smoke'].includes(command) && extra.length === 0,
    'USE_PROBE_OR_VALIDATE_SMOKE_CONFIG_PATH',
  );
  check(
    command === 'probe' ? !configPath : Boolean(configPath),
    'CONFIG_PATH_REQUIRED_FOR_FILE_VERIFICATION',
  );
  await mkdir(storage, { recursive: true, mode: 0o700 });
  if (command === 'probe') return probe();
  const output = resolve(storage, 'verification.json');
  const attempt = { checkedAt: new Date().toISOString(), command, status: 'running' };
  await writeFile(output, `${JSON.stringify(attempt, null, 2)}\n`, { mode: 0o600 });
  try {
    const input = await inspect(configPath);
    const report = {
      ...attempt,
      status: 'file-validated-only',
      source: input.source.id,
      sourcePageUrl: input.source.sourceUrl,
      license: input.source.license,
      sha256: input.prepared.sha256,
      rows: input.prepared.rows.length,
      header: 'exact-operator-reviewed-match',
      provenance: 'operator-attested-original-file-not-independent-download-proof',
      fileValidation: 'passed',
      database: 'not-executed',
      sdkSearch: 'not-executed',
      sdkSpatial: 'not-executed',
      locationControlPoints: 'not-executed',
    };
    if (command === 'smoke') {
      Object.assign(report, await smoke(input));
      report.status = 'database-smoke-passed';
    }
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify(report));
  } catch (error) {
    await writeFile(
      output,
      `${JSON.stringify({ ...attempt, status: 'failed', detail: error instanceof VerificationError ? error.message : 'READ_PARSE_DATABASE_OR_SERVICE_FAILURE' }, null, 2)}\n`,
      { mode: 0o600 },
    );
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    // Do not print raw parser/DB errors, paths, source fields, coordinates or connection strings.
    console.error(
      JSON.stringify({
        code: 'REAL_POI_VERIFICATION_FAILED',
        detail:
          error instanceof VerificationError
            ? error.message
            : 'READ_PARSE_DATABASE_OR_SERVICE_FAILURE',
        help: 'Check ignored operator config, exact source/header/hash, location controls and dedicated empty loopback DB; see docs/research/real-poi-validation.md.',
      }),
    );
    process.exitCode = 1;
  });
}
