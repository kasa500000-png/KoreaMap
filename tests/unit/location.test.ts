import { describe, it, expect, vi } from 'vitest';
import {
  createLocationClient,
  LocationError,
  createCancellationSource,
  type LocationObserver,
  type LocationFix,
  type LocationSubscription,
} from 'korea-map-core';
import { createMockLocationProvider } from 'korea-map-data-adapters';
import { createBrowserLocationClient } from '../../packages/web/src/location.js';
import {
  createExpoLocationClient,
  type ExpoLocationPort,
} from '../../packages/native/src/location.js';
const scheduler = {
  schedule(fn: () => void, ms: number) {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  },
};
const fix: LocationFix = { coordinate: [127, 37.5], accuracyMeters: 8, timestampMs: 1700000000000 };
describe('consent, foreground location and cancellation', () => {
  it('never collects before consent and revocation stops subscriptions', async () => {
    const mock = createMockLocationProvider(),
      client = createLocationClient(mock.provider, scheduler);
    await expect(client.getCurrentPosition()).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(mock.subscriberCount()).toBe(0);
    client.setConsent(true);
    mock.push(fix);
    expect(await client.getCurrentPosition()).toEqual(fix);
    const observer = { onLocation: vi.fn(), onError: vi.fn() };
    await client.watchPosition(observer);
    mock.push(fix);
    expect(observer.onLocation).toHaveBeenCalledOnce();
    client.setConsent(false);
    expect(mock.subscriberCount()).toBe(0);
    expect(observer.onError.mock.lastCall?.[0].code).toBe('PERMISSION_DENIED');
    mock.push(fix);
    expect(observer.onLocation).toHaveBeenCalledOnce();
    client.dispose();
  });
  it('background stops collection; returning does not automatically resume', async () => {
    const mock = createMockLocationProvider(),
      client = createLocationClient(mock.provider, scheduler);
    client.setConsent(true);
    const onError = vi.fn();
    await client.watchPosition({ onLocation: vi.fn(), onError });
    client.setForeground(false);
    expect(mock.subscriberCount()).toBe(0);
    await expect(client.getCurrentPosition()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    client.setForeground(true);
    expect(mock.subscriberCount()).toBe(0);
    expect(onError).toHaveBeenCalledOnce();
    client.dispose();
  });
  it('handles late native setup after timeout and explicit watch cancellation without leaks', async () => {
    vi.useFakeTimers();
    try {
      let resolve!: (subscription: LocationSubscription) => void;
      const stop = vi.fn();
      const client = createLocationClient(
        {
          getCurrentPosition: async () => fix,
          watchPosition: () =>
            new Promise((done) => {
              resolve = done;
            }),
        },
        scheduler,
      );
      client.setConsent(true);
      const pending = client.watchPosition(
        { onLocation: vi.fn(), onError: vi.fn() },
        { timeoutMs: 10 },
      );
      const check = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' });
      await vi.advanceTimersByTimeAsync(11);
      await check;
      resolve({ stop });
      await Promise.resolve();
      await Promise.resolve();
      expect(stop).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
      client.dispose();
      const mock = createMockLocationProvider(),
        c = createLocationClient(mock.provider, scheduler),
        cancel = createCancellationSource();
      c.setConsent(true);
      await c.watchPosition({ onLocation: vi.fn(), onError: vi.fn() }, { signal: cancel.signal });
      cancel.cancel();
      expect(mock.subscriberCount()).toBe(0);
      c.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
  it('normalizes invalid fixes/raw exceptions to safe errors and isolates callbacks', async () => {
    let observer!: LocationObserver;
    const stop = vi.fn();
    const client = createLocationClient(
      {
        getCurrentPosition: async () => {
          throw new Error('secret coords upstream');
        },
        watchPosition: async (o) => {
          observer = o;
          return { stop };
        },
      },
      scheduler,
    );
    client.setConsent(true);
    await expect(client.getCurrentPosition()).rejects.toThrow('LOCATION_FAILED');
    const onError = vi.fn();
    await client.watchPosition({ onLocation: vi.fn(), onError });
    observer.onLocation({ ...fix, accuracyMeters: NaN });
    expect(onError.mock.lastCall?.[0].code).toBe('UNAVAILABLE');
    expect(stop).toHaveBeenCalledOnce();
    client.dispose();
  });
});
describe('platform location bridges', () => {
  it('browser waits for consent, uses fresh fixes and clears one-shot/watch on permission errors', async () => {
    let onFix!: PositionCallback, onError!: PositionErrorCallback;
    const clearWatch = vi.fn();
    const watchPosition = vi.fn((ok: PositionCallback, error: PositionErrorCallback) => {
      onFix = ok;
      onError = error;
      return 1;
    });
    const client = createBrowserLocationClient({
      geolocation: { watchPosition, clearWatch } as unknown as Geolocation,
    });
    expect(watchPosition).not.toHaveBeenCalled();
    client.setConsent(true);
    const current = client.getCurrentPosition();
    onFix({
      coords: { longitude: 127, latitude: 37.5, accuracy: 8 },
      timestamp: fix.timestampMs,
    } as GeolocationPosition);
    expect(await current).toEqual(fix);
    expect(clearWatch).toHaveBeenCalledOnce();
    const error = vi.fn();
    await client.watchPosition({ onLocation: vi.fn(), onError: error });
    onError({ code: 1, message: 'private location message' } as GeolocationPositionError);
    expect(error.mock.lastCall?.[0].code).toBe('PERMISSION_DENIED');
    expect(clearWatch).toHaveBeenCalledTimes(2);
    client.dispose();
  });
  it('Expo requests only foreground permission; AppState and dispose remove native listeners', async () => {
    const remove = vi.fn(),
      off = vi.fn();
    let appState!: (state: string) => void;
    const location: ExpoLocationPort = {
      requestForegroundPermissionsAsync: vi.fn(async () => ({ granted: true })),
      watchPositionAsync: vi.fn(async () => ({ remove })),
    };
    const client = createExpoLocationClient(
      location,
      {
        currentState: 'active',
        addEventListener(_event, fn) {
          appState = fn;
          return { remove: off };
        },
      },
      scheduler,
    );
    expect(location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    client.setConsent(true);
    await client.watchPosition({ onLocation: vi.fn(), onError: vi.fn() });
    appState('background');
    expect(remove).toHaveBeenCalledOnce();
    appState('active');
    expect(location.watchPositionAsync).toHaveBeenCalledOnce();
    client.dispose();
    expect(off).toHaveBeenCalledOnce();
  });
  it('Expo rejects denied permission and removes a late acquired native subscription', async () => {
    const watch = vi.fn(async () => ({ remove: vi.fn() }));
    const lifecycle = { currentState: 'active', addEventListener: () => ({ remove: vi.fn() }) };
    const denied = createExpoLocationClient(
      {
        requestForegroundPermissionsAsync: async () => ({ granted: false }),
        watchPositionAsync: watch,
      },
      lifecycle,
      scheduler,
    );
    denied.setConsent(true);
    await expect(denied.getCurrentPosition()).rejects.toBeInstanceOf(LocationError);
    expect(watch).not.toHaveBeenCalled();
    denied.dispose();
    let resolve!: (value: { remove(): void }) => void;
    const native = createExpoLocationClient(
      {
        requestForegroundPermissionsAsync: async () => ({ granted: true }),
        watchPositionAsync: () =>
          new Promise((r) => {
            resolve = r;
          }),
      },
      lifecycle,
      scheduler,
    );
    native.setConsent(true);
    const cancel = createCancellationSource();
    const pending = native.watchPosition(
      { onLocation: vi.fn(), onError: vi.fn() },
      { signal: cancel.signal },
    );
    await Promise.resolve();
    const check = expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
    cancel.cancel();
    await check;
    const remove = vi.fn();
    resolve({ remove });
    await Promise.resolve();
    await Promise.resolve();
    expect(remove).toHaveBeenCalledOnce();
    native.dispose();
  });
});
