// Upstream MapLibre declarations use the ambient GeoJSON namespace. Preserve it in published types.
/// <reference types="geojson" preserve="true" />
import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import { validateMapConfig, type LocalMapConfig } from '@korea-map-kit/core';

/** Original synthetic geometry, MIT. Not OSM or real map/search data. */
export function createFixtureStyle(config: LocalMapConfig): StyleSpecification {
  validateMapConfig(config);
  return {
    version: 8,
    name: 'Korea Map Kit synthetic fixture',
    sources: {
      fixture: {
        type: 'geojson',
        attribution: 'Korea Map Kit synthetic fixture (MIT)',
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              id: 'fixture:park',
              properties: {},
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [126.97, 37.56],
                    [126.99, 37.56],
                    [126.99, 37.575],
                    [126.97, 37.575],
                    [126.97, 37.56],
                  ],
                ],
              },
            },
            {
              type: 'Feature',
              id: 'fixture:point',
              properties: { label: '합성 지점' },
              geometry: {
                type: 'Point',
                coordinates: [126.978, 37.5665],
              },
            },
          ],
        },
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#eef2ed' } },
      {
        id: 'fixture-area',
        type: 'fill',
        source: 'fixture',
        filter: ['==', '$type', 'Polygon'],
        paint: { 'fill-color': '#c5ddcd' },
      },
      {
        id: 'fixture-point',
        type: 'circle',
        source: 'fixture',
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 10,
          'circle-color': '#176651',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
        },
      },
    ],
  };
}

export {
  themeNames,
  resolveTheme,
  contrastRatio,
  type ThemeName,
  type DesignTokens,
  type ThemeOverrides,
} from './tokens.js';
export {
  createThemeStyle,
  parseCustomStyle,
  extendStyle,
  type ThemeStyleOptions,
  type TypographyConfig,
  type FeatureKind,
} from './themes.js';
export {
  koreanNameExpression,
  resolveKoreanName,
  requiredCodePoints,
  auditGlyphCoverage,
} from './labels.js';
export { createPoiIcon, poiKinds, type PoiKind, type RgbaIcon } from './icons.js';
export { createDesignFixture, designAttribution, designLabelCorpus } from './design-fixture.js';
export { inspectFontCoverage } from './font-coverage.js';
