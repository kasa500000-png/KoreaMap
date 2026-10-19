import { expect, it } from 'vitest';
import { createMap, createMapState } from '@korea-map-kit/web';
import {
  validateWebConfig,
  resourceUrl,
  escapeAttribution,
} from '../../packages/web/src/provider.js';
import { validateGeoJSON } from '../../packages/web/src/geojson.js';
const fixture = { mode: 'local-fixture', fixtureId: 'synthetic-v1' } as const;
it('imports safely without DOM and fails missing config before construction', async () => {
  await expect(
    createMap({
      container: {} as HTMLElement,
      workerUrl: '/worker.mjs',
      config: undefined as never,
    }),
  ).rejects.toThrow('CONFIG_REQUIRED');
  await expect(
    createMap({ container: {} as HTMLElement, workerUrl: '/worker.mjs', config: fixture }),
  ).rejects.toThrow('CLIENT_ONLY');
});
it('keeps immutable copied state across renderer lifecycles, supports unsubscribe', () => {
  const state = createMapState();
  let calls = 0;
  const off = state.subscribe(() => calls++);
  const markers = [{ id: 'a', label: 'A', coordinate: [127, 37] as [number, number] }];
  state.setMarkers(markers);
  markers[0]!.coordinate[0] = 128;
  expect(state.getSnapshot().markers[0]?.coordinate[0]).toBe(127);
  state.selectMarker('a');
  expect(state.getSnapshot().selectedId).toBe('a');
  state.setMarkers([]);
  expect(state.getSnapshot().selectedId).toBeNull();
  off();
  state.setMarkers([]);
  expect(calls).toBe(3);
});
it('rejects duplicate IDs, invalid camera and missing selection atomically', () => {
  const state = createMapState();
  const before = state.getSnapshot();
  expect(() => state.setCamera({ center: [0, 89], zoom: 10, bearing: 0, pitch: 0 })).toThrow(
    'OUTSIDE_MERCATOR',
  );
  expect(() => state.setCamera({ ...before.camera, zoom: Infinity })).toThrow('INVALID_CAMERA');
  const marker = { id: 'a', label: 'A', coordinate: [127, 37] as const };
  expect(() => state.setMarkers([marker, marker])).toThrow('INVALID_MARKER');
  expect(() => state.selectMarker('missing')).toThrow('MARKER_NOT_FOUND');
  expect(state.getSnapshot()).toBe(before);
});
it('requires explicit cost acknowledgement and exact HTTPS resource origins', () => {
  const operator = {
    mode: 'operator',
    styleUrl: 'https://tiles.example.invalid/style.json',
    allowedOrigins: ['https://tiles.example.invalid'],
    attribution: 'Operator',
    costAcknowledged: true,
  } as const;
  const config = validateWebConfig(operator, 'http://localhost');
  expect(resourceUrl(config, 'https://tiles.example.invalid/a.pbf', 'http://localhost')).toContain(
    'a.pbf',
  );
  expect(() =>
    resourceUrl(config, 'https://other.example.invalid/a.pbf', 'http://localhost'),
  ).toThrow('RESOURCE_ORIGIN_BLOCKED');
  expect(() => resourceUrl(fixture, '/a.pbf', 'http://localhost')).toThrow(
    'FIXTURE_RESOURCE_BLOCKED',
  );
  expect(() =>
    validateWebConfig({ ...operator, costAcknowledged: false } as never, 'http://localhost'),
  ).toThrow('PROVIDER_CONFIG_REQUIRED');
  expect(() =>
    validateWebConfig(
      { ...operator, styleUrl: 'http://tiles.example.invalid/style.json' },
      'http://localhost',
    ),
  ).toThrow('UNSAFE_PROVIDER_URL');
  expect(() =>
    validateWebConfig(
      { ...operator, allowedOrigins: ['https://tiles.example.invalid/path'] },
      'http://localhost',
    ),
  ).toThrow('EXACT_ORIGIN_REQUIRED');
  expect(escapeAttribution('<img onerror="bad">')).toBe('&lt;img onerror=&quot;bad&quot;&gt;');
});
it('validates GeoJSON and clones caller data; rejects open rings and unsupported types', () => {
  const data = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'test' },
        geometry: { type: 'Point', coordinates: [127, 37] },
      },
    ],
  } as const;
  const copy = validateGeoJSON(data as never);
  expect(copy).toEqual(data);
  expect(copy).not.toBe(data);
  expect(() =>
    validateGeoJSON({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
              ],
            ],
          },
        },
      ],
    }),
  ).toThrow('INVALID_GEOJSON');
  expect(() =>
    validateGeoJSON({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: {}, geometry: { type: 'MultiPoint', coordinates: [] } },
      ],
    } as never),
  ).toThrow('INVALID_GEOJSON');
});
it('accepts explicitly attributed inline styles and rejects all unlisted resource origins', () => {
  const config = validateWebConfig(
    {
      mode: 'inline',
      style: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background' }] },
      allowedOrigins: [],
      attribution: 'Authored style',
      costAcknowledged: true,
    },
    'http://localhost',
  );
  expect(config.mode).toBe('inline');
  if (config.mode !== 'inline') throw new Error('inline config expected');
  expect(() =>
    resourceUrl(config, 'https://tiles.example.invalid/tile.pbf', 'http://localhost'),
  ).toThrow('RESOURCE_ORIGIN_BLOCKED');
  expect(() => validateWebConfig({ ...config, attribution: '' }, 'http://localhost')).toThrow(
    'PROVIDER_CONFIG_REQUIRED',
  );
  expect(() =>
    validateWebConfig({ ...config, style: { version: 0 } } as never, 'http://localhost'),
  ).toThrow('INVALID_STYLE_SPEC');
});
it('does not notify or replace snapshots for equal camera/1000-marker values, but preserves meaningful edits', () => {
  const markers = Array.from({ length: 1000 }, (_, i) => ({
    id: `p${i}`,
    label: `P${i}`,
    coordinate: [127, 37] as const,
  }));
  const state = createMapState({ markers });
  const before = state.getSnapshot();
  let notifications = 0;
  state.subscribe(() => notifications++);
  for (let i = 0; i < 10; i++) {
    state.setCamera({ ...before.camera, center: [...before.camera.center] });
    state.setMarkers(markers.map((m) => ({ ...m, coordinate: [...m.coordinate] })));
  }
  expect(notifications).toBe(0);
  expect(state.getSnapshot()).toBe(before);
  state.setMarkers(markers.map((m, i) => (i === 0 ? { ...m, description: 'updated' } : m)));
  expect(notifications).toBe(1);
  state.setCamera({ ...before.camera, zoom: before.camera.zoom + 1 });
  expect(notifications).toBe(2);
  expect(() => state.setMarkers([...markers, markers[0]!])).toThrow('INVALID_MARKER');
  expect(notifications).toBe(2);
});
