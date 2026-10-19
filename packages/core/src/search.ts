import { assertLngLat, KitError, type SearchProvider, type SearchQuery } from './base.js';
import type {
  Coordinate,
  MapBounds,
  MapController,
  OperationContext,
  OperationOptions,
  Scheduler,
} from './contracts.js';
import { runOperation } from './operations.js';
import {
  publicPlaceToPlace,
  validatePoiCategory,
  validatePublicPlace,
  type PoiCategory,
  type PublicPlace,
} from './places.js';
import { validateBounds } from './validation.js';

export interface KoreanSearchQuery extends SearchQuery {
  readonly bounds?: MapBounds;
  readonly center?: Coordinate;
  readonly radiusMeters?: number;
  readonly category?: PoiCategory;
  /** Offset 0..1000. Stable ordering on an unchanged DB, not a snapshot across updates. */
  readonly offset?: number;
  readonly sort?: 'relevance' | 'distance';
}
export interface SearchHit {
  readonly place: PublicPlace;
  readonly distanceMeters: number | null;
  readonly relevance: number;
}
export interface SearchPage {
  readonly hits: readonly SearchHit[];
  readonly nextOffset: number | null;
}
export interface ReversePoiQuery {
  readonly center: Coordinate;
  readonly radiusMeters?: number;
  readonly category?: PoiCategory;
}
/** Nearby facility address, never a parcel/road-address determination at the input coordinate. */
export interface ReversePoiResult {
  readonly kind: 'nearby-poi';
  readonly place: PublicPlace;
  readonly distanceMeters: number;
}
export type SearchRequest =
  | { readonly kind: 'search' | 'autocomplete'; readonly query: KoreanSearchQuery }
  | { readonly kind: 'reverse'; readonly query: ReversePoiQuery };
export interface SearchPort {
  request(request: SearchRequest, context: OperationContext): Promise<unknown>;
}
export interface KoreanSearchProvider extends SearchProvider {
  search(
    query: KoreanSearchQuery,
    options?: OperationOptions,
  ): ReturnType<SearchProvider['search']>;
  searchPage(query: KoreanSearchQuery, options?: OperationOptions): Promise<SearchPage>;
  autocomplete(query: KoreanSearchQuery, options?: OperationOptions): Promise<SearchPage>;
  reverseNearby(
    query: ReversePoiQuery,
    options?: OperationOptions,
  ): Promise<ReversePoiResult | null>;
}
/** NFC; remove ASCII whitespace, NBSP and ideographic space; ASCII case folding only. */
export function normalizeSearchText(value: string): string {
  if (typeof value !== 'string') throw new KitError('INVALID_ARGUMENT', 'INVALID_SEARCH_TEXT');
  return [...value.normalize('NFC')]
    .filter((char) => {
      const c = char.charCodeAt(0);
      return !((c >= 9 && c <= 13) || c === 32 || c === 160 || c === 12288);
    })
    .join('')
    .replace(/[A-Z]/gu, (c) => c.toLowerCase());
}
export function validateKoreanSearchQuery(value: KoreanSearchQuery): KoreanSearchQuery {
  if (
    !value ||
    typeof value.text !== 'string' ||
    value.text.length > 120 ||
    !['ko', 'ko-KR'].includes(value.language) ||
    !Number.isInteger(value.limit) ||
    value.limit < 1 ||
    value.limit > 50
  )
    throw new KitError('INVALID_ARGUMENT', 'INVALID_SEARCH_QUERY');
  const offset = value.offset ?? 0;
  if (!Number.isInteger(offset) || offset < 0 || offset > 1000)
    throw new KitError('INVALID_ARGUMENT', 'INVALID_SEARCH_OFFSET');
  if (value.center !== undefined) assertLngLat(value.center);
  if (
    value.radiusMeters !== undefined &&
    (!value.center ||
      !Number.isFinite(value.radiusMeters) ||
      value.radiusMeters <= 0 ||
      value.radiusMeters > 50000)
  )
    throw new KitError('INVALID_ARGUMENT', 'INVALID_SEARCH_RADIUS');
  const sort = value.sort ?? (value.center ? 'distance' : 'relevance');
  if (!['distance', 'relevance'].includes(sort) || (sort === 'distance' && !value.center))
    throw new KitError('INVALID_ARGUMENT', 'INVALID_SEARCH_SORT');
  return {
    text: normalizeSearchText(value.text),
    language: value.language,
    limit: value.limit,
    offset,
    sort,
    ...(value.center ? { center: [...value.center] as Coordinate } : {}),
    ...(value.radiusMeters !== undefined ? { radiusMeters: value.radiusMeters } : {}),
    ...(value.bounds !== undefined ? { bounds: validateBounds(value.bounds) } : {}),
    ...(value.category !== undefined ? { category: validatePoiCategory(value.category) } : {}),
  };
}
export function validateReversePoiQuery(q: ReversePoiQuery): ReversePoiQuery {
  if (!q) throw new KitError('INVALID_ARGUMENT', 'INVALID_REVERSE_QUERY');
  assertLngLat(q.center);
  const radiusMeters = q.radiusMeters ?? 1000;
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0 || radiusMeters > 50000)
    throw new KitError('INVALID_ARGUMENT', 'INVALID_SEARCH_RADIUS');
  return {
    center: [...q.center],
    radiusMeters,
    ...(q.category !== undefined ? { category: validatePoiCategory(q.category) } : {}),
  };
}
function validateHit(value: unknown): SearchHit {
  const hit = value as SearchHit | null;
  if (
    !hit ||
    !Number.isFinite(hit.relevance) ||
    hit.relevance < 0 ||
    hit.relevance > 4 ||
    (hit.distanceMeters !== null &&
      (!Number.isFinite(hit.distanceMeters) || hit.distanceMeters < 0))
  )
    throw new Error('Invalid search response');
  const place = validatePublicPlace(hit.place);
  if (hit.distanceMeters !== null && !place.location) throw new Error('Distance without location');
  return { place, distanceMeters: hit.distanceMeters, relevance: hit.relevance };
}
export function createKoreanSearchProvider(
  port: SearchPort,
  scheduler: Scheduler,
): KoreanSearchProvider {
  const page = (
    input: KoreanSearchQuery,
    kind: 'search' | 'autocomplete',
    options?: OperationOptions,
  ) =>
    runOperation(
      async (context) => {
        const query = validateKoreanSearchQuery(input);
        if (!query.text || (kind === 'autocomplete' && query.text.length < 2))
          return { hits: [], nextOffset: null };
        if (kind === 'autocomplete' && (query.limit > 10 || query.offset !== 0))
          throw new KitError('INVALID_ARGUMENT', 'INVALID_AUTOCOMPLETE_WINDOW');
        const raw = await port.request({ kind, query }, context);
        try {
          const result = raw as SearchPage;
          if (!result || !Array.isArray(result.hits) || result.hits.length > query.limit)
            throw new Error();
          const expected = (query.offset ?? 0) + query.limit;
          if (
            result.nextOffset !== null &&
            (kind === 'autocomplete' ||
              result.hits.length !== query.limit ||
              result.nextOffset !== expected ||
              expected > 1000)
          )
            throw new Error();
          return { hits: Array.from(result.hits, validateHit), nextOffset: result.nextOffset };
        } catch {
          throw new KitError('UNAVAILABLE', 'INVALID_SEARCH_RESPONSE');
        }
      },
      options,
      scheduler,
    );
  return {
    capabilities: { autocomplete: true, reverse: true },
    searchPage: (q, o) => page(q, 'search', o),
    autocomplete: (q, o) => page(q, 'autocomplete', o),
    async search(q, o) {
      return (await page(q, 'search', o)).hits
        .filter((h) => h.place.location !== null)
        .map((h) => publicPlaceToPlace(h.place));
    },
    reverseNearby: (input, options) =>
      runOperation(
        async (context) => {
          const query = validateReversePoiQuery(input);
          const result = await port.request({ kind: 'reverse', query }, context);
          if (result === null) return null;
          try {
            const r = result as ReversePoiResult;
            const hit = validateHit({ ...r, relevance: 1 });
            if (
              r.kind !== 'nearby-poi' ||
              hit.distanceMeters === null ||
              hit.distanceMeters > (query.radiusMeters ?? 1000)
            )
              throw new Error();
            return {
              kind: 'nearby-poi' as const,
              place: hit.place,
              distanceMeters: hit.distanceMeters,
            };
          } catch {
            throw new KitError('UNAVAILABLE', 'INVALID_REVERSE_RESPONSE');
          }
        },
        options,
        scheduler,
      ),
  };
}
/** Map selection helper; null-location results cannot move the camera. */
export function focusSearchHit(
  map: MapController,
  hit: SearchHit,
  options?: OperationOptions,
): Promise<void> {
  const place = validatePublicPlace(hit.place);
  if (!place.location) return Promise.reject(new KitError('UNAVAILABLE', 'POI_HAS_NO_LOCATION'));
  return map.setCamera({ center: place.location, zoom: 16, bearing: 0, pitch: 0 }, options);
}
