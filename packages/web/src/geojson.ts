import { assertMercatorCoordinate, KitError, type MapFeatureCollection } from '@korea-map-kit/core';
/** The current shared contract deliberately accepts Point/LineString/Polygon only. */
export function validateGeoJSON(data: MapFeatureCollection): MapFeatureCollection {
  const fail = () => {
    throw new KitError('INVALID_ARGUMENT', 'INVALID_GEOJSON');
  };
  if (
    data?.type !== 'FeatureCollection' ||
    !Array.isArray(data.features) ||
    data.features.length > 10000
  )
    fail();
  for (const feature of data.features) {
    if (
      feature.type !== 'Feature' ||
      !feature.geometry ||
      !feature.properties ||
      (feature.id !== undefined && typeof feature.id !== 'string')
    )
      fail();
    for (const value of Object.values(feature.properties)) {
      if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) fail();
      if (typeof value === 'number' && !Number.isFinite(value)) fail();
    }
    const geometry = feature.geometry;
    if (geometry.type === 'Point') assertMercatorCoordinate(geometry.coordinates);
    else if (geometry.type === 'LineString') {
      if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) fail();
      geometry.coordinates.forEach(assertMercatorCoordinate);
    } else if (geometry.type === 'Polygon') {
      if (!Array.isArray(geometry.coordinates) || !geometry.coordinates.length) fail();
      for (const ring of geometry.coordinates) {
        if (!Array.isArray(ring) || ring.length < 4) fail();
        ring.forEach(assertMercatorCoordinate);
        if (JSON.stringify(ring[0]) !== JSON.stringify(ring.at(-1))) fail();
      }
    } else fail();
  }
  return structuredClone(data);
}
