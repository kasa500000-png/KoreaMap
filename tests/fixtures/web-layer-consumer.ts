// Authored compile-only consumer contract. The verifier copies this into an isolated tarball install.
import type { MapHandle, WebMapConfig } from 'korea-map-web';
import { createFixtureStyle } from 'korea-map-styles';
import type {
  CustomLayerInterface,
  LayerSpecification,
  Map as MapLibreMap,
  StyleSpecification,
} from 'maplibre-gl';

type Assert<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type IsAny<T> = 0 extends 1 & T ? true : false;
type LayerInput = Parameters<MapHandle['addLayer']>[0];
type CustomInput = Extract<LayerInput, { type: 'custom' }>;
type OnAddMap = Parameters<NonNullable<CustomInput['onAdd']>>[0];

// Callback receivers and the complete official layer union must retain their public types.
export type CompleteLayerContract = Assert<
  Equal<LayerInput, LayerSpecification | CustomLayerInterface>
>;
export type EngineCallbackContract = Assert<Equal<OnAddMap, MapLibreMap>>;
export type LayerIsTyped = Assert<Equal<IsAny<LayerInput>, false>>;
export type CallbackIsTyped = Assert<Equal<IsAny<OnAddMap>, false>>;

declare const map: MapHandle;
const custom: CustomInput = {
  id: 'authored-custom-layer',
  type: 'custom',
  renderingMode: '3d',
  onAdd(engine, gl) {
    const canvas: HTMLCanvasElement = engine.getCanvas();
    const buffer: WebGLBuffer | null = gl.createBuffer();
    void canvas;
    void buffer;
    engine.triggerRepaint();
    // @ts-expect-error A weakened callback receiver must not silently accept unknown methods.
    engine.unavailableKoreaMapMethod();
    // @ts-expect-error The GL callback is a real WebGL context, not an untyped object.
    gl.unavailableKoreaMapMethod();
  },
  render(gl, input) {
    const context: WebGL2RenderingContext = gl;
    context.clear(context.COLOR_BUFFER_BIT);
    // @ts-expect-error Custom render arguments must retain their upstream shape.
    const unavailable = input.unavailableKoreaMapField;
    void unavailable;
  },
  onRemove(engine, gl) {
    const receiver: MapLibreMap = engine;
    const context: WebGLRenderingContext | WebGL2RenderingContext = gl;
    void receiver;
    void context;
  },
};
const officialCustom: CustomLayerInterface = custom;
map.addLayer(officialCustom, 'authored-label-layer');
map.addLayer(custom);

const styleLayer: LayerSpecification = {
  id: 'authored-circle-layer',
  type: 'circle',
  source: 'authored-source',
  paint: { 'circle-radius': 6, 'circle-color': '#245343' },
};
map.addLayer(styleLayer);
const style: StyleSpecification = createFixtureStyle({
  mode: 'local-fixture',
  fixtureId: 'synthetic-v1',
});
const config: WebMapConfig = {
  mode: 'inline',
  style,
  allowedOrigins: [],
  attribution: 'Authored layer contract fixture · MIT',
  costAcknowledged: true,
};
void config;

// @ts-expect-error Custom layers require a render callback.
map.addLayer({ id: 'missing-render', type: 'custom' });
// @ts-expect-error Insertion anchors are strings.
map.addLayer(custom, 42);
map.addLayer({
  id: 'invalid-style-layer',
  type: 'circle',
  source: 'authored-source',
  // @ts-expect-error Circle radius cannot be an arbitrary text value.
  paint: { 'circle-radius': 'wide' },
});
const incompatibleCallbacks = {
  id: 'invalid-receiver',
  type: 'custom' as const,
  render() {},
  onAdd(receiver: string) {
    receiver.toUpperCase();
  },
};
// @ts-expect-error A callback expecting a string cannot receive a MapLibre map.
map.addLayer(incompatibleCallbacks);
