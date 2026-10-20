import { assertMercatorCoordinate, KitError } from './base.js';
import type {
  MapCommand,
  MapController,
  MapPort,
  OperationOptions,
  Scheduler,
} from './contracts.js';
import { createCancellationSource, normalizeError, runOperation } from './operations.js';
import {
  assertMapId,
  defineMapStyle,
  routeToGeoJSON,
  validateBounds,
  validateCamera,
  validateGeoJSON,
  validateMarkers,
  validateZoom,
} from './validation.js';

/** Validated, portable controller. Destroy cancels pending work and detaches event subscriptions. */
export function createMapController(port: MapPort, scheduler: Scheduler): MapController {
  let destroyed = false;
  const lifetime = createCancellationSource();
  const subscriptions = new Set<() => void>();
  function invoke<T>(
    operation: Parameters<typeof runOperation<T>>[0],
    options: OperationOptions = {},
  ): Promise<T> {
    if (destroyed) return Promise.reject(new KitError('UNAVAILABLE', 'MAP_DESTROYED'));
    const cancellation = createCancellationSource();
    const offLifetime = lifetime.signal.subscribe(cancellation.cancel);
    const offCaller = options.signal?.subscribe(cancellation.cancel) ?? (() => {});
    return runOperation(operation, { ...options, signal: cancellation.signal }, scheduler).finally(
      () => {
        offLifetime();
        offCaller();
      },
    );
  }
  function send(build: () => MapCommand, options?: OperationOptions) {
    // Validation happens synchronously inside runOperation; all public failures are rejections.
    return invoke((context) => port.execute(build(), context), options);
  }
  const api: MapController = {
    setCenter: (center, options) =>
      send(() => {
        assertMercatorCoordinate(center);
        return { type: 'center', center: [...center] };
      }, options),
    setZoom: (zoom, options) => send(() => ({ type: 'zoom', zoom: validateZoom(zoom) }), options),
    setCamera: (camera, options) =>
      send(() => ({ type: 'camera', camera: validateCamera(camera) }), options),
    fitBounds: (bounds, fit = {}, options) =>
      send(() => {
        const padding = fit.padding ?? 0;
        if (!Number.isFinite(padding) || padding < 0 || padding > 1000)
          throw new KitError('INVALID_ARGUMENT', 'INVALID_PADDING');
        return { type: 'bounds', bounds: validateBounds(bounds), padding };
      }, options),
    setStyle: (style, options) =>
      send(
        () => ({ type: 'style', style: defineMapStyle(style?.document, style?.attribution) }),
        options,
      ),
    addMarker: (marker, options) =>
      send(() => ({ type: 'marker', marker: validateMarkers([marker])[0]! }), options),
    removeMarker: (id, options) =>
      send(() => {
        if (typeof id !== 'string' || !id) throw new KitError('INVALID_ARGUMENT', 'INVALID_MARKER');
        return { type: 'remove-marker', id };
      }, options),
    addGeoJSON: (id, data, options) =>
      send(() => {
        assertMapId(id);
        return { type: 'geojson', id, data: validateGeoJSON(data) };
      }, options),
    removeGeoJSON: (id, options) =>
      send(() => {
        assertMapId(id);
        return { type: 'remove-geojson', id };
      }, options),
    showRoute: (route, options) =>
      send(() => ({ type: 'geojson', id: route.id, data: routeToGeoJSON(route) }), options),
    getVisibleBounds: (options) =>
      invoke(async (context) => validateBounds(await port.getVisibleBounds(context)), options),
    onEvent(listener) {
      if (destroyed) throw new KitError('UNAVAILABLE', 'MAP_DESTROYED');
      const off = port.subscribe((event) => {
        try {
          listener(event);
        } catch {
          /* User callbacks do not break the adapter. */
        }
      });
      let active = true;
      const unsubscribe = () => {
        if (!active) return;
        active = false;
        subscriptions.delete(unsubscribe);
        off();
      };
      subscriptions.add(unsubscribe);
      return unsubscribe;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      lifetime.cancel();
      try {
        port.destroy();
      } catch (error) {
        throw normalizeError(error);
      } finally {
        for (const off of subscriptions) off();
        subscriptions.clear();
      }
    },
  };
  return api;
}
