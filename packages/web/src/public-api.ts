import {
  createMapController,
  KitError,
  type MapController,
  type MapStyle,
  type MapBounds,
  type OperationContext,
} from 'korea-map-core';
import type { MapHandle, MapStatus } from './index.js';
/** Web bridge keeps legacy synchronous methods available; api is the portable async surface. */
export function createWebController(
  handle: MapHandle,
  replaceStyle: (style: MapStyle, context: OperationContext) => Promise<void>,
  bounds: () => MapBounds,
  fitBounds: (bounds: MapBounds, padding: number) => void,
  getStatus: () => MapStatus = () => handle.diagnostics().status,
): MapController {
  return createMapController(
    {
      execute(command, context) {
        if (getStatus() !== 'ready') throw new KitError('UNAVAILABLE', 'MAP_NOT_READY');
        switch (command.type) {
          case 'center':
            return handle.panTo(command.center);
          case 'zoom':
            return handle.zoomTo(command.zoom);
          case 'camera':
            return handle.setCamera(command.camera);
          case 'bounds':
            return fitBounds(command.bounds, command.padding);
          case 'style':
            return replaceStyle(command.style, context);
          case 'marker':
            return handle.setMarkers([
              ...handle.state.getSnapshot().markers.filter((m) => m.id !== command.marker.id),
              command.marker,
            ]);
          case 'remove-marker':
            return handle.setMarkers(
              handle.state.getSnapshot().markers.filter((m) => m.id !== command.id),
            );
          case 'geojson':
            return handle.setGeoJSON(command.id, command.data);
          case 'remove-geojson':
            return handle.removeGeoJSON(command.id);
        }
      },
      getVisibleBounds: bounds,
      subscribe(listener) {
        const off = [
          handle.on('status', (status) => {
            if (status === 'ready' || status === 'destroyed') listener({ type: status });
          }),
          handle.on('camera', (camera) => listener({ type: 'camera', camera })),
          handle.on('click', (coordinate) => listener({ type: 'click', coordinate })),
          handle.on('select', (marker) => listener({ type: 'select', marker })),
          handle.on('idle', () => listener({ type: 'idle' })),
          handle.on('error', ({ code, fatal }) =>
            listener({ type: 'error', error: new KitError('UNAVAILABLE', code), fatal }),
          ),
        ];
        return () => off.forEach((remove) => remove());
      },
      destroy: () => handle.destroy(),
    },
    {
      schedule(callback, delayMs) {
        const timer = setTimeout(callback, delayMs);
        return () => clearTimeout(timer);
      },
    },
  );
}
