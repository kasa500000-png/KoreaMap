import type { GeoJSONSourceSpecification } from '@maplibre/maplibre-gl-style-spec';
export const designAttribution = 'Korea Map Kit authored design fixture (MIT)';
export const designLabelCorpus = [
  '한빛공원',
  '가람천',
  '가람동',
  '한빛로',
  '산책길',
  '솔빛도서관',
  '주차장',
  '모래정원',
  '별빛쉼터',
  '이름 대체',
  'English fallback',
  '서울특별시',
  '제주특별자치도',
  '가각간갇갈감갑값갓강힣',
  '한글',
  'ㄱㄴㄷ',
  '123',
];
/** Imagined neighborhood. Coordinates/shapes/names are authored examples, not a map of Seoul. */
export function createDesignFixture(): GeoJSONSourceSpecification {
  type Feature = {
    type: 'Feature';
    properties: Record<string, string>;
    geometry:
      | { type: 'Polygon'; coordinates: number[][][] }
      | { type: 'LineString'; coordinates: number[][] }
      | { type: 'Point'; coordinates: number[] };
  };
  const features: Feature[] = [];
  const polygon = (
    kind: string,
    coordinates: number[][],
    properties: Record<string, string> = {},
  ) =>
    features.push({
      type: 'Feature',
      properties: { kind, ...properties },
      geometry: { type: 'Polygon', coordinates: [coordinates] },
    });
  const line = (kind: string, coordinates: number[][], properties: Record<string, string> = {}) =>
    features.push({
      type: 'Feature',
      properties: { kind, ...properties },
      geometry: { type: 'LineString', coordinates },
    });
  const point = (kind: string, coordinates: number[], properties: Record<string, string>) =>
    features.push({
      type: 'Feature',
      properties: { kind, ...properties },
      geometry: { type: 'Point', coordinates },
    });
  polygon('land', [
    [126.96, 37.552],
    [126.996, 37.552],
    [126.996, 37.582],
    [126.96, 37.582],
    [126.96, 37.552],
  ]);
  polygon('park', [
    [126.968, 37.567],
    [126.976, 37.567],
    [126.976, 37.574],
    [126.97, 37.575],
    [126.968, 37.567],
  ]);
  polygon('park', [
    [126.981, 37.56],
    [126.987, 37.56],
    [126.987, 37.564],
    [126.981, 37.564],
    [126.981, 37.56],
  ]);
  polygon('water', [
    [126.966, 37.558],
    [126.998, 37.568],
    [126.998, 37.57],
    [126.966, 37.56],
    [126.966, 37.558],
  ]);
  for (let row = 0; row < 3; row++)
    for (let column = 0; column < 5; column++) {
      const x = 126.978 + column * 0.002,
        y = 37.572 + row * 0.0017;
      polygon('building', [
        [x, y],
        [x + 0.0013, y],
        [x + 0.0013, y + 0.0009],
        [x, y + 0.0009],
        [x, y],
      ]);
    }
  line(
    'road',
    [
      [126.961, 37.566],
      [126.994, 37.566],
    ],
    { class: 'major', 'name:ko': '한빛로', name: 'Hanbit Road' },
  );
  line(
    'road',
    [
      [126.977, 37.552],
      [126.977, 37.581],
    ],
    { class: 'major' },
  );
  for (let i = 0; i < 4; i++)
    line(
      'road',
      [
        [126.978, 37.571 + i * 0.0017],
        [126.991, 37.571 + i * 0.0017],
      ],
      { class: 'minor' },
    );
  line(
    'road',
    [
      [126.985, 37.566],
      [126.985, 37.581],
    ],
    { class: 'minor' },
  );
  line(
    'trail',
    [
      [126.969, 37.569],
      [126.971, 37.573],
      [126.974, 37.572],
      [126.973, 37.568],
    ],
    { 'name:ko': '산책길' },
  );
  line(
    'boundary',
    [
      [126.966, 37.578],
      [126.992, 37.578],
      [126.992, 37.555],
    ],
    {},
  );
  point('place', [126.9715, 37.571], { 'name:ko': '한빛공원', name: 'Hanbit Park' });
  point('place', [126.988, 37.5675], { 'name:ko': '가람천' });
  point('place', [126.988, 37.5785], { 'name:ko': '가람동' });
  point('place', [126.984, 37.562], { name: '모래정원' });
  point('poi', [126.981, 37.574], { poi: 'facility', 'name:ko': '솔빛도서관' });
  point('poi', [126.987, 37.5725], { poi: 'parking', 'name:ko': '주차장' });
  point('poi', [126.973, 37.5675], { poi: 'trail', 'name:ko': '별빛쉼터' });
  point('poi', [126.9815, 37.562], { poi: 'park', 'name:ko': '', name: '이름 대체' });
  return {
    type: 'geojson',
    attribution: designAttribution,
    data: { type: 'FeatureCollection', features },
  };
}
