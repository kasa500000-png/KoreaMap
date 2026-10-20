import {
  createMapController,
  createMapInteractionController,
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
  type MapCamera,
  type MapInteractionEvent,
  type MapSelection,
  type OperationContext,
  type ScreenPoint,
  type MapBounds,
  type EdgeInsets,
} from 'korea-map-core';
import { validateNativeResources, type NativeResourcePolicy } from './resources.js';
import { validateStyleMin, type StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import { nativeMarkerSelection, sameNativeMarkers } from './features.js';

/** Minimal native bridge, checked against installed MapLibre CameraRef/MapRef by MapView. */
export type NativeCameraStop = {
  zoom?: number;
  bearing?: number;
  pitch?: number;
  padding?: { top: number; right: number; bottom: number; left: number };
  duration: number;
  easing?: 'linear' | 'ease' | 'fly';
} & (
  | { center: [number, number]; bounds?: never }
  | { bounds: [number, number, number, number]; center?: never }
  | { center?: never; bounds?: never }
);
export interface NativeBridge {
  setCamera(stop: NativeCameraStop): Promise<void>;
  getBounds(): Promise<[number, number, number, number]>;
  /** Stop at the currently rendered camera, never restore an earlier target. */
  stopCamera?(): Promise<void>;
  pickFeatures?(point: ScreenPoint, context: OperationContext): Promise<readonly MapSelection[]>;
  getClusterExpansionZoom?(clusterId: string | number): Promise<number>;
  getCamera?(): Promise<MapCamera>;
  /** Verify the rendered fit using projected corners and the actual viewport/insets. */
  isBoundsFitted?(bounds: MapBounds, insets: EdgeInsets): Promise<boolean>;
  prefersReducedMotion?(): boolean;
}
export interface NativeSnapshot {
  readonly revision: number;
  readonly style: StyleSpecification;
  readonly attribution: string;
  readonly markers: readonly MapMarker[];
  readonly overlays: ReadonlyMap<string, MapFeatureCollection>;
  readonly selection: MapSelection | null;
  readonly destroyed: boolean;
}
/** Inline style plus explicit operator resources; no implicit TileJSON or provider discovery. */
export function validateNativeStyle(
  input: MapStyle,
  policy?: NativeResourcePolicy,
): StyleSpecification {
  const envelope = defineMapStyle(input.document, input.attribution);
  const style = envelope.document as unknown as StyleSpecification;
  if (validateStyleMin(style).length)
    throw new KitError('INVALID_ARGUMENT', 'INVALID_NATIVE_STYLE');
  validateNativeResources(style, policy);
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
  resourcePolicy?: NativeResourcePolicy,
) {
  const policy = resourcePolicy
    ? { ...resourcePolicy, allowedOrigins: [...resourcePolicy.allowedOrigins] }
    : undefined;
  let snapshot: NativeSnapshot = {
    revision: 0,
    style: validateNativeStyle(initial, policy),
    attribution: initial.attribution,
    markers: [],
    overlays: new Map(),
    selection: null,
    destroyed: false,
  };
  let ready = false;
  let pending: { resolve(): void; reject(error: Error): void; off(): void } | undefined;
  const listeners = new Set<(event: MapEvent) => void>();
  const interactionListeners = new Set<(event: MapInteractionEvent) => void>();
  let movementOrigin: 'api' | 'gesture' | 'unknown' = 'unknown';
  let lastTimestamp = -Infinity;
  let motion:
    | {
        resolve(): void;
        reject(error: Error): void;
        off(): void;
        accepted: boolean;
        completed: boolean;
        started: boolean;
        baseline: number;
        target?: MapCamera;
        verify?: () => Promise<boolean>;
      }
    | undefined;
  function emitInteraction(event: MapInteractionEvent) {
    for (const listener of [...interactionListeners]) {
      try {
        listener(event);
      } catch {
        /* Consumer callbacks cannot interrupt map cleanup. */
      }
    }
  }
  function emit(event: MapEvent) {
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch {
        /* Consumer callbacks cannot prevent native cleanup. */
      }
    }
  }
  function update(patch: Partial<NativeSnapshot>) {
    snapshot = { ...snapshot, ...patch };
    changed(snapshot);
  }
  function requireReady() {
    if (!ready || snapshot.destroyed) throw new KitError('UNAVAILABLE', 'MAP_NOT_READY');
  }
  function cancelMotion(stop = true) {
    const previous = motion;
    if (!previous) return;
    motion = undefined;
    previous.off();
    previous.reject(new KitError('ABORTED', 'TRANSITION_ABORTED'));
    if (stop) void bridge.stopCamera?.().catch(() => {});
  }
  function applySelection(selection: MapSelection | null) {
    if (JSON.stringify(snapshot.selection) === JSON.stringify(selection)) return;
    update({ selection });
    emitInteraction({ type: 'selection', selection });
    const marker =
      selection?.kind === 'marker'
        ? (snapshot.markers.find((entry) => entry.id === selection.id) ?? null)
        : null;
    emit({ type: 'select', marker });
  }
  function setMarkers(markers: readonly MapMarker[]) {
    if (sameNativeMarkers(snapshot.markers, markers)) return;
    const previous = snapshot.selection;
    const marker =
      previous?.kind === 'marker' ? markers.find((entry) => entry.id === previous.id) : undefined;
    const selection =
      previous?.kind === 'marker'
        ? marker
          ? nativeMarkerSelection(marker)
          : null
        : previous?.kind === 'cluster'
          ? null
          : previous;
    update({ markers, selection });
    if (JSON.stringify(previous) !== JSON.stringify(selection)) {
      emitInteraction({ type: 'selection', selection });
      emit({ type: 'select', marker: marker ?? null });
    }
  }
  function move(
    stop: NativeCameraStop,
    context: OperationContext,
    target?: MapCamera,
    verify?: () => Promise<boolean>,
  ) {
    requireReady();
    cancelMotion();
    movementOrigin = 'api';
    const duration = bridge.prefersReducedMotion?.() ? 0 : stop.duration;
    if (duration === 0) return bridge.setCamera({ ...stop, duration });
    return new Promise<void>((resolve, reject) => {
      const current: NonNullable<typeof motion> = {
        resolve,
        reject,
        off: () => {},
        accepted: false,
        completed: false,
        started: false,
        baseline: lastTimestamp,
        ...(target ? { target } : {}),
        ...(verify ? { verify } : {}),
      };
      motion = current;
      current.off = context.signal.subscribe(() => {
        if (motion === current) cancelMotion();
      });
      if (context.signal.aborted || motion !== current) {
        current.off();
        return;
      }
      void bridge.setCamera({ ...stop, duration, easing: 'ease' }).then(
        () => {
          if (motion !== current) return;
          current.accepted = true;
          if (current.completed) {
            motion = undefined;
            current.off();
            resolve();
          }
        },
        (error: unknown) => {
          if (motion !== current) return;
          motion = undefined;
          current.off();
          reject(error instanceof KitError ? error : new KitError('UNAVAILABLE', 'CAMERA_FAILED'));
        },
      );
    });
  }
  const interactions = createMapInteractionController(
    {
      transitionCamera(camera, transition, context) {
        return move(
          {
            ...camera,
            center: [...camera.center],
            padding: { ...transition.insets },
            duration: transition.durationMs,
          },
          context,
          camera,
        );
      },
      fitBounds(bounds, transition, context) {
        const verify = bridge.isBoundsFitted;
        if (transition.durationMs > 0 && !bridge.prefersReducedMotion?.() && !verify)
          throw new KitError('UNAVAILABLE', 'BOUNDS_FIT_VERIFICATION_UNAVAILABLE');
        return move(
          {
            bounds: [
              bounds.west,
              bounds.south,
              bounds.west > bounds.east ? bounds.east + 360 : bounds.east,
              bounds.north,
            ],
            padding: { ...transition.insets },
            bearing: 0,
            pitch: 0,
            duration: transition.durationMs,
          },
          context,
          undefined,
          verify ? () => verify(bounds, transition.insets) : undefined,
        );
      },
      setMarkers(markers) {
        requireReady();
        setMarkers(markers);
      },
      async pickFeatures(point, context) {
        requireReady();
        if (!bridge.pickFeatures) throw new KitError('UNAVAILABLE', 'FEATURE_QUERY_UNAVAILABLE');
        const result = await bridge.pickFeatures(point, context);
        if (context.signal.aborted) throw new KitError('ABORTED', 'OPERATION_ABORTED');
        return result;
      },
      async selectFeature(selection, context) {
        requireReady();
        if (
          selection?.kind === 'marker' &&
          !snapshot.markers.some((marker) => marker.id === selection.id)
        )
          throw new KitError('NOT_FOUND', 'MARKER_NOT_FOUND');
        if (selection?.kind === 'cluster') {
          const markers = snapshot.markers;
          if (selection.sourceId !== 'kmk-markers' || typeof selection.clusterId !== 'number')
            throw new KitError('INVALID_ARGUMENT', 'INVALID_CLUSTER_SELECTION');
          if (
            selection.clusterId === undefined ||
            !bridge.getClusterExpansionZoom ||
            !bridge.getCamera
          )
            throw new KitError('UNAVAILABLE', 'CLUSTER_EXPANSION_UNAVAILABLE');
          const zoom = await bridge.getClusterExpansionZoom(selection.clusterId);
          if (context.signal.aborted || snapshot.markers !== markers)
            throw new KitError('ABORTED', 'OPERATION_ABORTED');
          if (!Number.isFinite(zoom) || zoom < 0 || zoom > 22)
            throw new KitError('UNAVAILABLE', 'CLUSTER_EXPANSION_UNAVAILABLE');
          const camera = { ...(await bridge.getCamera()), center: selection.coordinate, zoom };
          if (context.signal.aborted || snapshot.markers !== markers)
            throw new KitError('ABORTED', 'OPERATION_ABORTED');
          await move({ ...camera, center: [...camera.center], duration: 300 }, context, camera);
          if (context.signal.aborted || snapshot.markers !== markers)
            throw new KitError('ABORTED', 'OPERATION_ABORTED');
        }
        applySelection(selection);
      },
      subscribe(listener) {
        interactionListeners.add(listener);
        return () => {
          interactionListeners.delete(listener);
        };
      },
      destroy() {
        cancelMotion();
        interactionListeners.clear();
      },
    },
    scheduler,
  );
  function legacyCamera(stop: NativeCameraStop) {
    cancelMotion();
    movementOrigin = 'api';
    return bridge.setCamera(stop);
  }
  const api: MapController = createMapController(
    {
      execute(command, context) {
        requireReady();
        switch (command.type) {
          case 'center':
            return legacyCamera({ center: [...command.center], duration: 0 });
          case 'zoom':
            return legacyCamera({ zoom: command.zoom, duration: 0 });
          case 'camera':
            return legacyCamera({
              ...command.camera,
              center: [...command.camera.center],
              duration: 0,
            });
          case 'bounds': {
            const b = command.bounds,
              p = command.padding;
            return legacyCamera({
              bounds: [b.west, b.south, b.west > b.east ? b.east + 360 : b.east, b.north],
              padding: { top: p, right: p, bottom: p, left: p },
              bearing: 0,
              pitch: 0,
              duration: 0,
            });
          }
          case 'style': {
            const style = validateNativeStyle(command.style, policy);
            cancelMotion();
            ready = false;
            return new Promise<void>((resolve, reject) => {
              pending = { resolve, reject, off: context.signal.subscribe(() => api.destroy()) };
              update({
                style,
                attribution: command.style.attribution,
                revision: snapshot.revision + 1,
              });
            });
          }
          case 'marker':
            if (
              sameNativeMarkers(
                snapshot.markers.filter((m) => m.id === command.marker.id),
                [command.marker],
              )
            )
              return;
            setMarkers(
              validateMarkers([
                ...snapshot.markers.filter((m) => m.id !== command.marker.id),
                command.marker,
              ]),
            );
            return;
          case 'remove-marker':
            setMarkers(snapshot.markers.filter((m) => m.id !== command.id));
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
        interactions.destroy();
        if (pending) {
          const previous = pending;
          pending = undefined;
          previous.off();
          previous.reject(new KitError('ABORTED', 'STYLE_ABORTED'));
        }
        update({ destroyed: true, markers: [], overlays: new Map(), selection: null });
        emit({ type: 'destroyed' });
        listeners.clear();
      },
    },
    scheduler,
  );
  return {
    api,
    interactions,
    getSnapshot: () => snapshot,
    loaded(revision = snapshot.revision) {
      if (snapshot.destroyed || revision !== snapshot.revision || ready) return;
      ready = true;
      if (pending) {
        pending.off();
        pending.resolve();
        pending = undefined;
      }
      emit({ type: 'ready' });
    },
    failed(revision = snapshot.revision) {
      if (snapshot.destroyed || revision !== snapshot.revision) return;
      emit({ type: 'error', error: new KitError('UNAVAILABLE', 'MAP_LOAD_FAILED'), fatal: true });
      api.destroy();
    },
    emit(event: MapEvent) {
      if (!snapshot.destroyed) emit(event);
    },
    /** RN event timestamps share one monotonic stream; stale events cannot finish a newer motion. */
    regionChanged(
      phase: 'will' | 'changing' | 'did',
      camera: MapCamera,
      userInteraction: boolean,
      timestamp: number,
      revision = snapshot.revision,
    ) {
      if (snapshot.destroyed || revision !== snapshot.revision || !ready) return;
      const time = Number.isFinite(timestamp) ? timestamp : Math.max(0, lastTimestamp + 1);
      if (time < lastTimestamp) return;
      lastTimestamp = time;
      if (userInteraction) {
        movementOrigin = 'gesture';
        emitInteraction({ type: 'gesture' });
      }
      const current = motion;
      if (current && phase === 'will' && time >= current.baseline) current.started = true;
      const origin = movementOrigin;
      emitInteraction({ type: 'camera', camera, origin });
      if (phase !== 'did') return;
      emit({ type: 'camera', camera });
      emit({ type: 'idle' });
      if (current && motion === current && !userInteraction && time >= current.baseline) {
        const target = current.target;
        const matches = target
          ? Math.abs(((((target.center[0] - camera.center[0] + 180) % 360) + 360) % 360) - 180) <
              0.00001 &&
            Math.abs(target.center[1] - camera.center[1]) < 0.00001 &&
            Math.abs(target.zoom - camera.zoom) < 0.01 &&
            Math.abs(((((target.bearing - camera.bearing + 180) % 360) + 360) % 360) - 180) <
              0.01 &&
            Math.abs(target.pitch - camera.pitch) < 0.01
          : current.started;
        if (matches) {
          const complete = () => {
            if (motion !== current) return;
            current.completed = true;
            if (current.accepted) {
              motion = undefined;
              current.off();
              current.resolve();
            }
          };
          if (current.verify)
            void current.verify().then(
              (fitted) => {
                if (fitted) complete();
              },
              () => {
                if (motion !== current) return;
                motion = undefined;
                current.off();
                current.reject(new KitError('UNAVAILABLE', 'BOUNDS_FIT_VERIFICATION_FAILED'));
              },
            );
          else complete();
        }
      }
      movementOrigin = 'unknown';
    },
  };
}
