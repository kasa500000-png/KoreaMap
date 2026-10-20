import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  createExpression,
  validateStyleMin,
  type LayerSpecification,
  type StyleSpecification,
} from '@maplibre/maplibre-gl-style-spec';
import type { FeatureCollection } from 'korea-map-core';
import {
  createCartographyStyle,
  createCartographyFixture,
  createDesignFixture,
  createThemeStyle,
  designV1,
  designV2,
  extendStyle,
  resolveTheme,
  contrastRatio,
  themeNames,
  type CartographyStyleOptions,
} from 'korea-map-styles';

const nativeRequire = createRequire(new URL('../../packages/native/package.json', import.meta.url));
const nativeSpec = createRequire(
  nativeRequire.resolve('@maplibre/maplibre-react-native/package.json'),
)('@maplibre/maplibre-gl-style-spec') as { validateStyleMin: typeof validateStyleMin };
const typography = {
  mode: 'glyphs',
  fontStack: ['OperatorNoto'],
  url: 'https://fonts.example.invalid/{fontstack}/{range}.pbf',
} as const;
const fixture = { target: 'web', data: { mode: 'fixture' }, typography } as const;
const layers = Object.fromEntries(
  [...designV2.requiredLayers, ...designV2.optionalLayers].map((kind) => [kind, `custom_${kind}`]),
);
const operator = {
  mode: 'operator' as const,
  source: {
    type: 'vector' as const,
    tiles: ['https://tiles.example.invalid/{z}/{x}/{y}.pbf'],
    maxzoom: 16,
  },
  sourceLayers: layers,
  attribution: 'Operator OSM · ODbL',
  capabilities: { rail: true, waterway: true, transport: true, landmask: false, ocean: false },
};

function evaluate(value: unknown, properties: Record<string, unknown>, zoom = 14): unknown {
  const compiled = createExpression(value, 'layers[0].filter');
  expect(compiled.result).toBe('success');
  if (compiled.result !== 'success') throw Error('Cannot evaluate expression');
  return compiled.value.evaluate({ zoom }, { type: 1, properties });
}
function matches(
  layer: LayerSpecification,
  properties: Record<string, unknown>,
  zoom = 14,
): boolean {
  if (zoom < (layer.minzoom ?? 0) || zoom >= (layer.maxzoom ?? 24)) return false;
  return 'filter' in layer && layer.filter
    ? evaluate(layer.filter, properties, zoom) === true
    : true;
}
const find = (style: StyleSpecification, id: string) => {
  const layer = style.layers.find((layer) => layer.id === id);
  expect(layer, id).toBeDefined();
  return layer!;
};

describe('cartographic hierarchy shared by Web and Native', () => {
  for (const theme of themeNames)
    for (const density of ['balanced', 'sparse', 'dense'] as const)
      for (const target of ['web', 'native'] as const)
        it(`${theme}/${density}/${target} validates against Web 26.4.4 and RN 26.2.1`, () => {
          const style = createCartographyStyle({
            ...fixture,
            theme,
            density,
            target,
            data: operator,
          });
          expect(validateStyleMin(style)).toEqual([]);
          expect(nativeSpec.validateStyleMin(style)).toEqual([]);
          expect(style.metadata).toMatchObject({
            'korea:schema': 'design-v2',
            'korea:density': density,
          });
          const tokens = resolveTheme(theme);
          expect(
            contrastRatio(tokens.colors.label, tokens.colors.labelHalo),
          ).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(tokens.colors.poi, tokens.colors.labelHalo)).toBeGreaterThanOrEqual(
            4.5,
          );
          expect(style.sources['korea-base']).toHaveProperty('attribution', operator.attribution);
        });
});

it('preserves the old factory and uses v2 attributes only in the new opt-in factory', () => {
  const before = createThemeStyle({ ...fixture, theme: 'standard' });
  const expected = JSON.stringify(before);
  const cartography = createCartographyStyle({ ...fixture, theme: 'standard' });
  expect(JSON.stringify(createThemeStyle({ ...fixture, theme: 'standard' }))).toBe(expected);
  expect(before.metadata).toHaveProperty('korea:schema', 'design-v1');
  expect(before.layers.some((layer) => layer.id === 'korea-poi-dot')).toBe(true);
  expect(cartography.layers.some((layer) => layer.type === 'circle')).toBe(false);
  expect(designV1.requiredLayers).toEqual(designV2.requiredLayers);
  expect(Object.isFrozen(designV2.roadSubclasses)).toBe(true);
});

it('aligns city6, minor11 and Outdoor trail10 with per-feature data minzoom', () => {
  const style = createCartographyStyle({ ...fixture, theme: 'outdoor' });
  const city = find(style, 'korea-label-place-city');
  expect(
    matches(city, { kind: 'place', subclass: 'city', minzoom: 6, 'name:ko': '가상시' }, 5),
  ).toBe(false);
  expect(
    matches(city, { kind: 'place', subclass: 'city', minzoom: 6, 'name:ko': '가상시' }, 6),
  ).toBe(true);
  const minor = find(style, 'korea-road-residential-ground');
  expect(matches(minor, { kind: 'road', subclass: 'residential', minzoom: 11 }, 10)).toBe(false);
  expect(matches(minor, { kind: 'road', subclass: 'residential', minzoom: 11 }, 11)).toBe(true);
  expect(find(style, 'korea-trail').minzoom).toBe(10);
  expect(matches(find(style, 'korea-trail'), { kind: 'trail', minzoom: 12 }, 10)).toBe(false);
  expect(matches(find(style, 'korea-trail'), { kind: 'trail', minzoom: 12 }, 12)).toBe(true);
});

it('separates tunnels, ground and bridges and accepts all normalized road aliases', () => {
  const style = createCartographyStyle({ ...fixture, theme: 'standard' });
  for (const alias of ['residential', 'unclassified', 'living_street', 'road'])
    expect(
      matches(find(style, 'korea-road-residential-ground'), { kind: 'road', subclass: alias }, 14),
    ).toBe(true);
  for (const flag of [true, 'yes', 1]) {
    const properties = { kind: 'road', subclass: 'primary', bridge: flag };
    expect(matches(find(style, 'korea-road-primary-bridge'), properties)).toBe(true);
    expect(matches(find(style, 'korea-road-primary-ground'), properties)).toBe(false);
  }
  expect(
    matches(find(style, 'korea-road-primary-tunnel'), {
      kind: 'road',
      subclass: 'primary',
      tunnel: true,
    }),
  ).toBe(true);
  expect(find(style, 'korea-road-primary-tunnel')).toHaveProperty('paint.line-opacity', 0.55);
  expect(style.layers.indexOf(find(style, 'korea-road-primary-bridge'))).toBeGreaterThan(
    style.layers.indexOf(find(style, 'korea-road-primary-ground')),
  );
});

it('falls back for v1 geometry without subclass/rank/bridge/tunnel fields', () => {
  const style = createCartographyStyle({
    ...fixture,
    theme: 'pastel',
    schema: 'design-v1',
    data: {
      mode: 'operator',
      source: createDesignFixture(),
      attribution: 'Authored legacy fixture MIT',
    },
  });
  expect(matches(find(style, 'korea-road-primary-ground'), { kind: 'road', class: 'major' })).toBe(
    true,
  );
  expect(
    matches(find(style, 'korea-road-residential-ground'), { kind: 'road', class: 'minor' }),
  ).toBe(true);
  expect(
    matches(find(style, 'korea-label-place-neighbourhood'), { kind: 'place', name: '대체 이름' }),
  ).toBe(true);
  expect(
    matches(find(style, 'korea-poi-priority-2'), { kind: 'poi', poi: 'park', name: '가상공원' }),
  ).toBe(true);
});

it('measures density on crowded authored features without displaying anonymous dots', () => {
  const features = (createCartographyFixture().data as FeatureCollection).features.filter(
    (feature) => feature.properties?.kind === 'poi',
  );
  const counts = ['sparse', 'balanced', 'dense'].map((density) => {
    const style = createCartographyStyle({
      ...fixture,
      theme: 'standard',
      density: density as 'sparse' | 'balanced' | 'dense',
    });
    const poiLayers = style.layers.filter((layer) => layer.id.startsWith('korea-poi-priority-'));
    return features.filter((feature) =>
      poiLayers.some((layer) => matches(layer, feature.properties!, 13)),
    ).length;
  });
  expect(counts).toEqual([8, 17, 19]);
  // At z14 dense admits general facilities while balanced preserves landmark-first placement.
  const at14 = (density: 'balanced' | 'dense') => {
    const style = createCartographyStyle({ ...fixture, theme: 'standard', density });
    return features.filter((feature) =>
      style.layers.some(
        (layer) =>
          layer.id.startsWith('korea-poi-priority-') && matches(layer, feature.properties!, 14),
      ),
    ).length;
  };
  expect(at14('dense')).toBeGreaterThan(at14('balanced'));
  for (const density of ['sparse', 'balanced', 'dense'] as const) {
    const style = createCartographyStyle({ ...fixture, theme: 'standard', density });
    const poiLayers = style.layers.filter((layer) => layer.id.startsWith('korea-poi-priority-'));
    expect(poiLayers.every((layer) => !matches(layer, { kind: 'poi', rank: 10 }, 16))).toBe(true);
    expect(
      features.filter((feature) =>
        poiLayers.some((layer) => matches(layer, feature.properties!, 16)),
      ).length,
    ).toBe(40);
    for (const layer of poiLayers) {
      expect(layer).toHaveProperty('layout.text-allow-overlap', false);
      expect(layer).toHaveProperty('layout.symbol-sort-key');
      expect(layer).toHaveProperty('layout.text-variable-anchor', [
        'top',
        'bottom',
        'left',
        'right',
      ]);
    }
  }
});

it('keeps optional rail/waterway/transport/ocean absent unless explicitly supported', () => {
  const plain = createCartographyStyle({
    ...fixture,
    theme: 'standard',
    data: { ...operator, capabilities: {} },
  });
  for (const prefix of ['korea-rail', 'korea-waterway', 'korea-label-transport', 'korea-landmask'])
    expect(plain.layers.some((layer) => layer.id.startsWith(prefix))).toBe(false);
  const extra = createCartographyStyle({ ...fixture, theme: 'standard', data: operator });
  expect(find(extra, 'korea-rail')).toHaveProperty('source-layer', 'custom_rail');
  expect(find(extra, 'korea-waterway-river').minzoom).toBe(8);
  expect(find(extra, 'korea-waterway-stream').minzoom).toBe(12);
  expect(find(extra, 'korea-label-transport-station').minzoom).toBe(12);
  expect(() =>
    createCartographyStyle({
      ...fixture,
      theme: 'standard',
      data: { ...operator, capabilities: { ocean: true } },
    }),
  ).toThrow('OCEAN_REQUIRES_LANDMASK');
  const withOcean = createCartographyStyle({
    ...fixture,
    theme: 'dark',
    data: { ...operator, capabilities: { ocean: true, landmask: true } },
  });
  expect(find(withOcean, 'korea-background')).toHaveProperty(
    'paint.background-color',
    resolveTheme('dark').colors.water,
  );
  const withoutBinding = { ...layers };
  delete withoutBinding['rail'];
  expect(() =>
    createCartographyStyle({
      ...fixture,
      theme: 'standard',
      data: { ...operator, sourceLayers: withoutBinding },
    }),
  ).toThrow('CAPABILITY_SOURCE_LAYER_REQUIRED');
});

it('uses the same stable source-domain POI priority when v1 rank attributes are absent', () => {
  const style = createCartographyStyle({ ...fixture, theme: 'standard' });
  const tier1 = find(style, 'korea-poi-priority-1');
  if (tier1.type !== 'symbol') throw Error('Expected symbol');
  for (const [properties, expected] of [
    [{ poiCategory: 'hospital' }, 20],
    [{ poi: 'park' }, 30],
    [{ poi: 'parking' }, 60],
    [{ poi: 'facility' }, 50],
    [{ poiCategory: 'hospital', rank: 10 }, 10],
  ] as const)
    expect(evaluate(tier1.layout!['symbol-sort-key'], properties)).toBe(expected);
});

it('switches explicit generalized context to detail at z10 without duplicate visible layers', () => {
  const style = createCartographyStyle({
    ...fixture,
    theme: 'standard',
    data: {
      ...operator,
      context: {
        source: operator.source,
        sourceLayers: { land: 'context_land', place: 'context_place' },
        attribution: 'Reviewed context ODbL',
      },
    },
  });
  expect(validateStyleMin(style)).toEqual([]);
  expect(nativeSpec.validateStyleMin(style)).toEqual([]);
  expect(style.sources['korea-context']).toHaveProperty('attribution', 'Reviewed context ODbL');
  const contextCity = find(style, 'korea-label-place-city-context');
  const detailCity = find(style, 'korea-label-place-city');
  const feature = { kind: 'place', subclass: 'city', 'name:ko': '가상시', minzoom: 6 };
  expect(matches(contextCity, feature, 9)).toBe(true);
  expect(matches(detailCity, feature, 9)).toBe(false);
  expect(matches(contextCity, feature, 10)).toBe(false);
  expect(matches(detailCity, feature, 10)).toBe(true);
  expect(style.layers.some((layer) => layer.id === 'korea-building-context')).toBe(false);
});

it('preserves overrides and appended user-selected overlays across density modes', () => {
  for (const density of ['sparse', 'balanced', 'dense'] as const) {
    const style = createCartographyStyle({
      ...fixture,
      theme: 'outdoor',
      density,
      overrides: {
        colors: { water: '#123456' },
        widths: { minor: [1, 4, 12], buildingOutline: 2 },
        zoom: { minorRoad: 12, poi: 15 },
      },
    });
    expect(find(style, 'korea-water')).toHaveProperty('paint.fill-color', '#123456');
    expect(find(style, 'korea-road-residential-ground').minzoom).toBe(12);
    expect(find(style, 'korea-building-outline')).toHaveProperty('paint.line-width', 2);
    const custom = {
      id: 'selected-poi',
      type: 'circle',
      source: 'korea-base',
      paint: { 'circle-radius': 8 },
    } as const;
    expect(extendStyle(style, { layers: [custom] }).layers.at(-1)).toEqual(custom);
  }
});

it('creates every synthetic contract kind without adding font/image/network payloads', () => {
  const source = createCartographyFixture();
  const features = (source.data as FeatureCollection).features;
  expect(new Set(features.map((feature) => feature.properties?.kind))).toEqual(
    new Set([...designV2.requiredLayers, ...designV2.optionalLayers]),
  );
  const style = createCartographyStyle({
    theme: 'standard',
    target: 'web',
    data: { mode: 'fixture' },
    typography: { mode: 'none' },
  });
  expect(JSON.stringify(style)).not.toMatch(/https?:|glyphs|sprite/);
  expect(style.layers.some((layer) => layer.type === 'symbol')).toBe(false);
  expect(() =>
    createCartographyStyle({
      ...fixture,
      theme: 'standard',
      density: 'invalid',
    } as unknown as CartographyStyleOptions),
  ).toThrow('UNKNOWN_CARTOGRAPHY_DENSITY');
  expect(() =>
    createCartographyStyle({
      ...fixture,
      theme: 'standard',
      target: 'native',
      typography: { mode: 'local', fontStack: ['Noto'] },
    }),
  ).toThrow('NATIVE_REQUIRES_GLYPHS');
});
