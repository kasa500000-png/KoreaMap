export type LngLat = readonly [longitude: number, latitude: number];
export type KitErrorCode = 'INVALID_ARGUMENT' | 'UNSUPPORTED' | 'UNAVAILABLE' | 'ABORTED';

export class KitError extends Error {
  constructor(
    public readonly code: KitErrorCode,
    public readonly detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = 'KitError';
  }
}

export function assertLngLat(value: unknown): asserts value is LngLat {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every((part: unknown) => typeof part === 'number' && Number.isFinite(part)) ||
    Math.abs(value[0] as number) > 180 ||
    Math.abs(value[1] as number) > 90
  ) {
    throw new KitError('INVALID_ARGUMENT', 'INVALID_COORDINATE');
  }
}

export function assertMercatorCoordinate(value: unknown): asserts value is LngLat {
  assertLngLat(value);
  if (Math.abs(value[1]) > 85.051129) {
    throw new KitError('INVALID_ARGUMENT', 'OUTSIDE_MERCATOR');
  }
}

/** Foundation supports only this explicit, network-free mode. */
export type LocalMapConfig = { readonly mode: 'local-fixture'; readonly fixtureId: 'synthetic-v1' };

export function validateMapConfig(value: unknown): LocalMapConfig {
  if (value === undefined || value === null) {
    throw new KitError('INVALID_ARGUMENT', 'CONFIG_REQUIRED');
  }
  if (typeof value !== 'object' || !('mode' in value)) {
    throw new KitError('INVALID_ARGUMENT', 'INVALID_CONFIG');
  }
  if (value.mode !== 'local-fixture') {
    throw new KitError('UNSUPPORTED', 'PROVIDER_MODE_NOT_IMPLEMENTED');
  }
  if (
    !('fixtureId' in value) ||
    value.fixtureId !== 'synthetic-v1' ||
    Object.keys(value).some((key) => key !== 'mode' && key !== 'fixtureId')
  ) {
    throw new KitError('INVALID_ARGUMENT', 'INVALID_FIXTURE_CONFIG');
  }
  return { mode: 'local-fixture', fixtureId: 'synthetic-v1' };
}

export interface Place {
  readonly id: string;
  readonly label: string;
  readonly coordinate: LngLat;
  readonly categories: readonly string[];
  readonly provenance: { readonly sourceId: string; readonly datasetVersion: string };
}
export interface SearchQuery {
  readonly text: string;
  readonly language: string;
  readonly limit: number;
}
export interface SearchProvider {
  readonly capabilities: { readonly autocomplete: boolean; readonly reverse: boolean };
  search(query: SearchQuery): Promise<readonly Place[]>;
}

export function requireSearchProvider(provider?: SearchProvider): SearchProvider {
  if (!provider) throw new KitError('UNAVAILABLE', 'SEARCH_PROVIDER_REQUIRED');
  return provider;
}

/** Serializable camera and marker contracts shared by platform adapters. */
export interface CameraState {
  readonly center: LngLat;
  readonly zoom: number;
  readonly bearing: number;
  readonly pitch: number;
}
export interface MapMarker {
  readonly id: string;
  readonly coordinate: LngLat;
  readonly label: string;
  readonly description?: string;
}
export type MapGeometry =
  | { type: 'Point'; coordinates: [number, number] }
  | { type: 'LineString'; coordinates: [number, number][] }
  | { type: 'Polygon'; coordinates: [number, number][][] };
export interface MapFeatureCollection {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    id?: string;
    properties: Record<string, string | number | boolean | null>;
    geometry: MapGeometry;
  }[];
}
