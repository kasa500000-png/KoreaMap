# Korea Map Kit core API reference

Generated from TypeScript declarations by `pnpm docs:api`. Do not edit by hand.

[Usage, semantics and platform parity](../public-api.md)

## LngLat

```ts
export type LngLat = readonly [longitude: number, latitude: number];
```

## KitErrorCode

```ts
export type KitErrorCode = 'INVALID_ARGUMENT' | 'UNSUPPORTED' | 'UNAVAILABLE' | 'ABORTED' | 'TIMEOUT' | 'PERMISSION_DENIED' | 'NETWORK_ERROR' | 'NOT_FOUND';
```

## KitError

```ts
export declare class KitError extends Error {
    readonly code: KitErrorCode;
    readonly detail: string;
    constructor(code: KitErrorCode, detail: string);
}
```

## assertLngLat

```ts
export declare function assertLngLat(value: unknown): asserts value is LngLat;
```

## assertMercatorCoordinate

```ts
export declare function assertMercatorCoordinate(value: unknown): asserts value is LngLat;
```

## LocalMapConfig

```ts
/** Foundation supports only this explicit, network-free mode. */
export type LocalMapConfig = {
    readonly mode: 'local-fixture';
    readonly fixtureId: 'synthetic-v1';
};
```

## validateMapConfig

```ts
export declare function validateMapConfig(value: unknown): LocalMapConfig;
```

## Place

```ts
export interface Place {
    readonly id: string;
    readonly label: string;
    readonly coordinate: LngLat;
    readonly categories: readonly string[];
    readonly provenance: {
        readonly sourceId: string;
        readonly datasetVersion: string;
    };
}
```

## SearchQuery

```ts
export interface SearchQuery {
    readonly text: string;
    readonly language: string;
    readonly limit: number;
}
```

## SearchProvider

```ts
export interface SearchProvider {
    readonly capabilities: {
        readonly autocomplete: boolean;
        readonly reverse: boolean;
    };
    search(query: SearchQuery, options?: import('./contracts.js').OperationOptions): Promise<readonly Place[]>;
}
```

## requireSearchProvider

```ts
export declare function requireSearchProvider(provider?: SearchProvider): SearchProvider;
```

## CameraState

```ts
/** Serializable camera and marker contracts shared by platform adapters. */
export interface CameraState {
    readonly center: LngLat;
    readonly zoom: number;
    readonly bearing: number;
    readonly pitch: number;
}
```

## MapMarker

```ts
export interface MapMarker {
    readonly id: string;
    readonly coordinate: LngLat;
    readonly label: string;
    readonly description?: string;
}
```

## MapGeometry

```ts
export type MapGeometry = {
    type: 'Point';
    coordinates: [number, number];
} | {
    type: 'LineString';
    coordinates: [number, number][];
} | {
    type: 'Polygon';
    coordinates: [number, number][][];
};
```

## MapFeatureCollection

```ts
export interface MapFeatureCollection {
    type: 'FeatureCollection';
    features: {
        type: 'Feature';
        id?: string;
        properties: Record<string, string | number | boolean | null>;
        geometry: MapGeometry;
    }[];
}
```

## Coordinate

```ts
/** WGS84 decimal degrees, always [longitude, latitude]; altitude is outside this MVP. */
export type Coordinate = LngLat;
```

## MapCamera

```ts
/** Zoom 0..22, bearing -360..360 degrees, pitch 0..60 degrees. */
export type MapCamera = CameraState;
```

## MapBounds

```ts
/** SW and NE corners; west > east means crossing the antimeridian. */
export interface MapBounds {
    readonly west: number;
    readonly south: number;
    readonly east: number;
    readonly north: number;
}
```

## Feature

```ts
/** MVP GeoJSON subset: Point, LineString, Polygon; scalar properties and string IDs. */
export type Feature = MapFeatureCollection['features'][number];
```

## FeatureCollection

```ts
export type FeatureCollection = MapFeatureCollection;
```

## Geometry

```ts
export type Geometry = MapGeometry;
```

## JsonValue

```ts
export type JsonValue = null | boolean | number | string | JsonValue[] | {
    [key: string]: JsonValue;
};
```

## JsonObject

```ts
export type JsonObject = {
    [key: string]: JsonValue;
};
```

## MapStyle

```ts
/** Portable Style Spec JSON. Engine validation and resource policy are adapter responsibilities. */
export interface MapStyle {
    readonly document: JsonObject;
    readonly attribution: string;
}
```

## MapLayer

```ts
/** Portable JSON layer, excluding Web-only custom WebGL callbacks. Use defineMapLayer(). */
export interface MapLayer {
    readonly id: string;
    readonly type: 'background' | 'fill' | 'line' | 'symbol' | 'circle' | 'heatmap' | 'fill-extrusion' | 'raster' | 'hillshade';
    readonly definition: JsonObject;
}
```

## MapRoute

```ts
/** A route to display, not an implicit routing-service request. Distances in meters, duration in seconds. */
export interface MapRoute {
    readonly id: string;
    readonly coordinates: readonly Coordinate[];
    readonly distanceMeters?: number;
    readonly durationSeconds?: number;
}
```

## MapEvent

```ts
/** Events carry shared data only, never a DOM/native engine event. */
export type MapEvent = {
    readonly type: 'ready' | 'idle' | 'destroyed';
} | {
    readonly type: 'camera';
    readonly camera: MapCamera;
} | {
    readonly type: 'click';
    readonly coordinate: Coordinate;
} | {
    readonly type: 'select';
    readonly marker: MapMarker | null;
} | {
    readonly type: 'error';
    readonly error: KitError;
    readonly fatal: boolean;
};
```

## CancellationSignal

```ts
/** Portable cancellation; use createCancellationSource(), with no DOM type dependency. */
export interface CancellationSignal {
    readonly aborted: boolean;
    subscribe(listener: () => void): () => void;
}
```

## OperationOptions

```ts
export interface OperationOptions {
    readonly signal?: CancellationSignal;
    readonly timeoutMs?: number;
}
```

## OperationContext

```ts
export interface OperationContext {
    readonly signal: CancellationSignal;
}
```

## Scheduler

```ts
/** Inject platform timers; schedule returns an idempotent cancel function. */
export interface Scheduler {
    schedule(callback: () => void, delayMs: number): () => void;
}
```

## FitBoundsOptions

```ts
/** Uniform CSS pixel / native logical-point padding. Zero-duration camera commands. */
export interface FitBoundsOptions {
    readonly padding?: number;
}
```

## MapController

```ts
/** Promises acknowledge commands, not a rendered frame. setStyle waits for style readiness. */
export interface MapController {
    setCenter(center: Coordinate, options?: OperationOptions): Promise<void>;
    setZoom(zoom: number, options?: OperationOptions): Promise<void>;
    setCamera(camera: MapCamera, options?: OperationOptions): Promise<void>;
    fitBounds(bounds: MapBounds, fit?: FitBoundsOptions, options?: OperationOptions): Promise<void>;
    setStyle(style: MapStyle, options?: OperationOptions): Promise<void>;
    addMarker(marker: MapMarker, options?: OperationOptions): Promise<void>;
    removeMarker(id: string, options?: OperationOptions): Promise<void>;
    addGeoJSON(id: string, data: FeatureCollection, options?: OperationOptions): Promise<void>;
    removeGeoJSON(id: string, options?: OperationOptions): Promise<void>;
    showRoute(route: MapRoute, options?: OperationOptions): Promise<void>;
    getVisibleBounds(options?: OperationOptions): Promise<MapBounds>;
    onEvent(listener: (event: MapEvent) => void): () => void;
    destroy(): void;
}
```

## MapCommand

```ts
/** Adapter commands. addMarker/addGeoJSON replace matching IDs; removing absent IDs is a no-op. */
export type MapCommand = {
    type: 'center';
    center: Coordinate;
} | {
    type: 'zoom';
    zoom: number;
} | {
    type: 'camera';
    camera: MapCamera;
} | {
    type: 'bounds';
    bounds: MapBounds;
    padding: number;
} | {
    type: 'style';
    style: MapStyle;
} | {
    type: 'marker';
    marker: MapMarker;
} | {
    type: 'remove-marker';
    id: string;
} | {
    type: 'geojson';
    id: string;
    data: FeatureCollection;
} | {
    type: 'remove-geojson';
    id: string;
};
```

## MapPort

```ts
/** Internal integration seam is exported for custom adapters and dependency-free contract tests. */
export interface MapPort {
    execute(command: MapCommand, context: OperationContext): void | Promise<void>;
    getVisibleBounds(context: OperationContext): MapBounds | Promise<MapBounds>;
    subscribe(listener: (event: MapEvent) => void): () => void;
    destroy(): void;
}
```

## GeocodingProvider

```ts
export interface GeocodingProvider {
    geocode(query: SearchQuery, options?: OperationOptions): Promise<readonly Place[]>;
    reverse(coordinate: Coordinate, options?: OperationOptions): Promise<readonly Place[]>;
}
```

## RoutingRequest

```ts
export interface RoutingRequest {
    readonly waypoints: readonly Coordinate[];
    readonly mode: 'walking' | 'cycling' | 'driving';
}
```

## RoutingProvider

```ts
export interface RoutingProvider {
    route(request: RoutingRequest, options?: OperationOptions): Promise<readonly MapRoute[]>;
}
```

## LocationFix

```ts
export interface LocationFix {
    readonly coordinate: Coordinate;
    readonly accuracyMeters: number;
    readonly timestampMs: number;
}
```

## LocationProvider

```ts
/** No permission prompt on import. Platform adapters implement permission UX at explicit invocation. */
export interface LocationProvider {
    getCurrentPosition(options?: OperationOptions): Promise<LocationFix>;
}
```

## PlaceRepository

```ts
/** Storage implementation and authorization belong to the operator. */
export interface PlaceRepository {
    get(id: string, options?: OperationOptions): Promise<Place | null>;
    put(place: Place, options?: OperationOptions): Promise<void>;
    remove(id: string, options?: OperationOptions): Promise<void>;
}
```

## TileProvider

```ts
/** Provider supplies a complete explicit style; no SDK endpoint or automatic fallback. */
export interface TileProvider {
    readonly id: string;
    readonly attribution: string;
    readonly costResponsibility: 'operator';
    getStyle(options?: OperationOptions): Promise<MapStyle>;
}
```

## createMapController

```ts
/** Validated, portable controller. Destroy cancels pending work and detaches event subscriptions. */
export declare function createMapController(port: MapPort, scheduler: Scheduler): MapController;
```

## normalizeError

```ts
/** No raw provider exception, URL, token or response body is copied into a public error. */
export declare function normalizeError(error: unknown): KitError;
```

## LocationErrorCode

```ts
export type LocationErrorCode = Extract<KitErrorCode, 'PERMISSION_DENIED' | 'UNAVAILABLE' | 'ABORTED' | 'TIMEOUT'>;
```

## LocationError

```ts
export declare class LocationError extends KitError {
    readonly code: LocationErrorCode;
    constructor(code: LocationErrorCode);
}
```

## createCancellationSource

```ts
/** Cancellation is idempotent and isolates subscriber exceptions. */
export declare function createCancellationSource(): {
    readonly signal: CancellationSignal;
    cancel(): void;
};
```

## runOperation

```ts
/** Default deadline 10s. Cancellation stops waiting and signals the adapter; never implies rollback. */
export declare function runOperation<T>(operation: (context: OperationContext) => T | Promise<T>, options: OperationOptions | undefined, scheduler: Scheduler): Promise<T>;
```

## PoiCategory

```ts
/** Stable categories; a trail POI is not a routing graph. */
export type PoiCategory = 'park' | 'tourism' | 'parking' | 'toilet' | 'pet_facility' | 'trail' | 'other';
```

## PublicPlace

```ts
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
```

## PlaceQueryOptions

```ts
export interface PlaceQueryOptions {
    /** 1..100; default 20. No implicit pagination/download of the entire DB. */
    readonly limit?: number;
}
```

## NearbyPlacesQuery

```ts
export interface NearbyPlacesQuery extends PlaceQueryOptions {
    readonly center: Coordinate;
    /** Positive meters, at most 50,000. */
    readonly radiusMeters: number;
    readonly category?: PoiCategory;
}
```

## BoundsPlacesQuery

```ts
export interface BoundsPlacesQuery extends PlaceQueryOptions {
    readonly bounds: MapBounds;
    readonly category?: PoiCategory;
}
```

## CategoryPlacesQuery

```ts
export interface CategoryPlacesQuery extends PlaceQueryOptions {
    readonly category: PoiCategory;
}
```

## PlacesQuery

```ts
export type PlacesQuery = ({
    readonly kind: 'nearby';
} & NearbyPlacesQuery) | ({
    readonly kind: 'bounds';
} & BoundsPlacesQuery) | ({
    readonly kind: 'category';
} & CategoryPlacesQuery);
```

## PlacesProvider

```ts
/** Implement this interface for any operator-owned DB/service. No storage vendor dependency. */
export interface PlacesProvider {
    query(query: PlacesQuery, context: OperationContext): Promise<readonly PublicPlace[]>;
}
```

## PlacesClient

```ts
export interface PlacesClient {
    getNearbyPlaces(query: NearbyPlacesQuery, options?: OperationOptions): Promise<readonly PublicPlace[]>;
    getPlacesInBounds(query: BoundsPlacesQuery, options?: OperationOptions): Promise<readonly PublicPlace[]>;
    getPlacesByCategory(query: CategoryPlacesQuery, options?: OperationOptions): Promise<readonly PublicPlace[]>;
}
```

## validatePoiCategory

```ts
export declare function validatePoiCategory(value: unknown): PoiCategory;
```

## validatePlacesQuery

```ts
/** Validate before invoking a provider; returns a detached query. */
export declare function validatePlacesQuery(query: PlacesQuery): PlacesQuery;
```

## validatePublicPlace

```ts
export declare function validatePublicPlace(value: unknown): PublicPlace;
```

## publicPlaceToPlace

```ts
/** Explicit conversion to the original display/search Place model. Unlocated records cannot be markers. */
export declare function publicPlaceToPlace(value: PublicPlace): Place;
```

## createPlacesClient

```ts
export declare function createPlacesClient(provider: PlacesProvider, scheduler: Scheduler): PlacesClient;
```

## KoreanSearchQuery

```ts
export interface KoreanSearchQuery extends SearchQuery {
    readonly bounds?: MapBounds;
    readonly center?: Coordinate;
    readonly radiusMeters?: number;
    readonly category?: PoiCategory;
    /** Offset 0..1000. Stable ordering on an unchanged DB, not a snapshot across updates. */
    readonly offset?: number;
    readonly sort?: 'relevance' | 'distance';
}
```

## SearchHit

```ts
export interface SearchHit {
    readonly place: PublicPlace;
    readonly distanceMeters: number | null;
    readonly relevance: number;
}
```

## SearchPage

```ts
export interface SearchPage {
    readonly hits: readonly SearchHit[];
    readonly nextOffset: number | null;
}
```

## ReversePoiQuery

```ts
export interface ReversePoiQuery {
    readonly center: Coordinate;
    readonly radiusMeters?: number;
    readonly category?: PoiCategory;
}
```

## ReversePoiResult

```ts
/** Nearby facility address, never a parcel/road-address determination at the input coordinate. */
export interface ReversePoiResult {
    readonly kind: 'nearby-poi';
    readonly place: PublicPlace;
    readonly distanceMeters: number;
}
```

## SearchRequest

```ts
export type SearchRequest = {
    readonly kind: 'search' | 'autocomplete';
    readonly query: KoreanSearchQuery;
} | {
    readonly kind: 'reverse';
    readonly query: ReversePoiQuery;
};
```

## SearchPort

```ts
export interface SearchPort {
    request(request: SearchRequest, context: OperationContext): Promise<unknown>;
}
```

## KoreanSearchProvider

```ts
export interface KoreanSearchProvider extends SearchProvider {
    search(query: KoreanSearchQuery, options?: OperationOptions): ReturnType<SearchProvider['search']>;
    searchPage(query: KoreanSearchQuery, options?: OperationOptions): Promise<SearchPage>;
    autocomplete(query: KoreanSearchQuery, options?: OperationOptions): Promise<SearchPage>;
    reverseNearby(query: ReversePoiQuery, options?: OperationOptions): Promise<ReversePoiResult | null>;
}
```

## normalizeSearchText

```ts
/** NFC; remove ASCII whitespace, NBSP and ideographic space; ASCII case folding only. */
export declare function normalizeSearchText(value: string): string;
```

## validateKoreanSearchQuery

```ts
export declare function validateKoreanSearchQuery(value: KoreanSearchQuery): KoreanSearchQuery;
```

## validateReversePoiQuery

```ts
export declare function validateReversePoiQuery(q: ReversePoiQuery): ReversePoiQuery;
```

## createKoreanSearchProvider

```ts
export declare function createKoreanSearchProvider(port: SearchPort, scheduler: Scheduler): KoreanSearchProvider;
```

## focusSearchHit

```ts
/** Map selection helper; null-location results cannot move the camera. */
export declare function focusSearchHit(map: MapController, hit: SearchHit, options?: OperationOptions): Promise<void>;
```

## copyJson

```ts
/** Copies JSON with finite numbers, bounded depth, no prototype keys, cycles or executable values. */
export declare function copyJson(value: unknown, depth?: number): JsonValue;
```

## defineMapStyle

```ts
/** Validates the portable envelope; the renderer validates the full MapLibre Style Spec. */
export declare function defineMapStyle(document: unknown, attribution: string): MapStyle;
```

## defineMapLayer

```ts
export declare function defineMapLayer(definition: unknown): MapLayer;
```

## validateBounds

```ts
/** Bounds use normalized longitudes. Dateline crossing is represented by west > east. */
export declare function validateBounds(bounds: MapBounds): MapBounds;
```

## normalizeVisibleBounds

```ts
/** Convert renderer world copies to normalized bounds; spans >=360 become the entire world. */
export declare function normalizeVisibleBounds(west: number, south: number, east: number, north: number): MapBounds;
```

## assertMapId

```ts
export declare function assertMapId(id: string): void;
```

## validateZoom

```ts
export declare function validateZoom(zoom: number): number;
```

## validateCamera

```ts
export declare function validateCamera(camera: CameraState): CameraState;
```

## validateMarkers

```ts
export declare function validateMarkers(markers: readonly MapMarker[]): readonly MapMarker[];
```

## validateGeoJSON

```ts
/** Deep copy before validation prevents caller mutation from reaching a renderer or delayed bridge. */
export declare function validateGeoJSON(input: MapFeatureCollection): MapFeatureCollection;
```

## routeToGeoJSON

```ts
export declare function routeToGeoJSON(route: MapRoute): MapFeatureCollection;
```
