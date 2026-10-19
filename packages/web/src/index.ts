import {
  KitError,
  type CameraState,
  type LngLat,
  type MapMarker,
  type MapFeatureCollection,
} from '@korea-map-kit/core';
import { createFixtureStyle } from '@korea-map-kit/styles';
import type {
  Map as LibreMap,
  Popup as LibrePopup,
  GeoJSONSource,
  LayerSpecification,
  CustomLayerInterface,
} from 'maplibre-gl';
import { createMapState, type MapState } from './state.js';
import { validateGeoJSON } from './geojson.js';
import {
  validateWebConfig,
  resourceUrl,
  escapeAttribution,
  type WebMapConfig,
} from './provider.js';
export { createMapState, type MapState, type MapSnapshot } from './state.js';
export type { WebMapConfig } from './provider.js';
export type { CameraState, MapMarker, MapFeatureCollection } from '@korea-map-kit/core';
export type MapStatus = 'loading' | 'ready' | 'error' | 'destroyed';
export interface MapEvents {
  status: MapStatus;
  camera: CameraState;
  select: MapMarker | null;
  click: LngLat;
  idle: undefined;
  error: { code: 'MAP_LOAD_FAILED' | 'MAP_RESOURCE_FAILED'; fatal: boolean };
}
export interface CreateMapOptions {
  container: HTMLElement;
  config: WebMapConfig;
  workerUrl: string;
  state?: MapState;
  signal?: AbortSignal;
  loadTimeoutMs?: number;
}
export interface MapHandle {
  readonly state: MapState;
  readonly ready: Promise<void>;
  on<K extends keyof MapEvents>(event: K, callback: (value: MapEvents[K]) => void): () => void;
  setCamera(camera: CameraState): void;
  panTo(center: LngLat): void;
  zoomTo(zoom: number): void;
  rotateTo(bearing: number): void;
  setMarkers(markers: readonly MapMarker[]): void;
  selectMarker(id: string | null): void;
  setGeoJSON(id: string, data: MapFeatureCollection): void;
  removeGeoJSON(id: string): void;
  setRoute(id: string, coordinates: readonly LngLat[]): void;
  addLayer(layer: LayerSpecification | CustomLayerInterface, beforeId?: string): void;
  removeLayer(id: string): void;
  resize(): void;
  diagnostics(): {
    status: MapStatus;
    listeners: number;
    observing: boolean;
    renderedMarkers: number;
  };
  destroy(): void;
}
let activeWorker = '';
const markerSource = 'kmk-markers';
const markerLayer = 'kmk-marker-points';
const selectedLayer = 'kmk-marker-selected';
/** Importable on the server. Construction and the renderer import occur only in a browser. */
export async function createMap(options: CreateMapOptions): Promise<MapHandle> {
  const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
  const config = validateWebConfig(options.config, origin);
  if (typeof window === 'undefined') throw new KitError('UNAVAILABLE', 'CLIENT_ONLY');
  if (!/^\/(?!\/)[^\\\s?#]+\.mjs$/.test(options.workerUrl))
    throw new KitError('INVALID_ARGUMENT', 'LOCAL_WORKER_REQUIRED');
  const timeoutMs = options.loadTimeoutMs ?? 15000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1)
    throw new KitError('INVALID_ARGUMENT', 'INVALID_TIMEOUT');
  const signal = options.signal;
  if (signal?.aborted) throw new KitError('ABORTED', 'MAP_ABORTED');
  const { Map, Popup, NavigationControl, setWorkerUrl } = await import('maplibre-gl');
  if (signal?.aborted) throw new KitError('ABORTED', 'MAP_ABORTED');
  if (activeWorker && activeWorker !== options.workerUrl)
    throw new KitError('INVALID_ARGUMENT', 'WORKER_CONFLICT');
  setWorkerUrl(options.workerUrl);
  const state = options.state ?? createMapState();
  const camera = state.getSnapshot().camera;
  let engine: LibreMap | undefined = new Map({
    container: options.container,
    style: config.mode === 'local-fixture' ? createFixtureStyle(config) : config.styleUrl,
    center: [...camera.center],
    zoom: camera.zoom,
    bearing: camera.bearing,
    pitch: camera.pitch,
    maxPitch: 60,
    maxZoom: 22,
    attributionControl: {
      compact: false,
      ...(config.mode === 'operator'
        ? { customAttribution: escapeAttribution(config.attribution) }
        : {}),
    },
    transformRequest: (url) => ({ url: resourceUrl(config, url, origin) }),
  });
  activeWorker = options.workerUrl;
  let status: MapStatus = 'loading';
  let disposed = false;
  let syncingCamera = false;
  let popup: LibrePopup | undefined;
  let popupClose: (() => void) | undefined;
  let frame = 0;
  let observer: ResizeObserver | undefined;
  let unsubscribe = () => {};
  const listeners: (() => void)[] = [];
  const callbacks = new MapCallbacks();
  const overlays = new globalThis.Map<string, MapFeatureCollection>();
  const customLayers = new Set<string>();
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  void ready.catch(() => {});
  const timer = setTimeout(() => fail(), timeoutMs);
  const selector = document.createElement('select');
  selector.setAttribute('aria-label', '지도 장소 선택');
  selector.className = 'kmk-place-selector';
  Object.assign(selector.style, {
    position: 'absolute',
    top: '12px',
    left: '12px',
    zIndex: '2',
    maxWidth: '65%',
  });
  options.container.append(selector);
  const canvas = engine.getCanvas();
  canvas.setAttribute('aria-label', '지도: 방향키로 이동, 더하기/빼기로 확대 및 축소');
  engine.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
  function requireMap(): LibreMap {
    if (!engine || disposed) throw new KitError('UNAVAILABLE', 'MAP_DESTROYED');
    return engine;
  }
  function emit<K extends keyof MapEvents>(event: K, value: MapEvents[K]) {
    callbacks.emit(event, value);
  }
  function closePopup() {
    if (popupClose) popup?.off('close', popupClose);
    popup?.remove();
    popup = undefined;
    popupClose = undefined;
  }
  function renderSelection() {
    if (status !== 'ready' || !engine) return;
    const snapshot = state.getSnapshot();
    const marker = snapshot.markers.find((m) => m.id === snapshot.selectedId);
    engine.setFilter(selectedLayer, ['==', ['get', 'id'], marker?.id ?? '']);
    selector.value = marker?.id ?? '';
    closePopup();
    if (marker) {
      const card = document.createElement('article');
      card.setAttribute('aria-label', '장소 카드');
      const title = document.createElement('h3');
      title.textContent = marker.label;
      const description = document.createElement('p');
      description.textContent = marker.description ?? '';
      card.append(title, description);
      popup = new Popup({ closeOnClick: false, maxWidth: '280px', focusAfterOpen: true })
        .setLngLat([...marker.coordinate])
        .setDOMContent(card)
        .addTo(engine);
      popupClose = () => {
        state.selectMarker(null);
        selector.focus();
      };
      popup.on('close', popupClose);
    }
  }
  function renderMarkers() {
    if (status !== 'ready' || !engine) return;
    const markers = state.getSnapshot().markers;
    (engine.getSource(markerSource) as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: markers.map((m) => ({
        type: 'Feature',
        properties: { id: m.id },
        geometry: { type: 'Point', coordinates: [...m.coordinate] },
      })),
    });
    selector.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = `장소 선택 (${markers.length})`;
    selector.append(placeholder);
    for (const marker of markers) {
      const option = document.createElement('option');
      option.value = marker.id;
      option.textContent = marker.label;
      selector.append(option);
    }
    renderSelection();
  }
  function renderOverlay(id: string, data: MapFeatureCollection) {
    const map = requireMap();
    const source = `kmk-data-${id}`;
    const existing = map.getSource(source) as GeoJSONSource | undefined;
    if (existing) {
      existing.setData(data);
      return;
    }
    map.addSource(source, { type: 'geojson', data });
    map.addLayer({
      id: `${source}-fill`,
      source,
      type: 'fill',
      filter: ['==', '$type', 'Polygon'],
      paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.3 },
    });
    map.addLayer({
      id: `${source}-line`,
      source,
      type: 'line',
      filter: ['!=', '$type', 'Point'],
      paint: { 'line-color': '#2563eb', 'line-width': 4 },
    });
    map.addLayer({
      id: `${source}-point`,
      source,
      type: 'circle',
      filter: ['==', '$type', 'Point'],
      paint: { 'circle-color': '#a855f7', 'circle-radius': 7 },
    });
  }
  function cleanup(finalStatus: 'error' | 'destroyed') {
    if (disposed) return;
    disposed = true;
    status = finalStatus;
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    unsubscribe();
    unsubscribe = () => {};
    observer?.disconnect();
    observer = undefined;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    closePopup();
    selector.removeEventListener('change', select);
    selector.remove();
    selector.replaceChildren();
    for (const off of listeners.splice(0)) off();
    try {
      engine?.stop();
      engine?.remove();
    } finally {
      engine = undefined;
    }
    overlays.clear();
    customLayers.clear();
    rejectReady(
      new KitError(
        finalStatus === 'destroyed' ? 'ABORTED' : 'UNAVAILABLE',
        finalStatus === 'destroyed' ? 'MAP_DESTROYED' : 'MAP_LOAD_FAILED',
      ),
    );
    emit('status', status);
    callbacks.clear();
  }
  function fail() {
    if (disposed) return;
    emit('error', { code: 'MAP_LOAD_FAILED', fatal: true });
    cleanup('error');
  }
  function abort() {
    cleanup('destroyed');
  }
  function select() {
    state.selectMarker(selector.value || null);
  }
  selector.addEventListener('change', select);
  signal?.addEventListener('abort', abort, { once: true });
  function listen(event: 'load' | 'error' | 'move' | 'idle', callback: () => void) {
    const map = requireMap();
    map.on(event, callback);
    listeners.push(() => map.off(event, callback));
  }
  listen('load', () => {
    if (!engine || disposed) return;
    try {
      const style = engine.getStyle();
      if (
        Object.keys(style.sources).some((id) => id.startsWith('kmk-')) ||
        style.layers.some((layer) => layer.id.startsWith('kmk-'))
      )
        throw new KitError('INVALID_ARGUMENT', 'RESERVED_LAYER_ID');
      engine.addSource(markerSource, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      engine.addLayer({
        id: markerLayer,
        source: markerSource,
        type: 'circle',
        paint: {
          'circle-color': '#0369a1',
          'circle-radius': 5,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff',
        },
      });
      engine.addLayer({
        id: selectedLayer,
        source: markerSource,
        type: 'circle',
        filter: ['==', ['get', 'id'], ''],
        paint: { 'circle-color': '#e11d48', 'circle-radius': 9 },
      });
      status = 'ready';
      clearTimeout(timer);
      renderMarkers();
      for (const [id, data] of overlays) renderOverlay(id, data);
      emit('status', status);
      resolveReady();
    } catch {
      fail();
    }
  });
  listen('error', () => {
    if (status === 'loading') fail();
    else emit('error', { code: 'MAP_RESOURCE_FAILED', fatal: false });
  });
  listen('move', () => {
    if (!engine) return;
    const center = engine.getCenter();
    syncingCamera = true;
    try {
      state.setCamera({
        center: [center.wrap().lng, center.lat],
        zoom: engine.getZoom(),
        bearing: engine.getBearing(),
        pitch: engine.getPitch(),
      });
    } finally {
      syncingCamera = false;
    }
    emit('camera', state.getSnapshot().camera);
  });
  listen('idle', () => emit('idle', undefined));
  const click = (event: {
    point: { x: number; y: number };
    lngLat: { lng: number; lat: number };
  }) => {
    if (status !== 'ready' || !engine) return;
    const feature = engine.queryRenderedFeatures([event.point.x, event.point.y], {
      layers: [markerLayer],
    })[0];
    const id = feature?.properties['id'];
    if (typeof id === 'string') state.selectMarker(id);
    emit('click', [event.lngLat.lng, event.lngLat.lat]);
  };
  engine.on('click', click);
  listeners.push(() => {
    engine?.off('click', click);
  });
  let previous = state.getSnapshot();
  unsubscribe = state.subscribe(() => {
    if (!engine) return;
    const next = state.getSnapshot();
    const prior = previous;
    previous = next;
    if (next.camera !== prior.camera && !syncingCamera)
      engine.jumpTo({ ...next.camera, center: [...next.camera.center] });
    if (next.markers !== prior.markers) renderMarkers();
    else if (next.selectedId !== prior.selectedId) renderSelection();
    if (next.selectedId !== prior.selectedId)
      emit('select', next.markers.find((m) => m.id === next.selectedId) ?? null);
  });
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => {
      if (!frame && !disposed)
        frame = requestAnimationFrame(() => {
          frame = 0;
          engine?.resize();
        });
    });
    observer.observe(options.container);
  }
  function validId(id: string) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id))
      throw new KitError('INVALID_ARGUMENT', 'INVALID_LAYER_ID');
  }
  const handle: MapHandle = {
    state,
    ready,
    on: (event, callback) => {
      requireMap();
      return callbacks.on(event, callback);
    },
    setCamera(camera) {
      requireMap();
      state.setCamera(camera);
    },
    panTo(center) {
      this.setCamera({ ...state.getSnapshot().camera, center });
    },
    zoomTo(zoom) {
      this.setCamera({ ...state.getSnapshot().camera, zoom });
    },
    rotateTo(bearing) {
      this.setCamera({ ...state.getSnapshot().camera, bearing });
    },
    setMarkers(markers) {
      requireMap();
      state.setMarkers(markers);
    },
    selectMarker(id) {
      requireMap();
      state.selectMarker(id);
    },
    setGeoJSON(id, data) {
      requireMap();
      validId(id);
      const copy = validateGeoJSON(data);
      overlays.set(id, copy);
      if (status === 'ready') renderOverlay(id, copy);
    },
    removeGeoJSON(id) {
      const map = requireMap();
      validId(id);
      for (const suffix of ['point', 'line', 'fill']) {
        const layer = `kmk-data-${id}-${suffix}`;
        if (map.getLayer(layer)) map.removeLayer(layer);
      }
      if (map.getSource(`kmk-data-${id}`)) map.removeSource(`kmk-data-${id}`);
      overlays.delete(id);
    },
    setRoute(id, coordinates) {
      this.setGeoJSON(id, {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: coordinates.map((p) => [...p]) },
          },
        ],
      });
    },
    addLayer(layer, beforeId) {
      const map = requireMap();
      if (status !== 'ready') throw new KitError('UNAVAILABLE', 'MAP_NOT_READY');
      if (layer.id.startsWith('kmk-') || map.getLayer(layer.id))
        throw new KitError('INVALID_ARGUMENT', 'RESERVED_LAYER_ID');
      map.addLayer(layer, beforeId);
      customLayers.add(layer.id);
    },
    removeLayer(id) {
      const map = requireMap();
      if (!customLayers.has(id)) throw new KitError('INVALID_ARGUMENT', 'LAYER_NOT_OWNED');
      map.removeLayer(id);
      customLayers.delete(id);
    },
    resize() {
      requireMap().resize();
    },
    diagnostics() {
      return {
        status,
        listeners: listeners.length,
        observing: !!observer,
        renderedMarkers:
          engine && status === 'ready'
            ? new Set(
                engine
                  .queryRenderedFeatures({ layers: [markerLayer] })
                  .map((feature) => feature.properties['id']),
              ).size
            : 0,
      };
    },
    destroy() {
      cleanup('destroyed');
    },
  };
  return handle;
}
class MapCallbacks {
  private callbacks = new globalThis.Map<keyof MapEvents, Set<(value: never) => void>>();
  on<K extends keyof MapEvents>(event: K, callback: (value: MapEvents[K]) => void) {
    const set = this.callbacks.get(event) ?? new Set();
    this.callbacks.set(event, set);
    set.add(callback as (value: never) => void);
    return () => {
      set.delete(callback as (value: never) => void);
    };
  }
  emit<K extends keyof MapEvents>(event: K, value: MapEvents[K]) {
    for (const callback of this.callbacks.get(event) ?? []) {
      try {
        callback(value as never);
      } catch {
        console.error('Korea Map Kit event callback failed');
      }
    }
  }
  clear() {
    for (const set of this.callbacks.values()) set.clear();
    this.callbacks.clear();
  }
}
