import {
  LocationError,
  validateLocationFix,
  type LocationFix,
  type LocationObserver,
  type LocationStreamProvider,
} from 'korea-map-core';
/** Explicit, manually driven mock GPS. No clock, permission prompt or network runs on import. */
export function createMockLocationProvider() {
  const listeners = new Set<LocationObserver>();
  let latest: LocationFix | null = null;
  const provider: LocationStreamProvider = {
    async getCurrentPosition(options) {
      if (options?.signal?.aborted) throw new LocationError('ABORTED');
      if (!latest) throw new LocationError('UNAVAILABLE');
      return validateLocationFix(latest);
    },
    async watchPosition(observer, options) {
      if (options?.signal?.aborted) throw new LocationError('ABORTED');
      let off = () => {};
      const stop = () => {
        listeners.delete(observer);
        off();
      };
      listeners.add(observer);
      off = options?.signal?.subscribe(stop) ?? off;
      return { stop };
    },
  };
  return {
    provider,
    push(fix: LocationFix) {
      latest = validateLocationFix(fix);
      for (const listener of [...listeners]) listener.onLocation(validateLocationFix(latest));
    },
    fail(code: 'PERMISSION_DENIED' | 'UNAVAILABLE' | 'TIMEOUT') {
      for (const listener of [...listeners]) listener.onError(new LocationError(code));
    },
    clear() {
      latest = null;
    },
    subscriberCount() {
      return listeners.size;
    },
  };
}
