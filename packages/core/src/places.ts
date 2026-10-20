import { assertLngLat, KitError, type Place } from './base.js';
import type {
  Coordinate,
  JsonObject,
  MapBounds,
  OperationContext,
  OperationOptions,
  Scheduler,
} from './contracts.js';
import { copyJson, validateBounds } from './validation.js';
import { runOperation } from './operations.js';

/** Stable categories; a trail POI is not a routing graph. */
export type PoiCategory =
  'park' | 'tourism' | 'parking' | 'toilet' | 'pet_facility' | 'trail' | 'other';
/** Source-attributed record. Missing coordinates remain null, never guessed or geocoded implicitly. */
export interface PublicPlace {
  readonly id: string;
  readonly name: string;
  readonly category: PoiCategory;
  readonly location: Coordinate | null;
  readonly address: string | null;
  readonly source: string;
  readonly source_id: string;
  readonly license: string;
  readonly attribution: string;
  /** Source snapshot/record time, not the ingestion time; UTC ISO 8601. */
  readonly updated_at: string;
  readonly metadata: JsonObject;
}
export interface PlaceQueryOptions {
  /** 1..100; default 20. No implicit pagination/download of the entire DB. */
  readonly limit?: number;
}
export interface NearbyPlacesQuery extends PlaceQueryOptions {
  readonly center: Coordinate;
  /** Positive meters, at most 50,000. */
  readonly radiusMeters: number;
  readonly category?: PoiCategory;
}
export interface BoundsPlacesQuery extends PlaceQueryOptions {
  readonly bounds: MapBounds;
  readonly category?: PoiCategory;
}
export interface CategoryPlacesQuery extends PlaceQueryOptions {
  readonly category: PoiCategory;
}
export type PlacesQuery =
  | ({ readonly kind: 'nearby' } & NearbyPlacesQuery)
  | ({ readonly kind: 'bounds' } & BoundsPlacesQuery)
  | ({ readonly kind: 'category' } & CategoryPlacesQuery);
/** Implement this interface for any operator-owned DB/service. No storage vendor dependency. */
export interface PlacesProvider {
  query(query: PlacesQuery, context: OperationContext): Promise<readonly PublicPlace[]>;
}
export interface PlacesClient {
  getNearbyPlaces(
    query: NearbyPlacesQuery,
    options?: OperationOptions,
  ): Promise<readonly PublicPlace[]>;
  getPlacesInBounds(
    query: BoundsPlacesQuery,
    options?: OperationOptions,
  ): Promise<readonly PublicPlace[]>;
  getPlacesByCategory(
    query: CategoryPlacesQuery,
    options?: OperationOptions,
  ): Promise<readonly PublicPlace[]>;
}
export function validatePoiCategory(value: unknown): PoiCategory {
  if (
    typeof value !== 'string' ||
    !['park', 'tourism', 'parking', 'toilet', 'pet_facility', 'trail', 'other'].includes(value)
  )
    throw new KitError('INVALID_ARGUMENT', 'INVALID_POI_CATEGORY');
  return value as PoiCategory;
}
/** Validate before invoking a provider; returns a detached query. */
export function validatePlacesQuery(query: PlacesQuery): PlacesQuery {
  if (!query || typeof query !== 'object')
    throw new KitError('INVALID_ARGUMENT', 'INVALID_POI_QUERY');
  const limit = query.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new KitError('INVALID_ARGUMENT', 'INVALID_POI_LIMIT');
  const category =
    query.category === undefined ? {} : { category: validatePoiCategory(query.category) };
  if (query.kind === 'nearby') {
    assertLngLat(query.center);
    if (
      !Number.isFinite(query.radiusMeters) ||
      query.radiusMeters <= 0 ||
      query.radiusMeters > 50000
    )
      throw new KitError('INVALID_ARGUMENT', 'INVALID_POI_RADIUS');
    return {
      kind: query.kind,
      center: [...query.center],
      radiusMeters: query.radiusMeters,
      limit,
      ...category,
    };
  }
  if (query.kind === 'bounds')
    return { kind: query.kind, bounds: validateBounds(query.bounds), limit, ...category };
  if (query.kind === 'category')
    return { kind: query.kind, category: validatePoiCategory(query.category), limit };
  throw new KitError('INVALID_ARGUMENT', 'INVALID_POI_QUERY');
}
export function validatePublicPlace(value: unknown): PublicPlace {
  if (!value || typeof value !== 'object')
    throw new KitError('INVALID_ARGUMENT', 'INVALID_POI_RECORD');
  const p = value as Record<string, unknown>;
  function text(key: string, max: number): string {
    const v = p[key];
    if (
      typeof v !== 'string' ||
      !v.trim() ||
      v.length > max ||
      [...v].some((char) => char.charCodeAt(0) < 32)
    )
      throw new KitError('INVALID_ARGUMENT', 'INVALID_POI_FIELD');
    return v;
  }
  const location = p['location'];
  if (location !== null) assertLngLat(location as Coordinate);
  const address = p['address'] === null ? null : text('address', 1000);
  const updated = text('updated_at', 24);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(updated) ||
    !Number.isFinite(Date.parse(updated)) ||
    new Date(updated).toISOString() !== updated
  )
    throw new KitError('INVALID_ARGUMENT', 'INVALID_POI_DATE');
  const metadata = copyJson(p['metadata']);
  if (
    !metadata ||
    Array.isArray(metadata) ||
    typeof metadata !== 'object' ||
    JSON.stringify(metadata).length > 8192
  )
    throw new KitError('INVALID_ARGUMENT', 'INVALID_POI_METADATA');
  return {
    id: text('id', 256),
    name: text('name', 500),
    category: validatePoiCategory(p['category']),
    location: location === null ? null : [...(location as Coordinate)],
    address,
    source: text('source', 100),
    source_id: text('source_id', 256),
    license: text('license', 100),
    attribution: text('attribution', 2000),
    updated_at: updated,
    metadata,
  };
}
/** Explicit conversion to the original display/search Place model. Unlocated records cannot be markers. */
export function publicPlaceToPlace(value: PublicPlace): Place {
  const p = validatePublicPlace(value);
  if (!p.location) throw new KitError('UNAVAILABLE', 'POI_HAS_NO_LOCATION');
  return {
    id: p.id,
    label: p.name,
    coordinate: p.location,
    categories: [p.category],
    provenance: { sourceId: p.source, datasetVersion: p.updated_at },
  };
}
export function createPlacesClient(provider: PlacesProvider, scheduler: Scheduler): PlacesClient {
  const query = (input: PlacesQuery, options?: OperationOptions) =>
    runOperation(
      async (context) => {
        const checked = validatePlacesQuery(input);
        const result = await provider.query(checked, context);
        if (!Array.isArray(result) || result.length > (checked.limit ?? 20))
          throw new KitError('UNAVAILABLE', 'INVALID_POI_RESPONSE');
        return Array.from(result, validatePublicPlace);
      },
      options,
      scheduler,
    );
  return {
    getNearbyPlaces: (q, o) => query({ ...q, kind: 'nearby' }, o),
    getPlacesInBounds: (q, o) => query({ ...q, kind: 'bounds' }, o),
    getPlacesByCategory: (q, o) => query({ ...q, kind: 'category' }, o),
  };
}
