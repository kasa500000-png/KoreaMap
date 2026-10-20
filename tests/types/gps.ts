import {
  createLocationClient,
  createTrackRecorder,
  exportTracksGPX,
  importTracksGPX,
  tracksToFeatureCollection,
  createTrackReplay,
  type LocationStreamProvider,
  type LocationProvider,
  type MapController,
  type TrackingClock,
  type Scheduler,
} from 'korea-map-core';
export async function trackConsumer(
  provider: LocationStreamProvider,
  clock: TrackingClock,
  scheduler: Scheduler,
  map: MapController,
) {
  const client = createLocationClient(provider, scheduler);
  const compatible: LocationProvider = client;
  client.setConsent(true);
  const recorder = createTrackRecorder('sample', clock);
  recorder.start();
  recorder.ingest(await compatible.getCurrentPosition());
  const subscription = await client.watchPosition({
    onLocation: (fix) => {
      recorder.ingest(fix);
    },
    onError: () => {
      recorder.pause();
    },
  });
  subscription.stop();
  recorder.pause();
  recorder.resume();
  const result = recorder.stop();
  await map.addGeoJSON(
    'tracks',
    tracksToFeatureCollection(importTracksGPX(exportTracksGPX([result.track]))),
  );
  const replay = createTrackReplay(result.track, clock, scheduler, () => {});
  replay.destroy();
  // @ts-expect-error The SDK needs explicit boolean consent.
  client.setConsent('granted');
  // @ts-expect-error Accuracy is meters, not a string or GPX HDOP.
  recorder.ingest({ coordinate: [127, 37], timestampMs: 0, accuracyMeters: '8' });
  client.dispose();
}
