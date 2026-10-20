import type { IncomingMessage, ServerResponse } from 'node:http';
import { statSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { invariant, readBoundedFile, realContained, shaText } from './config.js';

export const MAX_GLYPH_BYTES = 2 * 1024 ** 2;
export const MAX_TILE_BYTES = 8 * 1024 ** 2;
const IMMUTABLE = 'public, max-age=31536000, immutable';

/** LRU accounting includes retained Buffer bytes; a single oversized entry is never cached. */
export class ByteCache {
  private entries = new Map<string, Buffer>();
  private retained = 0;
  constructor(
    readonly limit: number,
    readonly maxEntries = 32,
  ) {
    invariant(
      Number.isSafeInteger(limit) && limit >= 0 && limit <= 16 * 1024 ** 2,
      'CACHE_BYTE_LIMIT',
    );
    invariant(
      Number.isSafeInteger(maxEntries) && maxEntries > 0 && maxEntries <= 256,
      'CACHE_ENTRY_LIMIT',
    );
  }
  get bytes(): number {
    return this.retained;
  }
  get size(): number {
    return this.entries.size;
  }
  get(key: string): Buffer | undefined {
    const bytes = this.entries.get(key);
    if (bytes) {
      this.entries.delete(key);
      this.entries.set(key, bytes);
    }
    return bytes;
  }
  set(key: string, bytes: Buffer): void {
    const old = this.entries.get(key);
    if (old) {
      this.retained -= old.length;
      this.entries.delete(key);
    }
    if (bytes.length > this.limit || this.limit === 0) return;
    while (this.retained + bytes.length > this.limit || this.entries.size >= this.maxEntries) {
      const oldest = this.entries.entries().next().value;
      if (!oldest) break;
      this.entries.delete(oldest[0]);
      this.retained -= oldest[1].length;
    }
    this.entries.set(key, bytes);
    this.retained += bytes.length;
  }
  clear(): void {
    this.entries.clear();
    this.retained = 0;
  }
}

export function vary(res: ServerResponse, value: string): void {
  const fields = new Set(
    String(res.getHeader('Vary') ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
  );
  fields.add(value);
  res.setHeader('Vary', [...fields].join(', '));
}

/** Returns null when neither supported representation is acceptable. No substring q=0 matching. */
export function chooseEncoding(header: string | undefined): 'gzip' | 'identity' | null {
  if (!header?.trim()) return 'identity';
  const values = new Map<string, number>();
  for (const item of header.split(',')) {
    const [rawToken, ...parameters] = item.trim().toLowerCase().split(';');
    const token = rawToken?.trim();
    if (!token) continue;
    let quality = 1;
    for (const parameter of parameters) {
      const q = /^\s*q\s*=\s*(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)\s*$/.exec(parameter);
      if (q) quality = Number(q[1]);
      else quality = 0;
    }
    values.set(token, quality);
  }
  const gzip = values.get('gzip') ?? values.get('*') ?? 0;
  const identity = values.get('identity') ?? (values.get('*') === 0 ? 0 : 1);
  if (gzip > 0 && gzip >= identity) return 'gzip';
  return identity > 0 ? 'identity' : gzip > 0 ? 'gzip' : null;
}

export function representation(
  bytes: Buffer,
  encoding: 'gzip' | 'identity',
  compressed: boolean,
  cache?: ByteCache,
): Buffer {
  if (encoding === 'identity')
    return compressed ? gunzipSync(bytes, { maxOutputLength: MAX_TILE_BYTES }) : bytes;
  if (compressed) return bytes;
  const key = shaText(bytes);
  const existing = cache?.get(key);
  if (existing) return existing;
  const gzip = gzipSync(bytes, { level: 6 });
  cache?.set(key, gzip);
  return gzip;
}

export function replyAsset(
  req: IncomingMessage,
  res: ServerResponse,
  bytes: Buffer,
  contentType: string,
  immutable: boolean,
  encoding?: 'gzip' | 'identity',
): void {
  const etag = `"${shaText(bytes)}"`;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', immutable ? IMMUTABLE : 'no-cache');
  res.setHeader('ETag', etag);
  if (encoding) {
    vary(res, 'Accept-Encoding');
    if (encoding === 'gzip') res.setHeader('Content-Encoding', 'gzip');
  }
  const conditional = req.headers['if-none-match'];
  const candidates = (Array.isArray(conditional) ? conditional.join(',') : (conditional ?? ''))
    .split(',')
    .map((v) => v.trim().replace(/^W\//, ''));
  if (candidates.includes('*') || candidates.includes(etag)) {
    res.writeHead(304).end();
    return;
  }
  res.setHeader('Content-Length', bytes.length);
  res.end(req.method === 'HEAD' ? undefined : bytes);
}

export function fileStamp(root: string, file: string): string {
  const info = statSync(realContained(root, file), { bigint: true });
  invariant(info.isFile(), 'REGULAR_ASSET_REQUIRED');
  return [info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs].join(':');
}

export interface GlyphFile {
  file: string;
  sha256: string;
  bytes: number;
}
export interface LoadedGlyphPack {
  root: string;
  hash: string;
  pack: { fontstack: string; files: GlyphFile[] };
  files: Map<string, GlyphFile>;
  notice: Buffer;
  read(file: string): Buffer;
}

export function loadGlyphPack(root: string): LoadedGlyphPack {
  const manifest = readBoundedFile(root, 'manifest.json', 1024 ** 2);
  const hash = shaText(manifest);
  const pack = JSON.parse(manifest.toString('utf8')) as {
    schemaVersion: number;
    format: string;
    fontstack: string;
    license: string;
    licenseFile: string;
    licenseSha256: string;
    files: GlyphFile[];
  };
  invariant(
    pack?.schemaVersion === 1 &&
      pack.format === 'maplibre-glyph-pbf' &&
      typeof pack.fontstack === 'string' &&
      /^[A-Za-z][A-Za-z0-9 _-]{0,63}$/.test(pack.fontstack) &&
      pack.license === 'OFL-1.1' &&
      pack.licenseFile === 'LICENSE.txt' &&
      /^[a-f0-9]{64}$/.test(pack.licenseSha256),
    'INVALID_GLYPH_PACK',
  );
  invariant(
    Array.isArray(pack.files) && pack.files.length > 0 && pack.files.length <= 256,
    'INVALID_GLYPH_PACK',
  );
  const files = new Map<string, GlyphFile>();
  for (const entry of pack.files) {
    invariant(
      typeof entry?.file === 'string' &&
        entry.file.startsWith(`${pack.fontstack}/`) &&
        /^[a-f0-9]{64}$/.test(entry.sha256) &&
        Number.isSafeInteger(entry.bytes) &&
        entry.bytes > 0 &&
        entry.bytes <= MAX_GLYPH_BYTES,
      'INVALID_GLYPH_PACK',
    );
    const range = /^(\d{1,5})-(\d{1,5})\.pbf$/.exec(entry.file.slice(pack.fontstack.length + 1));
    invariant(
      range &&
        Number(range[1]) % 256 === 0 &&
        Number(range[2]) === Number(range[1]) + 255 &&
        Number(range[2]) <= 65535 &&
        !files.has(entry.file),
      'INVALID_GLYPH_PACK',
    );
    const info = statSync(realContained(root, entry.file));
    invariant(info.isFile() && info.size === entry.bytes, 'GLYPH_SIZE_MISMATCH');
    files.set(entry.file, entry);
  }
  const required = [0, 0x1100, 0x3100];
  for (let first = 0xac00; first <= 0xd7a3; first += 256) required.push(first);
  invariant(
    required.every((first) => files.has(`${pack.fontstack}/${first}-${first + 255}.pbf`)),
    'REQUIRED_GLYPH_RANGE_MISSING',
  );
  const notice = readBoundedFile(root, pack.licenseFile, 128 * 1024);
  invariant(
    shaText(notice) === pack.licenseSha256 &&
      notice.includes('SIL OPEN FONT LICENSE') &&
      notice.includes('Version 1.1'),
    'GLYPH_LICENSE_MISMATCH',
  );
  return {
    root,
    hash,
    pack,
    files,
    notice,
    read(file) {
      invariant(
        shaText(readBoundedFile(root, 'manifest.json', 1024 ** 2)) === hash,
        'GLYPH_MANIFEST_CHANGED',
      );
      const expected = files.get(file);
      invariant(expected, 'GLYPH_RANGE_NOT_DECLARED');
      const bytes = readBoundedFile(root, file, MAX_GLYPH_BYTES);
      invariant(
        bytes.length === expected.bytes && shaText(bytes) === expected.sha256,
        'GLYPH_CHECKSUM_MISMATCH',
      );
      return bytes;
    },
  };
}
