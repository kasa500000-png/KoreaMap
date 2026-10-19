import { describe, expect, it, vi } from 'vitest';
import { defineMapStyle } from 'korea-map-core';
import {
  createThemeStyle,
  designAttribution,
  koreanNameExpression,
  themeNames,
} from 'korea-map-styles';
import {
  createNativeMapSession,
  validateNativeStyle,
} from '../../packages/native/src/controller.js';
import { createNativeVectorSource } from '../../packages/native/src/resources.js';

const origin = 'https://tiles.example.invalid';
const policy = { allowedOrigins: [origin] };
const xyz = `${origin}/{z}/{x}/{y}.pbf`;
function theme(name: (typeof themeNames)[number] = 'standard', glyphs = false) {
  return defineMapStyle(
    createThemeStyle({
      theme: name,
      target: 'native',
      data: { mode: 'fixture' },
      typography: glyphs
        ? {
            mode: 'glyphs',
            fontStack: ['Noto Sans CJK KR'],
            url: `${origin}/fonts/{fontstack}/{range}.pbf`,
          }
        : { mode: 'none' },
    }),
    designAttribution,
  );
}
function tiled(source: ReturnType<typeof createNativeVectorSource>) {
  return defineMapStyle(
    { version: 8, sources: { korea: source }, layers: [] },
    'Operator ODbL attribution',
  );
}
describe('Native resource policy (configuration tests, not device HTTP/rendering QA)', () => {
  it.each(themeNames)(
    '%s validates with Native style spec, Korean fallback and explicit glyphs',
    (name) => {
      const document = validateNativeStyle(theme(name, true), policy);
      expect(
        document.layers.some(
          (layer) =>
            layer.type === 'symbol' &&
            JSON.stringify(layer.layout?.['text-field']) === JSON.stringify(koreanNameExpression()),
        ),
      ).toBe(true);
      expect(validateNativeStyle(theme(name)).glyphs).toBeUndefined();
      expect(() => validateNativeStyle(theme(name, true))).toThrow(
        'NATIVE_OFFLINE_GEOMETRY_STYLE_REQUIRED',
      );
    },
  );
  it('defaults to explicit HTTP XYZ even if a PMTiles URL is supplied', () => {
    const source = createNativeVectorSource({
      tiles: [xyz],
      attribution: 'operator',
      pmtilesUrl: `${origin}/korea.pmtiles`,
    });
    expect(source).toEqual({ type: 'vector', tiles: [xyz], attribution: 'operator' });
    expect(validateNativeStyle(tiled(source), policy).sources['korea']).toEqual(source);
    expect(() => validateNativeStyle(tiled(source))).toThrow(
      'NATIVE_OFFLINE_GEOMETRY_STYLE_REQUIRED',
    );
  });
  it('PMTiles requires experimental opt-in; supplied HTTP fallback remains usable', () => {
    const config = { tiles: [xyz], attribution: 'operator', pmtilesUrl: `${origin}/korea.pmtiles` };
    const source = createNativeVectorSource({ ...config, transport: 'experimental-pmtiles' });
    expect(() => validateNativeStyle(tiled(source), policy)).toThrow(
      'NATIVE_DIRECT_TILES_REQUIRED',
    );
    expect(
      validateNativeStyle(tiled(source), { ...policy, experimentalPMTiles: true }).sources['korea'],
    ).toEqual(source);
    expect(
      validateNativeStyle(tiled(createNativeVectorSource(config)), policy).sources['korea'],
    ).toHaveProperty('tiles', [xyz]);
  });
  it.each([
    'https://other.example.invalid/{z}/{x}/{y}.pbf',
    `${origin}/{z}/{x}/{y}.pbf?token=not-a-secret`,
    'https://' + 'user:synthetic-only@' + 'tiles.example.invalid/{z}/{x}/{y}.pbf',
    'http://tiles.example.invalid/{z}/{x}/{y}.pbf',
    'file:///private/tiles/{z}/{x}/{y}.pbf',
  ])('rejects undeclared/insecure/private resource %s', (url) => {
    expect(() =>
      validateNativeStyle(
        defineMapStyle(
          { version: 8, sources: { v: { type: 'vector', tiles: [url] } }, layers: [] },
          'operator',
        ),
        policy,
      ),
    ).toThrow();
  });
  it('rejects hidden TileJSON/remote GeoJSON discovery and missing glyphs', () => {
    for (const source of [
      { type: 'vector', url: `${origin}/tiles.json` },
      { type: 'geojson', data: `${origin}/data.json` },
    ]) {
      expect(() =>
        validateNativeStyle(
          defineMapStyle({ version: 8, sources: { v: source }, layers: [] }, 'operator'),
          policy,
        ),
      ).toThrow();
    }
    const style = theme('standard', true);
    delete style.document['glyphs'];
    expect(() => validateNativeStyle(style, policy)).toThrow();
  });
  it('checks sprite origins and reserved overlay namespace', () => {
    const style = theme();
    style.document['sprite'] = `${origin}/sprite`;
    expect(() => validateNativeStyle(style, { allowedOrigins: [] })).toThrow(
      'NATIVE_ORIGIN_NOT_ALLOWED',
    );
    expect(validateNativeStyle(style, policy).sprite).toBe(`${origin}/sprite`);
    expect(() =>
      validateNativeStyle(
        defineMapStyle(
          { version: 8, sources: {}, layers: [{ id: 'kmk-markers', type: 'background' }] },
          'MIT',
        ),
      ),
    ).toThrow('RESERVED_LAYER_ID');
  });
});
describe('Native session lifecycle (mock bridge)', () => {
  it('ignores stale load/failure callbacks, preserves overlays, isolates callbacks and destroys once', async () => {
    const scheduler = {
      schedule(fn: () => void, ms: number) {
        const timer = setTimeout(fn, ms);
        return () => clearTimeout(timer);
      },
    };
    const mutablePolicy = { allowedOrigins: [origin] };
    const session = createNativeMapSession(
      theme(),
      { setCamera: async () => {}, getBounds: async () => [126, 37, 128, 38] },
      scheduler,
      () => {},
      mutablePolicy,
    );
    const events = vi.fn();
    session.api.onEvent(() => {
      throw new Error('consumer error');
    });
    session.api.onEvent(events);
    session.loaded(0);
    await session.api.addMarker({ id: 'a', coordinate: [127, 37], label: '합성' });
    await session.api.showRoute({
      id: 'a',
      coordinates: [
        [127, 37],
        [127.1, 37.1],
      ],
    });
    mutablePolicy.allowedOrigins.length = 0;
    for (const name of themeNames) {
      const before = session.getSnapshot().revision;
      const pending = session.api.setStyle(theme(name, true));
      session.loaded(before);
      session.failed(before);
      await expect(session.api.setZoom(12)).rejects.toThrow('MAP_NOT_READY');
      session.loaded(before + 1);
      await pending;
      expect(session.getSnapshot().markers).toHaveLength(1);
      expect(session.getSnapshot().overlays.size).toBe(1);
      expect(session.getSnapshot().attribution).toBe(designAttribution);
    }
    session.api.destroy();
    session.api.destroy();
    session.loaded();
    session.failed();
    expect(events.mock.calls.filter(([event]) => event.type === 'destroyed')).toHaveLength(1);
    expect(session.getSnapshot().overlays.size).toBe(0);
    await expect(session.api.setZoom(12)).rejects.toThrow('MAP_DESTROYED');
  });
});
