import { KitError, type SearchProvider } from '@korea-map-kit/core';

/** Explicit opt-in demo adapter. No service discovery, endpoint or network access. */
export function createFixtureSearchProvider(): SearchProvider {
  return {
    capabilities: { autocomplete: false, reverse: false },
    async search(query, options) {
      if (options?.signal?.aborted) throw new KitError('ABORTED', 'OPERATION_ABORTED');
      if (
        options?.timeoutMs !== undefined &&
        (!Number.isFinite(options.timeoutMs) ||
          options.timeoutMs < 1 ||
          options.timeoutMs > 2147483647)
      )
        throw new KitError('INVALID_ARGUMENT', 'INVALID_TIMEOUT');
      if (
        typeof query.text !== 'string' ||
        !Number.isInteger(query.limit) ||
        query.limit < 1 ||
        query.limit > 50
      ) {
        throw new KitError('INVALID_ARGUMENT', 'INVALID_SEARCH_QUERY');
      }
      const text = query.text.normalize('NFC').trim();
      return text && '합성 지점'.includes(text)
        ? [
            {
              id: 'fixture:point',
              label: '합성 지점',
              coordinate: [126.978, 37.5665],
              categories: [],
              provenance: { sourceId: 'synthetic-fixture', datasetVersion: '1' },
            },
          ]
        : [];
    },
  };
}
export * from './places.js';
