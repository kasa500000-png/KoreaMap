import {
  createMapInteractionController,
  KitError,
  type CameraState,
  type MapBounds,
  type MapInteractionController,
  type MapInteractionEvent,
  type MapSelection,
  type MapMarker,
  type NormalizedCameraTransition,
  type OperationContext,
} from 'korea-map-core';
import type { GeoJSONSource, Map as LibreMap, MapGeoJSONFeature } from 'maplibre-gl';
import type { MapState } from './state.js';

export interface MarkerClusteringOptions {
  readonly radius?: number;
  readonly maxZoom?: number;
}
export interface WebInteractionOptions {
  /** Opt-in GPU source clustering; omission preserves the legacy unclustered source. */
  readonly clustering?: MarkerClusteringOptions;
  /** Only these operator-selected basemap Point layers participate in POI picking. */
  readonly interactionPoiLayers?: readonly string[];
}
export function validateInteractionOptions(options: WebInteractionOptions) {
  const cluster = options.clustering;
  if (
    cluster !== undefined &&
    (!cluster ||
      typeof cluster !== 'object' ||
      Array.isArray(cluster) ||
      !Number.isInteger(cluster.radius ?? 48) ||
      (cluster.radius ?? 48) < 1 ||
      (cluster.radius ?? 48) > 128 ||
      !Number.isInteger(cluster.maxZoom ?? 13) ||
      (cluster.maxZoom ?? 13) < 0 ||
      (cluster.maxZoom ?? 13) > 21)
  )
    throw new KitError('INVALID_ARGUMENT', 'INVALID_CLUSTER_OPTIONS');
  const layers = options.interactionPoiLayers ?? [];
  if (
    !Array.isArray(layers) ||
    layers.length > 8 ||
    new Set(layers).size !== layers.length ||
    layers.some(
      (id) =>
        typeof id !== 'string' || !/^[A-Za-z0-9_:. -]{1,128}$/.test(id) || id.startsWith('kmk-'),
    )
  )
    throw new KitError('INVALID_ARGUMENT', 'INVALID_PICK_LAYERS');
  return {
    clustering: cluster
      ? { radius: cluster.radius ?? 48, maxZoom: cluster.maxZoom ?? 13 }
      : undefined,
    poiLayers: [...layers],
  };
}

const pickedSource = 'kmk-picked-feature';
const pickedLayer = 'kmk-picked-highlight';
export const markerSourceId = 'kmk-markers';
export const markerLayerId = 'kmk-marker-points';
export const clusterLayerId = 'kmk-marker-clusters';
const empty = () => ({ type: 'FeatureCollection' as const, features: [] });
const aborted = () => new KitError('ABORTED', 'CAMERA_INTERRUPTED');

/** Internal adapter hooks: no renderer is exposed by the public interaction controller. */
export function createWebInteractions(options: {
  map: LibreMap;
  requireMap(): LibreMap;
  state: MapState;
  poiLayers: readonly string[];
  reducedMotion(): boolean;
}) {
  const listeners = new Set<(event: MapInteractionEvent) => void>();
  const detach: (() => void)[] = [];
  let destroyed = false;
  let selected: MapSelection | null = null;
  let pending: { cancel(): void } | undefined;
  let gesture = false;
  // MapState snapshots keep marker arrays immutable and stable across camera-only updates.
  // Weak keys let replaced batches be collected without waiting for another pick.
  let markerIndexes = new WeakMap<readonly MapMarker[], ReadonlyMap<string, MapMarker>>();
  const map = options.map;
  function currentMarkerIndex() {
    const markers = options.state.getSnapshot().markers;
    let index = markerIndexes.get(markers);
    if (!index) {
      index = new Map(markers.map((marker) => [marker.id, marker]));
      markerIndexes.set(markers, index);
    }
    return index;
  }
  function emit(event: MapInteractionEvent) {
    for (const listener of [...listeners]) listener(event);
  }
  function camera(): CameraState {
    const center = map.getCenter();
    return {
      center: [center.wrap().lng, center.lat],
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    };
  }
  function requireReady() {
    if (destroyed) throw new KitError('UNAVAILABLE', 'INTERACTIONS_DESTROYED');
    return options.requireMap();
  }
  function highlight() {
    const source = map.getSource(pickedSource) as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(
      selected?.kind === 'poi'
        ? {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { key: selected.key },
                geometry: { type: 'Point', coordinates: [...selected.coordinate] },
              },
            ],
          }
        : empty(),
    );
  }
  function styleLoaded() {
    if (destroyed) return;
    if (!map.getSource(pickedSource))
      map.addSource(pickedSource, { type: 'geojson', data: empty() });
    if (!map.getLayer(pickedLayer))
      map.addLayer({
        id: pickedLayer,
        source: pickedSource,
        type: 'circle',
        paint: {
          'circle-color': '#e11d48',
          'circle-radius': 10,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });
    highlight();
  }
  function motion(
    transition: NormalizedCameraTransition,
    context: OperationContext,
    start: (duration: number) => void,
    target?: CameraState,
  ) {
    requireReady();
    const canvas = map.getCanvas();
    if (
      transition.insets.left + transition.insets.right >= canvas.clientWidth ||
      transition.insets.top + transition.insets.bottom >= canvas.clientHeight
    )
      return Promise.reject(new KitError('INVALID_ARGUMENT', 'INSETS_EXCEED_VIEWPORT'));
    if (context.signal.aborted) return Promise.reject(aborted());
    pending?.cancel();
    // Finish unrelated navigation/inertia before installing the new moveend listener.
    // MapLibre easeTo stops prior movement synchronously and emits that old moveend.
    map.stop();
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let off = () => {};
      function finish(error?: KitError) {
        if (settled) return;
        settled = true;
        off();
        map.off('moveend', end);
        if (pending === task) pending = undefined;
        if (error) reject(error);
        else resolve();
      }
      const task = {
        cancel() {
          // Detach moveend first: map.stop() itself emits moveend at the interrupted location.
          finish(aborted());
          map.stop();
        },
      };
      function end() {
        const actual = camera();
        const angleDistance = (a: number, b: number) =>
          Math.abs(((((a - b + 180) % 360) + 360) % 360) - 180);
        const reached =
          !target ||
          (angleDistance(actual.center[0], target.center[0]) < 0.000001 &&
            Math.abs(actual.center[1] - target.center[1]) < 0.000001 &&
            Math.abs(actual.zoom - target.zoom) < 0.0001 &&
            angleDistance(actual.bearing, target.bearing) < 0.001 &&
            Math.abs(actual.pitch - target.pitch) < 0.001);
        finish(reached ? undefined : aborted());
      }
      pending = task;
      map.on('moveend', end);
      off = context.signal.subscribe(() => task.cancel());
      if (settled) {
        off();
        return;
      }
      const duration =
        transition.reducedMotion || options.reducedMotion() ? 0 : transition.durationMs;
      try {
        start(duration);
        // A no-op or zero-duration camera command need not emit a movement event.
        if (duration === 0 && !settled) end();
      } catch {
        finish(new KitError('UNAVAILABLE', 'CAMERA_TRANSITION_FAILED'));
      }
    });
  }
  function transitionCamera(
    target: CameraState,
    transition: NormalizedCameraTransition,
    context: OperationContext,
  ) {
    return motion(
      transition,
      context,
      (duration) =>
        map.easeTo({
          ...target,
          center: [...target.center],
          duration,
          padding: transition.insets,
          essential: false,
        }),
      target,
    );
  }
  function fitBounds(
    bounds: MapBounds,
    transition: NormalizedCameraTransition,
    context: OperationContext,
  ) {
    requireReady();
    const east = bounds.west > bounds.east ? bounds.east + 360 : bounds.east;
    const corners: [[number, number], [number, number]] = [
      [bounds.west, bounds.south],
      [east, bounds.north],
    ];
    const calculated = map.cameraForBounds(corners, {
      padding: transition.insets,
      absolutePadding: true,
      bearing: 0,
    });
    if (!calculated?.center || calculated.zoom === undefined)
      throw new KitError('INVALID_ARGUMENT', 'UNFITTED_BOUNDS');
    const center = calculated.center;
    const coordinate: readonly [number, number] = Array.isArray(center)
      ? [center[0], center[1]]
      : ['lng' in center ? center.lng : center.lon, center.lat];
    return motion(
      transition,
      context,
      (duration) => {
        map.fitBounds(corners, {
          duration,
          padding: transition.insets,
          absolutePadding: true,
          bearing: 0,
          pitch: 0,
          linear: true,
          essential: false,
        });
      },
      { center: coordinate, zoom: calculated.zoom, bearing: 0, pitch: 0 },
    );
  }
  function pointCoordinate(feature: MapGeoJSONFeature): readonly [number, number] | undefined {
    if (feature.geometry.type !== 'Point') return;
    const [longitude, latitude] = feature.geometry.coordinates;
    if (
      longitude === undefined ||
      latitude === undefined ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      Math.abs(latitude) > 85.051129
    )
      return;
    return [((((longitude + 180) % 360) + 360) % 360) - 180, latitude];
  }
  const controller: MapInteractionController = createMapInteractionController(
    {
      transitionCamera,
      fitBounds,
      setMarkers(markers) {
        requireReady();
        options.state.setMarkers(markers);
        if (selected?.kind === 'marker' && !markers.some((marker) => marker.id === selected?.id)) {
          selected = null;
          emit({ type: 'selection', selection: null });
        }
      },
      pickFeatures(point) {
        requireReady();
        const layers = [markerLayerId, clusterLayerId, ...options.poiLayers].filter((id) =>
          map.getLayer(id),
        );
        const features = map.queryRenderedFeatures(
          [
            [point.x - 22, point.y - 22],
            [point.x + 22, point.y + 22],
          ],
          { layers },
        );
        const selections: MapSelection[] = [];
        let markers: ReadonlyMap<string, MapMarker> | undefined;
        for (const feature of features) {
          const coordinate = pointCoordinate(feature);
          if (!coordinate) continue;
          const position = map.project([...coordinate]);
          const distancePixels = Math.hypot(position.x - point.x, position.y - point.y);
          if (distancePixels > 22) continue;
          const common = {
            coordinate,
            distancePixels,
            sourceId: feature.source,
            layerId: feature.layer.id,
          };
          if (feature.layer.id === clusterLayerId) {
            const id = feature.properties['cluster_id'];
            const count = feature.properties['point_count'];
            if (typeof id === 'number' && typeof count === 'number')
              selections.push({
                ...common,
                kind: 'cluster',
                key: `cluster:${id}`,
                id: String(id),
                clusterId: id,
                count,
                label: `${count} places`,
                priority: 1,
              });
          } else if (feature.layer.id === markerLayerId) {
            markers ??= currentMarkerIndex();
            const marker = markers.get(feature.properties['id']);
            if (marker)
              selections.push({
                ...common,
                coordinate: marker.coordinate,
                kind: 'marker',
                key: `marker:${marker.id}`,
                id: marker.id,
                label: marker.label,
                priority: 0,
              });
          } else {
            const fid = feature.properties['fid'];
            if (typeof fid !== 'string' && typeof fid !== 'number') continue;
            const label =
              [
                feature.properties['name:ko'],
                feature.properties['name'],
                feature.properties['label'],
              ].find(
                (value): value is string => typeof value === 'string' && value.trim().length > 0,
              ) ?? String(fid);
            selections.push({
              ...common,
              kind: 'poi',
              key: `poi:${feature.source}:${feature.layer.id}:${fid}`,
              id: String(fid),
              label: label.slice(0, 256),
              priority: 2,
            });
          }
        }
        return selections;
      },
      async selectFeature(selection, context) {
        requireReady();
        if (selection?.kind === 'cluster') {
          if (selection.sourceId !== markerSourceId || typeof selection.clusterId !== 'number')
            throw new KitError('INVALID_ARGUMENT', 'INVALID_CLUSTER_SELECTION');
          options.state.selectMarker(null);
          selected = null;
          highlight();
          const source = map.getSource(markerSourceId) as GeoJSONSource;
          let zoom: number;
          try {
            zoom = await source.getClusterExpansionZoom(selection.clusterId);
          } catch {
            throw new KitError('NOT_FOUND', 'CLUSTER_NOT_FOUND');
          }
          if (context.signal.aborted) throw aborted();
          const padding = map.getPadding();
          await transitionCamera(
            { ...camera(), center: selection.coordinate, zoom: Math.min(zoom, map.getMaxZoom()) },
            {
              durationMs: 300,
              insets: {
                top: padding.top ?? 0,
                right: padding.right ?? 0,
                bottom: padding.bottom ?? 0,
                left: padding.left ?? 0,
              },
              reducedMotion: false,
            },
            context,
          );
          if (context.signal.aborted) throw aborted();
          emit({ type: 'selection', selection });
        } else {
          options.state.selectMarker(selection?.kind === 'marker' ? selection.id : null);
          selected = selection;
          highlight();
          emit({ type: 'selection', selection });
        }
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        pending?.cancel();
        for (const off of detach.splice(0)) off();
        if (map.getLayer(pickedLayer)) map.removeLayer(pickedLayer);
        if (map.getSource(pickedSource)) map.removeSource(pickedSource);
        selected = null;
        markerIndexes = new WeakMap();
        emit({ type: 'destroyed' });
        listeners.clear();
      },
    },
    {
      schedule(callback, delayMs) {
        const timer = setTimeout(callback, delayMs);
        return () => clearTimeout(timer);
      },
    },
  );
  const begin = (event: { originalEvent?: unknown }) => {
    if (!event.originalEvent) return;
    gesture = true;
    emit({ type: 'gesture' });
  };
  for (const event of ['dragstart', 'rotatestart', 'zoomstart', 'pitchstart'] as const) {
    map.on(event, begin);
    detach.push(() => map.off(event, begin));
  }
  const move = (event: { originalEvent?: unknown }) =>
    emit({
      type: 'camera',
      camera: camera(),
      origin: event.originalEvent || gesture ? 'gesture' : pending ? 'api' : 'unknown',
    });
  map.on('move', move);
  detach.push(() => map.off('move', move));
  const endGesture = () => {
    gesture = false;
  };
  map.on('moveend', endGesture);
  detach.push(() => map.off('moveend', endGesture));
  return { controller, styleLoaded, listenerCount: () => detach.length };
}
