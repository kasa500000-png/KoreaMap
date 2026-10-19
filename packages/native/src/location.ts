import {
  createLocationClient,
  LocationError,
  type LocationClient,
  type LocationFix,
  type LocationObserver,
  type LocationStreamProvider,
  type LocationSubscription,
  type OperationOptions,
  type Scheduler,
} from '@korea-map-kit/core';
/** Structural seam: consumers inject expo-location; it is not a required SDK dependency. */
export interface ExpoLocationPort {
  requestForegroundPermissionsAsync(): Promise<{ granted: boolean }>;
  watchPositionAsync(
    options: { accuracy: 4; timeInterval: number; distanceInterval: number },
    onLocation: (value: {
      coords: { longitude: number; latitude: number; accuracy: number | null };
      timestamp: number;
    }) => void,
    onError?: (reason: string) => void,
  ): Promise<{ remove(): void }>;
}
export interface NativeAppLifecycle {
  readonly currentState: string | null | undefined;
  addEventListener(event: 'change', listener: (state: string) => void): { remove(): void };
}
/** Foreground only; no background task/foreground service or permission is registered. */
export function createExpoLocationClient(
  location: ExpoLocationPort,
  lifecycle: NativeAppLifecycle,
  scheduler: Scheduler,
): LocationClient {
  async function watch(
    observer: LocationObserver,
    options: OperationOptions = {},
  ): Promise<LocationSubscription> {
    if (options.signal?.aborted) throw new LocationError('ABORTED');
    const permission = await location.requestForegroundPermissionsAsync();
    if (options.signal?.aborted) throw new LocationError('ABORTED');
    if (!permission.granted) throw new LocationError('PERMISSION_DENIED');
    let stopped = false,
      native: { remove(): void } | undefined;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      off();
      native?.remove();
    };
    let off = () => {};
    off = options.signal?.subscribe(stop) ?? off;
    try {
      native = await location.watchPositionAsync(
        { accuracy: 4, timeInterval: 1000, distanceInterval: 0 },
        (value) => {
          if (stopped) return;
          if (value.coords.accuracy === null) {
            observer.onError(new LocationError('UNAVAILABLE'));
            return;
          }
          observer.onLocation({
            coordinate: [value.coords.longitude, value.coords.latitude],
            accuracyMeters: value.coords.accuracy,
            timestampMs: value.timestamp,
          });
        },
        () => {
          if (!stopped) observer.onError(new LocationError('UNAVAILABLE'));
        },
      );
      if (stopped) {
        off();
        native.remove();
      }
      return { stop };
    } catch {
      stop();
      throw new LocationError('UNAVAILABLE');
    }
  }
  const provider: LocationStreamProvider = {
    watchPosition: watch,
    getCurrentPosition: (options) =>
      new Promise<LocationFix>((resolve, reject) => {
        let subscription: LocationSubscription | undefined,
          settled = false;
        void watch(
          {
            onLocation(fix) {
              settled = true;
              subscription?.stop();
              resolve(fix);
            },
            onError(error) {
              settled = true;
              subscription?.stop();
              reject(error);
            },
          },
          options,
        ).then((value) => {
          subscription = value;
          if (settled) value.stop();
        }, reject);
      }),
  };
  const client = createLocationClient(provider, scheduler);
  client.setForeground(lifecycle.currentState === 'active');
  const listener = lifecycle.addEventListener('change', (state) =>
    client.setForeground(state === 'active'),
  );
  return {
    ...client,
    dispose() {
      listener.remove();
      client.dispose();
    },
  };
}
