import { assertMercatorCoordinate, KitError, type MapMarker } from './base.js';
import type {
  MapBounds,
  MapCamera,
  OperationContext,
  OperationOptions,
  Scheduler,
} from './contracts.js';
import { createCancellationSource, normalizeError, runOperation } from './operations.js';
import { validateBounds, validateCamera } from './validation.js';

/** CSS pixels on Web and logical points on Native. */
export interface EdgeInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}
export interface CameraTransitionOptions extends OperationOptions {
  /** 0..10000ms; default 300. Zero applies without animation. */
  readonly durationMs?: number;
  /** Each edge is 0..1000 CSS pixels or native logical points; missing edges are zero. */
  readonly insets?: Partial<EdgeInsets>;
  /** Forces duration zero while retaining the requested insets. */
  readonly reducedMotion?: boolean;
}
export interface InteractionFitBoundsOptions {
  readonly durationMs?: number;
  readonly insets?: Partial<EdgeInsets>;
  readonly reducedMotion?: boolean;
}
/** The controller supplies complete, validated values. Reduced motion forces duration zero. */
export interface NormalizedCameraTransition {
  readonly durationMs: number;
  readonly insets: EdgeInsets;
  readonly reducedMotion: boolean;
}
/** Detached selection data; engine properties, DOM and native events are never exposed. */
export interface MapSelection {
  readonly key: string;
  readonly id: string;
  readonly kind: 'marker' | 'poi' | 'cluster';
  readonly coordinate: MapCamera['center'];
  readonly label: string;
  readonly sourceId?: string;
  readonly layerId?: string;
  readonly priority?: number;
  readonly distancePixels?: number;
  readonly clusterId?: string | number;
  readonly count?: number;
}
export type MapInteractionEvent =
  | {
      readonly type: 'camera';
      readonly camera: MapCamera;
      readonly origin: 'gesture' | 'api' | 'unknown';
    }
  | { readonly type: 'selection'; readonly selection: MapSelection | null }
  | { readonly type: 'gesture' }
  | { readonly type: 'destroyed' };
/** Optional extension. Existing MapController commands and timing contracts remain unchanged. */
export interface MapInteractionController {
  transitionCamera(camera: MapCamera, options?: CameraTransitionOptions): Promise<void>;
  fitBounds(
    bounds: MapBounds,
    fit?: InteractionFitBoundsOptions,
    options?: OperationOptions,
  ): Promise<void>;
  setMarkers(markers: readonly MapMarker[], options?: OperationOptions): Promise<void>;
  /** At most eight unique keys, ordered by priority, pixel distance, then key. */
  pickFeatures(point: ScreenPoint, options?: OperationOptions): Promise<readonly MapSelection[]>;
  selectFeature(selection: MapSelection | null, options?: OperationOptions): Promise<void>;
  onEvent(listener: (event: MapInteractionEvent) => void): () => void;
  destroy(): void;
}
/**
 * Port camera promises settle on actual movement completion; duration zero applies immediately.
 * Stop the current movement in place when context.signal aborts. Never restore an old camera.
 * Emit only portable events. Destroy releases this extension, leaving the base map intact.
 */
export interface MapInteractionPort {
  transitionCamera(
    camera: MapCamera,
    transition: NormalizedCameraTransition,
    context: OperationContext,
  ): void | Promise<void>;
  fitBounds(
    bounds: MapBounds,
    transition: NormalizedCameraTransition,
    context: OperationContext,
  ): void | Promise<void>;
  setMarkers(markers: readonly MapMarker[], context: OperationContext): void | Promise<void>;
  pickFeatures(
    point: ScreenPoint,
    context: OperationContext,
  ): readonly MapSelection[] | Promise<readonly MapSelection[]>;
  selectFeature(selection: MapSelection | null, context: OperationContext): void | Promise<void>;
  subscribe(listener: (event: MapInteractionEvent) => void): () => void;
  destroy(): void;
}

function invalid(detail: string): never {
  throw new KitError('INVALID_ARGUMENT', detail);
}
function text(value: unknown, limit: number, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value) || value.length > limit)
    return invalid('INVALID_SELECTION');
  return value;
}
function finite(value: unknown, low: number, high: number, detail: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high)
    return invalid(detail);
  return value;
}
function coordinateSnapshot(value: MapCamera['center']): MapCamera['center'] {
  if (!Array.isArray(value) || value.length !== 2) return invalid('INVALID_COORDINATE');
  const point = [value[0], value[1]] as const;
  assertMercatorCoordinate(point);
  return Object.freeze(point);
}
function cameraSnapshot(camera: MapCamera): MapCamera {
  return validateCamera({
    center: coordinateSnapshot(camera?.center),
    zoom: camera?.zoom,
    bearing: camera?.bearing,
    pitch: camera?.pitch,
  });
}
function transitionSnapshot(options: InteractionFitBoundsOptions = {}): NormalizedCameraTransition {
  if (!options || typeof options !== 'object' || Array.isArray(options))
    return invalid('INVALID_TRANSITION');
  const rawDuration = options.durationMs,
    rawReducedMotion = options.reducedMotion,
    rawInsets = options.insets;
  const duration = finite(
    rawDuration === undefined ? 300 : rawDuration,
    0,
    10000,
    'INVALID_DURATION',
  );
  const reducedMotion = rawReducedMotion === undefined ? false : rawReducedMotion;
  if (typeof reducedMotion !== 'boolean') return invalid('INVALID_REDUCED_MOTION');
  const input = rawInsets === undefined ? {} : rawInsets;
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !['top', 'right', 'bottom', 'left'].includes(key))
  )
    return invalid('INVALID_INSETS');
  const { top, right, bottom, left } = input;
  const insets = Object.freeze({
    top: finite(top === undefined ? 0 : top, 0, 1000, 'INVALID_INSETS'),
    right: finite(right === undefined ? 0 : right, 0, 1000, 'INVALID_INSETS'),
    bottom: finite(bottom === undefined ? 0 : bottom, 0, 1000, 'INVALID_INSETS'),
    left: finite(left === undefined ? 0 : left, 0, 1000, 'INVALID_INSETS'),
  });
  return Object.freeze({ durationMs: reducedMotion ? 0 : duration, insets, reducedMotion });
}
function selectionSnapshot(input: MapSelection): MapSelection {
  if (!input || typeof input !== 'object') return invalid('INVALID_SELECTION');
  const {
    key,
    id,
    kind,
    coordinate: rawCoordinate,
    label,
    sourceId,
    layerId,
    priority,
    distancePixels,
    clusterId,
    count,
  } = input;
  if (!['marker', 'poi', 'cluster'].includes(kind)) return invalid('INVALID_SELECTION');
  const coordinate = coordinateSnapshot(rawCoordinate);
  const selection: MapSelection = {
    key: text(key, 512),
    id: text(id, 512),
    kind,
    coordinate,
    label: text(label, 500, true),
    ...(sourceId !== undefined ? { sourceId: text(sourceId, 512) } : {}),
    ...(layerId !== undefined ? { layerId: text(layerId, 512) } : {}),
    ...(priority !== undefined
      ? { priority: finite(priority, -1000000, 1000000, 'INVALID_SELECTION') }
      : {}),
    ...(distancePixels !== undefined
      ? { distancePixels: finite(distancePixels, 0, 10000000, 'INVALID_SELECTION') }
      : {}),
    ...(clusterId !== undefined
      ? {
          clusterId:
            typeof clusterId === 'number'
              ? finite(clusterId, 0, Number.MAX_SAFE_INTEGER, 'INVALID_SELECTION')
              : text(clusterId, 512),
        }
      : {}),
    ...(count !== undefined ? { count: finite(count, 1, 10000000, 'INVALID_SELECTION') } : {}),
  };
  if (
    (typeof selection.clusterId === 'number' && !Number.isSafeInteger(selection.clusterId)) ||
    (selection.count !== undefined && !Number.isSafeInteger(selection.count))
  )
    return invalid('INVALID_SELECTION');
  return Object.freeze(selection);
}
function selectedResults(values: readonly MapSelection[]): readonly MapSelection[] {
  if (!Array.isArray(values) || values.length > 10000) return invalid('SELECTION_LIMIT');
  const sorted = Array.from(values, selectionSnapshot).sort(
    (a, b) =>
      (a.priority ?? 0) - (b.priority ?? 0) ||
      (a.distancePixels ?? Infinity) - (b.distancePixels ?? Infinity) ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
  const seen = new Set<string>();
  return Object.freeze(
    sorted
      .filter((selection) => {
        if (seen.has(selection.key)) return false;
        seen.add(selection.key);
        return true;
      })
      .slice(0, 8),
  );
}
function operationSnapshot(options: OperationOptions = {}): OperationOptions {
  if (!options || typeof options !== 'object' || Array.isArray(options))
    return invalid('INVALID_OPERATION');
  const signal = options.signal,
    timeoutMs = options.timeoutMs;
  if (
    signal !== undefined &&
    (!signal || typeof signal.aborted !== 'boolean' || typeof signal.subscribe !== 'function')
  )
    return invalid('INVALID_CANCELLATION_SIGNAL');
  return { ...(signal ? { signal } : {}), ...(timeoutMs !== undefined ? { timeoutMs } : {}) };
}
function markersSnapshot(markers: readonly MapMarker[]): readonly MapMarker[] {
  if (!Array.isArray(markers) || markers.length > 10000) return invalid('MARKER_LIMIT');
  const ids = new Set<string>();
  return Object.freeze(
    Array.from(markers, (marker) => {
      const id = marker?.id,
        label = marker?.label,
        description = marker?.description;
      const coordinate = coordinateSnapshot(marker?.coordinate);
      if (
        typeof id !== 'string' ||
        !id ||
        ids.has(id) ||
        typeof label !== 'string' ||
        !label ||
        label.length > 500 ||
        (description !== undefined &&
          (typeof description !== 'string' || description.length > 5000))
      )
        return invalid('INVALID_MARKER');
      ids.add(id);
      return Object.freeze({
        id,
        coordinate,
        label,
        ...(description !== undefined ? { description } : {}),
      });
    }),
  );
}

/**
 * Pure orchestration; timers, rendering and resource requests belong to injected ports.
 * A new camera/fit/selection operation supersedes the previous movement. Gesture, caller
 * cancellation, movement timeout and destruction signal the adapter and reject ABORTED.
 * Movement stops in place; no rollback command is sent. Non-movement timeouts remain TIMEOUT.
 */
export function createMapInteractionController(
  port: MapInteractionPort,
  scheduler: Scheduler,
): MapInteractionController {
  if (
    !port ||
    [
      'transitionCamera',
      'fitBounds',
      'setMarkers',
      'pickFeatures',
      'selectFeature',
      'subscribe',
      'destroy',
    ].some((name) => typeof port[name as keyof MapInteractionPort] !== 'function') ||
    typeof scheduler?.schedule !== 'function'
  )
    return invalid('INVALID_INTERACTION_PORT');
  let destroyed = false;
  const lifetime = createCancellationSource();
  let motion: ReturnType<typeof createCancellationSource> | undefined;
  const listeners = new Set<(event: MapInteractionEvent) => void>();
  let detachPort = () => {};
  function emit(event: MapInteractionEvent) {
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch {
        /* User callbacks cannot interrupt cancellation or other listeners. */
      }
    }
  }
  function stop(callPort: boolean) {
    if (destroyed) return;
    destroyed = true;
    lifetime.cancel();
    motion?.cancel();
    motion = undefined;
    try {
      detachPort();
    } finally {
      emit(Object.freeze({ type: 'destroyed' }));
      listeners.clear();
      if (callPort) port.destroy();
    }
  }
  const offPort = port.subscribe((event) => {
    if (destroyed) return;
    try {
      if (event.type === 'gesture') {
        motion?.cancel();
        emit(Object.freeze({ type: 'gesture' }));
      } else if (event.type === 'camera') {
        if (!['gesture', 'api', 'unknown'].includes(event.origin)) return;
        if (event.origin === 'gesture') motion?.cancel();
        const camera = cameraSnapshot(event.camera);
        emit(Object.freeze({ type: 'camera', camera, origin: event.origin }));
      } else if (event.type === 'selection') {
        emit(
          Object.freeze({
            type: 'selection',
            selection: event.selection === null ? null : selectionSnapshot(event.selection),
          }),
        );
      } else if (event.type === 'destroyed') stop(false);
    } catch {
      /* Reject malformed adapter events without exposing raw engine values. */
    }
  });
  if (typeof offPort !== 'function') return invalid('INVALID_INTERACTION_PORT');
  if (destroyed) offPort();
  else detachPort = offPort;

  function invoke<T>(
    operation: (context: OperationContext) => T | Promise<T>,
    options: OperationOptions,
    isMotion = false,
  ): Promise<T> {
    if (destroyed) return Promise.reject(new KitError('UNAVAILABLE', 'INTERACTION_DESTROYED'));
    const cancellation = createCancellationSource();
    let offCaller = () => {};
    const offLifetime = lifetime.signal.subscribe(cancellation.cancel);
    try {
      offCaller = options.signal?.subscribe(cancellation.cancel) ?? offCaller;
    } catch (error) {
      offLifetime();
      return Promise.reject(normalizeError(error));
    }
    return runOperation(
      (context) => {
        if (isMotion) {
          const previous = motion;
          motion = cancellation;
          previous?.cancel();
        }
        return operation(context);
      },
      { ...options, signal: cancellation.signal },
      scheduler,
    )
      .catch((error: unknown) => {
        const safe = normalizeError(error);
        if (isMotion && safe.code === 'TIMEOUT')
          throw new KitError('ABORTED', 'TRANSITION_ABORTED');
        throw safe;
      })
      .finally(() => {
        offLifetime();
        offCaller();
        if (motion === cancellation) motion = undefined;
      });
  }
  function checked<T>(build: () => Promise<T>): Promise<T> {
    try {
      return build();
    } catch (error) {
      return Promise.reject(normalizeError(error));
    }
  }
  return {
    transitionCamera(camera, options = {}) {
      return checked(() => {
        const value = cameraSnapshot(camera),
          transition = transitionSnapshot(options),
          operation = operationSnapshot(options);
        return invoke(
          (context) => port.transitionCamera(value, transition, context),
          operation,
          true,
        );
      });
    },
    fitBounds(bounds, fit = {}, options = {}) {
      return checked(() => {
        const value = Object.freeze(
            validateBounds({
              west: bounds?.west,
              south: bounds?.south,
              east: bounds?.east,
              north: bounds?.north,
            }),
          ),
          transition = transitionSnapshot(fit),
          operation = operationSnapshot(options);
        return invoke((context) => port.fitBounds(value, transition, context), operation, true);
      });
    },
    setMarkers(markers, options = {}) {
      return checked(() => {
        const value = markersSnapshot(markers);
        return invoke((context) => port.setMarkers(value, context), operationSnapshot(options));
      });
    },
    pickFeatures(point, options = {}) {
      return checked(() => {
        const value = Object.freeze({
          x: finite(point?.x, 0, 10000000, 'INVALID_SCREEN_POINT'),
          y: finite(point?.y, 0, 10000000, 'INVALID_SCREEN_POINT'),
        });
        return invoke(async (context) => {
          const selected = await port.pickFeatures(value, context);
          if (context.signal.aborted) throw new KitError('ABORTED', 'OPERATION_ABORTED');
          return selectedResults(selected);
        }, operationSnapshot(options));
      });
    },
    selectFeature(selection, options = {}) {
      return checked(() => {
        const value = selection === null ? null : selectionSnapshot(selection);
        return invoke(
          (context) => port.selectFeature(value, context),
          operationSnapshot(options),
          true,
        );
      });
    },
    onEvent(listener) {
      if (destroyed) throw new KitError('UNAVAILABLE', 'INTERACTION_DESTROYED');
      if (typeof listener !== 'function') return invalid('INVALID_INTERACTION_LISTENER');
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    destroy() {
      try {
        stop(true);
      } catch (error) {
        throw normalizeError(error);
      }
    },
  };
}
