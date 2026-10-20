import { createServer, type Server } from 'node:http';
import { statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createThemeStyle, themeNames } from 'korea-map-styles';
import { activeGeneration, verifyGeneration } from './pipeline.js';
import {
  invariant,
  osmAttribution,
  regions,
  sourceLayers,
  realContained,
  readBoundedFile,
  shaText,
  type Region,
} from './config.js';
import { tileRow } from './archive.js';

const MAX_GLYPH_BYTES = 2 * 1024 ** 2;
const MAX_TILE_BYTES = 8 * 1024 ** 2;
export interface TileServerOptions {
  store: string;
  region: Region;
  port?: number;
  allowedOrigins?: readonly string[];
  glyphs?: string;
}
export interface TileServer {
  server: Server;
  origin: string;
  counts: { styles: number; tiles: number; glyphs: number; errors: number };
  close(): Promise<void>;
}
interface GlyphFile {
  file: string;
  sha256: string;
  bytes: number;
}
interface GlyphPack {
  schemaVersion: number;
  format: string;
  fontstack: string;
  license: string;
  licenseFile: string;
  licenseSha256: string;
  files: GlyphFile[];
}
function loadGlyphPack(root: string): {
  pack: GlyphPack;
  files: Map<string, GlyphFile>;
  notice: Buffer;
} {
  const pack = JSON.parse(
    readBoundedFile(root, 'manifest.json', 1024 ** 2).toString('utf8'),
  ) as GlyphPack;
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
  const requiredBlocks = [0, 0x1100, 0x3100];
  for (let first = 0xac00; first <= 0xd7a3; first += 256) requiredBlocks.push(first);
  invariant(
    requiredBlocks.every((first) => files.has(`${pack.fontstack}/${first}-${first + 255}.pbf`)),
    'REQUIRED_GLYPH_RANGE_MISSING',
  );
  const notice = readBoundedFile(root, pack.licenseFile, 128 * 1024);
  invariant(
    shaText(notice) === pack.licenseSha256 &&
      notice.includes('SIL OPEN FONT LICENSE') &&
      notice.includes('Version 1.1'),
    'GLYPH_LICENSE_MISMATCH',
  );
  return { pack, files, notice };
}
export async function startTileServer(options: TileServerOptions): Promise<TileServer> {
  const origins = Object.freeze([...(options.allowedOrigins ?? [])]);
  for (const value of origins) {
    const u = new URL(value);
    invariant(
      u.origin === value &&
        !u.username &&
        !u.password &&
        (u.protocol === 'https:' ||
          (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))),
      'INVALID_CORS_ORIGIN',
    );
  }
  const glyphs = options.glyphs ? loadGlyphPack(options.glyphs) : undefined;
  const current = await verifyGeneration(
    options.store,
    options.region,
    activeGeneration(options.store, options.region),
  );
  const archive = new DatabaseSync(realContained(current.directory, 'base.mbtiles'), {
    readOnly: true,
    allowExtension: false,
  });
  let query: ReturnType<DatabaseSync['prepare']>;
  try {
    archive.exec('PRAGMA trusted_schema=OFF');
    // SQLite can inspect a BLOB length without allocating the full payload in JavaScript.
    query = archive.prepare(
      `SELECT CASE WHEN length(tile_data)<=${MAX_TILE_BYTES} THEN tile_data ELSE NULL END AS tile_data, length(tile_data) AS bytes FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?`,
    );
  } catch (error) {
    archive.close();
    throw error;
  }
  const counts = { styles: 0, tiles: 0, glyphs: 0, errors: 0 };
  let origin = '';
  const server = createServer((req, res) => {
    const fail = (status: number, code: string) => {
      counts.errors++;
      res
        .writeHead(status, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' })
        .end(req.method === 'HEAD' ? undefined : code);
    };
    try {
      if (!['GET', 'HEAD'].includes(req.method ?? '')) return fail(405, 'METHOD_NOT_ALLOWED');
      if (
        ![`127.0.0.1:${new URL(origin).port}`, `localhost:${new URL(origin).port}`].includes(
          req.headers.host ?? '',
        )
      )
        return fail(403, 'HOST_NOT_ALLOWED');
      const requestOrigin = req.headers.origin;
      if (requestOrigin && requestOrigin !== origin && !origins.includes(requestOrigin))
        return fail(403, 'ORIGIN_NOT_ALLOWED');
      if (requestOrigin) {
        res.setHeader('Access-Control-Allow-Origin', requestOrigin);
        res.setHeader('Vary', 'Origin');
      }
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'no-store');
      invariant((req.url?.length ?? 0) <= 2048, 'INVALID_TILE_REQUEST');
      const url = new URL(req.url ?? '/', origin);
      if (url.search || url.hash) return fail(400, 'QUERY_NOT_SUPPORTED');
      const json = (data: unknown) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(req.method === 'HEAD' ? undefined : JSON.stringify(data));
      };
      if (url.pathname === '/status')
        return json({
          region: options.region,
          generation: current.manifest.generation,
          dataAsOf: current.manifest.source.dataAsOf,
          tileCount: current.manifest.archive.tileCount,
          glyphs: Boolean(glyphs),
          counts,
        });
      const style = /^\/styles\/(standard|dark|pastel|outdoor)\.json$/.exec(url.pathname);
      if (style) {
        const theme = style[1] as (typeof themeNames)[number];
        const spec = createThemeStyle({
          theme,
          target: 'web',
          data: {
            mode: 'operator',
            source: {
              type: 'vector',
              tiles: [`${origin}/tiles/{z}/{x}/{y}.pbf`],
              minzoom: current.manifest.archive.minzoom,
              maxzoom: current.manifest.archive.maxzoom,
              bounds: [...regions[options.region].bounds],
            },
            sourceLayers,
            attribution: osmAttribution,
          },
          typography: glyphs
            ? {
                mode: 'glyphs',
                fontStack: [glyphs.pack.fontstack],
                url: `${origin}/glyphs/{fontstack}/{range}.pbf`,
              }
            : { mode: 'none' },
        });
        spec.center = [...regions[options.region].center];
        spec.zoom = regions[options.region].zoom;
        const metadata =
          spec.metadata && typeof spec.metadata === 'object' && !Array.isArray(spec.metadata)
            ? (spec.metadata as Record<string, unknown>)
            : {};
        spec.metadata = {
          ...metadata,
          'korea:generation': current.manifest.generation,
          'korea:source-time': current.manifest.source.dataAsOf,
        };
        counts.styles++;
        return json(spec);
      }
      const tile = /^\/tiles\/(\d{1,2})\/(\d{1,6})\/(\d{1,6})\.pbf$/.exec(url.pathname);
      if (tile) {
        const z = Number(tile[1]),
          x = Number(tile[2]),
          y = Number(tile[3]);
        invariant(Number.isInteger(x) && x >= 0 && x < 2 ** z, 'INVALID_TILE_COORDINATE');
        const row = tileRow(z, y),
          result = query.get(z, x, row),
          bytes = result?.['tile_data'];
        invariant(
          !result ||
            (typeof result['bytes'] === 'number' &&
              result['bytes'] > 0 &&
              result['bytes'] <= MAX_TILE_BYTES),
          'INVALID_TILE_SIZE',
        );
        counts.tiles++;
        if (!(bytes instanceof Uint8Array)) {
          res.writeHead(204).end();
          return;
        }
        res.setHeader('Content-Type', 'application/vnd.mapbox-vector-tile');
        if (bytes[0] === 31 && bytes[1] === 139) res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Content-Length', bytes.length);
        res.end(req.method === 'HEAD' ? undefined : bytes);
        return;
      }
      const font = /^\/glyphs\/([A-Za-z][A-Za-z0-9 _-]{0,63})\/(\d{1,5})-(\d{1,5})\.pbf$/.exec(
        decodeURIComponent(url.pathname),
      );
      if (font && glyphs && options.glyphs && font[1] === glyphs.pack.fontstack) {
        const first = Number(font[2]),
          last = Number(font[3]);
        invariant(
          first % 256 === 0 && last === first + 255 && last <= 65535,
          'INVALID_GLYPH_RANGE',
        );
        const relative = `${glyphs.pack.fontstack}/${first}-${last}.pbf`,
          expected = glyphs.files.get(relative);
        if (!expected) return fail(404, 'GLYPH_RANGE_NOT_DECLARED');
        const bytes = readBoundedFile(options.glyphs, relative, MAX_GLYPH_BYTES);
        invariant(
          bytes.length === expected.bytes && shaText(bytes) === expected.sha256,
          'GLYPH_CHECKSUM_MISMATCH',
        );
        counts.glyphs++;
        res.setHeader('Content-Type', 'application/x-protobuf');
        res.end(req.method === 'HEAD' ? undefined : bytes);
        return;
      }
      if (url.pathname === '/font-license' && glyphs) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(req.method === 'HEAD' ? undefined : glyphs.notice);
        return;
      }
      return fail(404, 'RESOURCE_NOT_FOUND');
    } catch {
      return fail(400, 'INVALID_TILE_REQUEST');
    }
  });
  try {
    await new Promise<void>((ok, fail) => {
      server.once('error', fail);
      server.listen(options.port ?? 0, '127.0.0.1', ok);
    });
  } catch (error) {
    archive.close();
    throw error;
  }
  const address = server.address();
  invariant(address && typeof address !== 'string', 'TILE_SERVER_START_FAILED');
  origin = `http://127.0.0.1:${address.port}`;
  let closing: Promise<void> | undefined;
  return {
    server,
    origin,
    counts,
    close: () =>
      (closing ??= new Promise<void>((ok, fail) => {
        server.close((error) => {
          archive.close();
          if (error) fail(error);
          else ok();
        });
        server.closeIdleConnections();
      })),
  };
}
