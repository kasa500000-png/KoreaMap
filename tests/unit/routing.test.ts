import { describe, it, expect, vi } from 'vitest';
import {
  createCancellationSource,
  createRoadRoutingProvider,
  roadRouteToGeoJSON,
  validateRoutingRequest,
  validateRoadRoute,
  type RoadRoute,
  type RoutingRequest,
  type Scheduler,
} from 'korea-map-core';
import { createValhallaRoutingProvider, type ValhallaTransport } from 'korea-map-data-adapters';
const scheduler: Scheduler = {
  schedule(f, ms) {
    const t = setTimeout(f, ms);
    return () => clearTimeout(t);
  },
};
const request: RoutingRequest = {
  mode: 'driving',
  waypoints: [
    [127, 37.5],
    [127.004, 37.502],
  ],
};
const dataset = {
  id: 'test',
  version: '1',
  source: 'synthetic-routing-v1',
  license: 'MIT',
  attribution: 'Korea Map Kit synthetic roads',
} as const;
const road: RoadRoute = {
  id: 'route',
  kind: 'road-route',
  mode: 'driving',
  coordinates: [
    [127, 37.5],
    [127, 37.502],
    [127.004, 37.502],
  ],
  matchedWaypoints: request.waypoints,
  distanceMeters: 576,
  durationSeconds: 74.515,
  dataset,
};
const response = () => ({
  code: 'Ok',
  waypoints: request.waypoints.map((location) => ({ location })),
  routes: [
    {
      geometry: { type: 'LineString', coordinates: road.coordinates },
      legs: [{}],
      distance: 576,
      duration: 74.515,
    },
  ],
});
describe('optional road routing', () => {
  it('maps all modes, longitude first, bounded snapping, breaks and GeoJSON meters/seconds', async () => {
    for (const [mode, costing] of [
      ['driving', 'auto'],
      ['walking', 'pedestrian'],
      ['cycling', 'bicycle'],
    ] as const) {
      const transport = vi.fn<ValhallaTransport>(async () => response());
      const provider = createValhallaRoutingProvider({ request: transport, scheduler, dataset });
      const routes = await provider.route({ ...request, mode });
      expect(transport.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          costing,
          format: 'osrm',
          shape_format: 'geojson',
          locations: expect.arrayContaining([
            expect.objectContaining({ lon: 127, lat: 37.5, type: 'break', search_cutoff: 50 }),
          ]),
        }),
      );
      expect(routes[0]?.distanceMeters).toBe(576);
      expect(routes[0]?.durationSeconds).toBe(74.515);
      expect(roadRouteToGeoJSON(routes[0]!).features[0]?.properties?.source).toBe(dataset.source);
    }
  });
  it('rejects unsupported modes, sparse/duplicate/out-of-range points and excessive stops before transport', async () => {
    const port = { request: vi.fn() };
    const provider = createRoadRoutingProvider(port, scheduler);
    for (const bad of [
      null,
      { ...request, mode: 'flying' },
      { ...request, waypoints: new Array(3) },
      {
        ...request,
        waypoints: [
          [127, 37],
          [127, 37],
        ],
      },
      {
        ...request,
        waypoints: [
          [181, 37],
          [127, 37],
        ],
      },
      { ...request, waypoints: Array(11).fill([127, 37]) },
    ])
      await expect(provider.route(bad as RoutingRequest)).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    expect(port.request).not.toHaveBeenCalled();
    expect(validateRoutingRequest(request)).not.toBe(request);
  });
  it('never invents a road for disconnected, unmatched or unavailable engine results', async () => {
    for (const raw of [
      { code: 'NoRoute' },
      { code: 'NoSegment' },
      { error_code: 170 },
      { error_code: 171 },
      { error_code: 442 },
    ]) {
      const provider = createValhallaRoutingProvider({
        request: async () => raw,
        dataset,
        scheduler,
      });
      await expect(provider.route(request)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        detail: 'ROUTE_NOT_FOUND',
      });
    }
    await expect(
      createValhallaRoutingProvider({
        request: async () => {
          throw new Error('private');
        },
        dataset,
        scheduler,
      }).route(request),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE', detail: 'OPERATION_FAILED' });
  });
  it('rejects malformed, empty, wrong-unit geometry, missing legs/stops and nonfinite summaries', async () => {
    for (const raw of [
      null,
      {},
      { code: 'Ok', routes: [], waypoints: [] },
      { ...response(), routes: [{ ...response().routes[0], duration: NaN }] },
      {
        ...response(),
        routes: [{ ...response().routes[0], geometry: { type: 'Point', coordinates: [127, 37] } }],
      },
      { ...response(), routes: [{ ...response().routes[0], legs: [] }] },
    ]) {
      await expect(
        createValhallaRoutingProvider({ request: async () => raw, dataset, scheduler }).route(
          request,
        ),
      ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    }
    expect(() =>
      validateRoadRoute(
        {
          ...road,
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        },
        request,
      ),
    ).toThrow();
    expect(() =>
      validateRoadRoute(
        { ...road, matchedWaypoints: [[127.1, 37.5], request.waypoints[1]] },
        request,
      ),
    ).toThrow(expect.objectContaining({ detail: 'ROUTING_SNAP_TOO_FAR' }));
    expect(() =>
      validateRoadRoute({ ...road, matchedWaypoints: [...request.waypoints].reverse() }, request),
    ).toThrow();
  });
  it('pre-cancel makes no request; active cancellation/timeouts notify transport and clear listeners', async () => {
    const source = createCancellationSource();
    source.cancel();
    const transport = vi.fn();
    await expect(
      createRoadRoutingProvider({ request: transport }, scheduler).route(request, {
        signal: source.signal,
      }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
    expect(transport).not.toHaveBeenCalled();
    let aborts = 0;
    const provider = createRoadRoutingProvider(
      {
        request: (_, context) =>
          new Promise(() => {
            context.signal.subscribe(() => aborts++);
          }),
      },
      scheduler,
    );
    const running = createCancellationSource();
    const promise = provider.route(request, { signal: running.signal });
    running.cancel();
    await expect(promise).rejects.toMatchObject({ code: 'ABORTED' });
    await expect(provider.route(request, { timeoutMs: 5 })).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
    expect(aborts).toBe(2);
  });
  it('requires licensed provenance and never lets consumer mutations alter returned data', () => {
    expect(() =>
      createValhallaRoutingProvider({
        request: async () => response(),
        scheduler,
        dataset: { ...dataset, source: 'osm-geofabrik-kr' },
      }),
    ).toThrow();
    const cloned = validateRoadRoute(road, request);
    expect(cloned.coordinates).not.toBe(road.coordinates);
    expect(cloned.dataset).not.toBe(road.dataset);
    expect(() => validateRoadRoute({ ...road, id: 1 }, request)).toThrow();
    expect(() =>
      validateRoadRoute({ ...road, dataset: { ...dataset, version: 1 } }, request),
    ).toThrow();
    expect(roadRouteToGeoJSON(cloned).features[0]?.properties?.license).toBe('MIT');
  });
  it('distinguishes configured engine distance limits from unreachable roads', async () => {
    const provider = createValhallaRoutingProvider({
      request: async () => ({ code: 'DistanceExceeded', message: 'untrusted engine text' }),
      dataset,
      scheduler,
    });
    await expect(provider.route(request)).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
      detail: 'ROUTING_DISTANCE_LIMIT',
    });
  });
});
