import type { FeatureKind } from './themes.js';

export const cartographyOptionalKinds = Object.freeze([
  'rail',
  'waterway',
  'transport',
  'landmask',
] as const);
export type CartographyOptionalKind = (typeof cartographyOptionalKinds)[number];
export type CartographyKind = FeatureKind | CartographyOptionalKind;
export type CartographySchema = 'design-v1' | 'design-v2';
export type CartographyDensity = 'balanced' | 'sparse' | 'dense';

/** Operator-reviewed source capabilities; absent capabilities never enable extra layers. */
export interface CartographyCapabilities {
  rail?: boolean;
  waterway?: boolean;
  transport?: boolean;
  landmask?: boolean;
  /** Requires a reviewed landmask from the same source; never inferred from inland water. */
  ocean?: boolean;
}

const requiredLayers = Object.freeze([
  'land',
  'park',
  'water',
  'building',
  'boundary',
  'road',
  'trail',
  'place',
  'poi',
] as const);
const names = Object.freeze(['name:ko', 'name', 'name:en'] as const);
const minzoom = Object.freeze({ city: 6, minorRoad: 11, outdoorTrail: 10, detail: 10 });

/** Stable original nine-layer contract. Missing v2 attributes have explicit style fallbacks. */
export const designV1 = Object.freeze({
  id: 'design-v1' as const,
  requiredLayers,
  optionalLayers: Object.freeze([] as const),
  fields: Object.freeze({
    names,
    road: Object.freeze(['kind', 'class'] as const),
    place: Object.freeze(['kind'] as const),
    poi: Object.freeze(['kind', 'poi'] as const),
  }),
  minzoom,
});

/** Additive operator schema: extra source layers are optional, never fabricated by a style. */
export const designV2 = Object.freeze({
  id: 'design-v2' as const,
  requiredLayers,
  optionalLayers: cartographyOptionalKinds,
  fields: Object.freeze({
    names,
    common: Object.freeze(['kind', 'fid', 'subclass', 'rank', 'minzoom'] as const),
    road: Object.freeze([
      'kind',
      'class',
      'subclass',
      'bridge',
      'tunnel',
      'layer',
      'ref',
      'rank',
    ] as const),
    place: Object.freeze(['kind', 'subclass', 'rank'] as const),
    poi: Object.freeze(['kind', 'poi', 'poiCategory', 'subclass', 'rank', 'minzoom'] as const),
  }),
  roadSubclasses: Object.freeze([
    'motorway',
    'trunk',
    'primary',
    'secondary',
    'tertiary',
    'residential',
    'service',
    'unclassified',
    'living_street',
    'road',
  ] as const),
  placeSubclasses: Object.freeze([
    'country',
    'state',
    'province',
    'city',
    'town',
    'village',
    'suburb',
    'borough',
    'quarter',
    'neighbourhood',
  ] as const),
  minzoom,
});
