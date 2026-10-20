import {
  KitError,
  type EdgeInsets,
  type MapMarker,
  type MapSelection,
  type ScreenPoint,
} from 'korea-map-core';

export interface NativeMarkerClustering {
  readonly radius?: number;
  readonly maxZoom?: number;
}
/** Native logical points; Android's bridge applies display density itself. */
export function nativeTouchRadius(platform: string): number {
  return platform === 'android' ? 24 : 22;
}
export function nativeClustering(input: boolean | NativeMarkerClustering = false) {
  if (input === false) return { enabled: false, radius: 48, maxZoom: 13 } as const;
  if (input !== true && (!input || typeof input !== 'object' || Array.isArray(input)))
    throw new KitError('INVALID_ARGUMENT', 'INVALID_CLUSTERING');
  const radius = input === true ? 48 : (input.radius ?? 48);
  const maxZoom = input === true ? 13 : (input.maxZoom ?? 13);
  if (
    !Number.isInteger(radius) ||
    radius < 1 ||
    radius > 128 ||
    !Number.isInteger(maxZoom) ||
    maxZoom < 0 ||
    maxZoom > 21
  )
    throw new KitError('INVALID_ARGUMENT', 'INVALID_CLUSTERING');
  return { enabled: true, radius, maxZoom } as const;
}
export function nativePickLayers(input: readonly string[] = []): readonly string[] {
  if (
    !Array.isArray(input) ||
    input.length > 8 ||
    new Set(input).size !== input.length ||
    input.some(
      (id) =>
        typeof id !== 'string' || !/^[A-Za-z0-9_:. -]{1,128}$/.test(id) || id.startsWith('kmk-'),
    )
  )
    throw new KitError('INVALID_ARGUMENT', 'INVALID_PICK_LAYERS');
  return [...input];
}
export function sameNativeMarkers(a: readonly MapMarker[], b: readonly MapMarker[]): boolean {
  return (
    a.length === b.length &&
    a.every((marker, i) => {
      const next = b[i];
      return (
        next !== undefined &&
        marker.id === next.id &&
        marker.label === next.label &&
        marker.description === next.description &&
        marker.coordinate[0] === next.coordinate[0] &&
        marker.coordinate[1] === next.coordinate[1]
      );
    })
  );
}
export function nativeMarkerSelection(marker: MapMarker): MapSelection {
  return {
    key: `marker:${marker.id}`,
    id: marker.id,
    kind: 'marker',
    coordinate: [...marker.coordinate],
    label: marker.label,
    sourceId: 'kmk-markers',
    layerId: 'kmk-marker-points',
    priority: 0,
  };
}
/** Layer metadata is supplied by the query, since Native returns plain GeoJSON. */
export function nativeFeatureSelection(
  feature: GeoJSON.Feature,
  sourceId: string,
  layerId: string,
  markers: ReadonlyMap<string, MapMarker>,
): MapSelection | null {
  if (feature.geometry?.type !== 'Point') return null;
  const [longitude, latitude] = feature.geometry.coordinates;
  if (
    typeof longitude !== 'number' ||
    typeof latitude !== 'number' ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    Math.abs(longitude) > 180 ||
    Math.abs(latitude) > 85.05112878
  )
    return null;
  const coordinate: [number, number] = [longitude, latitude];
  const props = feature.properties ?? {};
  if (sourceId === 'kmk-markers') {
    if (props['cluster'] === true || props['cluster'] === 1) {
      const id: unknown = props['cluster_id'];
      const count: unknown = props['point_count'];
      if (
        (typeof id !== 'number' && typeof id !== 'string') ||
        (typeof id === 'string' && (!id || id.length > 500)) ||
        typeof count !== 'number' ||
        !Number.isSafeInteger(count) ||
        count < 1 ||
        count > 10000000 ||
        (typeof id === 'number' && (!Number.isSafeInteger(id) || id < 0))
      )
        return null;
      return {
        key: `cluster:${id}`,
        id: String(id),
        kind: 'cluster',
        coordinate,
        label: `${count}개 장소`,
        sourceId,
        layerId,
        clusterId: id,
        count,
        priority: 1,
      };
    }
    const marker = typeof props['id'] === 'string' ? markers.get(props['id']) : undefined;
    return marker ? nativeMarkerSelection(marker) : null;
  }
  const label = (
    [props['name:ko'], props['name_ko'], props['name'], props['label']].find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    ) ?? ''
  ).slice(0, 500);
  const identity: unknown = props['fid'] ?? feature.id ?? props['id'] ?? props['osm_id'];
  const id =
    typeof identity === 'string' || typeof identity === 'number'
      ? String(identity).slice(0, 512)
      : `${longitude},${latitude}:${label}`.slice(0, 512);
  if (!id) return null;
  const key = `poi:${sourceId}:${layerId}:${id}`;
  if (key.length > 512 || sourceId.length > 512 || layerId.length > 512) return null;
  return {
    key,
    id,
    kind: 'poi',
    coordinate,
    label: label || id.slice(0, 500),
    sourceId,
    layerId,
    priority: 2,
  };
}

/** A newer tap, list choice, close or data generation makes all older query results inert. */
export function createNativePickRequests() {
  let epoch = 0;
  return {
    begin: () => ++epoch,
    isCurrent: (token: number) => token === epoch,
    cancel: () => {
      epoch++;
    },
  };
}

/** Query/projection ports make the logical hit radius testable without a native runtime. */
export async function pickNativeRenderedFeatures(options: {
  readonly point: ScreenPoint;
  readonly radius: number;
  readonly layers: readonly { readonly id: string; readonly source: string }[];
  readonly markers: ReadonlyMap<string, MapMarker>;
  readonly query: (
    bounds: [[number, number], [number, number]],
    layerId: string,
  ) => Promise<readonly GeoJSON.Feature[]>;
  readonly project: (coordinate: [number, number]) => Promise<readonly [number, number]>;
  readonly isCurrent: () => boolean;
}): Promise<readonly MapSelection[]> {
  function requireCurrent() {
    if (!options.isCurrent()) throw new KitError('ABORTED', 'FEATURE_QUERY_ABORTED');
  }
  requireCurrent();
  const { point, radius } = options;
  const bounds: [[number, number], [number, number]] = [
    [Math.max(0, point.x - radius), Math.max(0, point.y - radius)],
    [point.x + radius, point.y + radius],
  ];
  const results = await Promise.all(
    options.layers.map(async (layer) => {
      const features = await options.query(bounds, layer.id);
      return features.map((feature) =>
        nativeFeatureSelection(feature, layer.source, layer.id, options.markers),
      );
    }),
  );
  requireCurrent();
  const unique = new Map<string, MapSelection>();
  for (const selection of results.flat())
    if (selection && !unique.has(selection.key)) unique.set(selection.key, selection);
  const projections = new Map<string, Promise<readonly [number, number]>>();
  const distances = await Promise.all(
    [...unique.values()].map(async (selection) => {
      const coordinateKey = selection.coordinate.join(',');
      let projected = projections.get(coordinateKey);
      if (!projected) {
        projected = options.project([...selection.coordinate]);
        projections.set(coordinateKey, projected);
      }
      const pixel = await projected;
      const distancePixels = Math.hypot(pixel[0] - point.x, pixel[1] - point.y);
      return distancePixels <= radius ? { ...selection, distancePixels } : null;
    }),
  );
  requireCurrent();
  return distances.filter((selection) => selection !== null);
}

/** A fit must actually fill one usable axis, unless the renderer reached its maximum zoom. */
export function nativeBoundsFit(options: {
  readonly northWest: readonly [number, number];
  readonly southEast: readonly [number, number];
  readonly width: number;
  readonly height: number;
  readonly insets: EdgeInsets;
  readonly zoom: number;
  readonly bearing: number;
  readonly pitch: number;
}): boolean {
  const { width, height, insets, northWest, southEast } = options;
  if (
    ![
      ...northWest,
      ...southEast,
      width,
      height,
      options.zoom,
      options.bearing,
      options.pitch,
    ].every(Number.isFinite)
  )
    return false;
  const usableWidth = width - insets.left - insets.right;
  const usableHeight = height - insets.top - insets.bottom;
  if (
    usableWidth <= 0 ||
    usableHeight <= 0 ||
    Math.abs(((((options.bearing + 180) % 360) + 360) % 360) - 180) > 0.05 ||
    Math.abs(options.pitch) > 0.05
  )
    return false;
  const left = Math.min(northWest[0], southEast[0]),
    right = Math.max(northWest[0], southEast[0]);
  const top = Math.min(northWest[1], southEast[1]),
    bottom = Math.max(northWest[1], southEast[1]);
  const tolerance = 2;
  const contained =
    left >= insets.left - tolerance &&
    right <= width - insets.right + tolerance &&
    top >= insets.top - tolerance &&
    bottom <= height - insets.bottom + tolerance;
  const centered =
    Math.abs((left + right) / 2 - insets.left - usableWidth / 2) <= tolerance &&
    Math.abs((top + bottom) / 2 - insets.top - usableHeight / 2) <= tolerance;
  return (
    contained &&
    centered &&
    (Math.abs(right - left - usableWidth) <= tolerance * 2 ||
      Math.abs(bottom - top - usableHeight) <= tolerance * 2 ||
      options.zoom >= 21.99)
  );
}
