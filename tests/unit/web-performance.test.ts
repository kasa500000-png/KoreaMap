import { afterEach, expect, it, vi } from 'vitest';
import {
  createCancellationSource,
  defineMapStyle,
  type CameraState,
  type MapFeatureCollection,
} from 'korea-map-core';
import { createMap, createMapState, type MapHandle } from 'korea-map-web';
import { createWebController } from '../../packages/web/src/public-api.js';

// Exercise the actual SDK lifecycle/bridge with an instrumented renderer and small DOM double.
// This measures redundant calls and option semantics, not WebGL/browser performance.
class TestNode {
  readonly children: TestNode[] = [];
  readonly attributes = new Map<string, string>();
  readonly style: Record<string, string> = {};
  readonly handlers = new Map<string, Set<() => void>>();
  parent: TestNode | undefined;
  className = '';
  value = '';
  textContent = '';
  clientWidth = 800;
  clientHeight = 600;
  constructor(readonly tag: string) {}
  private insert(node: TestNode) {
    if (node.tag === '#fragment') {
      for (const child of node.children.splice(0)) this.insert(child);
    } else {
      this.children.push(node);
      node.parent = this;
    }
  }
  append = vi.fn((...nodes: TestNode[]) => {
    for (const node of nodes) this.insert(node);
  });
  replaceChildren = vi.fn((...nodes: TestNode[]) => {
    for (const child of this.children) child.parent = undefined;
    this.children.length = 0;
    for (const node of nodes) this.insert(node);
  });
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  addEventListener(name: string, callback: () => void) {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name)!.add(callback);
  }
  removeEventListener(name: string, callback: () => void) {
    this.handlers.get(name)?.delete(callback);
  }
  dispatch(name: string) {
    for (const handler of this.handlers.get(name) ?? []) handler();
  }
  focus = vi.fn();
  remove() {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = undefined;
  }
}
class TestSource {
  constructor(public data: MapFeatureCollection) {}
  setData = vi.fn((data: MapFeatureCollection) => {
    this.data = data;
  });
}
const engines: TestMap[] = [];
class TestMap {
  readonly handlers = new Map<string, Set<(event: unknown) => void>>();
  readonly sources = new Map<string, TestSource>();
  readonly layers = new Map<string, { id: string }>();
  readonly canvas = new TestNode('canvas');
  camera: CameraState;
  constructor(private options: { style: unknown } & CameraState) {
    this.camera = options;
    engines.push(this);
  }
  on(name: string, callback: (event: unknown) => void) {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name)!.add(callback);
  }
  off(name: string, callback: (event: unknown) => void) {
    this.handlers.get(name)?.delete(callback);
  }
  emit(name: string) {
    for (const callback of [...(this.handlers.get(name) ?? [])]) callback({});
  }
  getCanvas() {
    return this.canvas;
  }
  getStyle() {
    return this.options.style;
  }
  addControl() {}
  removeControl() {}
  addSource(id: string, source: { data: MapFeatureCollection }) {
    this.sources.set(id, new TestSource(source.data));
  }
  getSource(id: string) {
    return this.sources.get(id);
  }
  removeSource(id: string) {
    this.sources.delete(id);
  }
  addLayer(layer: { id: string }) {
    this.layers.set(layer.id, layer);
  }
  getLayer(id: string) {
    return this.layers.get(id);
  }
  removeLayer(id: string) {
    this.layers.delete(id);
  }
  getCenter() {
    const [lng, lat] = this.camera.center;
    return { lng, lat, wrap: () => ({ lng, lat }) };
  }
  getZoom() {
    return this.camera.zoom;
  }
  getBearing() {
    return this.camera.bearing;
  }
  getPitch() {
    return this.camera.pitch;
  }
  jumpTo = vi.fn((camera: CameraState) => {
    this.camera = camera;
    this.emit('move');
  });
  queryRenderedFeatures = vi.fn(() =>
    (this.sources.get('kmk-markers')?.data.features ?? []).map((feature) => ({
      ...feature,
      source: 'kmk-markers',
      layer: { id: 'kmk-marker-points' },
    })),
  );
  setStyle(document: unknown) {
    this.options.style = document;
    this.sources.clear();
    this.layers.clear();
    queueMicrotask(() => this.emit('style.load'));
  }
  stop() {}
  remove() {}
}
const popups: TestPopup[] = [];
class TestPopup {
  content: TestNode | undefined;
  constructor() {
    popups.push(this);
  }
  setLngLat() {
    return this;
  }
  setDOMContent(content: TestNode) {
    this.content = content;
    return this;
  }
  addTo() {
    return this;
  }
  on() {
    return this;
  }
  off() {
    return this;
  }
  remove = vi.fn();
}
vi.mock('maplibre-gl', () => ({
  Map: TestMap,
  Popup: TestPopup,
  NavigationControl: class {},
  AttributionControl: class {},
  setWorkerUrl: vi.fn(),
}));

const active: MapHandle[] = [];
afterEach(() => {
  for (const map of active.splice(0)) map.destroy();
  engines.length = 0;
  popups.length = 0;
  vi.unstubAllGlobals();
});
function markers(count = 1000) {
  return Array.from({ length: count }, (_, index) => ({
    id: `marker-${index}`,
    label: `합성 장소 ${index}`,
    coordinate: [127 + index * 0.000001, 37] as const,
  }));
}
async function setup(load = true) {
  const nodes: TestNode[] = [];
  const create = (tag: string) => {
    const node = new TestNode(tag);
    nodes.push(node);
    return node;
  };
  vi.stubGlobal('window', { location: { origin: 'http://localhost' } });
  vi.stubGlobal('document', {
    createElement: create,
    createDocumentFragment: () => create('#fragment'),
  });
  const container = create('main');
  const state = createMapState({ markers: markers() });
  const map = await createMap({
    container: container as unknown as HTMLElement,
    workerUrl: '/worker.mjs',
    config: { mode: 'local-fixture', fixtureId: 'synthetic-v1' },
    state,
  });
  active.push(map);
  const engine = engines.at(-1)!;
  const selector = nodes.find((node) => node.tag === 'select')!;
  if (load) {
    engine.emit('load');
    await map.ready;
  }
  return { map, engine, state, selector, container, nodes };
}

it('keeps all 1000 markers and camera updates while status-only queries fall from 100 to zero', async () => {
  const { map, engine, state, selector } = await setup();
  const legacy = createWebController(
    map,
    async () => {},
    () => ({ west: 126, south: 36, east: 128, north: 38 }),
    () => {},
  );
  const source = engine.getSource('kmk-markers')!;
  const priorMarkers = state.getSnapshot().markers;
  const options = [...selector.children];
  let events = 0;
  map.on('camera', () => events++);
  source.setData.mockClear();
  selector.append.mockClear();
  selector.replaceChildren.mockClear();
  const commands = Array.from({ length: 100 }, (_, index) => ({
    center: [127 + index * 0.000001, 37] as const,
    zoom: 14,
    bearing: 0,
    pitch: 0,
  }));
  for (const camera of commands) await legacy.setCamera(camera);
  expect(engine.queryRenderedFeatures).toHaveBeenCalledTimes(100);
  expect(engine.jumpTo).toHaveBeenCalledTimes(100);
  expect(events).toBe(100);
  engine.queryRenderedFeatures.mockClear();
  engine.jumpTo.mockClear();
  events = 0;
  for (const camera of commands) await map.api.setCamera(camera);
  expect(engine.queryRenderedFeatures).not.toHaveBeenCalled();
  expect(engine.jumpTo).toHaveBeenCalledTimes(100);
  expect(events).toBe(100);
  expect(state.getSnapshot().markers).toBe(priorMarkers);
  expect(source.setData).not.toHaveBeenCalled();
  expect(selector.replaceChildren).not.toHaveBeenCalled();
  expect(selector.append).not.toHaveBeenCalled();
  expect(selector.children).toEqual(options);
  expect(selector.children.every((node, index) => node === options[index])).toBe(true);
  // Explicit diagnostics keeps its original fresh query and actual unique-marker count.
  expect(map.diagnostics().renderedMarkers).toBe(1000);
  expect(engine.queryRenderedFeatures).toHaveBeenCalledTimes(1);
  expect(state.getSnapshot().camera).toEqual(commands.at(-1));
  legacy.destroy();
});

it('batches selector changes once while preserving placeholder, order, selection and accessible card', async () => {
  const { map, engine, selector } = await setup();
  expect(selector.attributes.get('aria-label')).toBe('지도 장소 선택');
  expect(selector.children).toHaveLength(1001);
  expect(selector.children[0]?.textContent).toBe('장소 선택 (1000)');
  expect(selector.children.slice(1).map((node) => node.value)).toEqual(
    markers().map((marker) => marker.id),
  );
  expect(selector.replaceChildren).toHaveBeenCalledTimes(1);
  expect(selector.replaceChildren.mock.calls[0]?.[0]?.tag).toBe('#fragment');
  expect(selector.append).not.toHaveBeenCalled();
  selector.value = 'marker-999';
  selector.dispatch('change');
  expect(map.state.getSnapshot().selectedId).toBe('marker-999');
  expect(popups.at(-1)?.content?.attributes.get('aria-label')).toBe('장소 카드');
  expect(popups.at(-1)?.content?.children[0]?.textContent).toBe('합성 장소 999');
  const changed = markers()
    .reverse()
    .map((marker) =>
      marker.id === 'marker-999' ? { ...marker, label: '변경된 합성 장소' } : marker,
    );
  selector.replaceChildren.mockClear();
  map.setMarkers(changed);
  expect(selector.replaceChildren).toHaveBeenCalledTimes(1);
  expect(selector.value).toBe('marker-999');
  expect(selector.children[1]?.textContent).toBe('변경된 합성 장소');
  expect(popups.at(-1)?.content?.children[0]?.textContent).toBe('변경된 합성 장소');
  const style = defineMapStyle(
    { version: 8, sources: {}, layers: [] },
    'Own synthetic test style MIT',
  );
  await map.api.setStyle(style);
  expect(engine.getSource('kmk-markers')?.data.features).toHaveLength(1000);
  expect(selector.children).toHaveLength(1001);
  expect(selector.value).toBe('marker-999');
  map.setMarkers([]);
  expect(selector.children).toHaveLength(1);
  expect(selector.children[0]?.textContent).toBe('장소 선택 (0)');
  expect(selector.value).toBe('');
  expect(map.state.getSnapshot().selectedId).toBeNull();
});

it('rejects unavailable and pre-cancelled commands without querying markers or moving the map', async () => {
  const { map, engine } = await setup(false);
  await expect(map.api.setZoom(14)).rejects.toThrow('MAP_NOT_READY');
  expect(engine.queryRenderedFeatures).not.toHaveBeenCalled();
  engine.emit('load');
  await map.ready;
  const signal = createCancellationSource();
  signal.cancel();
  await expect(map.api.setZoom(14, { signal: signal.signal })).rejects.toMatchObject({
    code: 'ABORTED',
  });
  expect(engine.jumpTo).not.toHaveBeenCalled();
  expect(engine.queryRenderedFeatures).not.toHaveBeenCalled();
  map.destroy();
  await expect(map.api.setZoom(14)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  expect(engine.queryRenderedFeatures).not.toHaveBeenCalled();
});
