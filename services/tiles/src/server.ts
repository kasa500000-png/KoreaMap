import { createServer, type Server } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import {
  createThemeStyle,
  createCartographyStyle,
  themeNames,
  type ThemeName,
} from 'korea-map-styles';
import { activeGeneration, verifyGeneration, type Generation } from './pipeline.js';
import {
  invariant,
  contained,
  osmAttribution,
  regions,
  sourceLayers,
  realContained,
  readBoundedFile,
  shaText,
  type Region,
} from './config.js';
import { tileRow } from './archive.js';
import {
  ByteCache,
  chooseEncoding,
  fileStamp,
  loadGlyphPack,
  MAX_TILE_BYTES,
  replyAsset,
  representation,
  vary,
} from './http-assets.js';

const generationPattern = /^[0-9]{13}-[a-f0-9]{8}$/;
type Quality = 'legacy' | 'balanced' | 'sparse' | 'dense';
type Capabilities = {
  rail: boolean;
  waterway: boolean;
  transport: boolean;
  landmask: boolean;
  ocean: boolean;
};
type ServerManifest = Omit<Generation, 'schema' | 'schemaVersion'> & {
  schema: 'design-v1' | 'design-v2';
  schemaVersion: 1 | 2;
  capabilities?: Capabilities;
};
interface Archive {
  manifest: ServerManifest;
  database: DatabaseSync;
  query: ReturnType<DatabaseSync['prepare']>;
  assertUnchanged(): void;
}
interface Styles {
  revision: string;
  immutable: Map<ThemeName, Buffer>;
  aliases: Map<ThemeName, Buffer>;
}
export interface TileServerOptions {
  store: string;
  region: Region;
  port?: number;
  allowedOrigins?: readonly string[];
  glyphs?: string;
  /** v1 defaults to the original factory; v2 defaults to balanced cartography. */
  quality?: Quality;
  glyphCacheBytes?: number;
  /** Explicit verified low-zoom context in the same store; never an implicit provider. */
  context?: { generation?: string };
}
export interface TileServer {
  server: Server;
  origin: string;
  counts: { styles: number; tiles: number; glyphs: number; errors: number };
  diagnostics(): {
    archives: number;
    glyphCacheBytes: number;
    glyphCacheEntries: number;
    previousAvailable: boolean;
    closed: boolean;
  };
  close(): Promise<void>;
}
async function openArchive(store: string, region: Region, generation: string): Promise<Archive> {
  invariant(generationPattern.test(generation), 'INVALID_GENERATION');
  const directory = realContained(store, `${region}/generations/${generation}`);
  const noSidecars = () => {
    for (const suffix of ['-wal', '-journal', '-shm'])
      invariant(
        !existsSync(contained(directory, `base.mbtiles${suffix}`)),
        'UNHASHED_ARCHIVE_SIDECAR',
      );
  };
  noSidecars();
  const initial = {
    archive: fileStamp(directory, 'base.mbtiles'),
    manifest: fileStamp(directory, 'manifest.json'),
  };
  const verified = await verifyGeneration(store, region, generation);
  const manifest = verified.manifest as ServerManifest;
  const assertUnchanged = () => {
    noSidecars();
    invariant(
      fileStamp(directory, 'base.mbtiles') === initial.archive &&
        fileStamp(directory, 'manifest.json') === initial.manifest,
      'IMMUTABLE_GENERATION_CHANGED',
    );
  };
  assertUnchanged();
  const database = new DatabaseSync(realContained(directory, 'base.mbtiles'), {
    readOnly: true,
    allowExtension: false,
  });
  try {
    database.exec('PRAGMA trusted_schema=OFF');
    const query = database.prepare(
      `SELECT CASE WHEN length(tile_data)<=${MAX_TILE_BYTES} THEN tile_data ELSE NULL END AS tile_data, length(tile_data) AS bytes FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?`,
    );
    assertUnchanged();
    return { manifest, database, query, assertUnchanged };
  } catch (error) {
    database.close();
    throw error;
  }
}
function source(archive: Archive, origin: string) {
  return {
    type: 'vector' as const,
    tiles: [`${origin}/datasets/${archive.manifest.generation}/tiles/{z}/{x}/{y}.pbf`],
    minzoom: archive.manifest.archive.minzoom,
    maxzoom: archive.manifest.archive.maxzoom,
    bounds: [...archive.manifest.bounds] as [number, number, number, number],
  };
}
function layers(archive: Archive): Record<string, string> {
  return Object.fromEntries(archive.manifest.archive.layers.map((name) => [name, name]));
}
export async function startTileServer(options: TileServerOptions): Promise<TileServer> {
  const origins = Object.freeze([...(options.allowedOrigins ?? [])]);
  invariant(origins.length <= 16, 'CORS_ORIGIN_LIMIT');
  for (const value of origins) {
    const url = new URL(value);
    invariant(
      url.origin === value &&
        !url.username &&
        !url.password &&
        (url.protocol === 'https:' ||
          (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))),
      'INVALID_CORS_ORIGIN',
    );
  }
  invariant(
    options.quality === undefined ||
      ['legacy', 'balanced', 'sparse', 'dense'].includes(options.quality),
    'INVALID_CARTOGRAPHY_QUALITY',
  );
  const cache = new ByteCache(options.glyphCacheBytes ?? 8 * 1024 ** 2);
  const glyphs = options.glyphs ? loadGlyphPack(options.glyphs) : undefined;
  const archives = new Map<string, Archive>();
  let current: Archive, previous: Archive | undefined, context: Archive | undefined;
  try {
    const generation = activeGeneration(options.store, options.region);
    current = await openArchive(options.store, options.region, generation);
    archives.set(generation, current);
    const pointer = JSON.parse(
      readBoundedFile(options.store, `${options.region}/active.json`, 4096).toString('utf8'),
    ) as { generation: unknown; previous: unknown };
    invariant(
      pointer.generation === generation &&
        (pointer.previous === null ||
          (typeof pointer.previous === 'string' && generationPattern.test(pointer.previous))),
      'INVALID_ACTIVE_POINTER',
    );
    if (typeof pointer.previous === 'string' && pointer.previous !== generation) {
      try {
        previous = await openArchive(options.store, options.region, pointer.previous);
        archives.set(pointer.previous, previous);
      } catch {
        previous = undefined;
      }
    }
    if (options.context) {
      const contextRegion = 'context' as Region;
      const selected = options.context.generation ?? activeGeneration(options.store, contextRegion);
      invariant(!archives.has(selected), 'DUPLICATE_CONTEXT_GENERATION');
      context = await openArchive(options.store, contextRegion, selected);
      archives.set(selected, context);
      invariant(context.manifest.schema === 'design-v2', 'CONTEXT_REQUIRES_DESIGN_V2');
    }
    invariant(archives.size <= 3, 'OPEN_ARCHIVE_LIMIT');
  } catch (error) {
    for (const archive of archives.values()) archive.database.close();
    throw error;
  }
  const counts = { styles: 0, tiles: 0, glyphs: 0, errors: 0 };
  const revisions = new Map<string, { archive: Archive; styles: Styles }>();
  let currentStyles: Styles,
    origin = '',
    closed = false;
  function buildStyles(archive: Archive): Styles {
    const quality =
      archive.manifest.schema === 'design-v2'
        ? options.quality === 'legacy'
          ? 'balanced'
          : (options.quality ?? 'balanced')
        : (options.quality ?? (context ? 'balanced' : 'legacy'));
    invariant(quality !== 'legacy' || !context, 'CONTEXT_REQUIRES_CARTOGRAPHY');
    const specs = new Map<ThemeName, ReturnType<typeof createThemeStyle>>();
    for (const theme of themeNames) {
      const data = {
        mode: 'operator' as const,
        source: source(archive, origin),
        sourceLayers: { ...sourceLayers, ...layers(archive) },
        attribution: osmAttribution,
        ...(archive.manifest.capabilities ? { capabilities: archive.manifest.capabilities } : {}),
        ...(context
          ? {
              context: {
                source: source(context, origin),
                sourceLayers: layers(context),
                attribution: osmAttribution,
                ...(context.manifest.capabilities
                  ? { capabilities: context.manifest.capabilities }
                  : {}),
              },
            }
          : {}),
      };
      const typography = glyphs
        ? {
            mode: 'glyphs' as const,
            fontStack: [glyphs.pack.fontstack],
            url: `${origin}/glyphs/${glyphs.hash}/{fontstack}/{range}.pbf`,
          }
        : { mode: 'none' as const };
      const spec =
        quality === 'legacy'
          ? createThemeStyle({ theme, target: 'web', data, typography })
          : createCartographyStyle({
              theme,
              target: 'web',
              data,
              typography,
              schema: archive.manifest.schema,
              density: quality,
              icons: false,
            });
      spec.center = [...regions[options.region].center];
      spec.zoom = regions[options.region].zoom;
      const metadata =
        spec.metadata && typeof spec.metadata === 'object' && !Array.isArray(spec.metadata)
          ? (spec.metadata as Record<string, unknown>)
          : {};
      spec.metadata = {
        ...metadata,
        'korea:generation': archive.manifest.generation,
        'korea:source-time': archive.manifest.source.dataAsOf,
        'korea:quality': quality,
      };
      specs.set(theme, spec);
    }
    const revision = shaText(
      JSON.stringify({
        format: 'kmk-style-revision-v1',
        schema: archive.manifest.schema,
        archive: archive.manifest.archive.sha256,
        generation: archive.manifest.generation,
        quality,
        glyphPack: glyphs?.hash ?? null,
        context: context?.manifest.archive.sha256 ?? null,
        styles: [...specs],
      }),
    );
    const immutable = new Map<ThemeName, Buffer>(),
      aliases = new Map<ThemeName, Buffer>();
    for (const [theme, spec] of specs) {
      spec.metadata = {
        ...(spec.metadata as Record<string, unknown>),
        'korea:style-revision': revision,
      };
      immutable.set(theme, Buffer.from(JSON.stringify(spec)));
      if (quality === 'legacy') {
        const old = createThemeStyle({
          theme,
          target: 'web',
          data: {
            mode: 'operator',
            source: { ...source(archive, origin), tiles: [`${origin}/tiles/{z}/{x}/{y}.pbf`] },
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
        old.center = [...regions[options.region].center];
        old.zoom = regions[options.region].zoom;
        old.metadata = spec.metadata;
        aliases.set(theme, Buffer.from(JSON.stringify(old)));
      } else aliases.set(theme, immutable.get(theme)!);
    }
    return { revision, immutable, aliases };
  }
  const server = createServer({ maxHeaderSize: 8192 }, (req, res) => {
    const fail = (status: number, code: string) => {
      counts.errors++;
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res
        .writeHead(status, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' })
        .end(req.method === 'HEAD' ? undefined : code);
    };
    try {
      if (
        ![`127.0.0.1:${new URL(origin).port}`, `localhost:${new URL(origin).port}`].includes(
          req.headers.host ?? '',
        )
      )
        return fail(403, 'HOST_NOT_ALLOWED');
      const requestOrigin = req.headers.origin;
      vary(res, 'Origin');
      if (requestOrigin && requestOrigin !== origin && !origins.includes(requestOrigin))
        return fail(403, 'ORIGIN_NOT_ALLOWED');
      if (requestOrigin) {
        res.setHeader('Access-Control-Allow-Origin', requestOrigin);
        vary(res, 'Origin');
        res.setHeader('Access-Control-Expose-Headers', 'ETag, Content-Length, Content-Encoding');
      }
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'no-store');
      invariant(
        (req.url?.length ?? 0) <= 2048 &&
          req.url?.startsWith('/') &&
          !req.url.startsWith('//') &&
          !req.url.includes('\\'),
        'INVALID_TILE_REQUEST',
      );
      const url = new URL(req.url!, origin);
      if (url.search || url.hash) return fail(400, 'QUERY_NOT_SUPPORTED');
      if (req.method === 'OPTIONS') {
        if (
          !requestOrigin ||
          !['GET', 'HEAD'].includes(req.headers['access-control-request-method'] ?? '')
        )
          return fail(405, 'METHOD_NOT_ALLOWED');
        if (
          (req.headers['access-control-request-headers'] ?? '')
            .split(',')
            .some((value) => value.trim() && value.trim().toLowerCase() !== 'if-none-match')
        )
          return fail(403, 'HEADER_NOT_ALLOWED');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD');
        res.setHeader('Access-Control-Allow-Headers', 'If-None-Match');
        res.writeHead(204).end();
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method ?? '')) return fail(405, 'METHOD_NOT_ALLOWED');
      if (url.pathname === '/status') {
        res.setHeader('Content-Type', 'application/json');
        res.end(
          req.method === 'HEAD'
            ? undefined
            : JSON.stringify({
                region: options.region,
                generation: current.manifest.generation,
                dataAsOf: current.manifest.source.dataAsOf,
                tileCount: current.manifest.archive.tileCount,
                glyphs: Boolean(glyphs),
                glyphPack: glyphs?.hash ?? null,
                styleRevision: currentStyles.revision,
                previous: previous?.manifest.generation ?? null,
                context: context?.manifest.generation ?? null,
                counts,
              }),
        );
        return;
      }
      const versionedStyle =
          /^\/styles\/([a-f0-9]{64})\/(standard|dark|pastel|outdoor)\.json$/.exec(url.pathname),
        aliasStyle = /^\/styles\/(standard|dark|pastel|outdoor)\.json$/.exec(url.pathname);
      if (versionedStyle || aliasStyle) {
        const selected = versionedStyle
          ? revisions.get(versionedStyle[1]!)
          : { archive: current, styles: currentStyles };
        if (!selected) return fail(404, 'STYLE_REVISION_NOT_AVAILABLE');
        selected.archive.assertUnchanged();
        context?.assertUnchanged();
        const theme = (versionedStyle?.[2] ?? aliasStyle?.[1]) as ThemeName,
          data = (versionedStyle ? selected.styles.immutable : selected.styles.aliases).get(theme)!;
        counts.styles++;
        replyAsset(req, res, data, 'application/json', Boolean(versionedStyle));
        return;
      }
      const versionedTile =
          /^\/datasets\/([0-9]{13}-[a-f0-9]{8})\/tiles\/(\d{1,2})\/(\d{1,6})\/(\d{1,6})\.pbf$/.exec(
            url.pathname,
          ),
        aliasTile = /^\/tiles\/(\d{1,2})\/(\d{1,6})\/(\d{1,6})\.pbf$/.exec(url.pathname);
      if (versionedTile || aliasTile) {
        const archive = versionedTile ? archives.get(versionedTile[1]!) : current;
        if (!archive) return fail(404, 'DATASET_NOT_AVAILABLE');
        archive.assertUnchanged();
        const parts = versionedTile ? versionedTile.slice(2) : aliasTile!.slice(1),
          z = Number(parts[0]),
          x = Number(parts[1]),
          y = Number(parts[2]);
        invariant(Number.isInteger(x) && x >= 0 && x < 2 ** z, 'INVALID_TILE_COORDINATE');
        const result = archive.query.get(
          z,
          x,
          tileRow(z, y, archive.manifest.schema === 'design-v2' ? 16 : 14),
        );
        invariant(
          !result ||
            (typeof result['bytes'] === 'number' &&
              result['bytes'] > 0 &&
              result['bytes'] <= MAX_TILE_BYTES),
          'INVALID_TILE_SIZE',
        );
        archive.assertUnchanged();
        counts.tiles++;
        const data = result?.['tile_data'];
        if (!(data instanceof Uint8Array)) {
          res.statusCode = 204;
          replyAsset(
            req,
            res,
            Buffer.alloc(0),
            'application/vnd.mapbox-vector-tile',
            Boolean(versionedTile),
          );
          return;
        }
        const encoding = chooseEncoding(req.headers['accept-encoding']);
        if (!encoding) return fail(406, 'ENCODING_NOT_ACCEPTABLE');
        const bytes = Buffer.from(data);
        replyAsset(
          req,
          res,
          representation(bytes, encoding, bytes[0] === 31 && bytes[1] === 139),
          'application/vnd.mapbox-vector-tile',
          Boolean(versionedTile),
          encoding,
        );
        return;
      }
      const path = decodeURIComponent(url.pathname),
        versionedFont =
          /^\/glyphs\/([a-f0-9]{64})\/([A-Za-z][A-Za-z0-9 _-]{0,63})\/(\d{1,5})-(\d{1,5})\.pbf$/.exec(
            path,
          ),
        aliasFont = /^\/glyphs\/([A-Za-z][A-Za-z0-9 _-]{0,63})\/(\d{1,5})-(\d{1,5})\.pbf$/.exec(
          path,
        );
      if (versionedFont || aliasFont) {
        if (!glyphs || (versionedFont && versionedFont[1] !== glyphs.hash))
          return fail(404, 'GLYPH_PACK_NOT_AVAILABLE');
        const parts = versionedFont ? versionedFont.slice(2) : aliasFont!.slice(1);
        if (parts[0] !== glyphs.pack.fontstack) return fail(404, 'FONTSTACK_NOT_AVAILABLE');
        const first = Number(parts[1]),
          last = Number(parts[2]);
        invariant(
          first % 256 === 0 && last === first + 255 && last <= 65535,
          'INVALID_GLYPH_RANGE',
        );
        const file = `${glyphs.pack.fontstack}/${first}-${last}.pbf`;
        if (!glyphs.files.has(file)) return fail(404, 'GLYPH_RANGE_NOT_DECLARED');
        const bytes = glyphs.read(file);
        const encoding = chooseEncoding(req.headers['accept-encoding']);
        if (!encoding) return fail(406, 'ENCODING_NOT_ACCEPTABLE');
        counts.glyphs++;
        replyAsset(
          req,
          res,
          representation(bytes, encoding, false, cache),
          'application/x-protobuf',
          Boolean(versionedFont),
          encoding,
        );
        return;
      }
      if (url.pathname === '/font-license' && glyphs) {
        const notice = readBoundedFile(glyphs.root, 'LICENSE.txt', 128 * 1024);
        invariant(shaText(notice) === shaText(glyphs.notice), 'GLYPH_LICENSE_MISMATCH');
        replyAsset(req, res, notice, 'text/plain; charset=utf-8', false);
        return;
      }
      return fail(404, 'RESOURCE_NOT_FOUND');
    } catch {
      return fail(400, 'INVALID_TILE_REQUEST');
    }
  });
  server.headersTimeout = 5000;
  server.requestTimeout = 10000;
  server.keepAliveTimeout = 1000;
  server.maxConnections = 32;
  server.maxHeadersCount = 40;
  try {
    await new Promise<void>((ok, fail) => {
      server.once('error', fail);
      server.listen(options.port ?? 0, '127.0.0.1', ok);
    });
    const address = server.address();
    invariant(address && typeof address !== 'string', 'TILE_SERVER_START_FAILED');
    origin = `http://127.0.0.1:${address.port}`;
    currentStyles = buildStyles(current);
    revisions.set(currentStyles.revision, { archive: current, styles: currentStyles });
    if (previous) {
      const styles = buildStyles(previous);
      revisions.set(styles.revision, { archive: previous, styles });
    }
  } catch (error) {
    server.close();
    server.closeAllConnections();
    for (const archive of archives.values()) archive.database.close();
    archives.clear();
    cache.clear();
    throw error;
  }
  let closing: Promise<void> | undefined;
  return {
    server,
    origin,
    counts,
    diagnostics: () => ({
      archives: archives.size,
      glyphCacheBytes: cache.bytes,
      glyphCacheEntries: cache.size,
      previousAvailable: Boolean(previous),
      closed,
    }),
    close: () =>
      (closing ??= new Promise<void>((ok, fail) => {
        server.close((error) => {
          for (const archive of archives.values()) archive.database.close();
          archives.clear();
          revisions.clear();
          cache.clear();
          closed = true;
          if (error) fail(error);
          else ok();
        });
        server.closeAllConnections();
      })),
  };
}
