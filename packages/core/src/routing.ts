import { assertLngLat, KitError } from './base.js';
import type {
  Coordinate,
  FeatureCollection,
  MapRoute,
  OperationContext,
  OperationOptions,
  RoutingProvider,
  RoutingRequest,
  Scheduler,
} from './contracts.js';
import { runOperation } from './operations.js';
import { distanceMeters } from './tracks.js';

export interface RoutingDataset {
  readonly id: string;
  readonly version: string;
  readonly source: 'osm-geofabrik-kr' | 'synthetic-routing-v1';
  readonly attribution: string;
  readonly license: 'ODbL-1.0' | 'MIT';
}
/** A road-network result. Estimated duration has no live traffic/safety guarantee. */
export interface RoadRoute extends MapRoute {
  readonly kind: 'road-route';
  readonly mode: RoutingRequest['mode'];
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  /** Matched coordinates in requested order. Never draw input-to-match connectors as roads. */
  readonly matchedWaypoints: readonly Coordinate[];
  readonly dataset: RoutingDataset;
}
export interface RoadRoutingProvider extends RoutingProvider {
  route(request: RoutingRequest, options?: OperationOptions): Promise<readonly RoadRoute[]>;
}
export interface RoutingPort {
  request(request: RoutingRequest, context: OperationContext): Promise<unknown>;
}
export function validateRoutingRequest(value: RoutingRequest): RoutingRequest {
  if (
    !value ||
    !['walking', 'cycling', 'driving'].includes(value.mode) ||
    !Array.isArray(value.waypoints) ||
    value.waypoints.length < 2 ||
    value.waypoints.length > 10
  )
    throw new KitError('INVALID_ARGUMENT', 'INVALID_ROUTING_REQUEST');
  const waypoints = Array.from(value.waypoints, (p) => {
    assertLngLat(p);
    return [...p] as Coordinate;
  });
  for (let i = 1; i < waypoints.length; i++) {
    if (distanceMeters(waypoints[i - 1]!, waypoints[i]!) < 1)
      throw new KitError('INVALID_ARGUMENT', 'DUPLICATE_ROUTING_WAYPOINT');
  }
  return { mode: value.mode, waypoints };
}
export function validateRoutingDataset(value: RoutingDataset): RoutingDataset {
  if (
    !value ||
    typeof value.id !== 'string' ||
    !/^[a-z0-9-]{1,64}$/.test(value.id) ||
    typeof value.version !== 'string' ||
    !/^[a-zA-Z0-9._-]{1,80}$/.test(value.version) ||
    typeof value.attribution !== 'string' ||
    value.attribution.length < 1 ||
    value.attribution.length > 400 ||
    /[<>]/u.test(value.attribution) ||
    [...value.attribution].some((c) => c.charCodeAt(0) < 32) ||
    !(
      (value.source === 'osm-geofabrik-kr' &&
        value.license === 'ODbL-1.0' &&
        value.attribution.includes('OpenStreetMap')) ||
      (value.source === 'synthetic-routing-v1' && value.license === 'MIT')
    )
  )
    throw new KitError('INVALID_ARGUMENT', 'INVALID_ROUTING_DATASET');
  return {
    id: value.id,
    version: value.version,
    source: value.source,
    license: value.license,
    attribution: value.attribution,
  };
}
export function validateRoadRoute(
  raw: unknown,
  request: RoutingRequest,
  maxSnapMeters = 50,
): RoadRoute {
  try {
    const route = raw as RoadRoute;
    if (
      !route ||
      route.kind !== 'road-route' ||
      !['walking', 'cycling', 'driving'].includes(route.mode) ||
      route.mode !== request.mode ||
      typeof route.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(route.id) ||
      !Number.isFinite(route.distanceMeters) ||
      route.distanceMeters <= 0 ||
      !Number.isFinite(route.durationSeconds) ||
      route.durationSeconds <= 0 ||
      !Array.isArray(route.coordinates) ||
      route.coordinates.length < 2 ||
      route.coordinates.length > 100000 ||
      !Array.isArray(route.matchedWaypoints) ||
      route.matchedWaypoints.length !== request.waypoints.length ||
      !Number.isFinite(maxSnapMeters) ||
      maxSnapMeters < 1 ||
      maxSnapMeters > 100
    )
      throw new Error();
    const copy = (p: Coordinate) => {
      assertLngLat(p);
      return [...p] as Coordinate;
    };
    const coordinates = Array.from(route.coordinates, copy);
    const matchedWaypoints = Array.from(route.matchedWaypoints, copy);
    for (let i = 0; i < matchedWaypoints.length; i++) {
      if (distanceMeters(matchedWaypoints[i]!, request.waypoints[i]!) > maxSnapMeters)
        throw new KitError('NOT_FOUND', 'ROUTING_SNAP_TOO_FAR');
    }
    // Every stop must occur on the ordered geometry, including endpoints.
    let cursor = 0;
    for (const stop of matchedWaypoints) {
      while (cursor < coordinates.length && distanceMeters(stop, coordinates[cursor]!) > 2)
        cursor++;
      if (cursor === coordinates.length) throw new Error();
    }
    if (
      distanceMeters(coordinates[0]!, matchedWaypoints[0]!) > 2 ||
      distanceMeters(coordinates.at(-1)!, matchedWaypoints.at(-1)!) > 2
    )
      throw new Error();
    return {
      id: route.id,
      kind: 'road-route',
      mode: route.mode,
      coordinates,
      matchedWaypoints,
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      dataset: validateRoutingDataset(route.dataset),
    };
  } catch (error) {
    if (error instanceof KitError && error.detail === 'ROUTING_SNAP_TOO_FAR') throw error;
    throw new KitError('UNAVAILABLE', 'INVALID_ROUTING_RESPONSE');
  }
}
/** Transport is explicitly injected; core never discovers an endpoint or sends a request itself. */
export function createRoadRoutingProvider(
  port: RoutingPort,
  scheduler: Scheduler,
  maxSnapMeters = 50,
): RoadRoutingProvider {
  if (
    !port ||
    typeof port.request !== 'function' ||
    !Number.isFinite(maxSnapMeters) ||
    maxSnapMeters < 1 ||
    maxSnapMeters > 100
  )
    throw new KitError('INVALID_ARGUMENT', 'INVALID_ROUTING_CONFIGURATION');
  return {
    route: (input, options) =>
      runOperation(
        async (context) => {
          const request = validateRoutingRequest(input);
          const result = await port.request(request, context);
          if (!Array.isArray(result) || result.length !== 1)
            throw new KitError('UNAVAILABLE', 'INVALID_ROUTING_RESPONSE');
          return [validateRoadRoute(result[0], request, maxSnapMeters)];
        },
        options,
        scheduler,
      ),
  };
}
export function roadRouteToGeoJSON(route: RoadRoute): FeatureCollection {
  const validated = validateRoadRoute(route, {
    mode: route.mode,
    waypoints: route.matchedWaypoints,
  });
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          id: validated.id,
          mode: validated.mode,
          distanceMeters: validated.distanceMeters,
          durationSeconds: validated.durationSeconds,
          attribution: validated.dataset.attribution,
          source: validated.dataset.source,
          license: validated.dataset.license,
          datasetId: validated.dataset.id,
          datasetVersion: validated.dataset.version,
        },
        geometry: { type: 'LineString', coordinates: validated.coordinates.map((p) => [...p]) },
      },
    ],
  };
}
