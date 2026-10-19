import { assertLngLat, KitError } from './base.js';
import type { LocationFix, LocationProvider, OperationOptions, Scheduler } from './contracts.js';
import { createCancellationSource, LocationError, runOperation } from './operations.js';

export interface LocationObserver {
  onLocation(fix: LocationFix): void;
  /** Terminal error: the subscription is stopped before this callback. No raw OS message. */
  onError(error: LocationError): void;
}
export interface LocationSubscription {
  stop(): void;
}
export interface LocationStreamProvider extends LocationProvider {
  watchPosition(
    observer: LocationObserver,
    options?: OperationOptions,
  ): Promise<LocationSubscription>;
}
export interface LocationClient extends LocationStreamProvider {
  setConsent(granted: boolean): void;
  /** Foreground only. Returning to the foreground never restarts collection automatically. */
  setForeground(active: boolean): void;
  dispose(): void;
}
export function validateLocationFix(fix: LocationFix): LocationFix {
  if (
    !fix ||
    !Number.isFinite(fix.accuracyMeters) ||
    fix.accuracyMeters < 0 ||
    fix.accuracyMeters > 100000 ||
    !Number.isFinite(fix.timestampMs) ||
    fix.timestampMs < 0 ||
    fix.timestampMs > 253402300799999
  )
    throw new KitError('INVALID_ARGUMENT', 'INVALID_LOCATION_FIX');
  assertLngLat(fix.coordinate);
  return {
    coordinate: [...fix.coordinate],
    accuracyMeters: fix.accuracyMeters,
    timestampMs: fix.timestampMs,
  };
}
export function toLocationError(error: unknown): LocationError {
  const code = error instanceof KitError ? error.code : 'UNAVAILABLE';
  return new LocationError(
    code === 'PERMISSION_DENIED' || code === 'TIMEOUT' || code === 'ABORTED' ? code : 'UNAVAILABLE',
  );
}
/** Consent is per client lifetime. No persistence, telemetry or OS access is performed here. */
export function createLocationClient(
  provider: LocationStreamProvider,
  scheduler: Scheduler,
): LocationClient {
  let consent = false,
    foreground = true,
    disposed = false;
  const sessions = new Set<(error?: LocationError) => void>();
  function guard() {
    if (disposed || !foreground) throw new LocationError('UNAVAILABLE');
    if (!consent) throw new LocationError('PERMISSION_DENIED');
  }
  function cancelAll(error: LocationError) {
    for (const stop of [...sessions]) stop(error);
  }
  return {
    setConsent(granted) {
      if (typeof granted !== 'boolean') throw new KitError('INVALID_ARGUMENT', 'INVALID_CONSENT');
      consent = granted;
      if (!granted) cancelAll(new LocationError('PERMISSION_DENIED'));
    },
    setForeground(active) {
      if (typeof active !== 'boolean') throw new KitError('INVALID_ARGUMENT', 'INVALID_FOREGROUND');
      foreground = active;
      if (!active) cancelAll(new LocationError('UNAVAILABLE'));
    },
    dispose() {
      disposed = true;
      consent = false;
      cancelAll(new LocationError('ABORTED'));
    },
    async getCurrentPosition(options = {}) {
      guard();
      const source = createCancellationSource();
      const stop = () => source.cancel();
      sessions.add(stop);
      const off = options.signal?.subscribe(stop);
      try {
        return await runOperation(
          async (context) =>
            validateLocationFix(
              await provider.getCurrentPosition({
                signal: context.signal,
                ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
              }),
            ),
          { ...options, signal: source.signal },
          scheduler,
        );
      } catch (error) {
        throw toLocationError(error);
      } finally {
        off?.();
        sessions.delete(stop);
        source.cancel();
      }
    },
    async watchPosition(observer, options = {}) {
      guard();
      const source = createCancellationSource();
      let subscription: LocationSubscription | undefined,
        ended = false;
      let terminalError: LocationError | undefined;
      let off = () => {};
      const stop = (error?: LocationError) => {
        if (ended) return;
        ended = true;
        terminalError = error;
        off();
        sessions.delete(stop);
        source.cancel();
        subscription?.stop();
        if (error) {
          try {
            observer.onError(error);
          } catch {
            /* No private data is logged. */
          }
        }
      };
      sessions.add(stop);
      off = options.signal?.subscribe(() => stop(new LocationError('ABORTED'))) ?? off;
      if (ended) off();
      try {
        await runOperation(
          async (context) => {
            const acquired = await provider.watchPosition(
              {
                onLocation(value) {
                  if (ended) return;
                  let fix: LocationFix;
                  try {
                    fix = validateLocationFix(value);
                  } catch {
                    stop(new LocationError('UNAVAILABLE'));
                    return;
                  }
                  try {
                    observer.onLocation(fix);
                  } catch {
                    stop(new LocationError('UNAVAILABLE'));
                  }
                },
                onError(error) {
                  stop(toLocationError(error));
                },
              },
              {
                signal: source.signal,
                ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
              },
            );
            subscription = acquired;
            if (ended || context.signal.aborted) acquired.stop();
          },
          { ...options, signal: source.signal },
          scheduler,
        );
        return { stop: () => stop() };
      } catch (error) {
        stop();
        throw terminalError ?? toLocationError(error);
      }
    },
  };
}
