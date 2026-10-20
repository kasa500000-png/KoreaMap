import type {
  ExpressionSpecification,
  GeoJSONSourceSpecification,
  LayerSpecification,
  StyleSpecification,
  VectorSourceSpecification,
} from '@maplibre/maplibre-gl-style-spec';
import { KitError } from 'korea-map-core';
import { createThemeStyle, parseCustomStyle, type ThemeStyleOptions } from './themes.js';
import { resolveTheme } from './tokens.js';
import { koreanNameExpression } from './labels.js';
import { createCartographyFixture } from './cartography-fixture.js';
import {
  cartographyOptionalKinds,
  designV2,
  type CartographyCapabilities,
  type CartographyDensity,
  type CartographyKind,
  type CartographySchema,
} from './cartography-schema.js';

export interface CartographySource {
  source: GeoJSONSourceSpecification | VectorSourceSpecification;
  sourceLayers?: Partial<Record<CartographyKind, string>>;
  attribution: string;
  capabilities?: CartographyCapabilities;
}
export interface CartographyStyleOptions extends Omit<ThemeStyleOptions, 'data'> {
  data:
    | { mode: 'fixture'; capabilities?: CartographyCapabilities }
    | (CartographySource & {
        mode: 'operator';
        /** Optional generalized source for z0–9; detail takes over at z10. */
        context?: CartographySource;
      });
  schema?: CartographySchema;
  density?: CartographyDensity;
}

const expression = (value: unknown) => value as ExpressionSpecification;
const and = (...values: unknown[]) => expression(['all', ...values]);
const eq = (field: string, value: unknown) => ['==', ['get', field], value];
const named = () => ['!=', koreanNameExpression(), ''];
const rank = (fallback: number | unknown[] = 9) => [
  'max',
  0,
  ['min', 999, ['case', ['has', 'rank'], ['to-number', ['get', 'rank'], fallback], fallback]],
];
const roadClass = () => [
  'match',
  ['get', 'subclass'],
  ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'service'],
  ['get', 'subclass'],
  ['unclassified', 'living_street', 'road'],
  'residential',
  ['match', ['get', 'class'], 'major', 'primary', 'residential'],
];
const grade = () => [
  'case',
  ['in', ['to-string', ['get', 'tunnel']], ['literal', ['true', 'yes', '1']]],
  'tunnel',
  ['in', ['to-string', ['get', 'bridge']], ['literal', ['true', 'yes', '1']]],
  'bridge',
  'ground',
];
const poiRank = () =>
  rank([
    'match',
    ['coalesce', ['get', 'poiCategory'], ['get', 'subclass'], ['get', 'poi']],
    ['hospital', 'station', 'university'],
    20,
    ['park', 'attraction', 'museum', 'viewpoint', 'tourism'],
    30,
    'trail',
    45,
    'parking',
    60,
    50,
  ]);
const zoomSize = (first: number, middle: number, last: number) =>
  expression(['interpolate', ['linear'], ['zoom'], 6, first, 13, middle, 18, last]);
const lineWidth = (stops: readonly number[], factor = 1, casing = 0) =>
  expression([
    'interpolate',
    ['linear'],
    ['zoom'],
    6,
    stops[0]! * factor * 0.35 + casing,
    10,
    stops[0]! * factor + casing,
    14,
    stops[1]! * factor + casing,
    18,
    stops[2]! * factor + casing,
  ]);

/** Opt-in cartographic hierarchy. Never fetches assets, chooses endpoints or changes user overlays. */
export function createCartographyStyle(options: CartographyStyleOptions): StyleSpecification {
  // Reuse the original data/font/token/security validation without altering its output or IDs.
  const base = createThemeStyle(options);
  const schema = options.schema ?? 'design-v2';
  const density = options.density ?? 'balanced';
  if (!['design-v1', 'design-v2'].includes(schema))
    throw new KitError('INVALID_ARGUMENT', 'UNKNOWN_CARTOGRAPHY_SCHEMA');
  if (!['balanced', 'sparse', 'dense'].includes(density))
    throw new KitError('INVALID_ARGUMENT', 'UNKNOWN_CARTOGRAPHY_DENSITY');
  const tokens = resolveTheme(options.theme, options.overrides);
  const typography = options.typography;
  if (options.data.mode === 'fixture') base.sources['korea-base'] = createCartographyFixture();
  const hasContext = options.data.mode === 'operator' && options.data.context !== undefined;
  const inputs: { id: string; input: CartographySource; minimum: number; maximum?: number }[] = [];
  const main: CartographySource =
    options.data.mode === 'fixture'
      ? {
          source: base.sources['korea-base'] as GeoJSONSourceSpecification,
          attribution: String(
            (base.sources['korea-base'] as GeoJSONSourceSpecification).attribution,
          ),
          ...(options.data.capabilities ? { capabilities: options.data.capabilities } : {}),
        }
      : options.data;
  if (hasContext && options.data.mode === 'operator') {
    const input = options.data.context!;
    if (!input.attribution?.trim() || !['geojson', 'vector'].includes(input.source?.type))
      throw new KitError('INVALID_ARGUMENT', 'DATA_ATTRIBUTION_REQUIRED');
    if (input.source.type === 'vector' && !input.sourceLayers)
      throw new KitError('INVALID_ARGUMENT', 'SOURCE_LAYERS_REQUIRED');
    base.sources['korea-context'] = JSON.parse(
      JSON.stringify({ ...input.source, attribution: input.attribution }),
    );
    inputs.push({ id: 'korea-context', input, minimum: 0, maximum: 10 });
  }
  inputs.push({ id: 'korea-base', input: main, minimum: hasContext ? 10 : 0 });
  for (const { input } of inputs) {
    const caps = input.capabilities;
    if (
      caps &&
      (typeof caps !== 'object' ||
        Array.isArray(caps) ||
        Object.entries(caps).some(
          ([key, value]) =>
            ![...cartographyOptionalKinds, 'ocean'].includes(key as never) ||
            typeof value !== 'boolean',
        ))
    )
      throw new KitError('INVALID_ARGUMENT', 'INVALID_CARTOGRAPHY_CAPABILITY');
    if (caps?.ocean && !caps.landmask)
      throw new KitError('INVALID_ARGUMENT', 'OCEAN_REQUIRES_LANDMASK');
    for (const kind of cartographyOptionalKinds)
      if (caps?.[kind] && input.source.type === 'vector' && !input.sourceLayers?.[kind])
        throw new KitError('INVALID_ARGUMENT', 'CAPABILITY_SOURCE_LAYER_REQUIRED');
  }
  const layers: LayerSpecification[] = [];
  const size = tokens.typography.size;
  const textPaint = {
    'text-color': tokens.colors.label,
    'text-halo-color': tokens.colors.labelHalo,
    'text-halo-width': tokens.typography.halo,
  };
  for (const { id, input, minimum, maximum } of inputs) {
    const suffix = id === 'korea-context' ? '-context' : '';
    const binding = (kind: CartographyKind) => ({
      source: id,
      ...(input.source.type === 'vector' ? { 'source-layer': input.sourceLayers![kind]! } : {}),
    });
    const available = (kind: CartographyKind) =>
      input.source.type !== 'vector' || Boolean(input.sourceLayers?.[kind]);
    const add = (layer: LayerSpecification, kind?: CartographyKind) => {
      if (kind && !available(kind)) return;
      if (maximum !== undefined && Math.max(layer.minzoom ?? 0, minimum) >= maximum) return;
      layers.push({
        ...layer,
        id: `${layer.id}${suffix}`,
        minzoom: Math.max(layer.minzoom ?? 0, minimum),
        ...(maximum === undefined ? {} : { maxzoom: maximum }),
        ...(kind
          ? {
              filter: and('filter' in layer ? (layer.filter ?? true) : true, [
                '<=',
                ['to-number', ['get', 'minzoom'], 0],
                ['zoom'],
              ]),
            }
          : {}),
      });
    };
    add({
      id: 'korea-background',
      type: 'background',
      paint: {
        'background-color': input.capabilities?.ocean
          ? tokens.colors.water
          : tokens.colors.background,
      },
    });
    if (input.capabilities?.landmask)
      add(
        {
          id: 'korea-landmask',
          type: 'fill',
          ...binding('landmask'),
          filter: and(eq('kind', 'landmask')),
          paint: { 'fill-color': tokens.colors.land },
        },
        'landmask',
      );
    for (const kind of ['land', 'park', 'water'] as const)
      add(
        {
          id: `korea-${kind}`,
          type: 'fill',
          ...binding(kind),
          filter: and(eq('kind', kind)),
          paint: { 'fill-color': tokens.colors[kind] },
        },
        kind,
      );
    if (input.capabilities?.waterway)
      for (const [subclass, minzoom] of [
        ['river', 8],
        ['stream', 12],
      ] as const)
        add(
          {
            id: `korea-waterway-${subclass}`,
            type: 'line',
            ...binding('waterway'),
            filter: and(eq('kind', 'waterway'), [
              '==',
              ['match', ['get', 'subclass'], 'river', 'river', 'stream'],
              subclass,
            ]),
            minzoom,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': tokens.colors.water, 'line-width': lineWidth([0.6, 1.8, 5]) },
          },
          'waterway',
        );
    add(
      {
        id: 'korea-building',
        type: 'fill',
        ...binding('building'),
        filter: and(eq('kind', 'building')),
        minzoom: tokens.zoom.building,
        paint: {
          'fill-color': tokens.colors.building,
        },
      },
      'building',
    );
    add(
      {
        id: 'korea-building-outline',
        type: 'line',
        ...binding('building'),
        filter: and(eq('kind', 'building')),
        minzoom: tokens.zoom.building,
        paint: {
          'line-color': tokens.colors.buildingOutline,
          'line-width': tokens.widths.buildingOutline,
        },
      },
      'building',
    );
    add(
      {
        id: 'korea-boundary',
        type: 'line',
        ...binding('boundary'),
        filter: and(eq('kind', 'boundary')),
        minzoom: tokens.zoom.boundary,
        paint: {
          'line-color': tokens.colors.boundary,
          'line-opacity': 0.65,
          'line-width': tokens.widths.boundary,
          'line-dasharray': [3, 3],
        },
      },
      'boundary',
    );
    for (const elevation of ['tunnel', 'ground', 'bridge'] as const)
      for (const [index, subclass] of [
        ...designV2.roadSubclasses.slice(0, 7).entries(),
      ].reverse()) {
        const minor = index >= 5;
        const minzoom = minor
          ? Math.max(11, tokens.zoom.minorRoad, subclass === 'service' ? 13 : 11)
          : [5, 6, 8, 9, 10][index]!;
        const width = minor ? tokens.widths.minor : tokens.widths.major;
        const factor = [1.5, 1.3, 1.15, 1, 0.85, 1, 0.7][index]!;
        const filter = and(
          eq('kind', 'road'),
          ['==', roadClass(), subclass],
          ['==', grade(), elevation],
        );
        const layout = {
          'line-cap': 'round' as const,
          'line-join': 'round' as const,
          'line-sort-key': expression([
            '+',
            ['*', ['to-number', ['get', 'layer'], 0], 100],
            ['-', 100, rank(index + 1)],
          ]),
        };
        for (const casing of [true, false])
          add(
            {
              id: `korea-road-${subclass}-${elevation}${casing ? '-casing' : ''}`,
              type: 'line',
              ...binding('road'),
              filter,
              minzoom,
              layout,
              paint: {
                'line-color': casing
                  ? tokens.colors.roadCasing
                  : minor
                    ? tokens.colors.roadMinor
                    : tokens.colors.roadMajor,
                'line-width': lineWidth(
                  width,
                  factor,
                  casing ? tokens.widths.casing * (elevation === 'bridge' ? 2.3 : 1.6) : 0,
                ),
                'line-opacity': elevation === 'tunnel' ? 0.55 : 1,
                ...(elevation === 'tunnel' && casing ? { 'line-dasharray': [2, 1.5] } : {}),
              },
            },
            'road',
          );
      }
    if (input.capabilities?.rail) {
      add(
        {
          id: 'korea-rail',
          type: 'line',
          ...binding('rail'),
          filter: and(eq('kind', 'rail')),
          minzoom: 9,
          paint: {
            'line-color': tokens.colors.buildingOutline,
            'line-width': lineWidth([0.5, 1.4, 3]),
          },
        },
        'rail',
      );
      add(
        {
          id: 'korea-rail-sleepers',
          type: 'line',
          ...binding('rail'),
          filter: and(eq('kind', 'rail')),
          minzoom: 12,
          paint: {
            'line-color': tokens.colors.labelHalo,
            'line-width': lineWidth([0.25, 0.75, 1.4]),
            'line-dasharray': [2, 2],
          },
        },
        'rail',
      );
    }
    add(
      {
        id: 'korea-trail',
        type: 'line',
        ...binding('trail'),
        filter: and(eq('kind', 'trail')),
        minzoom: Math.max(options.theme === 'outdoor' ? 10 : 13, tokens.zoom.trail),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': tokens.colors.trail,
          'line-width': lineWidth(tokens.widths.trail),
          'line-dasharray': [1.5, 1.2],
        },
      },
      'trail',
    );
    if (typography.mode === 'none') continue;
    const font = [...typography.fontStack];
    const placeGroups = [
      { subclass: 'country', values: ['country'], zoom: 3, scale: 1.65 },
      { subclass: 'state', values: ['state', 'province'], zoom: 5, scale: 1.5 },
      { subclass: 'city', values: ['city'], zoom: 6, scale: 1.4 },
      { subclass: 'town', values: ['town'], zoom: 8, scale: 1.2 },
      { subclass: 'village', values: ['village'], zoom: 10, scale: 1.05 },
      { subclass: 'suburb', values: ['suburb', 'borough', 'quarter'], zoom: 11, scale: 1 },
      { subclass: 'neighbourhood', values: ['neighbourhood'], zoom: 12, scale: 0.95 },
    ];
    const labelZoomDelta =
      options.overrides?.zoom?.label === undefined ? 0 : tokens.zoom.label - 11;
    for (const { subclass, values, zoom, scale } of placeGroups) {
      const fallback = ['coalesce', ['get', 'subclass'], 'neighbourhood'];
      add(
        {
          id: `korea-label-place-${subclass}`,
          type: 'symbol',
          ...binding('place'),
          filter: and(eq('kind', 'place'), ['in', fallback, ['literal', values]], named()),
          minzoom: Math.min(22, Math.max(zoom, zoom + labelZoomDelta)),
          layout: {
            'text-field': koreanNameExpression(),
            'text-font': font,
            'text-size': zoomSize(size[0] * scale, size[1] * scale, size[2] * scale),
            'text-max-width': 8,
            'text-padding': density === 'sparse' ? 18 : density === 'dense' ? 6 : 12,
            'text-allow-overlap': false,
            'symbol-sort-key': expression(rank(zoom * 10)),
            'text-variable-anchor': ['center', 'top', 'bottom'],
            'text-radial-offset': 0.3,
          },
          paint: textPaint,
        },
        'place',
      );
    }
    add(
      {
        id: 'korea-label-road-ref',
        type: 'symbol',
        ...binding('road'),
        filter: and(
          eq('kind', 'road'),
          ['in', roadClass(), ['literal', ['motorway', 'trunk', 'primary']]],
          ['has', 'ref'],
          ['!=', ['to-string', ['get', 'ref']], ''],
        ),
        minzoom: 9,
        layout: {
          'text-field': ['to-string', ['get', 'ref']],
          'text-font': font,
          'text-size': 11,
          'symbol-placement': 'line',
          'symbol-spacing': 600,
          'text-padding': 10,
          'text-allow-overlap': false,
          'symbol-sort-key': expression(rank(60)),
        },
        paint: textPaint,
      },
      'road',
    );
    for (const [index, group] of ['major', 'minor', 'service'].entries()) {
      const classes =
        index === 0
          ? ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']
          : index === 1
            ? ['residential']
            : ['service'];
      add(
        {
          id: `korea-label-road-${group}`,
          type: 'symbol',
          ...binding('road'),
          filter: and(eq('kind', 'road'), ['in', roadClass(), ['literal', classes]], named()),
          minzoom: Math.min(22, [11, 14, 16][index]! + Math.max(0, labelZoomDelta)),
          layout: {
            'text-field': koreanNameExpression(),
            'text-font': font,
            'text-size': zoomSize(size[0] * 0.85, size[1] * 0.85, size[2] * 0.8),
            'symbol-placement': 'line',
            'symbol-spacing': density === 'sparse' ? 450 : density === 'dense' ? 220 : 330,
            'symbol-sort-key': expression(rank(index + 1)),
            'text-max-angle': 30,
            'text-padding': 8,
            'text-keep-upright': true,
            'text-allow-overlap': false,
          },
          paint: textPaint,
        },
        'road',
      );
    }
    const cutoffs = [20, 30, 50, 999];
    const zooms =
      density === 'sparse'
        ? [13, 14, 15, 16]
        : density === 'dense'
          ? [12, 12, 13, 14]
          : [12, 13, 14, 15];
    const poiZoomDelta = options.overrides?.zoom?.poi === undefined ? 0 : tokens.zoom.poi - 14;
    for (let tier = 0; tier < 4; tier++) {
      const lower = tier === 0 ? -1 : cutoffs[tier - 1]!;
      const upper = cutoffs[tier]!;
      add(
        {
          id: `korea-poi-priority-${tier + 1}`,
          type: 'symbol',
          ...binding('poi'),
          filter: and(
            eq('kind', 'poi'),
            named(),
            ['>', poiRank(), lower],
            ['<=', poiRank(), upper],
          ),
          minzoom: Math.min(22, Math.max(0, zooms[tier]! + poiZoomDelta)),
          layout: {
            'text-field': koreanNameExpression(),
            'text-font': font,
            'text-size': zoomSize(size[0] * 0.85, size[1] * 0.85, size[2] * 0.85),
            'text-max-width': 8,
            'text-padding': density === 'sparse' ? 14 : density === 'dense' ? 5 : 9,
            'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
            'text-radial-offset': options.icons ? 1.1 : 0.45,
            'text-allow-overlap': false,
            'symbol-sort-key': expression(poiRank()),
            ...(options.icons
              ? {
                  'icon-image': expression([
                    'match',
                    ['get', 'poi'],
                    'park',
                    'korea-poi-park',
                    'parking',
                    'korea-poi-parking',
                    'trail',
                    'korea-poi-trail',
                    'korea-poi-facility',
                  ]),
                  'icon-size': 0.6,
                  'icon-allow-overlap': false,
                  'icon-padding': 4,
                }
              : {}),
          },
          paint: { ...textPaint, 'text-color': tokens.colors.poi },
        },
        'poi',
      );
    }
    if (input.capabilities?.transport)
      for (const [subclass, minzoom] of [
        ['station', 12],
        ['busstop', 14],
      ] as const)
        add(
          {
            id: `korea-label-transport-${subclass}`,
            type: 'symbol',
            ...binding('transport'),
            filter: and(
              eq('kind', 'transport'),
              [
                '==',
                [
                  'match',
                  ['get', 'subclass'],
                  ['bus_stop', 'busstop', 'platform'],
                  'busstop',
                  'station',
                ],
                subclass,
              ],
              named(),
            ),
            minzoom,
            layout: {
              'text-field': koreanNameExpression(),
              'text-font': font,
              'text-size': zoomSize(size[0], size[1], size[2]),
              'symbol-sort-key': expression(rank(10)),
              'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
              'text-radial-offset': 0.5,
              'text-padding': 12,
              'text-allow-overlap': false,
            },
            paint: textPaint,
          },
          'transport',
        );
  }
  return parseCustomStyle({
    ...base,
    name: `Korea Map Kit ${options.theme} cartography`,
    metadata: {
      ...(base.metadata as Record<string, unknown>),
      'korea:schema': schema,
      'korea:quality': 'cartography-v2',
      'korea:density': density,
      'korea:context-split-zoom': hasContext ? 10 : null,
      'korea:attribution-required': inputs.map(({ input }) => input.attribution).join(' · '),
    },
    layers,
  });
}
