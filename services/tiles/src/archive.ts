import { DatabaseSync } from 'node:sqlite';
import { openSync, readSync, closeSync, lstatSync } from 'node:fs';
import { inflateSync, gunzipSync } from 'node:zlib';
import { validateMvt } from './mvt.js';
import {
  invariant,
  optionalSourceLayers,
  sourceLayers,
  tileSchema,
  v2Fields,
  type TileSchema,
} from './config.js';

/** Read the standard OSMHeader replication timestamp without loading the complete PBF. */
function fields(bytes: Uint8Array): Map<number, Array<number | Uint8Array>> {
  let offset = 0;
  const result = new Map<number, Array<number | Uint8Array>>();
  const integer = () => {
    let value = 0,
      factor = 1;
    for (let i = 0; i < 10; i++) {
      invariant(offset < bytes.length, 'TRUNCATED_PROTOBUF');
      const b = bytes[offset++]!;
      value += (b & 127) * factor;
      if (b < 128) {
        invariant(Number.isSafeInteger(value), 'OVERSIZE_PROTOBUF_INTEGER');
        return value;
      }
      factor *= 128;
    }
    throw new Error('INVALID_PROTOBUF_INTEGER');
  };
  while (offset < bytes.length) {
    const tag = integer(),
      type = tag & 7,
      field = tag >>> 3;
    invariant(field > 0, 'INVALID_PROTOBUF_FIELD');
    let value: number | Uint8Array;
    if (type === 0) value = integer();
    else if (type === 2) {
      const size = integer();
      invariant(offset + size <= bytes.length, 'TRUNCATED_PROTOBUF');
      value = bytes.subarray(offset, offset + size);
      offset += size;
    } else if (type === 1 || type === 5) {
      offset += type === 1 ? 8 : 4;
      invariant(offset <= bytes.length, 'TRUNCATED_PROTOBUF');
      continue;
    } else throw new Error('UNSUPPORTED_PROTOBUF_WIRE');
    const values = result.get(field) ?? [];
    values.push(value);
    result.set(field, values);
  }
  return result;
}
export function pbfTimestamp(path: string): string {
  const fd = openSync(path, 'r');
  try {
    const size = Buffer.alloc(4);
    invariant(readSync(fd, size) === 4, 'INVALID_OSM_PBF');
    const length = size.readUInt32BE();
    invariant(length > 0 && length <= 65536, 'INVALID_OSM_PBF');
    const headerBytes = Buffer.alloc(length);
    invariant(readSync(fd, headerBytes) === length, 'INVALID_OSM_PBF');
    const header = fields(headerBytes),
      type = header.get(1)?.[0],
      blobLength = header.get(3)?.[0];
    invariant(
      type instanceof Uint8Array &&
        Buffer.from(type).toString() === 'OSMHeader' &&
        typeof blobLength === 'number' &&
        blobLength > 0 &&
        blobLength <= 16 * 1024 * 1024,
      'INVALID_OSM_HEADER',
    );
    const blobBytes = Buffer.alloc(blobLength);
    invariant(readSync(fd, blobBytes) === blobLength, 'INVALID_OSM_PBF');
    const blob = fields(blobBytes),
      raw = blob.get(1)?.[0],
      compressed = blob.get(3)?.[0];
    const block =
      raw instanceof Uint8Array
        ? raw
        : compressed instanceof Uint8Array
          ? inflateSync(compressed, { maxOutputLength: 16 * 1024 * 1024 })
          : undefined;
    invariant(block, 'UNSUPPORTED_OSM_COMPRESSION');
    const timestamp = fields(block).get(32)?.[0];
    invariant(
      typeof timestamp === 'number' && timestamp > 0 && timestamp * 1000 <= Date.now(),
      'OSM_REPLICATION_TIME_REQUIRED',
    );
    return new Date(timestamp * 1000).toISOString();
  } finally {
    closeSync(fd);
  }
}
export interface ArchiveInfo {
  tileCount: number;
  layers: string[];
  minzoom: number;
  maxzoom: number;
  gzip: boolean;
}
export const maximumStoredTileBytes = 8 * 1024 * 1024;
export const maximumExpandedTileBytes = 8 * 1024 * 1024;
export function inspectArchive(path: string, schema: TileSchema = 'design-v1'): ArchiveInfo {
  tileSchema(schema);
  invariant(
    ['-wal', '-journal', '-shm'].every(
      (suffix) => !lstatSync(`${path}${suffix}`, { throwIfNoEntry: false }),
    ),
    'UNHASHED_ARCHIVE_SIDECAR',
  );
  const db = new DatabaseSync(path, { readOnly: true, allowExtension: false });
  try {
    db.exec('PRAGMA trusted_schema=OFF');
    const tables = db
      .prepare(
        "SELECT name,type,sql FROM sqlite_schema WHERE name IN ('metadata','tiles','tiles_shallow','tiles_data')",
      )
      .all();
    invariant(
      tables.find((r) => r['name'] === 'metadata')?.['type'] === 'table',
      'UNSUPPORTED_ARCHIVE_LAYOUT',
    );
    const tileSchema = tables.find((r) => r['name'] === 'tiles');
    if (tileSchema?.['type'] === 'view') {
      const canonical =
        'CREATE VIEW tiles AS select tiles_shallow.zoom_level as zoom_level, tiles_shallow.tile_column as tile_column, tiles_shallow.tile_row as tile_row, tiles_data.tile_data as tile_data from tiles_shallow join tiles_data on tiles_shallow.tile_data_id = tiles_data.tile_data_id';
      const normalized = (value: unknown) =>
        String(value).replace(/\s+/g, ' ').trim().toLowerCase();
      invariant(
        normalized(tileSchema['sql']) === normalized(canonical) &&
          ['tiles_shallow', 'tiles_data'].every(
            (n) => tables.find((r) => r['name'] === n)?.['type'] === 'table',
          ),
        'UNSUPPORTED_ARCHIVE_LAYOUT',
      );
      const primaryKey = (table: 'tiles_data' | 'tiles_shallow') =>
        db
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .filter((row) => Number(row['pk']) > 0)
          .sort((a, b) => Number(a['pk']) - Number(b['pk']))
          .map((row) => String(row['name']));
      invariant(
        JSON.stringify(primaryKey('tiles_data')) === JSON.stringify(['tile_data_id']) &&
          JSON.stringify(primaryKey('tiles_shallow')) ===
            JSON.stringify(['zoom_level', 'tile_column', 'tile_row']),
        'UNSUPPORTED_ARCHIVE_LAYOUT',
      );
    } else invariant(tileSchema?.['type'] === 'table', 'UNSUPPORTED_ARCHIVE_LAYOUT');
    invariant(
      db.prepare('PRAGMA quick_check').get()?.['quick_check'] === 'ok',
      'INVALID_TILE_ARCHIVE',
    );
    const metadataSize = db
      .prepare(
        'SELECT count(*) AS n, max(length(CAST(value AS BLOB))) AS bytes, max(length(CAST(name AS BLOB))) AS nameBytes, sum(length(CAST(name AS BLOB))+length(CAST(value AS BLOB))) AS totalBytes FROM metadata',
      )
      .get();
    invariant(
      Number(metadataSize?.['n']) <= 100 &&
        Number(metadataSize?.['bytes']) <= 2 * 1024 * 1024 &&
        Number(metadataSize?.['nameBytes']) <= 128 &&
        Number(metadataSize?.['totalBytes']) <= 4 * 1024 * 1024,
      'OVERSIZE_ARCHIVE_METADATA',
    );
    const metadata = Object.fromEntries(
      db
        .prepare('SELECT name,value FROM metadata')
        .all()
        .map((r) => [String(r['name']), String(r['value'])]),
    );
    const json = JSON.parse(metadata['json'] ?? '{}') as {
      vector_layers?: Array<{ id: string; fields?: Record<string, unknown> }>;
    };
    invariant(Array.isArray(json.vector_layers), 'UNREVIEWED_TILE_SCHEMA');
    const layers = (json.vector_layers ?? []).map((l) => l.id).sort();
    invariant(new Set(layers).size === layers.length, 'UNREVIEWED_TILE_SCHEMA');
    const count = Number(db.prepare('SELECT count(*) AS n FROM tiles').get()?.['n']);
    // Check SQLite storage classes before length(): TEXT reports characters, not stored bytes.
    // Both gates return scalar metadata before any tile_data BLOB is materialized in JavaScript.
    invariant(
      !db.prepare("SELECT 1 FROM tiles WHERE typeof(tile_data) <> 'blob' LIMIT 1").get(),
      'INVALID_TILE_PAYLOAD',
    );
    const largest = Number(
      db.prepare('SELECT max(length(tile_data)) AS n FROM tiles').get()?.['n'],
    );
    invariant(largest > 0 && largest <= maximumStoredTileBytes, 'OVERSIZE_TILE');
    const sample = db.prepare('SELECT tile_data FROM tiles LIMIT 1').get()?.['tile_data'];
    invariant(
      count > 0 &&
        count <= 50_000_000 &&
        sample instanceof Uint8Array &&
        sample.length > 0 &&
        layers.length > 0,
      'EMPTY_TILE_ARCHIVE',
    );
    invariant(
      layers.every(
        (v) =>
          Object.hasOwn(sourceLayers, v) ||
          (schema === 'design-v2' &&
            optionalSourceLayers.includes(v as (typeof optionalSourceLayers)[number])),
      ),
      'UNREVIEWED_TILE_SCHEMA',
    );
    if (schema === 'design-v2') {
      invariant(metadata['version'] === '2.1.0', 'ARCHIVE_SCHEMA_REVISION_MISMATCH');
      invariant(
        json.vector_layers.every(
          (layer) =>
            layer.fields &&
            ['kind', 'fid', 'subclass', 'rank', 'minzoom'].every((field) =>
              Object.hasOwn(layer.fields!, field),
            ) &&
            ['kind', 'fid', 'subclass'].every((field) => layer.fields![field] === 'String') &&
            ['rank', 'minzoom'].every((field) => layer.fields![field] === 'Number') &&
            Object.keys(layer.fields).every((field) =>
              v2Fields.includes(field as (typeof v2Fields)[number]),
            ),
        ),
        'UNREVIEWED_TILE_FIELDS',
      );
      const invalidCoordinates = db
        .prepare(
          `SELECT count(*) AS n FROM tiles WHERE
        zoom_level IS NULL OR tile_column IS NULL OR tile_row IS NULL OR
        zoom_level < 0 OR zoom_level > 16 OR zoom_level != CAST(zoom_level AS INTEGER) OR
        tile_column < 0 OR tile_column >= (1 << zoom_level) OR tile_column != CAST(tile_column AS INTEGER) OR
        tile_row < 0 OR tile_row >= (1 << zoom_level) OR tile_row != CAST(tile_row AS INTEGER)`,
        )
        .get();
      invariant(Number(invalidCoordinates?.['n']) === 0, 'INVALID_TILE_COORDINATE');
    }
    const minzoom = Number(metadata['minzoom']),
      maxzoom = Number(metadata['maxzoom']);
    invariant(
      Number.isInteger(minzoom) &&
        Number.isInteger(maxzoom) &&
        minzoom >= 0 &&
        maxzoom <= (schema === 'design-v2' ? 16 : 14) &&
        minzoom <= maxzoom,
      'INVALID_ARCHIVE_ZOOM',
    );
    if (schema === 'design-v2') {
      const actualZoom = db
        .prepare('SELECT min(zoom_level) AS lo,max(zoom_level) AS hi FROM tiles')
        .get();
      invariant(
        Number(actualZoom?.['lo']) >= minzoom && Number(actualZoom?.['hi']) <= maxzoom,
        'ARCHIVE_ZOOM_COVERAGE_MISMATCH',
      );
    }
    let gzip: boolean | undefined;
    const declared = new Set(layers);
    // Iterate one bounded BLOB at a time; checksum/SQLite validity alone cannot validate compressed MVT.
    for (const row of db.prepare('SELECT tile_data FROM tiles').iterate()) {
      const data = row['tile_data'];
      invariant(data instanceof Uint8Array && data.length > 0, 'INVALID_TILE_PAYLOAD');
      const compressed = data[0] === 31 && data[1] === 139;
      invariant(gzip === undefined || gzip === compressed, 'MIXED_TILE_COMPRESSION');
      gzip = compressed;
      let expanded: Uint8Array = data;
      if (compressed) {
        try {
          expanded = gunzipSync(data, { maxOutputLength: maximumExpandedTileBytes });
        } catch (error) {
          if ((error as NodeJS.ErrnoException)?.code === 'ERR_BUFFER_TOO_LARGE')
            throw new Error('OVERSIZE_EXPANDED_TILE', { cause: error });
          throw new Error('INVALID_TILE_GZIP', { cause: error });
        }
      }
      invariant(expanded.length > 0, 'EMPTY_MVT_TILE');
      invariant(expanded.length <= maximumExpandedTileBytes, 'OVERSIZE_EXPANDED_TILE');
      validateMvt(expanded, declared);
    }
    return {
      tileCount: count,
      layers,
      minzoom,
      maxzoom,
      gzip: gzip === true,
    };
  } finally {
    db.close();
  }
}
export function tileRow(zoom: number, y: number, maxzoom = 14): number {
  invariant(
    Number.isInteger(zoom) &&
      zoom >= 0 &&
      (maxzoom === 14 || maxzoom === 16) &&
      zoom <= maxzoom &&
      Number.isInteger(y) &&
      y >= 0 &&
      y < 2 ** zoom,
    'INVALID_TILE_COORDINATE',
  );
  return 2 ** zoom - 1 - y;
}
