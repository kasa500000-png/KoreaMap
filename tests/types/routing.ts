import {
  createRoadRoutingProvider,
  roadRouteToGeoJSON,
  type RoutingProvider,
  type RoutingPort,
  type Scheduler,
  type MapController,
  type RoutingRequest,
} from 'korea-map-core';
import { createValhallaRoutingProvider, type ValhallaTransport } from 'korea-map-data-adapters';
export async function sharedRoutingExample(
  map: MapController,
  port: RoutingPort,
  scheduler: Scheduler,
) {
  const provider = createRoadRoutingProvider(port, scheduler);
  const shared: RoutingProvider = provider;
  const [route] = await provider.route({
    mode: 'walking',
    waypoints: [
      [126.977, 37.5663],
      [126.9769, 37.573],
    ],
  });
  if (route) {
    await map.showRoute(route);
    roadRouteToGeoJSON(route);
  }
  return shared;
}
export function valhallaExample(request: ValhallaTransport, scheduler: Scheduler) {
  return createValhallaRoutingProvider({
    request,
    scheduler,
    dataset: {
      id: 'operator-region',
      version: '2026-10-18',
      source: 'osm-geofabrik-kr',
      license: 'ODbL-1.0',
      attribution: '© OpenStreetMap contributors · Geofabrik · ODbL 1.0',
    },
  });
}
// @ts-expect-error unsupported modes must not silently change to driving
const mode: RoutingRequest['mode'] = 'transit';
void mode;
