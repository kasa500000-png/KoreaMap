import {
  assertMercatorCoordinate,
  KitError,
  type CameraState,
  type MapFeatureCollection,
  type MapMarker,
} from './base.js';
import type {
  JsonObject,
  JsonValue,
  MapBounds,
  MapLayer,
  MapRoute,
  MapStyle,
} from './contracts.js';
function invalid(detail: string): never {
  throw new KitError('INVALID_ARGUMENT', detail);
}
/** Copies JSON with finite numbers, bounded depth, no prototype keys, cycles or executable values. */
export function copyJson(value: unknown, depth = 0): JsonValue {
  if (depth > 40) return invalid('JSON_DEPTH');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return Array.from(value, (item: unknown) => copyJson(item, depth + 1));
  if (
    typeof value !== 'object' ||
    value === null ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    return invalid('INVALID_JSON');
  const result: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) return invalid('UNSAFE_JSON_KEY');
    result[key] = copyJson(item, depth + 1);
  }
  return result;
}
/** Validates the portable envelope; the renderer validates the full MapLibre Style Spec. */
export function defineMapStyle(document: unknown, attribution: string): MapStyle {
  const value = copyJson(document);
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value['version'] !== 8 ||
    !value['sources'] ||
    typeof value['sources'] !== 'object' ||
    Array.isArray(value['sources']) ||
    !Array.isArray(value['layers']) ||
    typeof attribution !== 'string' ||
    !attribution.trim()
  )
    return invalid('INVALID_STYLE');
  return { document: value, attribution };
}
export function defineMapLayer(definition: unknown): MapLayer {
  const value = copyJson(definition);
  const types = [
    'background',
    'fill',
    'line',
    'symbol',
    'circle',
    'heatmap',
    'fill-extrusion',
    'raster',
    'hillshade',
  ];
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    typeof value['id'] !== 'string' ||
    !types.includes(String(value['type']))
  )
    return invalid('INVALID_LAYER');
  assertMapId(value['id']);
  return { id: value['id'], type: value['type'] as MapLayer['type'], definition: value };
}
/** Bounds use normalized longitudes. Dateline crossing is represented by west > east. */
export function validateBounds(bounds: MapBounds): MapBounds {
  assertMercatorCoordinate([bounds?.west, bounds?.south]);
  assertMercatorCoordinate([bounds?.east, bounds?.north]);
  if (bounds.south > bounds.north) return invalid('INVALID_BOUNDS');
  return { west: bounds.west, south: bounds.south, east: bounds.east, north: bounds.north };
}
/** Convert renderer world copies to normalized bounds; spans >=360 become the entire world. */
export function normalizeVisibleBounds(
  west: number,
  south: number,
  east: number,
  north: number,
): MapBounds {
  if (![west, south, east, north].every(Number.isFinite) || south > north)
    return invalid('INVALID_BOUNDS');
  const wrap = (value: number) => ((((value + 180) % 360) + 360) % 360) - 180;
  return validateBounds({
    west: Math.abs(east - west) >= 360 ? -180 : wrap(west),
    east: Math.abs(east - west) >= 360 ? 180 : wrap(east),
    south: Math.max(-85.051129, south),
    north: Math.min(85.051129, north),
  });
}
export function assertMapId(id: string): void {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id) || id.startsWith('kmk-'))
    invalid('INVALID_ID');
}
export function validateZoom(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom < 0 || zoom > 22) return invalid('INVALID_CAMERA');
  return zoom;
}
export function validateCamera(camera: CameraState): CameraState {
  assertMercatorCoordinate(camera?.center);
  validateZoom(camera.zoom);
  if (
    !Number.isFinite(camera.bearing) ||
    Math.abs(camera.bearing) > 360 ||
    !Number.isFinite(camera.pitch) ||
    camera.pitch < 0 ||
    camera.pitch > 60
  )
    return invalid('INVALID_CAMERA');
  return Object.freeze({
    ...camera,
    center: Object.freeze([...camera.center] as [number, number]),
  });
}
export function validateMarkers(markers: readonly MapMarker[]): readonly MapMarker[] {
  if (!Array.isArray(markers) || markers.length > 10000) return invalid('MARKER_LIMIT');
  const ids = new Set<string>();
  return Object.freeze(
    Array.from(markers, (marker) => {
      assertMercatorCoordinate(marker?.coordinate);
      if (
        typeof marker.id !== 'string' ||
        !marker.id ||
        ids.has(marker.id) ||
        typeof marker.label !== 'string' ||
        !marker.label ||
        marker.label.length > 500 ||
        (marker.description !== undefined &&
          (typeof marker.description !== 'string' || marker.description.length > 5000))
      )
        return invalid('INVALID_MARKER');
      ids.add(marker.id);
      return Object.freeze({
        ...marker,
        coordinate: Object.freeze([...marker.coordinate] as [number, number]),
      });
    }),
  );
}
/** Deep copy before validation prevents caller mutation from reaching a renderer or delayed bridge. */
export function validateGeoJSON(input: MapFeatureCollection): MapFeatureCollection {
  const data = copyJson(input) as unknown as MapFeatureCollection;
  if (
    data?.type !== 'FeatureCollection' ||
    !Array.isArray(data.features) ||
    data.features.length > 10000
  )
    return invalid('INVALID_GEOJSON');
  for (const feature of data.features) {
    if (
      feature?.type !== 'Feature' ||
      !feature.geometry ||
      !feature.properties ||
      Array.isArray(feature.properties) ||
      typeof feature.properties !== 'object' ||
      (feature.id !== undefined && typeof feature.id !== 'string')
    )
      return invalid('INVALID_GEOJSON');
    for (const value of Object.values(feature.properties))
      if (value !== null && !['string', 'number', 'boolean'].includes(typeof value))
        return invalid('INVALID_GEOJSON');
    const geometry = feature.geometry;
    if (geometry.type === 'Point') assertMercatorCoordinate(geometry.coordinates);
    else if (geometry.type === 'LineString') {
      if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2)
        return invalid('INVALID_GEOJSON');
      geometry.coordinates.forEach(assertMercatorCoordinate);
    } else if (geometry.type === 'Polygon') {
      if (!Array.isArray(geometry.coordinates) || !geometry.coordinates.length)
        return invalid('INVALID_GEOJSON');
      for (const ring of geometry.coordinates) {
        if (!Array.isArray(ring) || ring.length < 4) return invalid('INVALID_GEOJSON');
        ring.forEach(assertMercatorCoordinate);
        if (JSON.stringify(ring[0]) !== JSON.stringify(ring.at(-1)))
          return invalid('INVALID_GEOJSON');
      }
    } else return invalid('INVALID_GEOJSON');
  }
  return data;
}
export function routeToGeoJSON(route: MapRoute): MapFeatureCollection {
  assertMapId(route?.id);
  for (const value of [route.distanceMeters, route.durationSeconds])
    if (value !== undefined && (!Number.isFinite(value) || value < 0))
      return invalid('INVALID_ROUTE');
  if (!Array.isArray(route.coordinates)) return invalid('INVALID_ROUTE');
  return validateGeoJSON({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: route.id,
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: route.coordinates.map((point) => [...point] as [number, number]),
        },
      },
    ],
  });
}
