import {
  createRoadRoutingProvider,
  KitError,
  validateRoutingDataset,
  type Coordinate,
  type OperationContext,
  type RoutingDataset,
  type RoutingRequest,
  type Scheduler,
} from '@korea-map-kit/core';

export interface ValhallaRequest {
  readonly locations: readonly {
    lon: number;
    lat: number;
    type: 'break';
    radius: number;
    search_cutoff: number;
    minimum_reachability: number;
  }[];
  readonly costing: 'auto' | 'pedestrian' | 'bicycle';
  readonly format: 'osrm';
  readonly shape_format: 'geojson';
  readonly directions_type: 'none';
  readonly alternates: 0;
}
export type ValhallaTransport = (
  body: ValhallaRequest,
  context: OperationContext,
) => Promise<unknown>;
/** Valhalla 3.9.1 OSRM-compatible output uses meters/seconds and GeoJSON [lon,lat]. */
export function createValhallaRoutingProvider(options: {
  readonly request: ValhallaTransport;
  readonly scheduler: Scheduler;
  readonly dataset: RoutingDataset;
  readonly maxSnapMeters?: number;
}) {
  const dataset = validateRoutingDataset(options.dataset);
  const limit = options.maxSnapMeters ?? 50;
  if (typeof options.request !== 'function' || !Number.isFinite(limit) || limit < 1 || limit > 100)
    throw new KitError('INVALID_ARGUMENT', 'INVALID_ROUTING_CONFIGURATION');
  const costing = { driving: 'auto', walking: 'pedestrian', cycling: 'bicycle' } as const;
  return createRoadRoutingProvider(
    {
      async request(input: RoutingRequest, context) {
        const raw = await options.request(
          {
            locations: input.waypoints.map(([lon, lat]) => ({
              lon,
              lat,
              type: 'break',
              radius: limit,
              search_cutoff: limit,
              minimum_reachability: 0,
            })),
            costing: costing[input.mode],
            format: 'osrm',
            shape_format: 'geojson',
            directions_type: 'none',
            alternates: 0,
          },
          context,
        );
        const result = raw as {
          code?: unknown;
          error_code?: unknown;
          routes?: unknown;
          waypoints?: unknown;
        } | null;
        if (!result) throw new KitError('UNAVAILABLE', 'INVALID_ROUTING_RESPONSE');
        if (result.code === 'DistanceExceeded')
          throw new KitError('INVALID_ARGUMENT', 'ROUTING_DISTANCE_LIMIT');
        if (
          [170, 171, 441, 442].includes(Number(result.error_code)) ||
          ['NoRoute', 'NoSegment'].includes(String(result.code))
        )
          throw new KitError('NOT_FOUND', 'ROUTE_NOT_FOUND');
        if (
          result.code !== 'Ok' ||
          !Array.isArray(result.routes) ||
          result.routes.length !== 1 ||
          !Array.isArray(result.waypoints)
        )
          throw new KitError('UNAVAILABLE', 'INVALID_ROUTING_RESPONSE');
        const route = result.routes[0] as {
          geometry?: { type?: unknown; coordinates?: unknown };
          distance?: unknown;
          duration?: unknown;
          legs?: unknown;
        };
        if (
          !route ||
          route.geometry?.type !== 'LineString' ||
          !Array.isArray(route.legs) ||
          route.legs.length !== input.waypoints.length - 1
        )
          throw new KitError('UNAVAILABLE', 'INVALID_ROUTING_RESPONSE');
        return [
          {
            id: 'route',
            kind: 'road-route',
            mode: input.mode,
            coordinates: route.geometry.coordinates,
            distanceMeters: route.distance,
            durationSeconds: route.duration,
            matchedWaypoints: result.waypoints.map(
              (p: { location?: Coordinate } | null) => p?.location,
            ),
            dataset,
          },
        ];
      },
    },
    options.scheduler,
    limit,
  );
}
