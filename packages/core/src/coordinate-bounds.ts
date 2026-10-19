import { assertMercatorCoordinate, KitError } from './base.js';
import type { Coordinate, MapBounds } from './contracts.js';

/** Smallest longitude arc containing all points; west > east crosses the date line.
 * Empty input fails. A single point returns a degenerate bounds (use setCenter/setZoom if desired).
 * Does not mutate input. O(n log n), at most 10,000 points.
 */
export function boundsFromCoordinates(points: readonly Coordinate[]): MapBounds {
  if (!Array.isArray(points) || !points.length || points.length > 10000)
    throw new KitError('INVALID_ARGUMENT', 'BOUNDS_COORDINATES_REQUIRED');
  const longitudes: number[] = [];
  let south = Infinity,
    north = -Infinity;
  for (const point of points) {
    assertMercatorCoordinate(point);
    longitudes.push(point[0] === 180 ? -180 : point[0]);
    south = Math.min(south, point[1]);
    north = Math.max(north, point[1]);
  }
  longitudes.sort((a, b) => a - b);
  let gap = -1,
    after = 0;
  for (let i = 0; i < longitudes.length; i++) {
    const next = (i + 1) % longitudes.length;
    const distance = longitudes[next]! + (next === 0 ? 360 : 0) - longitudes[i]!;
    if (distance > gap) {
      gap = distance;
      after = next;
    }
  }
  return {
    west: longitudes[after]!,
    east: longitudes[(after + longitudes.length - 1) % longitudes.length]!,
    south,
    north,
  };
}
