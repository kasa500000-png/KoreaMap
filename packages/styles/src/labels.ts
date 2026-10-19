import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';
/** Data pipelines should NFC-normalize and trim name fields before tiling. */
export function koreanNameExpression(): ExpressionSpecification {
  return [
    'case',
    ['all', ['==', ['typeof', ['get', 'name:ko']], 'string'], ['!=', ['get', 'name:ko'], '']],
    ['get', 'name:ko'],
    ['all', ['==', ['typeof', ['get', 'name']], 'string'], ['!=', ['get', 'name'], '']],
    ['get', 'name'],
    ['all', ['==', ['typeof', ['get', 'name:en']], 'string'], ['!=', ['get', 'name:en'], '']],
    ['get', 'name:en'],
    '',
  ];
}
export function resolveKoreanName(properties: Record<string, unknown>): string {
  for (const key of ['name:ko', 'name', 'name:en']) {
    const value = properties[key];
    if (typeof value === 'string' && value !== '') return value;
  }
  return '';
}
export function requiredCodePoints(labels: readonly string[]): number[] {
  return [
    ...new Set(
      labels.flatMap((label) =>
        [...label.normalize('NFC')]
          .filter((char) => !/^\s$/u.test(char))
          .map((char) => char.codePointAt(0)!),
      ),
    ),
  ].sort((a, b) => a - b);
}
/** Availability must come from a font cmap or decoded glyph IDs, never just successful HTTP status. */
export function auditGlyphCoverage(labels: readonly string[], available: Iterable<number>) {
  const codes = requiredCodePoints(labels);
  const coverage = new Set(available);
  const missing = codes.filter((code) => !coverage.has(code));
  return {
    ok: missing.length === 0,
    required: codes.length,
    missing: missing.map((code) => ({
      codePoint: code,
      unicode: `U+${code.toString(16).toUpperCase().padStart(4, '0')}`,
      character: String.fromCodePoint(code),
    })),
  };
}
