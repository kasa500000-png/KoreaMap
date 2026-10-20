import {
  createCancellationSource,
  defineMapStyle,
  type Coordinate,
  type MapCamera,
  type MapBounds,
  type MapMarker,
  type MapStyle,
  type MapLayer,
  type MapRoute,
  type Place,
  type Feature,
  type FeatureCollection,
  type MapEvent,
  type LocationError,
  type MapController,
  type SearchProvider,
  type GeocodingProvider,
  type RoutingProvider,
  type LocationProvider,
  type PlaceRepository,
  type TileProvider,
} from 'korea-map-core';
import type { MapHandle } from 'korea-map-web';
/** Compiled with strict/noEmit; this module is not executed. Negative cases must remain errors. */
export async function consumer(map: MapController, web: MapHandle) {
  const coordinate: Coordinate = [126.978, 37.5665];
  const camera: MapCamera = { center: coordinate, zoom: 14, bearing: 0, pitch: 0 };
  const bounds: MapBounds = { west: 126, south: 36, east: 128, north: 38 };
  const marker: MapMarker = { id: 'one', coordinate, label: '합성' };
  const route: MapRoute = { id: 'walk', coordinates: [coordinate, [127, 38]] };
  const feature: Feature = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates: [127, 37] },
  };
  const data: FeatureCollection = { type: 'FeatureCollection', features: [feature] };
  const style: MapStyle = defineMapStyle({ version: 8, sources: {}, layers: [] }, 'Own data · MIT');
  const source = createCancellationSource();
  await map.setCenter(coordinate);
  await map.setCamera(camera);
  await map.fitBounds(bounds);
  await map.setZoom(14, { signal: source.signal, timeoutMs: 1000 });
  await map.setStyle(style);
  await map.addMarker(marker);
  await map.removeMarker(marker.id);
  await map.addGeoJSON('data', data);
  await map.showRoute(route);
  const sameAPI: MapController = web.api;
  await sameAPI.getVisibleBounds();
  // @ts-expect-error Coordinates have exactly two numeric elements.
  await map.setCenter([127, 37, 20]);
  // @ts-expect-error Strings are not coordinates.
  await map.setCenter(['127', '37']);
  // @ts-expect-error A camera must include bearing and pitch.
  await map.setCamera({ center: coordinate, zoom: 14 });
  // @ts-expect-error Style URLs are not an implicit provider configuration.
  await map.setStyle('remote-style');
  // @ts-expect-error A DOM signal is not the portable cancellation interface.
  await map.setZoom(14, { signal: new AbortController().signal });
  const unsupported: Feature = {
    type: 'Feature',
    properties: {},
    // @ts-expect-error Arbitrary geometry types are outside the MVP subset.
    geometry: { type: 'MultiPoint', coordinates: [[127, 37]] },
  };
  void unsupported;
}
export function eventConsumer(event: MapEvent, error: LocationError, layer: MapLayer) {
  if (event.type === 'camera') return event.camera.center;
  // @ts-expect-error A discriminated event must be narrowed before reading camera.
  void event.camera;
  return [error.code, layer.id];
}
export const providers: {
  search: SearchProvider;
  geocoding: GeocodingProvider;
  routing: RoutingProvider;
  location: LocationProvider;
  places: PlaceRepository;
  tiles: TileProvider;
} = {
  search: { capabilities: { autocomplete: false, reverse: false }, search: async () => [] },
  geocoding: { geocode: async () => [], reverse: async () => [] },
  routing: { route: async () => [] },
  location: {
    getCurrentPosition: async () => ({ coordinate: [127, 37], accuracyMeters: 5, timestampMs: 0 }),
  },
  places: {
    get: async () => null,
    put: async (_place: Place) => {
      void _place;
    },
    remove: async () => {},
  },
  tiles: {
    id: 'local',
    attribution: 'Own data',
    costResponsibility: 'operator',
    getStyle: async () => defineMapStyle({ version: 8, sources: {}, layers: [] }, 'Own data'),
  },
};
