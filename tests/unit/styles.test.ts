import { expect, it } from 'vitest';
import { createExpression, validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import {
  createThemeStyle,
  themeNames,
  resolveTheme,
  contrastRatio,
  parseCustomStyle,
  extendStyle,
  koreanNameExpression,
  resolveKoreanName,
  auditGlyphCoverage,
  inspectFontCoverage,
  createPoiIcon,
  poiKinds,
} from 'korea-map-styles';
const fixture = {
  target: 'web',
  data: { mode: 'fixture' },
  typography: { mode: 'local', fontStack: ['Noto Sans CJK KR', 'sans-serif'] },
} as const;
for (const theme of themeNames)
  it(`${theme}: valid independent style, zoom hierarchy, source attribution, contrast and no endpoints`, () => {
    const style = createThemeStyle({ ...fixture, theme, icons: true });
    expect(validateStyleMin(style)).toEqual([]);
    expect(style.sources['korea-base']).toHaveProperty(
      'attribution',
      'Korea Map Kit authored design fixture (MIT)',
    );
    expect(JSON.stringify(style)).not.toMatch(/https?:|glyphs|sprite/);
    expect(style.layers.find((layer) => layer.id === 'korea-building')?.minzoom).toBe(14);
    expect(style.layers.find((layer) => layer.id === 'korea-trail')?.minzoom).toBe(
      theme === 'outdoor' ? 10 : 13,
    );
    const tokens = resolveTheme(theme);
    expect(contrastRatio(tokens.colors.label, tokens.colors.labelHalo)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens.colors.poi, tokens.colors.poiInk)).toBeGreaterThanOrEqual(4.5);
    style.layers.pop();
    expect(createThemeStyle({ ...fixture, theme, icons: true }).layers.length).toBe(
      style.layers.length + 1,
    );
  });
it('allows token overrides and rejects hidden/unknown, low contrast, invalid widths and zooms', () => {
  const style = createThemeStyle({
    ...fixture,
    theme: 'standard',
    overrides: { colors: { water: '#123456' }, widths: { major: [2, 6, 16] } },
  });
  expect(style.layers.find((layer) => layer.id === 'korea-water')).toHaveProperty(
    'paint.fill-color',
    '#123456',
  );
  expect(resolveTheme('standard').colors.water).not.toBe('#123456');
  for (const overrides of [
    { colors: { water: 'transparent' } },
    { colors: { attribution: 'hidden' } },
    { colors: { label: '#ffffff', labelHalo: '#ffffff' } },
    { widths: { major: [2, 1, 0] } },
    { zoom: { building: NaN } },
    { zoom: { building: 23 } },
  ])
    expect(() => resolveTheme('standard', overrides as never)).toThrow();
});
it('evaluates actual style expressions for Korean/name/English fallback including null and empty values', () => {
  const compiled = createExpression(koreanNameExpression(), 'layers[0].layout.text-field');
  expect(compiled.result).toBe('success');
  if (compiled.result !== 'success') throw Error('expression');
  for (const [properties, expected] of [
    [{ 'name:ko': '한빛공원', name: 'Other' }, '한빛공원'],
    [{ 'name:ko': '', name: '이름 대체' }, '이름 대체'],
    [{ 'name:ko': null, 'name:en': 'English' }, 'English'],
    [{ 'name:ko': 7, name: 'Fallback' }, 'Fallback'],
    [{}, ''],
  ] as const) {
    expect(compiled.value.evaluate({ zoom: 14 }, { type: 1, properties })).toBe(expected);
    expect(resolveKoreanName(properties)).toBe(expected);
  }
});
it('requires glyph settings on Native instead of silently assuming local font compatibility', () => {
  expect(() => createThemeStyle({ ...fixture, theme: 'standard', target: 'native' })).toThrow(
    'NATIVE_REQUIRES_GLYPHS',
  );
  const style = createThemeStyle({
    ...fixture,
    theme: 'standard',
    target: 'native',
    typography: {
      mode: 'glyphs',
      fontStack: ['Operator Noto'],
      url: 'https://fonts.example.invalid/{fontstack}/{range}.pbf',
    },
  });
  expect(validateStyleMin(style)).toEqual([]);
  expect(() =>
    createThemeStyle({
      ...fixture,
      theme: 'standard',
      typography: {
        mode: 'glyphs',
        fontStack: ['Noto'],
        url: 'https://fonts.example.invalid/missing.pbf',
      },
    }),
  ).toThrow('GLYPH_URL_REQUIRED');
});
it('parses user JSON and appends layers without replacing provenance or accepting invalid spec', () => {
  const style = createThemeStyle({ ...fixture, theme: 'pastel' });
  expect(parseCustomStyle(JSON.stringify(style))).toEqual(style);
  const extended = extendStyle(style, {
    layers: [{ id: 'user-background', type: 'background', paint: { 'background-opacity': 0 } }],
  });
  expect(extended.sources).toEqual(style.sources);
  expect(extended.layers.length).toBe(style.layers.length + 1);
  expect(() =>
    extendStyle(style, {
      sources: {
        'korea-base': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      },
    }),
  ).toThrow('RESERVED_SOURCE_ID');
  expect(() => extendStyle(style, { layers: [style.layers[0]!] })).toThrow('RESERVED_LAYER_ID');
  expect(() =>
    parseCustomStyle({
      version: 8,
      sources: {},
      layers: [{ id: 'bad', type: 'fill', paint: { 'fill-color': 7 } }],
    }),
  ).toThrow('INVALID_STYLE_SPEC');
  expect(() => parseCustomStyle({ ...style, zoom: NaN })).toThrow('INVALID_STYLE_SPEC');
});
it('reports missing individual glyphs instead of treating successful range downloads as coverage', () => {
  expect(auditGlyphCoverage(['한글'], [0xd55c])).toEqual({
    ok: false,
    required: 2,
    missing: [{ codePoint: 0xae00, unicode: 'U+AE00', character: '글' }],
  });
  expect(auditGlyphCoverage(['한', '한'], [0xd55c]).ok).toBe(true);
});
it('reads actual cmap glyph IDs and rejects malformed or unsupported font files', () => {
  // Authored minimal sfnt/cmap metadata fixture, no font outlines or copied font payload.
  const bytes = new Uint8Array(68);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x00010000);
  view.setUint16(4, 1);
  view.setUint32(12, 0x636d6170);
  view.setUint32(20, 28);
  view.setUint32(24, 40);
  view.setUint16(30, 1);
  view.setUint16(32, 3);
  view.setUint16(34, 10);
  view.setUint32(36, 12);
  view.setUint16(40, 12);
  view.setUint32(44, 28);
  view.setUint32(52, 1);
  view.setUint32(56, 0xd55c);
  view.setUint32(60, 0xd55c);
  view.setUint32(64, 1);
  expect(inspectFontCoverage(bytes, ['한글']).missing[0]?.character).toBe('글');
  view.setUint32(64, 0);
  expect(inspectFontCoverage(bytes, ['한']).ok).toBe(false);
  expect(() => inspectFontCoverage(bytes.subarray(0, 50), ['한'])).toThrow(
    'INVALID_OR_UNSUPPORTED_FONT',
  );
  expect(() => inspectFontCoverage(new Uint8Array([1, 2, 3]), ['한'])).toThrow(
    'INVALID_OR_UNSUPPORTED_FONT',
  );
});
it('generates distinct MIT geometric RGBA icons with transparent borders', () => {
  const icons = poiKinds.map((kind) => createPoiIcon(kind, '#315e34', '#ffffff'));
  expect(new Set(icons.map((icon) => Array.from(icon.data).join(','))).size).toBe(4);
  for (const icon of icons) {
    expect(icon.data.length).toBe(32 * 32 * 4);
    expect(icon.data[3]).toBe(0);
    expect(icon.data[(16 * 32 + 16) * 4 + 3]).toBe(255);
  }
});
it('requires explicit normalized vector bindings and does not infer a third-party tile schema', () => {
  const kinds = [
    'land',
    'park',
    'water',
    'building',
    'boundary',
    'road',
    'trail',
    'place',
    'poi',
  ] as const;
  const source = {
    type: 'vector',
    tiles: ['https://tiles.example.invalid/{z}/{x}/{y}.pbf'],
  } as const;
  expect(() =>
    createThemeStyle({
      ...fixture,
      theme: 'outdoor',
      data: {
        mode: 'operator',
        source: { ...source, tiles: [...source.tiles] },
        attribution: 'Operator',
      },
    }),
  ).toThrow('SOURCE_LAYERS_REQUIRED');
  for (const theme of themeNames) {
    const style = createThemeStyle({
      theme,
      target: 'native',
      data: {
        mode: 'operator',
        source: { ...source, tiles: [...source.tiles] },
        sourceLayers: Object.fromEntries(kinds.map((kind) => [kind, 'normalized'])),
        attribution: 'Operator',
      },
      typography: {
        mode: 'glyphs',
        fontStack: ['Noto'],
        url: 'https://fonts.example.invalid/{fontstack}/{range}.pbf',
      },
    });
    expect(validateStyleMin(style)).toEqual([]);
    expect(style.layers.find((layer) => layer.id === 'korea-water')).toHaveProperty(
      'source-layer',
      'normalized',
    );
  }
  expect(() =>
    parseCustomStyle('{"version":8,"sources":{},"layers":[],"metadata":{"__proto__":{}}}'),
  ).toThrow('UNSAFE_STYLE_KEY');
});
