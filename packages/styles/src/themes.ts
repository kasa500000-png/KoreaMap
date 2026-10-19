import {
  validateStyleMin,
  type StyleSpecification,
  type LayerSpecification,
  type GeoJSONSourceSpecification,
  type VectorSourceSpecification,
  type ExpressionSpecification,
  type SourceSpecification,
} from '@maplibre/maplibre-gl-style-spec';
import { KitError } from 'korea-map-core';
import { resolveTheme, type ThemeName, type ThemeOverrides } from './tokens.js';
import { createDesignFixture } from './design-fixture.js';
import { koreanNameExpression } from './labels.js';
export type TypographyConfig =
  | { mode: 'none' }
  | { mode: 'local'; fontStack: readonly string[] }
  | { mode: 'glyphs'; fontStack: readonly string[]; url: string };
export type FeatureKind =
  'land' | 'park' | 'water' | 'building' | 'boundary' | 'road' | 'trail' | 'place' | 'poi';
export interface ThemeStyleOptions {
  theme: ThemeName;
  target: 'web' | 'native';
  data:
    | { mode: 'fixture' }
    | {
        mode: 'operator';
        source: GeoJSONSourceSpecification | VectorSourceSpecification;
        sourceLayers?: Partial<Record<FeatureKind, string>>;
        attribution: string;
      };
  typography: TypographyConfig;
  overrides?: ThemeOverrides;
  /** Register createPoiIcon results under korea-poi-{kind} before rendering. */
  icons?: boolean;
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function width(stops: readonly number[]): ExpressionSpecification {
  return ['interpolate', ['linear'], ['zoom'], 10, stops[0]!, 14, stops[1]!, 18, stops[2]!];
}
export function parseCustomStyle(input: unknown): StyleSpecification {
  let value: unknown;
  try {
    if (typeof input === 'string') value = JSON.parse(input);
    else {
      const serialized = JSON.stringify(input, (_key, entry: unknown) => {
        if (
          typeof entry === 'function' ||
          typeof entry === 'symbol' ||
          typeof entry === 'bigint' ||
          (typeof entry === 'number' && !Number.isFinite(entry))
        )
          throw new Error('Not JSON');
        return entry;
      });
      value = JSON.parse(serialized);
    }
    if (validateStyleMin(value as StyleSpecification).length) throw new Error('Invalid spec');
  } catch {
    throw new KitError('INVALID_ARGUMENT', 'INVALID_STYLE_SPEC');
  }
  const inspect = (entry: unknown): void => {
    if (!entry || typeof entry !== 'object') return;
    for (const [key, child] of Object.entries(entry)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key))
        throw new KitError('INVALID_ARGUMENT', 'UNSAFE_STYLE_KEY');
      inspect(child);
    }
  };
  inspect(value);
  return value as StyleSpecification;
}
/** Strict style-spec validation; no fetch, font download or endpoint selection. */
export function createThemeStyle(options: ThemeStyleOptions): StyleSpecification {
  if (
    !options ||
    !['web', 'native'].includes(options.target) ||
    !options.data ||
    !['fixture', 'operator'].includes(options.data.mode)
  )
    throw new KitError('INVALID_ARGUMENT', 'STYLE_CONFIG_REQUIRED');
  const tokens = resolveTheme(options.theme, options.overrides);
  const typography = options.typography;
  if (!typography || !['none', 'local', 'glyphs'].includes(typography.mode))
    throw new KitError('INVALID_ARGUMENT', 'TYPOGRAPHY_REQUIRED');
  if (typography.mode === 'local' && options.target !== 'web')
    throw new KitError('UNSUPPORTED', 'NATIVE_REQUIRES_GLYPHS');
  if (
    typography.mode !== 'none' &&
    (!Array.isArray(typography.fontStack) ||
      !typography.fontStack.length ||
      typography.fontStack.length > 5 ||
      typography.fontStack.some(
        (name) => typeof name !== 'string' || !name.trim() || !/^[-\p{L}\p{N} ._]+$/u.test(name),
      ))
  )
    throw new KitError('INVALID_ARGUMENT', 'FONT_STACK_REQUIRED');
  if (typography.mode === 'glyphs') {
    const safe =
      typeof typography.url === 'string' &&
      /^(?:https:\/\/[a-z0-9][a-z0-9.-]*(?::[0-9]{1,5})?|http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?)\/[^\s#\\]*$/i.test(
        typography.url,
      ) &&
      typography.url.includes('{fontstack}') &&
      typography.url.includes('{range}');
    if (!safe) throw new KitError('INVALID_ARGUMENT', 'GLYPH_URL_REQUIRED');
  }
  const source =
    options.data.mode === 'fixture' ? createDesignFixture() : clone(options.data.source);
  if (options.data.mode === 'operator') {
    if (!options.data.attribution?.trim() || !['geojson', 'vector'].includes(source.type))
      throw new KitError('INVALID_ARGUMENT', 'DATA_ATTRIBUTION_REQUIRED');
    source.attribution = options.data.attribution;
    if (source.type === 'vector' && !options.data.sourceLayers)
      throw new KitError('INVALID_ARGUMENT', 'SOURCE_LAYERS_REQUIRED');
  }
  const layers: LayerSpecification[] = [
    {
      id: 'korea-background',
      type: 'background',
      paint: { 'background-color': tokens.colors.background },
    },
  ];
  const binding = (kind: FeatureKind) => {
    const sourceLayer =
      options.data.mode === 'operator' ? options.data.sourceLayers?.[kind] : undefined;
    if (source.type === 'vector' && !sourceLayer)
      throw new KitError('INVALID_ARGUMENT', 'SOURCE_LAYER_REQUIRED');
    return {
      source: 'korea-base',
      ...(sourceLayer ? { 'source-layer': sourceLayer } : {}),
      filter: ['==', ['get', 'kind'], kind] as ExpressionSpecification,
    };
  };
  for (const kind of ['land', 'park', 'water'] as const)
    layers.push({
      id: `korea-${kind}`,
      type: 'fill',
      ...binding(kind),
      paint: { 'fill-color': tokens.colors[kind] },
    });
  layers.push({
    id: 'korea-building',
    type: 'fill',
    ...binding('building'),
    minzoom: tokens.zoom.building,
    paint: { 'fill-color': tokens.colors.building },
  });
  layers.push({
    id: 'korea-building-outline',
    type: 'line',
    ...binding('building'),
    minzoom: tokens.zoom.building,
    paint: {
      'line-color': tokens.colors.buildingOutline,
      'line-width': tokens.widths.buildingOutline,
    },
  });
  layers.push({
    id: 'korea-boundary',
    type: 'line',
    ...binding('boundary'),
    minzoom: tokens.zoom.boundary,
    paint: {
      'line-color': tokens.colors.boundary,
      'line-width': tokens.widths.boundary,
      'line-dasharray': [3, 3],
    },
  });
  for (const category of ['minor', 'major'] as const) {
    const minzoom = category === 'minor' ? tokens.zoom.minorRoad : 5;
    const stops = tokens.widths[category];
    const filter: ExpressionSpecification = [
      'all',
      ['==', ['get', 'kind'], 'road'],
      ['==', ['get', 'class'], category],
    ];
    layers.push({
      id: `korea-road-${category}-casing`,
      type: 'line',
      ...binding('road'),
      filter,
      minzoom,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': tokens.colors.roadCasing,
        'line-width': width(stops.map((value) => value + tokens.widths.casing * 2)),
      },
    });
    layers.push({
      id: `korea-road-${category}`,
      type: 'line',
      ...binding('road'),
      filter,
      minzoom,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': category === 'major' ? tokens.colors.roadMajor : tokens.colors.roadMinor,
        'line-width': width(stops),
      },
    });
  }
  layers.push({
    id: 'korea-trail',
    type: 'line',
    ...binding('trail'),
    minzoom: tokens.zoom.trail,
    layout: { 'line-cap': 'round' },
    paint: {
      'line-color': tokens.colors.trail,
      'line-width': width(tokens.widths.trail),
      'line-dasharray': [1.5, 1.2],
    },
  });
  layers.push({
    id: 'korea-poi-dot',
    type: 'circle',
    ...binding('poi'),
    minzoom: tokens.zoom.poi,
    paint: {
      'circle-color': tokens.colors.poi,
      'circle-radius': 4,
      'circle-stroke-color': tokens.colors.poiInk,
      'circle-stroke-width': 1.5,
    },
  });
  if (options.icons)
    layers.push({
      id: 'korea-poi-icons',
      type: 'symbol',
      ...binding('poi'),
      minzoom: tokens.zoom.poi,
      layout: {
        'icon-image': [
          'match',
          ['get', 'poi'],
          'park',
          'korea-poi-park',
          'parking',
          'korea-poi-parking',
          'trail',
          'korea-poi-trail',
          'korea-poi-facility',
        ],
        'icon-size': 0.75,
        'icon-allow-overlap': false,
      },
    });
  if (typography.mode !== 'none') {
    for (const kind of ['road', 'place', 'poi'] as const)
      layers.push({
        id: `korea-label-${kind}`,
        type: 'symbol',
        ...binding(kind),
        minzoom: kind === 'poi' ? tokens.zoom.poi : tokens.zoom.label,
        layout: {
          'text-field': koreanNameExpression(),
          'text-font': [...typography.fontStack],
          'text-size': width(tokens.typography.size),
          'text-max-width': 10,
          'text-padding': 8,
          ...(kind === 'road'
            ? { 'symbol-placement': 'line' as const }
            : {
                'text-offset': kind === 'poi' ? [0, 1.4] : [0, 0],
                'text-anchor': kind === 'poi' ? ('top' as const) : ('center' as const),
              }),
        },
        paint: {
          'text-color': tokens.colors.label,
          'text-halo-color': tokens.colors.labelHalo,
          'text-halo-width': tokens.typography.halo,
        },
      });
  }
  return parseCustomStyle({
    version: 8,
    name: `Korea Map Kit ${options.theme}`,
    metadata: {
      'korea:theme': options.theme,
      'korea:schema': 'design-v1',
      'korea:target': options.target,
      'korea:attribution-required': source.attribution,
    },
    sources: { 'korea-base': source },
    layers,
    ...(typography.mode === 'glyphs' ? { glyphs: typography.url } : {}),
  });
}
/** Append only: required data sources, source attribution and base layers cannot be replaced. */
export function extendStyle(
  input: StyleSpecification,
  extension: {
    sources?: Record<string, SourceSpecification>;
    layers?: readonly LayerSpecification[];
  },
): StyleSpecification {
  const style = parseCustomStyle(input);
  for (const [id, source] of Object.entries(extension.sources ?? {})) {
    if (
      ['__proto__', 'constructor', 'prototype'].includes(id) ||
      Object.hasOwn(style.sources, id) ||
      id.startsWith('korea-') ||
      id.startsWith('kmk-')
    )
      throw new KitError('INVALID_ARGUMENT', 'RESERVED_SOURCE_ID');
    if (
      !('attribution' in source) ||
      typeof source.attribution !== 'string' ||
      !source.attribution.trim()
    )
      throw new KitError('INVALID_ARGUMENT', 'DATA_ATTRIBUTION_REQUIRED');
    style.sources[id] = clone(source);
  }
  const ids = new Set(style.layers.map((layer) => layer.id));
  for (const layer of extension.layers ?? []) {
    if (ids.has(layer.id) || layer.id.startsWith('korea-') || layer.id.startsWith('kmk-'))
      throw new KitError('INVALID_ARGUMENT', 'RESERVED_LAYER_ID');
    ids.add(layer.id);
    style.layers.push(clone(layer));
  }
  return parseCustomStyle(style);
}
