import {
  createPlacesClient,
  type PublicPlace,
  type PlacesProvider,
  type Scheduler,
} from '@korea-map-kit/core';
export function portablePlaces(provider: PlacesProvider, scheduler: Scheduler, place: PublicPlace) {
  const client = createPlacesClient(provider, scheduler);
  void client.getNearbyPlaces({ center: [127, 37], radiusMeters: 500 });
  void client.getPlacesInBounds({ bounds: { west: 126, south: 36, east: 128, north: 38 } });
  void client.getPlacesByCategory({ category: 'pet_facility', limit: 10 });
  // @ts-expect-error A category must be one of the stable POI categories.
  void client.getPlacesByCategory({ category: 'arbitrary' });
  // @ts-expect-error Coordinates are [longitude, latitude], never {lat,lng}.
  void client.getNearbyPlaces({ center: { lat: 37, lng: 127 }, radiusMeters: 500 });
  // @ts-expect-error Provenance and source license are mandatory fields.
  const incomplete: PublicPlace = { id: 'one', name: 'name', category: 'park', location: null };
  void incomplete;
  // @ts-expect-error An unlocated record cannot be used as a Coordinate without narrowing.
  const coordinate: readonly [number, number] = place.location;
  return coordinate;
}
