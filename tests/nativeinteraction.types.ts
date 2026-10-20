import type { MapCamera, MapController, MapInteractionController } from 'korea-map-core';
import type {
  MapViewProps,
  NativeBridge,
  NativeCameraStop,
} from '../packages/native/dist/index.js';

declare const controller: MapController;
declare const interactions: MapInteractionController;
declare const camera: MapCamera;
const props: MapViewProps = {
  config: { mode: 'local-fixture', fixtureId: 'synthetic-v1' },
  ref: { current: controller },
  markerClustering: { radius: 48, maxZoom: 13 },
  interactionPoiLayers: ['operator-poi'],
  onInteractionsReady(extension) {
    const optional: MapInteractionController | null = extension;
    void optional?.transitionCamera(camera, { durationMs: 300, insets: { bottom: 180 } });
  },
};
void props;
void interactions.fitBounds(
  { west: 126, south: 36, east: 128, north: 38 },
  { insets: { top: 20 }, reducedMotion: true },
);
// @ts-expect-error camera motion remains an optional extension of the existing MapController.
void controller.transitionCamera(camera);
declare const screenBounds: [[number, number], [number, number]];
const invalidStop: NativeCameraStop = {
  // @ts-expect-error native camera bounds are geographic coordinates rather than screen query bounds.
  bounds: screenBounds,
  duration: 0,
};
void invalidStop;
const compatibleOldBridge: NativeBridge = {
  setCamera: async () => {},
  getBounds: async () => [126, 36, 128, 38],
};
void compatibleOldBridge;
