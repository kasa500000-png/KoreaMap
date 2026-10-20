# korea-map-styles

Independent Korea Map Kit design system: Standard, Dark, Pastel and Outdoor. Code, geometric POI icons and authored synthetic geometry are MIT. No fonts, third-party map data, glyph server or paid account are bundled. MapLibre GL JS 6.14.0 / Style Spec 26.4.4 are the tested exact versions.

```ts
import { createThemeStyle, resolveTheme, createPoiIcon, poiKinds } from 'korea-map-styles';

const tokens = resolveTheme('outdoor', { colors: { water: '#80b8ce' } });
const style = createThemeStyle({
  theme: 'outdoor',
  target: 'web',
  data: { mode: 'fixture' }, // explicit authored example; not geographic truth
  typography: { mode: 'local', fontStack: ['Noto Sans CJK KR', 'sans-serif'] },
  overrides: { colors: { water: '#80b8ce' } },
  icons: true,
});
const images = poiKinds.map((kind) => ({
  id: `korea-poi-${kind}`,
  image: createPoiIcon(kind, tokens.colors.poi, tokens.colors.poiInk),
}));
```

Pass `style` and `images` to `korea-map-web` via `createMap({ ..., config: { mode: 'inline', style, allowedOrigins: [], attribution: 'Korea Map Kit authored design fixture (MIT)', costAcknowledged: true }, images })`. Empty allowedOrigins forbids renderer resource requests. SDK source attribution and the visible attribution control remain independent of theme tokens. Import the MapLibre CSS and provide a local worker as described in the web package README. The `/themes/` example compares all four with the same starting camera.

`resolveTheme(theme, overrides)` returns a fresh token tree. Override colors, widths, typography sizes/halo and minimum zooms. Colors accept opaque `#RRGGBB`; label/halo and icon/ink contrast below 4.5 fails. Width/size stops use z10/z14/z18 with linear interpolation; malformed, decreasing or oversized values fail. These checks are not a full accessibility certification.

`createThemeStyle` generates a valid JSON-serializable style, never fetches data and never chooses an endpoint. To consume operator data, pass `data: { mode: 'operator', source, attribution, sourceLayers }`. Source must be GeoJSON or vector; `sourceLayers` is required per kind for a vector source. This uses the **design-v1 normalized schema**, not an assumed OpenMapTiles/Planetiler schema:

| Field                    | Contract                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| kind                     | land, park, water, building (Polygon); boundary, road, trail (LineString); place, poi (Point)                      |
| class                    | major or minor for road                                                                                            |
| poi                      | park, parking, trail or facility; unknown values use facility                                                      |
| name:ko / name / name:en | NFC-normalized, trimmed strings; Korean, then original, then English; missing/empty/non-string values fall through |

The operator owns conversion, CRS validation, tile rights and attribution. The style cannot infer an external tile schema or legally authorize a dataset. Keep data under its own license.

`parseCustomStyle(objectOrJSONString)` validates with the installed MapLibre Style Spec and returns a detached JSON copy. It rejects invalid spec, non-JSON values and unsafe object keys. It does not sandbox trusted custom code or prove asset rights. `extendStyle(style, { sources, layers })` appends new IDs, requires attribution for added sources, preserves base sources/attribution and rejects reserved `korea-`/`kmk-` IDs. Raw custom style consumers must keep their own required notices visible; application CSS cannot be controlled by a style JSON validator.

`createPoiIcon(kind, background, ink, size)` returns original RGBA pixels, without SVG/font/network dependencies. Register the four `korea-poi-{kind}` images before loading an icon-enabled style. For custom marks use Web `images` at construction or `addImage` after ready, then add your symbol layer. The Native caller must register equivalent images with its renderer. Set `icons: false` to use circle POIs without images.

Typography is explicit:

- `mode: 'local'` is Web-only and relies on installed/otherwise operator-provided fonts. Local font omission is not claimed to work on Native.
- `mode: 'glyphs'` requires an operator HTTPS `{fontstack}/{range}.pbf` template and font stack. HTTP loopback is accepted for local tests. Supply all resource origins in the Web config. No demo glyph URL is inserted.
- `mode: 'none'` omits labels, for explicit geometry-only tests.

`koreanNameExpression()` is the renderer expression; `resolveKoreanName()` mirrors its fallback. Normalize/trim data before tiling, including decomposed Hangul. `auditGlyphCoverage(labels, actualGlyphIds)` reports missing individual code points; HTTP 200 alone is insufficient. `inspectFontCoverage(bytes, labels, faceIndex)` inspects Unicode cmap 4/12 in TTF/OTF/TTC. It rejects WOFF/WOFF2 and does not decode glyph PBF or prove shaping/raster quality. Compare decoded PBF glyph IDs separately when generating a provider pack.

Repository QA: `node scripts/check-font.mjs --font /path/to/reviewed/font.ttc --face 1`. It checks the corpus plus all 11,172 modern Hangul syllables without downloading a font. Face 1 is the tested Noto CJK KR collection face; inspect other files before choosing their index. Web Chromium rendering is verified separately. Android/iOS physical rendering is **unverified** until an explicit glyph provider and device/simulator are available.

Noto CJK is OFL-1.1: preserve its copyright/license when redistributing fonts or derived glyph packs, review reserved-name conditions for modifications, and do not relicense them MIT. This SDK distributes no Noto font/glyph payload. The full license, platform matrix and four screenshots are in the repository design-system documentation.

## 선택형 상세 지도 스타일

`createThemeStyle`은 기존 출력과 기본값을 유지합니다. 도로·장소 위계와 POI 밀도 조절은 새 `createCartographyStyle`로 선택합니다. `schema: 'design-v2'`, `density: 'balanced' | 'sparse' | 'dense'`를 지정할 수 있습니다. 네 테마와 기존 색상·폭 오버라이드를 사용하며 `name:ko → name → name:en` 순서로 표시합니다.

`designV1`/`designV2`는 필드·레이어 계약을 공개합니다. 실제 v2 타일은 선택형 운영자 profile로 생성해야 합니다. rail/waterway/transport/landmask/ocean capability를 원본 확인 없이 켜지 마세요. context source는 z0–9, detail source는 z10 이상을 담당합니다. 육지 마스크 없는 바다·해안선은 구현됐다고 표현하지 않습니다. 폰트·glyph·타일 endpoint는 운영자가 설정합니다.

```ts
import { createCartographyStyle } from 'korea-map-styles';

const synthetic = createCartographyStyle({
  theme: 'standard',
  target: 'web',
  schema: 'design-v2',
  density: 'balanced',
  data: { mode: 'fixture', capabilities: { rail: true, waterway: true, transport: true } },
  typography: { mode: 'none' },
  icons: false,
});
```

합성 예시는 실제 한국 지도가 아닙니다. 한국어 라벨은 운영자가 허가된 glyph를 연결해야 합니다. [품질 기준](../../docs/map-quality.md)과 [검증 기록](../../docs/research/map-quality-validation.md)을 참고하세요.
