import {
  assertMercatorCoordinate,
  KitError,
  type CameraState,
  type MapMarker,
} from '@korea-map-kit/core';

export interface MapSnapshot {
  readonly camera: CameraState;
  readonly markers: readonly MapMarker[];
  readonly selectedId: string | null;
}
export interface MapState {
  getSnapshot(): MapSnapshot;
  subscribe(listener: () => void): () => void;
  setCamera(camera: CameraState): void;
  setMarkers(markers: readonly MapMarker[]): void;
  selectMarker(id: string | null): void;
}
export function validateCamera(camera: CameraState): CameraState {
  assertMercatorCoordinate(camera.center);
  for (const [value, min, max] of [
    [camera.zoom, 0, 22],
    [camera.bearing, -360, 360],
    [camera.pitch, 0, 60],
  ] as const) {
    if (!Number.isFinite(value) || value < min || value > max)
      throw new KitError('INVALID_ARGUMENT', 'INVALID_CAMERA');
  }
  return Object.freeze({
    ...camera,
    center: Object.freeze([...camera.center] as [number, number]),
  });
}
export function validateMarkers(markers: readonly MapMarker[]): readonly MapMarker[] {
  if (!Array.isArray(markers) || markers.length > 10000)
    throw new KitError('INVALID_ARGUMENT', 'MARKER_LIMIT');
  const ids = new Set<string>();
  return Object.freeze(
    markers.map((marker) => {
      assertMercatorCoordinate(marker.coordinate);
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
        throw new KitError('INVALID_ARGUMENT', 'INVALID_MARKER');
      ids.add(marker.id);
      return Object.freeze({
        ...marker,
        coordinate: Object.freeze([...marker.coordinate] as [number, number]),
      });
    }),
  );
}
/** No DOM, renderer or network. A state instance can outlive a map mount. */
export function createMapState(initial: Partial<MapSnapshot> = {}): MapState {
  let snapshot: MapSnapshot = Object.freeze({
    camera: validateCamera(
      initial.camera ?? { center: [126.978, 37.5665], zoom: 13, bearing: 0, pitch: 0 },
    ),
    markers: validateMarkers(initial.markers ?? []),
    selectedId: null,
  });
  const listeners = new Set<() => void>();
  function update(patch: Partial<MapSnapshot>) {
    snapshot = Object.freeze({ ...snapshot, ...patch });
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        console.error('Korea Map Kit state subscriber failed');
      }
    }
  }
  const state: MapState = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setCamera: (camera) => update({ camera: validateCamera(camera) }),
    setMarkers(markers) {
      const next = validateMarkers(markers);
      update({
        markers: next,
        selectedId: next.some((m) => m.id === snapshot.selectedId) ? snapshot.selectedId : null,
      });
    },
    selectMarker(id) {
      if (id !== null && !snapshot.markers.some((m) => m.id === id))
        throw new KitError('INVALID_ARGUMENT', 'MARKER_NOT_FOUND');
      if (id !== snapshot.selectedId) update({ selectedId: id });
    },
  };
  if (initial.selectedId != null) state.selectMarker(initial.selectedId);
  return state;
}
