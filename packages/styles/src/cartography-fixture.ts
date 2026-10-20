import type { GeoJSONSourceSpecification } from '@maplibre/maplibre-gl-style-spec';
import { createDesignFixture, designAttribution } from './design-fixture.js';
import { designV2 } from './cartography-schema.js';

type FixtureCollection = Extract<GeoJSONSourceSpecification['data'], { type: 'FeatureCollection' }>;
type FixtureFeature = FixtureCollection['features'][number];
type FixtureGeometry = Exclude<FixtureFeature['geometry'], null>;

/** Authored, imagined geometry only. Includes every v2 kind and intentionally crowded POIs. */
export function createCartographyFixture(): GeoJSONSourceSpecification {
  const original = createDesignFixture().data as FixtureCollection;
  const features: FixtureFeature[] = JSON.parse(JSON.stringify(original.features));
  let id = 0;
  const add = (kind: string, properties: Record<string, unknown>, geometry: FixtureGeometry) => {
    features.push({
      type: 'Feature',
      id: `cartography-${id++}`,
      properties: {
        kind,
        fid: `fixture/${id}`,
        minzoom: 0,
        rank: 50,
        subclass: kind,
        ...properties,
      },
      geometry,
    });
  };
  for (const [index, subclass] of designV2.roadSubclasses.entries()) {
    add(
      'road',
      {
        class: index < 5 ? 'major' : 'minor',
        subclass,
        rank: [50, 60, 80, 90, 100, 110, 130, 110, 110, 110][index],
        minzoom: [5, 6, 8, 9, 10, 11, 13, 11, 11, 11][index],
        bridge: index === 1,
        tunnel: index === 2,
        layer: index === 1 ? 1 : index === 2 ? -1 : 0,
        ref: index < 3 ? String(10 + index) : '',
        'name:ko': `가상${subclass}길`,
      },
      {
        type: 'LineString',
        coordinates: [
          [126.962, 37.555 + index * 0.003],
          [126.993, 37.558 + index * 0.003],
        ],
      },
    );
  }
  for (const [index, subclass] of designV2.placeSubclasses.entries())
    add(
      'place',
      {
        subclass,
        rank: [30, 50, 50, 60, 80, 100, 110, 110, 110, 120][index],
        minzoom: [3, 5, 5, 6, 8, 10, 11, 11, 11, 12][index],
        'name:ko': `가상${subclass}`,
      },
      { type: 'Point', coordinates: [126.965 + index * 0.006, 37.58] },
    );
  for (let index = 0; index < 36; index++) {
    const poi = ['park', 'parking', 'trail', 'facility'][index % 4]!;
    add(
      'poi',
      {
        poi,
        subclass: poi,
        poiCategory: index % 9 === 0 ? 'hospital' : poi,
        rank: [10, 20, 30, 30, 45, 50, 50, 60, 60][index % 9],
        minzoom: index % 9 < 2 ? 12 : index % 9 < 4 ? 13 : index % 9 < 7 ? 14 : 15,
        'name:ko': `가상시설${index + 1}`,
      },
      {
        type: 'Point',
        coordinates: [126.978 + (index % 6) * 0.00045, 37.565 + Math.floor(index / 6) * 0.00045],
      },
    );
  }
  add('poi', { poi: 'facility', rank: 10 }, { type: 'Point', coordinates: [126.978, 37.565] });
  add(
    'rail',
    { subclass: 'rail', rank: 1 },
    {
      type: 'LineString',
      coordinates: [
        [126.962, 37.56],
        [126.993, 37.577],
      ],
    },
  );
  add(
    'waterway',
    { subclass: 'stream', 'name:ko': '가상개울' },
    {
      type: 'LineString',
      coordinates: [
        [126.965, 37.58],
        [126.97, 37.56],
      ],
    },
  );
  add(
    'transport',
    { subclass: 'station', rank: 10, minzoom: 12, 'name:ko': '가상역' },
    { type: 'Point', coordinates: [126.983, 37.572] },
  );
  add(
    'landmask',
    {},
    {
      type: 'Polygon',
      coordinates: [
        [
          [126.96, 37.552],
          [126.996, 37.552],
          [126.996, 37.582],
          [126.96, 37.582],
          [126.96, 37.552],
        ],
      ],
    },
  );
  return {
    type: 'geojson',
    attribution: `${designAttribution} · synthetic cartography-v2`,
    data: { type: 'FeatureCollection', features },
  };
}
