import {
  assertMercatorCoordinate,
  validateMapConfig,
  type LocalMapConfig,
  type LngLat,
} from '@korea-map-kit/core';
import { createFixtureStyle } from '@korea-map-kit/styles';
import type { Map as LibreMap } from 'maplibre-gl';

export interface CreateMapOptions {
  readonly container: HTMLElement;
  readonly config: LocalMapConfig;
  /** Absolute same-origin path to the locally hosted MapLibre worker module. */
  readonly workerUrl: string;
  readonly center?: LngLat;
}
export interface MapHandle {
  readonly map: LibreMap;
  destroy(): void;
}

/** Validate before importing/constructing the renderer; safe to import during SSR. */
export async function createMap(options: CreateMapOptions): Promise<MapHandle> {
  const config = validateMapConfig(options.config);
  const center = options.center ?? [126.978, 37.5665];
  assertMercatorCoordinate(center);
  if (typeof options.workerUrl !== 'string' || !/^\/(?!\/)[^\\\s]+\.mjs$/.test(options.workerUrl)) {
    throw new Error('A same-origin worker module path is required');
  }
  const { Map, setWorkerUrl } = await import('maplibre-gl');
  setWorkerUrl(options.workerUrl);
  const map = new Map({
    container: options.container,
    style: createFixtureStyle(config),
    center: [...center],
    zoom: 13,
    attributionControl: { compact: false },
    // This foundation has no remote assets. Reject unexpected renderer requests.
    transformRequest: () => {
      throw new Error('Fixture mode forbids remote resources');
    },
  });
  let removed = false;
  return {
    map,
    destroy() {
      if (!removed) {
        map.remove();
        removed = true;
      }
    },
  };
}
