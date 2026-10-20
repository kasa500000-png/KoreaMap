import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  createReadStream,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
} from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';

export const planetiler = {
  version: '0.10.2',
  sha256: 'f310bd0413e2e4512b27f4046d418664e8e1d3bf31603c2a70e23de06c167e4d',
  url: 'https://github.com/onthegomap/planetiler/releases/download/v0.10.2/planetiler.jar',
} as const;
export const sourceLayers = Object.fromEntries(
  ['land', 'park', 'water', 'building', 'boundary', 'road', 'trail', 'place', 'poi'].map((k) => [
    k,
    k,
  ]),
);
export type TileSchema = 'design-v1' | 'design-v2';
export const optionalSourceLayers = ['rail', 'waterway', 'transport', 'landmask'] as const;
export interface TileCapabilities {
  rail: boolean;
  waterway: boolean;
  transport: boolean;
  landmask: boolean;
  ocean: boolean;
}
export const v2Fields = [
  'kind',
  'class',
  'poi',
  'name:ko',
  'name',
  'name:en',
  'fid',
  'subclass',
  'rank',
  'minzoom',
  'bridge',
  'tunnel',
  'layer',
  'ref',
  'admin_level',
  'poiCategory',
] as const;
export function tileSchema(value: unknown = 'design-v1'): TileSchema {
  invariant(value === 'design-v1' || value === 'design-v2', 'UNREVIEWED_TILE_SCHEMA');
  return value;
}
export function archiveCapabilities(layers: readonly string[]): TileCapabilities {
  return {
    rail: layers.includes('rail'),
    waterway: layers.includes('waterway'),
    transport: layers.includes('transport'),
    landmask: layers.includes('landmask'),
    ocean: false,
  };
}
export const regions = {
  seoul: { bounds: [126.94, 37.53, 127.03, 37.61], center: [126.978, 37.5665], zoom: 13 },
  ulsan: { bounds: [129.27, 35.51, 129.36, 35.59], center: [129.3114, 35.5384], zoom: 13 },
  busan: { bounds: [129, 35.07, 129.1, 35.17], center: [129.0756, 35.1302], zoom: 13 },
  jeju: { bounds: [126.48, 33.46, 126.57, 33.53], center: [126.5312, 33.4996], zoom: 13 },
  context: { bounds: [124.5, 33, 132, 39.5], center: [127.5, 36], zoom: 7 },
  korea: { bounds: [124.5, 33, 132, 39.5], center: [127.5, 36], zoom: 7 },
} as const;
export type Region = keyof typeof regions;
export const osmAttribution =
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors · ODbL-1.0 · operator-hosted Korea Map Kit tiles</a>';
export function invariant(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}
export function regionName(value: unknown): Region {
  invariant(typeof value === 'string' && Object.hasOwn(regions, value), 'UNKNOWN_REGION');
  return value as Region;
}
export async function sha256(
  file: string,
  maxBytes = 512 * 1024 ** 2,
  signal?: AbortSignal,
): Promise<string> {
  invariant(!lstatSync(file).isSymbolicLink(), 'SYMLINK_OUTSIDE_STORE');
  const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = fstatSync(fd);
    invariant(info.isFile() && info.size > 0 && info.size <= maxBytes, 'INVALID_FILE_SIZE');
    const h = createHash('sha256');
    let size = 0;
    for await (const bytes of createReadStream(file, {
      fd,
      autoClose: false,
      ...(signal ? { signal } : {}),
    })) {
      size += bytes.length;
      invariant(size <= maxBytes, 'FILE_TOO_LARGE');
      h.update(bytes);
    }
    invariant(size === info.size, 'FILE_CHANGED_DURING_READ');
    return h.digest('hex');
  } finally {
    closeSync(fd);
  }
}
export function shaText(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
export function contained(root: string, file: string): string {
  const result = resolve(root, file);
  const rel = relative(resolve(root), result);
  invariant(
    rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\') && !isAbsolute(rel),
    'PATH_OUTSIDE_STORE',
  );
  // The operator chooses the root. Reject links below it before reading or writing.
  let base: string;
  try {
    base = realpathSync(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return result;
    throw error;
  }
  let current = base;
  for (const part of rel.split(/[\\/]/).filter(Boolean)) {
    invariant(part !== '..', 'PATH_OUTSIDE_STORE');
    current = resolve(current, part);
    try {
      invariant(!lstatSync(current).isSymbolicLink(), 'SYMLINK_OUTSIDE_STORE');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return resolve(base, rel);
}
export function sourceEligibility(root: string): void {
  const selection =
    "import sys,json;from pathlib import Path;sys.path.insert(0,'scripts');from data_policy import select_source;select_source(json.loads(Path('data/sources.json').read_text(encoding='utf-8')),'osm-geofabrik-kr','collect',operator_opt_in=True)";
  const result = spawnSync(process.execPath, ['scripts/python.mjs', '-c', selection], {
    cwd: root,
    encoding: 'utf8',
  });
  invariant(result.status === 0, 'OSM_SOURCE_REVIEW_REQUIRED');
}
export function readCatalogSource(root: string): {
  url: string;
  attribution: string;
  license: string;
  catalogSha256: string;
} {
  const bytes = readFileSync(resolve(root, 'data/sources.json'));
  const catalog = JSON.parse(bytes.toString()) as {
    sources: Array<{ id: string; sourceUrl: string; attribution: string; license: string }>;
  };
  const source = catalog.sources.find((s) => s.id === 'osm-geofabrik-kr');
  invariant(source?.license === 'ODbL-1.0', 'OSM_LICENSE_REQUIRED');
  return {
    url: source.sourceUrl,
    attribution: source.attribution,
    license: source.license,
    catalogSha256: shaText(bytes),
  };
}
export function realContained(root: string, file: string): string {
  const path = contained(root, file);
  return contained(realpathSync(root), relative(realpathSync(root), realpathSync(path)));
}
export function readBoundedFile(root: string, file: string, maxBytes: number): Buffer {
  const path = realContained(root, file);
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = fstatSync(fd);
    invariant(info.isFile() && info.size > 0 && info.size <= maxBytes, 'INVALID_FILE_SIZE');
    const bytes = Buffer.alloc(info.size);
    let offset = 0;
    while (offset < bytes.length) {
      const size = readSync(fd, bytes, offset, bytes.length - offset, null);
      invariant(size > 0, 'FILE_CHANGED_DURING_READ');
      offset += size;
    }
    invariant(readSync(fd, Buffer.alloc(1)) === 0, 'FILE_CHANGED_DURING_READ');
    return bytes;
  } finally {
    closeSync(fd);
  }
}
