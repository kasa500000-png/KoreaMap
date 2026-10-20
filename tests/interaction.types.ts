import {
  createMapInteractionController,
  type MapController,
  type MapInteractionPort,
  type MapInteractionEvent,
  type MapSelection,
  type Scheduler,
} from 'korea-map-core';

/** Strict public consumer fixture; this function is compiled, never executed. */
export async function interactionConsumer(
  port: MapInteractionPort,
  scheduler: Scheduler,
  legacy: MapController,
) {
  const controller = createMapInteractionController(port, scheduler);
  await controller.transitionCamera(
    { center: [127, 37], zoom: 14, bearing: 0, pitch: 0 },
    { durationMs: 300, insets: { bottom: 180 } },
  );
  await controller.fitBounds(
    { west: 126, south: 36, east: 128, north: 38 },
    { reducedMotion: true },
  );
  await controller.setMarkers([{ id: 'authored', coordinate: [127, 37], label: '합성' }]);
  const values: readonly MapSelection[] = await controller.pickFeatures({ x: 10, y: 20 });
  await controller.selectFeature(values[0] ?? null);
  const off = controller.onEvent((event: MapInteractionEvent) => {
    if (event.type === 'camera') {
      const origin: 'gesture' | 'api' | 'unknown' = event.origin;
      void origin;
    }
    // @ts-expect-error Shared events never expose an engine originalEvent.
    void event.originalEvent;
  });
  off();
  controller.destroy();
  // @ts-expect-error Existing MapController keeps its original API; extension is optional and separate.
  legacy.transitionCamera({ center: [127, 37], zoom: 14, bearing: 0, pitch: 0 });
  await controller.transitionCamera(
    { center: [127, 37], zoom: 14, bearing: 0, pitch: 0 },
    // @ts-expect-error Duration is numeric.
    { durationMs: '300' },
  );
  await controller.fitBounds(
    { west: 126, south: 36, east: 128, north: 38 },
    // @ts-expect-error Insets have named numeric edges.
    { insets: [10, 10, 10, 10] },
  );
  // @ts-expect-error Picked selections are readonly snapshots.
  values.push({ key: 'x', id: 'x', kind: 'poi', coordinate: [127, 37], label: '합성' });
  // @ts-expect-error Portable cancellation needs subscribe rather than platform onabort.
  await controller.pickFeatures({ x: 10, y: 20 }, { signal: { aborted: false, onabort: null } });
  const raw: MapSelection = {
    key: 'x',
    id: 'x',
    kind: 'poi',
    coordinate: [127, 37],
    label: '합성',
    // @ts-expect-error Arbitrary engine properties are excluded from the public selection contract.
    properties: { ignored: true },
  };
  void raw;
}
