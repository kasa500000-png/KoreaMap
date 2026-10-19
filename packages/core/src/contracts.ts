import type {
  CameraState,
  LngLat,
  MapFeatureCollection,
  MapGeometry,
  MapMarker,
  Place,
  SearchQuery,
} from './base.js';
import type { KitError } from './base.js';

/** WGS84 decimal degrees, always [longitude, latitude]; altitude is outside this MVP. */
export type Coordinate = LngLat;
/** Zoom 0..22, bearing -360..360 degrees, pitch 0..60 degrees. */
export type MapCamera = CameraState;
/** SW and NE corners; west > east means crossing the antimeridian. */
export interface MapBounds {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
}
/** MVP GeoJSON subset: Point, LineString, Polygon; scalar properties and string IDs. */
export type Feature = MapFeatureCollection['features'][number];
export type FeatureCollection = MapFeatureCollection;
export type Geometry = MapGeometry;
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
/** Portable Style Spec JSON. Engine validation and resource policy are adapter responsibilities. */
export interface MapStyle {
  readonly document: JsonObject;
  readonly attribution: string;
}
/** Portable JSON layer, excluding Web-only custom WebGL callbacks. Use defineMapLayer(). */
export interface MapLayer {
  readonly id: string;
  readonly type:
    | 'background'
    | 'fill'
    | 'line'
    | 'symbol'
    | 'circle'
    | 'heatmap'
    | 'fill-extrusion'
    | 'raster'
    | 'hillshade';
  readonly definition: JsonObject;
}
/** A route to display, not an implicit routing-service request. Distances in meters, duration in seconds. */
export interface MapRoute {
  readonly id: string;
  readonly coordinates: readonly Coordinate[];
  readonly distanceMeters?: number;
  readonly durationSeconds?: number;
}
/** Events carry shared data only, never a DOM/native engine event. */
export type MapEvent =
  | { readonly type: 'ready' | 'idle' | 'destroyed' }
  | { readonly type: 'camera'; readonly camera: MapCamera }
  | { readonly type: 'click'; readonly coordinate: Coordinate }
  | { readonly type: 'select'; readonly marker: MapMarker | null }
  | { readonly type: 'error'; readonly error: KitError; readonly fatal: boolean };
/** Portable cancellation; use createCancellationSource(), with no DOM type dependency. */
export interface CancellationSignal {
  readonly aborted: boolean;
  subscribe(listener: () => void): () => void;
}
export interface OperationOptions {
  readonly signal?: CancellationSignal;
  readonly timeoutMs?: number;
}
export interface OperationContext {
  readonly signal: CancellationSignal;
}
/** Inject platform timers; schedule returns an idempotent cancel function. */
export interface Scheduler {
  schedule(callback: () => void, delayMs: number): () => void;
}
/** Uniform CSS pixel / native logical-point padding. Zero-duration camera commands. */
export interface FitBoundsOptions {
  readonly padding?: number;
}
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
/** Adapter commands. addMarker/addGeoJSON replace matching IDs; removing absent IDs is a no-op. */
export type MapCommand =
  | { type: 'center'; center: Coordinate }
  | { type: 'zoom'; zoom: number }
  | { type: 'camera'; camera: MapCamera }
  | { type: 'bounds'; bounds: MapBounds; padding: number }
  | { type: 'style'; style: MapStyle }
  | { type: 'marker'; marker: MapMarker }
  | { type: 'remove-marker'; id: string }
  | { type: 'geojson'; id: string; data: FeatureCollection }
  | { type: 'remove-geojson'; id: string };
/** Internal integration seam is exported for custom adapters and dependency-free contract tests. */
export interface MapPort {
  execute(command: MapCommand, context: OperationContext): void | Promise<void>;
  getVisibleBounds(context: OperationContext): MapBounds | Promise<MapBounds>;
  subscribe(listener: (event: MapEvent) => void): () => void;
  destroy(): void;
}
export interface GeocodingProvider {
  geocode(query: SearchQuery, options?: OperationOptions): Promise<readonly Place[]>;
  reverse(coordinate: Coordinate, options?: OperationOptions): Promise<readonly Place[]>;
}
export interface RoutingRequest {
  readonly waypoints: readonly Coordinate[];
  readonly mode: 'walking' | 'cycling' | 'driving';
}
export interface RoutingProvider {
  route(request: RoutingRequest, options?: OperationOptions): Promise<readonly MapRoute[]>;
}
export interface LocationFix {
  readonly coordinate: Coordinate;
  readonly accuracyMeters: number;
  readonly timestampMs: number;
}
/** No permission prompt on import. Platform adapters implement permission UX at explicit invocation. */
export interface LocationProvider {
  getCurrentPosition(options?: OperationOptions): Promise<LocationFix>;
}
/** Storage implementation and authorization belong to the operator. */
export interface PlaceRepository {
  get(id: string, options?: OperationOptions): Promise<Place | null>;
  put(place: Place, options?: OperationOptions): Promise<void>;
  remove(id: string, options?: OperationOptions): Promise<void>;
}
/** Provider supplies a complete explicit style; no SDK endpoint or automatic fallback. */
export interface TileProvider {
  readonly id: string;
  readonly attribution: string;
  readonly costResponsibility: 'operator';
  getStyle(options?: OperationOptions): Promise<MapStyle>;
}
