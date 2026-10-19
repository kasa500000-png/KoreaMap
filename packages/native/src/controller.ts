import {
  createMapController,
  defineMapStyle,
  KitError,
  normalizeVisibleBounds,
  validateMarkers,
  type MapController,
  type MapEvent,
  type MapMarker,
  type MapFeatureCollection,
  type MapStyle,
  type Scheduler,
} from '@korea-map-kit/core';
import { validateStyleMin, type StyleSpecification } from '@maplibre/maplibre-gl-style-spec';

/** Minimal native bridge, checked against installed MapLibre CameraRef/MapRef by MapView. */
export type NativeCameraStop = {
  zoom?: number;
  bearing?: number;
  pitch?: number;
  padding?: { top: number; right: number; bottom: number; left: number };
  duration: number;
} & (
  | { center: [number, number]; bounds?: never }
  | { bounds: [number, number, number, number]; center?: never }
  | { center?: never; bounds?: never }
);
export interface NativeBridge {
  setCamera(stop: NativeCameraStop): Promise<void>;
  getBounds(): Promise<[number, number, number, number]>;
}
export interface NativeSnapshot {
  readonly style: StyleSpecification;
  readonly attribution: string;
  readonly markers: readonly MapMarker[];
  readonly overlays: ReadonlyMap<string, MapFeatureCollection>;
  readonly destroyed: boolean;
}
/** Until a native resource interceptor is implemented, external resources fail closed. */
export function validateNativeStyle(input: MapStyle): StyleSpecification {
  const envelope = defineMapStyle(input.document, input.attribution);
  const style = envelope.document as unknown as StyleSpecification;
  if (validateStyleMin(style).length)
    throw new KitError('INVALID_ARGUMENT', 'INVALID_NATIVE_STYLE');
  if (
    style.glyphs ||
    style.sprite ||
    Object.values(style.sources).some(
      (source) => source.type !== 'geojson' || !source.data || typeof source.data !== 'object',
    ) ||
    style.layers.some((layer) => layer.type === 'symbol')
  )
    throw new KitError('UNSUPPORTED', 'NATIVE_OFFLINE_GEOMETRY_STYLE_REQUIRED');
  if (
    Object.keys(style.sources).some((id) => id.startsWith('kmk-')) ||
    style.layers.some((layer) => layer.id.startsWith('kmk-'))
  )
    throw new KitError('INVALID_ARGUMENT', 'RESERVED_LAYER_ID');
  return style;
}
/** Testable session without React, DOM or native renderer imports. Native device QA remains separate. */
export function createNativeMapSession(
  initial: MapStyle,
  bridge: NativeBridge,
  scheduler: Scheduler,
  changed: (snapshot: NativeSnapshot) => void,
) {
  let snapshot: NativeSnapshot = {
    style: validateNativeStyle(initial),
    attribution: initial.attribution,
    markers: [],
    overlays: new Map(),
    destroyed: false,
  };
  let ready = false;
  let pending: { resolve(): void; reject(error: Error): void; off(): void } | undefined;
  const listeners = new Set<(event: MapEvent) => void>();
  function emit(event: MapEvent) {
    for (const listener of listeners) listener(event);
  }
  function update(patch: Partial<NativeSnapshot>) {
    snapshot = { ...snapshot, ...patch };
    changed(snapshot);
  }
  function requireReady() {
    if (!ready || snapshot.destroyed) throw new KitError('UNAVAILABLE', 'MAP_NOT_READY');
  }
  const api: MapController = createMapController(
    {
      execute(command, context) {
        requireReady();
        switch (command.type) {
          case 'center':
            return bridge.setCamera({ center: [...command.center], duration: 0 });
          case 'zoom':
            return bridge.setCamera({ zoom: command.zoom, duration: 0 });
          case 'camera':
            return bridge.setCamera({
              ...command.camera,
              center: [...command.camera.center],
              duration: 0,
            });
          case 'bounds': {
            const b = command.bounds,
              p = command.padding;
            return bridge.setCamera({
              bounds: [b.west, b.south, b.west > b.east ? b.east + 360 : b.east, b.north],
              padding: { top: p, right: p, bottom: p, left: p },
              bearing: 0,
              pitch: 0,
              duration: 0,
            });
          }
          case 'style': {
            const style = validateNativeStyle(command.style);
            ready = false;
            return new Promise<void>((resolve, reject) => {
              pending = { resolve, reject, off: context.signal.subscribe(() => api.destroy()) };
              update({ style, attribution: command.style.attribution });
            });
          }
          case 'marker':
            update({
              markers: validateMarkers([
                ...snapshot.markers.filter((m) => m.id !== command.marker.id),
                command.marker,
              ]),
            });
            return;
          case 'remove-marker':
            update({ markers: snapshot.markers.filter((m) => m.id !== command.id) });
            return;
          case 'geojson': {
            const overlays = new Map(snapshot.overlays);
            overlays.set(command.id, command.data);
            update({ overlays });
            return;
          }
          case 'remove-geojson': {
            const overlays = new Map(snapshot.overlays);
            overlays.delete(command.id);
            update({ overlays });
            return;
          }
        }
      },
      async getVisibleBounds() {
        requireReady();
        return normalizeVisibleBounds(...(await bridge.getBounds()));
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      destroy() {
        if (snapshot.destroyed) return;
        ready = false;
        if (pending) {
          const previous = pending;
          pending = undefined;
          previous.off();
          previous.reject(new KitError('ABORTED', 'STYLE_ABORTED'));
        }
        update({ destroyed: true, markers: [], overlays: new Map() });
        emit({ type: 'destroyed' });
        listeners.clear();
      },
    },
    scheduler,
  );
  return {
    api,
    getSnapshot: () => snapshot,
    loaded() {
      if (snapshot.destroyed) return;
      ready = true;
      if (pending) {
        pending.off();
        pending.resolve();
        pending = undefined;
      }
      emit({ type: 'ready' });
    },
    failed() {
      emit({ type: 'error', error: new KitError('UNAVAILABLE', 'MAP_LOAD_FAILED'), fatal: true });
      api.destroy();
    },
    emit(event: MapEvent) {
      if (!snapshot.destroyed) emit(event);
    },
  };
}
