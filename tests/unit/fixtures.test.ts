import { expect, it } from 'vitest';
import { createFixtureStyle } from '@korea-map-kit/styles';
import { createFixtureSearchProvider } from '@korea-map-kit/data-adapters';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
it('creates independent valid styles without remote assets', () => {
  const config = { mode: 'local-fixture', fixtureId: 'synthetic-v1' } as const;
  const first = createFixtureStyle(config);
  const next = createFixtureStyle(config);
  expect(validateStyleMin(first)).toEqual([]);
  expect(JSON.stringify(first)).not.toMatch(/https?:|glyphs|sprite|tiles/);
  first.layers.length = 0;
  expect(next.layers.length).toBe(3);
});
it('returns clearly synthetic results and empty results without remote fallback', async () => {
  const provider = createFixtureSearchProvider();
  expect(
    (await provider.search({ text: '합성', language: 'ko', limit: 5 }))[0]?.provenance.sourceId,
  ).toBe('synthetic-fixture');
  expect(await provider.search({ text: '실제 주소', language: 'ko', limit: 5 })).toEqual([]);
  expect(await provider.search({ text: ' ', language: 'ko', limit: 5 })).toEqual([]);
  await expect(provider.search({ text: '합성', language: 'ko', limit: 0 })).rejects.toThrow(
    'INVALID_SEARCH_QUERY',
  );
});
