import {
  validateCamera,
  validateMarkers,
  KitError,
  type CameraState,
  type MapMarker,
} from 'korea-map-core';

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
    setCamera(camera) {
      const next = validateCamera(camera),
        prior = snapshot.camera;
      if (
        next.center[0] === prior.center[0] &&
        next.center[1] === prior.center[1] &&
        next.zoom === prior.zoom &&
        next.bearing === prior.bearing &&
        next.pitch === prior.pitch
      )
        return;
      update({ camera: next });
    },
    setMarkers(markers) {
      const next = validateMarkers(markers);
      if (
        next.length === snapshot.markers.length &&
        next.every((m, i) => {
          const prior = snapshot.markers[i]!;
          return (
            m.id === prior.id &&
            m.label === prior.label &&
            m.description === prior.description &&
            m.coordinate[0] === prior.coordinate[0] &&
            m.coordinate[1] === prior.coordinate[1]
          );
        })
      )
        return;
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

export { validateCamera, validateMarkers } from 'korea-map-core';
