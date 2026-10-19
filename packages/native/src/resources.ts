import { KitError } from '@korea-map-kit/core';
import type {
  StyleSpecification,
  VectorSourceSpecification,
} from '@maplibre/maplibre-gl-style-spec';

/** Explicit operator resources. This validates configuration, not native HTTP redirects. */
export interface NativeResourcePolicy {
  readonly allowedOrigins: readonly string[];
  /** Opt in only for device QA; RN PMTiles compatibility is not certified by this SDK. */
  readonly experimentalPMTiles?: boolean;
}
function originOf(value: string): string {
  if (/[\s\\]/u.test(value)) throw new KitError('INVALID_ARGUMENT', 'UNSAFE_NATIVE_RESOURCE');
  const match = /^(https?:)\/\/([^/?#]+)(?:\/[^?#]*)?$/.exec(value);
  if (!match || match[2]!.includes('@'))
    throw new KitError('INVALID_ARGUMENT', 'UNSAFE_NATIVE_RESOURCE');
  const authority = match[2]!.toLowerCase();
  if (!/^(?:[a-z0-9.-]+|\[::1\])(?::[0-9]{1,5})?$/.test(authority))
    throw new KitError('INVALID_ARGUMENT', 'UNSAFE_NATIVE_RESOURCE');
  if (match[1] === 'http:' && !/^(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?$/.test(authority))
    throw new KitError('INVALID_ARGUMENT', 'NATIVE_RESOURCE_REQUIRES_TLS');
  return `${match[1]}//${authority}`;
}
export function validateNativeResources(
  style: StyleSpecification,
  policy?: NativeResourcePolicy,
): void {
  const allowed = new Set(
    (policy?.allowedOrigins ?? []).map((origin) => {
      if (originOf(origin) !== origin)
        throw new KitError('INVALID_ARGUMENT', 'NATIVE_ORIGIN_REQUIRED');
      return origin;
    }),
  );
  function check(url: string) {
    if (!policy) throw new KitError('UNSUPPORTED', 'NATIVE_OFFLINE_GEOMETRY_STYLE_REQUIRED');
    if (!allowed.has(originOf(url)))
      throw new KitError('INVALID_ARGUMENT', 'NATIVE_ORIGIN_NOT_ALLOWED');
  }
  if (style.glyphs) {
    check(style.glyphs);
    if (!style.glyphs.includes('{fontstack}') || !style.glyphs.includes('{range}'))
      throw new KitError('INVALID_ARGUMENT', 'GLYPH_TEMPLATE_REQUIRED');
  }
  if (style.sprite) {
    for (const sprite of typeof style.sprite === 'string' ? [{ url: style.sprite }] : style.sprite)
      check(sprite.url);
  }
  for (const source of Object.values(style.sources)) {
    if (source.type === 'geojson' && source.data && typeof source.data === 'object') continue;
    if (!policy) throw new KitError('UNSUPPORTED', 'NATIVE_OFFLINE_GEOMETRY_STYLE_REQUIRED');
    if (!['vector', 'raster', 'raster-dem'].includes(source.type))
      throw new KitError('UNSUPPORTED', 'NATIVE_INLINE_DATA_REQUIRED');
    const tile = source as VectorSourceSpecification;
    if (tile.url) {
      if (!policy.experimentalPMTiles || !tile.url.startsWith('pmtiles://https://') || tile.tiles)
        throw new KitError('UNSUPPORTED', 'NATIVE_DIRECT_TILES_REQUIRED');
      check(tile.url.slice('pmtiles://'.length));
    } else {
      if (!tile.tiles?.length) throw new KitError('INVALID_ARGUMENT', 'NATIVE_TILES_REQUIRED');
      for (const url of tile.tiles) {
        check(url);
        if (!['{z}', '{x}', '{y}'].every((token) => url.includes(token)))
          throw new KitError('INVALID_ARGUMENT', 'XYZ_TEMPLATE_REQUIRED');
      }
    }
  }
  if (
    style.layers.some((layer) => layer.type === 'symbol' && layer.layout?.['text-field']) &&
    !style.glyphs
  )
    throw new KitError('INVALID_ARGUMENT', 'NATIVE_GLYPHS_REQUIRED');
}

/** HTTP is the default. Retry through a new MapView after an experimental PMTiles load failure. */
export function createNativeVectorSource(options: {
  tiles: readonly string[];
  attribution: string;
  pmtilesUrl?: string;
  transport?: 'http' | 'experimental-pmtiles';
}): VectorSourceSpecification {
  if (!options.attribution.trim() || !options.tiles.length)
    throw new KitError('INVALID_ARGUMENT', 'TILE_CONFIG_REQUIRED');
  for (const tile of options.tiles) {
    originOf(tile);
    if (!['{z}', '{x}', '{y}'].every((token) => tile.includes(token)))
      throw new KitError('INVALID_ARGUMENT', 'XYZ_TEMPLATE_REQUIRED');
  }
  if (options.transport === 'experimental-pmtiles') {
    if (!options.pmtilesUrl?.startsWith('https://'))
      throw new KitError('INVALID_ARGUMENT', 'PMTILES_URL_REQUIRED');
    originOf(options.pmtilesUrl);
    return {
      type: 'vector',
      url: `pmtiles://${options.pmtilesUrl}`,
      attribution: options.attribution,
    };
  }
  return { type: 'vector', tiles: [...options.tiles], attribution: options.attribution };
}
