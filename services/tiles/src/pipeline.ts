import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statfsSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { open } from 'node:fs/promises';
import { dirname, delimiter, resolve } from 'node:path';
import { freemem } from 'node:os';
import { inspectArchive, pbfTimestamp, type ArchiveInfo } from './archive.js';
import {
  contained,
  invariant,
  planetiler,
  readBoundedFile,
  readCatalogSource,
  realContained,
  regionName,
  regions,
  sha256,
  shaText,
  sourceEligibility,
  archiveCapabilities,
  tileSchema,
  type Region,
  type TileSchema,
  type TileCapabilities,
} from './config.js';

const MAX_SOURCE_BYTES = 512 * 1024 ** 2;
const MAX_ARCHIVE_BYTES = 16 * 1024 ** 3;
const SOURCE_URL = 'https://download.geofabrik.de/asia/south-korea-latest.osm.pbf';
const generationPattern = /^[0-9]{13}-[a-f0-9]{8}$/;
const checksumPattern = /^[a-f0-9]{64}$/;
interface GenerationBase {
  generation: string;
  region: Region;
  bounds: readonly number[];
  source: {
    id: 'osm-geofabrik-kr';
    sha256: string;
    dataAsOf: string;
    license: 'ODbL-1.0';
    catalogSha256: string;
  };
  tool: { version: string; sha256: string; profileSha256: string };
  archive: ArchiveInfo & { file: 'base.mbtiles'; sha256: string; bytes: number };
  metrics: {
    elapsedMs: number;
    maxHeapMiB: number;
    availableMemoryBefore: number;
    freeDiskBefore: number;
  };
}
export type Generation = GenerationBase &
  (
    | { schemaVersion: 1; schema: 'design-v1' }
    | {
        schemaVersion: 2;
        schema: 'design-v2';
        schemaRevision: 1;
        capabilities: TileCapabilities;
        sources: GenerationBase['source'][];
      }
  );
export interface BuildOptions {
  root: string;
  store: string;
  region: Region;
  input: string;
  expectedSha256: string;
  operatorOptIn: boolean;
  jar: string;
  java: string;
  javac: string;
  maxzoom: number;
  heapMiB: number;
  signal?: AbortSignal;
  timeoutMs?: number;
  schema?: TileSchema;
}
/** The explicit national overview does not relax detailed Korea resource gates. */
export function buildLimits(
  region: Region,
  schema: TileSchema,
  maxzoom: number,
): { minimumDisk: number } {
  regionName(region);
  tileSchema(schema);
  invariant(
    Number.isInteger(maxzoom) && maxzoom >= 0 && maxzoom <= (schema === 'design-v2' ? 16 : 14),
    'ZOOM_LIMIT',
  );
  invariant(region !== 'context' || (schema === 'design-v2' && maxzoom <= 9), 'CONTEXT_ZOOM_LIMIT');
  return {
    minimumDisk:
      region === 'korea' ? 8 * 1024 ** 3 : region === 'context' ? 1024 ** 3 : 512 * 1024 ** 2,
  };
}
export function executeTileTool(
  command: string,
  args: string[],
  cwd: string,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  return new Promise((ok, fail) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: false,
      signal,
      killSignal: 'SIGKILL',
    });
    let failure: Error | undefined;
    child.once('error', () => {
      failure = new Error(signal.aborted ? 'TILE_BUILD_CANCELLED' : 'TILE_TOOL_UNAVAILABLE');
    });
    child.once('close', (code) => {
      if (failure) fail(failure);
      else if (signal.aborted) fail(new Error('TILE_BUILD_CANCELLED'));
      else if (code === 0) ok();
      else fail(new Error('TILE_TOOL_FAILED'));
    });
  });
}
export interface DownloadOptions {
  url: string;
  file: string;
  expectedSha256: string;
  maxBytes: number;
  operatorOptIn: boolean;
  signal?: AbortSignal;
  toolRedirects?: boolean;
  validate?: (file: string) => void;
}
/** Explicit operator download; no defaults are contacted on import, build or SDK use. */
export async function downloadVerifiedFile(options: DownloadOptions): Promise<void> {
  invariant(options.operatorOptIn, 'OPERATOR_OPT_IN_REQUIRED');
  invariant(checksumPattern.test(options.expectedSha256), 'INPUT_CHECKSUM_REQUIRED');
  invariant(
    Number.isSafeInteger(options.maxBytes) &&
      options.maxBytes > 0 &&
      options.maxBytes <= MAX_SOURCE_BYTES,
    'DOWNLOAD_LIMIT_REQUIRED',
  );
  if (existsSync(options.file)) {
    invariant(
      (await sha256(options.file, options.maxBytes, options.signal)) === options.expectedSha256,
      'DOWNLOAD_CHECKSUM_MISMATCH',
    );
    options.validate?.(options.file);
    return;
  }
  mkdirSync(dirname(options.file), { recursive: true });
  const temporary = `${options.file}.partial-${randomBytes(8).toString('hex')}`;
  const signal = AbortSignal.any([
    AbortSignal.timeout(120000),
    ...(options.signal ? [options.signal] : []),
  ]);
  let response: Response | undefined;
  let output: Awaited<ReturnType<typeof open>> | undefined;
  try {
    let url = new URL(options.url);
    for (let redirects = 0; ; redirects++) {
      signal.throwIfAborted();
      invariant(
        url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash,
        'INVALID_DOWNLOAD_URL',
      );
      if (options.toolRedirects)
        invariant(
          [
            'github.com',
            'release-assets.githubusercontent.com',
            'objects.githubusercontent.com',
          ].includes(url.hostname),
          'TOOL_REDIRECT_NOT_ALLOWED',
        );
      response = await fetch(url, { redirect: 'manual', signal });
      if (response.status < 300 || response.status >= 400) break;
      await response.body?.cancel();
      invariant(options.toolRedirects === true && redirects < 4, 'DOWNLOAD_REDIRECT_NOT_ALLOWED');
      const next = response.headers.get('location');
      invariant(next, 'DOWNLOAD_REDIRECT_NOT_ALLOWED');
      url = new URL(next, url);
    }
    invariant(response.ok && response.body, 'DOWNLOAD_FAILED');
    const length = response.headers.get('content-length');
    if (length !== null)
      invariant(
        /^\d+$/.test(length) && Number(length) > 0 && Number(length) <= options.maxBytes,
        'DOWNLOAD_TOO_LARGE',
      );
    output = await open(temporary, 'wx', 0o600);
    let size = 0;
    const hash = createHash('sha256');
    for await (const chunk of response.body) {
      signal.throwIfAborted();
      size += chunk.length;
      invariant(size <= options.maxBytes, 'DOWNLOAD_TOO_LARGE');
      hash.update(chunk);
      let offset = 0;
      while (offset < chunk.length) {
        const written = await output.write(chunk, offset, chunk.length - offset);
        invariant(written.bytesWritten > 0, 'DOWNLOAD_WRITE_FAILED');
        offset += written.bytesWritten;
      }
    }
    invariant(
      size > 0 && hash.digest('hex') === options.expectedSha256,
      'DOWNLOAD_CHECKSUM_MISMATCH',
    );
    await output.sync();
    await output.close();
    output = undefined;
    options.validate?.(temporary);
    signal.throwIfAborted();
    invariant(!existsSync(options.file), 'DOWNLOAD_TARGET_CHANGED');
    renameSync(temporary, options.file);
  } finally {
    try {
      await output?.close();
    } finally {
      await response?.body?.cancel().catch(() => undefined);
      rmSync(temporary, { force: true });
    }
  }
}
export async function downloadTool(
  file: string,
  optIn: boolean,
  signal?: AbortSignal,
): Promise<void> {
  await downloadVerifiedFile({
    url: planetiler.url,
    file,
    expectedSha256: planetiler.sha256,
    maxBytes: 120 * 1024 ** 2,
    operatorOptIn: optIn,
    toolRedirects: true,
    ...(signal ? { signal } : {}),
  });
}
export async function downloadSource(options: {
  root: string;
  store: string;
  expectedSha256: string;
  operatorOptIn: boolean;
  signal?: AbortSignal;
}): Promise<{ input: string; sha256: string; dataAsOf: string; manifestPath: string }> {
  invariant(options.operatorOptIn, 'OPERATOR_OPT_IN_REQUIRED');
  invariant(checksumPattern.test(options.expectedSha256), 'INPUT_CHECKSUM_REQUIRED');
  sourceEligibility(options.root);
  const catalog = readCatalogSource(options.root);
  mkdirSync(options.store, { recursive: true });
  const input = contained(options.store, 'source.pbf');
  let dataAsOf = '';
  await downloadVerifiedFile({
    url: SOURCE_URL,
    file: input,
    expectedSha256: options.expectedSha256,
    maxBytes: MAX_SOURCE_BYTES,
    operatorOptIn: true,
    ...(options.signal ? { signal: options.signal } : {}),
    validate: (file) => {
      dataAsOf = pbfTimestamp(file);
    },
  });
  const manifestPath = contained(options.store, 'source-manifest.json');
  const temporary = `${manifestPath}.${randomBytes(8).toString('hex')}.partial`;
  try {
    writeFileSync(
      temporary,
      `${JSON.stringify({ schemaVersion: 1, source: 'osm-geofabrik-kr', url: SOURCE_URL, catalogUrl: catalog.url, catalogSha256: catalog.catalogSha256, dataAsOf, license: catalog.license, attribution: catalog.attribution, sha256: options.expectedSha256, bytes: statSync(input).size, verified: true, verifiedAt: new Date().toISOString() }, null, 2)}\n`,
      { flag: 'wx', mode: 0o600 },
    );
    renameSync(temporary, manifestPath);
  } finally {
    rmSync(temporary, { force: true });
  }
  return { input, sha256: options.expectedSha256, dataAsOf, manifestPath };
}
export async function buildGeneration(options: BuildOptions): Promise<Generation> {
  invariant(options.operatorOptIn, 'OPERATOR_OPT_IN_REQUIRED');
  regionName(options.region);
  const schema = tileSchema(options.schema);
  const limits = buildLimits(options.region, schema, options.maxzoom);
  invariant(checksumPattern.test(options.expectedSha256), 'INPUT_CHECKSUM_REQUIRED');
  invariant(
    Number.isInteger(options.heapMiB) && options.heapMiB >= 512 && options.heapMiB <= 8192,
    'HEAP_LIMIT',
  );
  const timeout = options.timeoutMs ?? 5 * 60000;
  invariant(
    Number.isInteger(timeout) && timeout > 0 && timeout <= 15 * 60000,
    'BUILD_TIMEOUT_LIMIT',
  );
  const signal = AbortSignal.any([
    AbortSignal.timeout(timeout),
    ...(options.signal ? [options.signal] : []),
  ]);
  signal.throwIfAborted();
  sourceEligibility(options.root);
  const source = readCatalogSource(options.root);
  invariant(
    (await sha256(options.input, MAX_SOURCE_BYTES, signal)) === options.expectedSha256,
    'INPUT_CHECKSUM_MISMATCH',
  );
  const dataAsOf = pbfTimestamp(options.input);
  invariant(
    (await sha256(options.jar, 120 * 1024 ** 2, signal)) === planetiler.sha256,
    'TOOL_CHECKSUM_MISMATCH',
  );
  mkdirSync(options.store, { recursive: true });
  const disk = statfsSync(options.store),
    freeDisk = disk.bavail * disk.bsize;
  invariant(freeDisk >= limits.minimumDisk, 'INSUFFICIENT_TILE_DISK');
  invariant(freemem() > (options.heapMiB + 512) * 1024 ** 2, 'INSUFFICIENT_TILE_MEMORY');
  const name = `${Date.now()}-${randomBytes(4).toString('hex')}`;
  const directory = contained(options.store, `${options.region}/generations/${name}`);
  mkdirSync(directory, { recursive: true });
  const classes = contained(directory, 'classes');
  mkdirSync(classes);
  const mainClass = schema === 'design-v2' ? 'KoreaProfileV2' : 'KoreaProfile';
  const profile = resolve(options.root, `services/tiles/profile/${mainClass}.java`);
  const start = performance.now(),
    availableMemory = freemem();
  try {
    // Compile the exact bytes whose hash is recorded, even if checkout files change during a long build.
    const profileSource = readFileSync(profile);
    const profileSha256 = shaText(profileSource);
    const snapshot = contained(directory, `${mainClass}.java`);
    writeFileSync(snapshot, profileSource, { flag: 'wx', mode: 0o600 });
    await executeTileTool(
      options.javac,
      [
        '-proc:none',
        '-implicit:none',
        '-sourcepath',
        '',
        '-cp',
        resolve(options.jar),
        '-d',
        classes,
        snapshot,
      ],
      options.root,
      signal,
    );
    await executeTileTool(
      options.java,
      [
        `-Xmx${options.heapMiB}m`,
        '-cp',
        [classes, resolve(options.jar)].join(delimiter),
        mainClass,
        `--osm-path=${resolve(options.input)}`,
        `--output=${contained(directory, 'base.mbtiles')}`,
        `--bounds=${regions[options.region].bounds.join(',')}`,
        `--maxzoom=${options.maxzoom}`,
        '--minzoom=0',
        '--threads=2',
        '--nodemap-storage=ram',
        '--storage=ram',
        `--tmpdir=${contained(directory, 'tmp')}`,
      ],
      options.root,
      signal,
    );
    signal.throwIfAborted();
    invariant(shaText(readFileSync(profile)) === profileSha256, 'PROFILE_CHANGED_DURING_BUILD');
    const archiveFile = realContained(directory, 'base.mbtiles');
    invariant(
      statSync(archiveFile).size > 0 && statSync(archiveFile).size <= MAX_ARCHIVE_BYTES,
      'INVALID_ARCHIVE_SIZE',
    );
    const info = inspectArchive(archiveFile, schema);
    invariant(
      info.maxzoom === options.maxzoom && info.layers.includes('road'),
      'TILE_SMOKE_FAILED',
    );
    const primarySource: GenerationBase['source'] = {
      id: 'osm-geofabrik-kr',
      sha256: options.expectedSha256,
      dataAsOf,
      license: 'ODbL-1.0',
      catalogSha256: source.catalogSha256,
    };
    const generation: Generation = {
      ...(schema === 'design-v2'
        ? {
            schemaVersion: 2 as const,
            schema,
            schemaRevision: 1 as const,
            capabilities: archiveCapabilities(info.layers),
            sources: [primarySource],
          }
        : { schemaVersion: 1 as const, schema }),
      generation: name,
      region: options.region,
      bounds: regions[options.region].bounds,
      source: primarySource,
      tool: {
        version: planetiler.version,
        sha256: planetiler.sha256,
        profileSha256,
      },
      archive: {
        ...info,
        file: 'base.mbtiles',
        sha256: await sha256(archiveFile, MAX_ARCHIVE_BYTES, signal),
        bytes: statSync(archiveFile).size,
      },
      metrics: {
        elapsedMs: Math.round(performance.now() - start),
        maxHeapMiB: options.heapMiB,
        availableMemoryBefore: availableMemory,
        freeDiskBefore: freeDisk,
      },
    };
    signal.throwIfAborted();
    writeFileSync(
      contained(directory, 'manifest.json'),
      `${JSON.stringify(generation, null, 2)}\n`,
      { flag: 'wx', mode: 0o600 },
    );
    return generation;
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}
export async function verifyGeneration(
  store: string,
  region: Region,
  generation: string,
): Promise<{ directory: string; manifest: Generation }> {
  regionName(region);
  invariant(generationPattern.test(generation), 'INVALID_GENERATION');
  const directory = realContained(store, `${region}/generations/${generation}`);
  const manifest = JSON.parse(
    readBoundedFile(directory, 'manifest.json', 128 * 1024).toString('utf8'),
  ) as Generation;
  invariant(
    ((manifest?.schemaVersion === 1 && manifest.schema === 'design-v1') ||
      (manifest?.schemaVersion === 2 &&
        manifest.schema === 'design-v2' &&
        manifest.schemaRevision === 1)) &&
      manifest.region === region &&
      manifest.generation === generation &&
      manifest.archive?.file === 'base.mbtiles',
    'INVALID_GENERATION_MANIFEST',
  );
  buildLimits(region, manifest.schema, manifest.archive.maxzoom);
  if (manifest.schema === 'design-v2') {
    const expected = archiveCapabilities(manifest.archive.layers);
    invariant(
      manifest.capabilities &&
        JSON.stringify(Object.keys(manifest.capabilities).sort()) ===
          JSON.stringify(Object.keys(expected).sort()) &&
        Object.entries(expected).every(
          ([key, value]) => manifest.capabilities[key as keyof TileCapabilities] === value,
        ) &&
        manifest.capabilities.landmask === false &&
        manifest.capabilities.ocean === false,
      'UNREVIEWED_TILE_CAPABILITIES',
    );
    // Additional sources need their own reviewed ingestion before payload is accepted.
    const sourceKeys = ['id', 'sha256', 'dataAsOf', 'license', 'catalogSha256'] as const;
    const listedSource = manifest.sources?.[0];
    invariant(
      Array.isArray(manifest.sources) &&
        manifest.sources.length === 1 &&
        listedSource &&
        manifest.source &&
        Object.keys(listedSource).length === sourceKeys.length &&
        Object.keys(manifest.source).length === sourceKeys.length &&
        sourceKeys.every((key) => listedSource[key] === manifest.source[key]),
      'UNREVIEWED_GENERATION_SOURCES',
    );
  }
  const dataAsOf = manifest.source?.dataAsOf;
  invariant(
    typeof dataAsOf === 'string' &&
      Number.isFinite(Date.parse(dataAsOf)) &&
      new Date(dataAsOf).toISOString() === dataAsOf &&
      Date.parse(dataAsOf) <= Date.now(),
    'INVALID_SOURCE_DATE',
  );
  invariant(
    manifest.source?.license === 'ODbL-1.0' &&
      manifest.source.id === 'osm-geofabrik-kr' &&
      checksumPattern.test(manifest.source.sha256) &&
      checksumPattern.test(manifest.source.catalogSha256) &&
      manifest.tool?.version === planetiler.version &&
      manifest.tool.sha256 === planetiler.sha256 &&
      checksumPattern.test(manifest.tool.profileSha256),
    'UNREVIEWED_GENERATION',
  );
  invariant(
    JSON.stringify(manifest.bounds) === JSON.stringify(regions[region].bounds) &&
      checksumPattern.test(manifest.archive.sha256),
    'INVALID_GENERATION_MANIFEST',
  );
  const archiveFile = realContained(directory, manifest.archive.file);
  invariant(
    Number.isSafeInteger(manifest.archive.bytes) &&
      manifest.archive.bytes > 0 &&
      manifest.archive.bytes <= MAX_ARCHIVE_BYTES &&
      statSync(archiveFile).size === manifest.archive.bytes,
    'ARCHIVE_SIZE_MISMATCH',
  );
  invariant(
    (await sha256(archiveFile, MAX_ARCHIVE_BYTES)) === manifest.archive.sha256,
    'ARCHIVE_CHECKSUM_MISMATCH',
  );
  const info = inspectArchive(archiveFile, manifest.schema);
  invariant(
    info.tileCount === manifest.archive.tileCount &&
      info.minzoom === manifest.archive.minzoom &&
      info.maxzoom === manifest.archive.maxzoom &&
      info.gzip === manifest.archive.gzip &&
      JSON.stringify(info.layers) === JSON.stringify(manifest.archive.layers) &&
      info.layers.includes('road'),
    'ARCHIVE_METADATA_MISMATCH',
  );
  return { directory, manifest };
}
function activePointer(
  store: string,
  region: Region,
): { generation: string; previous: string | null } {
  regionName(region);
  const pointer = JSON.parse(
    readBoundedFile(store, `${region}/active.json`, 4096).toString('utf8'),
  ) as { generation: unknown; previous: unknown };
  invariant(
    typeof pointer?.generation === 'string' &&
      generationPattern.test(pointer.generation) &&
      (pointer.previous === null ||
        (typeof pointer.previous === 'string' && generationPattern.test(pointer.previous))),
    'INVALID_ACTIVE_GENERATION',
  );
  return pointer as { generation: string; previous: string | null };
}
export async function activateGeneration(
  store: string,
  region: Region,
  generation: string,
): Promise<void> {
  await verifyGeneration(store, region, generation);
  const path = contained(store, `${region}/active.json`);
  const temporary = `${path}.${randomBytes(8).toString('hex')}.partial`;
  const previous = existsSync(path) ? activePointer(store, region).generation : null;
  if (previous === generation) return;
  try {
    writeFileSync(temporary, JSON.stringify({ generation, previous }), { flag: 'wx', mode: 0o600 });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}
export function activeGeneration(store: string, region: Region): string {
  return activePointer(store, region).generation;
}
