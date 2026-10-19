import { describe, expect, it, vi } from 'vitest';
import {
  createCancellationSource,
  createPlacesClient,
  publicPlaceToPlace,
  validatePlacesQuery,
  validatePublicPlace,
  type PlacesQuery,
  type Scheduler,
} from 'korea-map-core';
import { createFixturePlacesProvider, createRemotePlacesProvider } from 'korea-map-data-adapters';
const scheduler: Scheduler = {
  schedule(fn, ms) {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  },
};
const context = () => ({ signal: createCancellationSource().signal });
describe('portable public POI API', () => {
  it('queries authored fixtures without a key or network and preserves provenance', async () => {
    const client = createPlacesClient(createFixturePlacesProvider(), scheduler);
    const places = await client.getNearbyPlaces({ center: [127, 37.5], radiusMeters: 150 });
    expect(places.map((p) => p.category)).toEqual(['park', 'tourism']);
    expect(
      (
        await client.getPlacesInBounds({
          bounds: { west: 126.999, south: 37.499, east: 127.0001, north: 37.501 },
        })
      ).map((p) => p.category),
    ).toEqual(['park']);
    const [p] = await client.getPlacesByCategory({ category: 'pet_facility' });
    expect(p?.license).toBe('MIT');
    expect(publicPlaceToPlace(p!).provenance.sourceId).toBe('synthetic-fixture');
    expect((await client.getPlacesByCategory({ category: 'pet_facility' }))[0]?.metadata).toEqual({
      synthetic: true,
    });
  });
  it('validates limits, category, coordinates, dateline bounds before invoking transport', async () => {
    const request = vi.fn();
    const client = createPlacesClient(createRemotePlacesProvider(request), scheduler);
    await expect(
      client.getNearbyPlaces({ center: [37, 127], radiusMeters: 1 }),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(
      client.getPlacesByCategory({ category: 'park', limit: 101 }),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(
      client.getNearbyPlaces({ center: [127, 37], radiusMeters: 0 }),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(() =>
      validatePlacesQuery({
        kind: 'category',
        category: "park'; DROP TABLE places",
      } as unknown as PlacesQuery),
    ).toThrow();
    expect(
      validatePlacesQuery({
        kind: 'bounds',
        bounds: { west: 170, east: -170, south: -10, north: 10 },
      }).kind,
    ).toBe('bounds');
    expect(request).not.toHaveBeenCalled();
  });
  it('propagates cancellation/deadlines and removes transport listeners', async () => {
    vi.useFakeTimers();
    try {
      let cancelled = false;
      const provider = createRemotePlacesProvider(
        (_q, ctx) =>
          new Promise((_resolve, reject) => {
            ctx.signal.subscribe(() => {
              cancelled = true;
              reject(new Error('private provider text'));
            });
          }),
      );
      const client = createPlacesClient(provider, scheduler);
      const pending = client.getPlacesByCategory({ category: 'park' }, { timeoutMs: 5 });
      const assertion = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' });
      await vi.advanceTimersByTimeAsync(6);
      await assertion;
      expect(cancelled).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      const source = createCancellationSource();
      source.cancel();
      await expect(
        client.getPlacesByCategory({ category: 'park' }, { signal: source.signal }),
      ).rejects.toMatchObject({ code: 'ABORTED' });
    } finally {
      vi.useRealTimers();
    }
  });
  it('rejects incomplete/untrusted output and does not create markers for null coordinates', async () => {
    const provider = createFixturePlacesProvider();
    const [p] = await provider.query({ kind: 'category', category: 'park' }, context());
    expect(() => validatePublicPlace({ ...p, license: '' })).toThrow();
    expect(() => validatePublicPlace({ ...p, updated_at: '2026-02-30T00:00:00.000Z' })).toThrow();
    expect(() => validatePublicPlace({ ...p, metadata: { bad: Infinity } })).toThrow();
    expect(() => publicPlaceToPlace({ ...p!, location: null })).toThrow('POI_HAS_NO_LOCATION');
    await expect(
      createPlacesClient(
        createRemotePlacesProvider(async () => [p, p]),
        scheduler,
      ).getPlacesByCategory({ category: 'park', limit: 1 }),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(
      createPlacesClient(
        createRemotePlacesProvider(async () => {
          throw new Error('private connection');
        }),
        scheduler,
      ).getPlacesByCategory({ category: 'park' }),
    ).rejects.toThrow('OPERATION_FAILED');
  });
});
