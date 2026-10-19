import {
  createLocationClient,
  LocationError,
  type LocationClient,
  type LocationFix,
  type LocationObserver,
  type LocationStreamProvider,
  type LocationSubscription,
  type OperationOptions,
} from '@korea-map-kit/core';
/** Browser foreground adapter. Construction/import never prompts for permission. */
export function createBrowserLocationClient(
  options: { geolocation?: Geolocation; document?: Document } = {},
): LocationClient {
  const geo =
    options.geolocation ?? (typeof navigator !== 'undefined' ? navigator.geolocation : undefined);
  const page = options.document ?? (typeof document !== 'undefined' ? document : undefined);
  const scheduler = {
    schedule(fn: () => void, ms: number) {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    },
  };
  function watch(
    observer: LocationObserver,
    settings: OperationOptions = {},
  ): LocationSubscription {
    if (!geo) throw new LocationError('UNAVAILABLE');
    if (settings.signal?.aborted) throw new LocationError('ABORTED');
    let stopped = false,
      id: number | undefined,
      off = () => {};
    const stop = () => {
      if (stopped) return;
      stopped = true;
      off();
      if (id !== undefined) geo.clearWatch(id);
    };
    off = settings.signal?.subscribe(stop) ?? off;
    try {
      id = geo.watchPosition(
        (value) => {
          if (!stopped)
            observer.onLocation({
              coordinate: [value.coords.longitude, value.coords.latitude],
              accuracyMeters: value.coords.accuracy,
              timestampMs: value.timestamp,
            });
        },
        (error) => {
          if (!stopped) {
            stop();
            observer.onError(
              new LocationError(
                error.code === 1
                  ? 'PERMISSION_DENIED'
                  : error.code === 3
                    ? 'TIMEOUT'
                    : 'UNAVAILABLE',
              ),
            );
          }
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: settings.timeoutMs ?? 10000 },
      );
      if (stopped) {
        off();
        geo.clearWatch(id);
      }
      return { stop };
    } catch {
      stop();
      throw new LocationError('UNAVAILABLE');
    }
  }
  const provider: LocationStreamProvider = {
    watchPosition: async (observer, settings) => watch(observer, settings),
    getCurrentPosition: (settings) =>
      new Promise<LocationFix>((resolve, reject) => {
        let subscription: LocationSubscription | undefined = undefined,
          settled = false;
        subscription = watch(
          {
            onLocation(fix) {
              settled = true;
              subscription?.stop();
              resolve(fix);
            },
            onError(error) {
              settled = true;
              reject(error);
            },
          },
          settings,
        );
        if (settled) subscription.stop();
      }),
  };
  const client = createLocationClient(provider, scheduler);
  const visibility = () => client.setForeground(!page || page.visibilityState === 'visible');
  visibility();
  page?.addEventListener('visibilitychange', visibility);
  return {
    ...client,
    dispose() {
      page?.removeEventListener('visibilitychange', visibility);
      client.dispose();
    },
  };
}
