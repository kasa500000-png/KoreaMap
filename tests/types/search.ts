import type {
  KoreanSearchProvider,
  SearchProvider,
  GeocodingProvider,
  MapController,
} from 'korea-map-core';
import { focusSearchHit } from 'korea-map-core';
/** Strict compile-only contract examples shared by Web and Native. */
export async function searchConsumer(provider: KoreanSearchProvider, map: MapController) {
  const compatible: SearchProvider = provider;
  await compatible.search({ text: '서울', language: 'ko', limit: 10 });
  const page = await provider.searchPage({
    text: '공원',
    language: 'ko',
    limit: 10,
    center: [127, 37.5],
    radiusMeters: 1000,
    category: 'park',
  });
  if (page.hits[0]) await focusSearchHit(map, page.hits[0]);
  await provider.reverseNearby({ center: [127, 37.5] });
  // @ts-expect-error POI proximity is not an exact address geocoding service.
  const geocoding: GeocodingProvider = provider;
  void geocoding;
  // @ts-expect-error Categories must use the common POI vocabulary.
  await provider.searchPage({ text: '공원', language: 'ko', limit: 10, category: 'unknown' });
}
