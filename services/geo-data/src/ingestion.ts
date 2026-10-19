import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import {
  KitError,
  validatePublicPlace,
  type PoiCategory,
  type PublicPlace,
} from '@korea-map-kit/core';

export const MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024;
export interface CsvImportConfig {
  readonly sourceId: string;
  readonly operatorOptIn: true;
  readonly sha256: string;
  readonly snapshotUpdatedAt: string;
  readonly encoding: 'utf-8' | 'euc-kr';
  readonly columns: {
    readonly name: string;
    readonly address: string;
    readonly source_id?: string;
    readonly x?: string;
    readonly y?: string;
    readonly status?: string;
  };
}
interface Source {
  id: string;
  sourceUrl: string;
  grade: string;
  collectionEligible: boolean;
  defaultEnabled: boolean;
  reviewedAt: string;
  reviewBy: string;
  license: string;
  attribution: string;
  rights: Record<string, string>;
  crs: { status: string; value: string | null };
}
export interface ImportRow {
  readonly place: PublicPlace;
  readonly projected: readonly [number, number] | null;
  readonly srid: number;
}
export interface PreparedImport {
  readonly source: string;
  readonly sha256: string;
  readonly rows: readonly ImportRow[];
  readonly duplicates: number;
  readonly synthetic: boolean;
  readonly reviewBy?: string;
}
const admitted = new WeakSet<PreparedImport>();
const profiles: Record<
  string,
  { category: PoiCategory; srid: number | null; requiresId: boolean }
> = {
  'yongsan-parking': { category: 'parking', srid: 4326, requiresId: false },
  'mois-animal-hospitals': { category: 'pet_facility', srid: 5174, requiresId: true },
  'bukgu-walking': { category: 'trail', srid: null, requiresId: false },
};
function fail(code: string): never {
  throw new KitError('INVALID_ARGUMENT', code);
}
export function digest(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}
export function admitSource(
  catalog: unknown,
  sourceId: string,
  optIn: boolean,
  now = new Date(),
): Source {
  if (optIn !== true) fail('OPERATOR_OPT_IN_REQUIRED');
  const c = catalog as {
    schemaVersion?: unknown;
    policy?: { defaultNetwork?: unknown };
    sources?: Source[];
  } | null;
  if (c?.schemaVersion !== 1 || c.policy?.defaultNetwork !== false || !Array.isArray(c.sources))
    fail('INVALID_CATALOG');
  const source = c.sources.find((s) => s.id === sourceId);
  if (
    !source ||
    source.grade !== 'A' ||
    source.collectionEligible !== true ||
    source.defaultEnabled !== false
  )
    fail('SOURCE_NOT_APPROVED_FOR_STORAGE');
  const day = now.toISOString().slice(0, 10);
  for (const date of [source.reviewedAt, source.reviewBy]) {
    if (!Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)
      fail('INVALID_REVIEW_DATE');
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(source.reviewedAt) ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(source.reviewBy) ||
    source.reviewedAt > day ||
    source.reviewBy < day ||
    Date.parse(source.reviewBy) - Date.parse(source.reviewedAt) > 90 * 86400000
  )
    fail('SOURCE_REVIEW_EXPIRED');
  if (
    !source.rights ||
    !['commercial', 'store', 'modify', 'redistribute'].every(
      (k) => source.rights[k] === 'allowed',
    ) ||
    source.license !== 'LicenseRef-DataGo-Unrestricted'
  )
    fail('SOURCE_RIGHTS_NOT_SUPPORTED');
  const profile = profiles[sourceId];
  if (!Object.hasOwn(profiles, sourceId) || !profile) fail('SOURCE_PROFILE_NOT_IMPLEMENTED');
  const official = new URL(source.sourceUrl);
  if (
    official.protocol !== 'https:' ||
    official.hostname !== 'www.data.go.kr' ||
    official.username ||
    official.password ||
    official.search ||
    official.hash ||
    official.port
  )
    fail('SOURCE_URL_NOT_APPROVED');
  if (
    profile.srid === null
      ? source.crs.status !== 'not-applicable' || source.crs.value !== null
      : source.crs.status !== 'confirmed' || source.crs.value !== `EPSG:${profile.srid}`
  )
    fail('SOURCE_CRS_NOT_VERIFIED');
  return structuredClone(source);
}
/** URL is operator-reviewed for this exact dataset/snapshot. No redirects, keys, cookies or automatic portal scraping. */
export async function downloadCsv(
  catalog: unknown,
  config: CsvImportConfig,
  downloadUrl: string,
  now = new Date(),
): Promise<Uint8Array> {
  const source = admitSource(catalog, config.sourceId, config.operatorOptIn, now);
  validateConfig(config, now);
  const url = new URL(downloadUrl);
  const hosts = [new URL(source.sourceUrl).hostname];
  if (source.id === 'mois-animal-hospitals') hosts.push('file.localdata.go.kr');
  if (
    url.protocol !== 'https:' ||
    !hosts.includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    /(?:key|token|secret|password|signature|credential)/iu.test(url.search)
  )
    fail('DOWNLOAD_URL_NOT_APPROVED');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'error',
      credentials: 'omit',
      headers: { Accept: 'text/csv,application/octet-stream' },
    });
    if (
      !response.ok ||
      !response.body ||
      Number(response.headers.get('content-length') ?? 0) > MAX_DOWNLOAD_BYTES ||
      /(?:html|xml|json)/iu.test(response.headers.get('content-type') ?? '')
    ) {
      await response.body?.cancel().catch(() => {});
      fail('DOWNLOAD_RESPONSE_REJECTED');
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        length += next.value.byteLength;
        if (length > MAX_DOWNLOAD_BYTES) fail('DOWNLOAD_TOO_LARGE');
        chunks.push(next.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const bytes = Buffer.concat(chunks);
    if (digest(bytes) !== config.sha256) fail('SNAPSHOT_HASH_MISMATCH');
    return bytes;
  } catch (e) {
    if (e instanceof KitError) throw e;
    throw new KitError('UNAVAILABLE', 'DOWNLOAD_FAILED');
  } finally {
    clearTimeout(timeout);
  }
}
function validateConfig(config: CsvImportConfig, now: Date): void {
  if (!/^[0-9a-f]{64}$/u.test(config.sha256)) fail('SNAPSHOT_HASH_REQUIRED');
  if (!['utf-8', 'euc-kr'].includes(config.encoding)) fail('UNSUPPORTED_ENCODING');
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(config.snapshotUpdatedAt) ||
    !Number.isFinite(Date.parse(config.snapshotUpdatedAt)) ||
    new Date(config.snapshotUpdatedAt).toISOString() !== config.snapshotUpdatedAt ||
    Date.parse(config.snapshotUpdatedAt) > now.getTime()
  )
    fail('INVALID_SNAPSHOT_DATE');
  const columns = config.columns;
  if (
    !columns ||
    !columns.name ||
    !columns.address ||
    Object.keys(columns).some(
      (k) => !['name', 'address', 'source_id', 'x', 'y', 'status'].includes(k),
    )
  )
    fail('INVALID_COLUMN_MAPPING');
  const fields = Object.values(columns);
  if (
    fields.some((v) => typeof v !== 'string' || !v || v.length > 200) ||
    new Set(fields).size !== fields.length
  )
    fail('INVALID_COLUMN_MAPPING');
}
export function prepareCsv(
  catalog: unknown,
  config: CsvImportConfig,
  bytes: Uint8Array,
  now = new Date(),
): PreparedImport {
  const source = admitSource(catalog, config.sourceId, config.operatorOptIn, now);
  validateConfig(config, now);
  if (bytes.byteLength > MAX_DOWNLOAD_BYTES || digest(bytes) !== config.sha256)
    fail('SNAPSHOT_HASH_MISMATCH');
  const profile = profiles[source.id]!;
  if (profile.requiresId && !config.columns.source_id) fail('SOURCE_ID_COLUMN_REQUIRED');
  if (
    profile.srid === null
      ? config.columns.x !== undefined || config.columns.y !== undefined
      : !config.columns.x || !config.columns.y
  )
    fail('COORDINATE_MAPPING_REQUIRED');
  if (source.id === 'mois-animal-hospitals' && !config.columns.status)
    fail('BUSINESS_STATUS_REQUIRED');
  let table: string[][];
  try {
    table = parse(new TextDecoder(config.encoding, { fatal: true }).decode(bytes), {
      bom: true,
      skip_empty_lines: true,
      max_record_size: 65536,
      relax_column_count: false,
      to: 100002,
    }) as string[][];
  } catch {
    fail('INVALID_CSV');
  }
  const header = table.shift();
  if (!header || new Set(header).size !== header.length || !table.length || table.length > 100000)
    fail('INVALID_CSV_HEADER_OR_ROW_COUNT');
  for (const column of Object.values(config.columns))
    if (!header.includes(column)) fail('MISSING_REQUIRED_COLUMN');
  const rows = new Map<string, ImportRow>();
  let duplicates = 0;
  for (const values of table) {
    const get = (column: string | undefined) =>
      column === undefined ? '' : (values[header.indexOf(column)] ?? '').trim().normalize('NFC');
    const name = get(config.columns.name),
      address = get(config.columns.address);
    if (!name || !address) fail('MISSING_IDENTITY_FIELD');
    const sourceId = config.columns.source_id
      ? get(config.columns.source_id)
      : digest(`${name}\n${address}`);
    let projected: [number, number] | null = null;
    if (profile.srid !== null) {
      const rawX = get(config.columns.x),
        rawY = get(config.columns.y);
      if (rawX || rawY) {
        if (!/^-?\d+(?:\.\d+)?$/u.test(rawX) || !/^-?\d+(?:\.\d+)?$/u.test(rawY))
          fail('INVALID_COORDINATE');
        projected = [Number(rawX), Number(rawY)];
        if (
          !projected.every(Number.isFinite) ||
          projected.some((v) => Math.abs(v) > 100000000) ||
          (projected[0] === 0 && projected[1] === 0)
        )
          fail('INVALID_COORDINATE');
      }
    }
    const status = get(config.columns.status);
    if (config.columns.status && (!status || status.length > 128)) fail('INVALID_BUSINESS_STATUS');
    const place = validatePublicPlace({
      id: `${source.id}:${digest(sourceId)}`,
      name,
      category: profile.category,
      location: profile.srid === 4326 ? projected : null,
      address,
      source: source.id,
      source_id: sourceId,
      license: source.license,
      attribution: source.attribution,
      updated_at: config.snapshotUpdatedAt,
      metadata: {
        snapshot_sha256: config.sha256,
        source_url: source.sourceUrl,
        source_crs: profile.srid === null ? null : `EPSG:${profile.srid}`,
        ...(status ? { business_status: status } : {}),
      },
    });
    const row = { place, projected, srid: profile.srid ?? 4326 };
    const previous = rows.get(sourceId);
    if (previous) {
      if (JSON.stringify(previous) !== JSON.stringify(row)) fail('CONFLICTING_DUPLICATE_ID');
      duplicates++;
    } else rows.set(sourceId, row);
  }
  return registerImport({
    source: source.id,
    sha256: config.sha256,
    rows: [...rows.values()],
    duplicates,
    synthetic: false,
    reviewBy: source.reviewBy,
  });
}
export function assertPrepared(input: PreparedImport): void {
  if (!admitted.has(input)) fail('IMPORT_NOT_ADMITTED');
  if (
    !input.synthetic &&
    (!input.reviewBy || input.reviewBy < new Date().toISOString().slice(0, 10))
  )
    fail('SOURCE_REVIEW_EXPIRED');
}
/** Internal module seam for the authored fixture; CLI never accepts arbitrary pre-normalized rows. */
export function registerImport(input: PreparedImport): PreparedImport {
  const frozen = structuredClone(input);
  function freeze(value: unknown): void {
    if (value && typeof value === 'object') {
      Object.freeze(value);
      for (const child of Object.values(value)) freeze(child);
    }
  }
  freeze(frozen);
  admitted.add(frozen);
  return frozen;
}
