import { describe, it, expect, vi } from 'vitest';
import {
  createCancellationSource,
  createKoreanSearchProvider,
  normalizeSearchText,
  focusSearchHit,
  validateKoreanSearchQuery,
  type SearchProvider,
  type Scheduler,
  type MapController,
} from '@korea-map-kit/core';
import {
  createFixtureKoreanSearchProvider,
  createRemoteKoreanSearchProvider,
} from '@korea-map-kit/data-adapters';
const scheduler: Scheduler = {
  schedule(fn, ms) {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  },
};
const q = (text: string) => ({ text, language: 'ko', limit: 10 });
describe('Korean search contracts and local fixture', () => {
  it('searches Seoul/Ulsan/Jeju names, POI addresses and spacing/NFC', async () => {
    const provider = createFixtureKoreanSearchProvider(scheduler);
    for (const city of ['서울', '울산', '제주'])
      expect(
        (await provider.searchPage(q(city))).hits.some((h) => h.place.name.includes(city)),
      ).toBe(true);
    expect((await provider.searchPage(q('서울   가상로 101'))).hits[0]?.place.name).toBe(
      '서울 합성공원',
    );
    expect(
      (await provider.searchPage(q('서 울 합 성 공 원'.normalize('NFD')))).hits[0]?.place.name,
    ).toBe('서울 합성공원');
    expect(normalizeSearchText('Ａ A\t가\u00a0나　다')).toBe('Ａa가나다');
    expect((await provider.searchPage(q('서울합성공웜'))).hits[0]?.place.name).toBe(
      '서울 합성공원',
    );
    expect((await provider.searchPage(q('존재하지않는zzz'))).hits).toEqual([]);
    const legacy: SearchProvider = provider;
    expect((await legacy.search(q('서울')))[0]?.provenance.sourceId).toBe('synthetic-search-v1');
  });
  it('bounds, distance, category, pages, autocomplete and reverse are explicit', async () => {
    const provider = createFixtureKoreanSearchProvider(scheduler);
    const page = await provider.searchPage({ ...q('합성'), category: 'park', limit: 1 });
    expect(page.nextOffset).toBe(1);
    const next = await provider.searchPage({ ...q('합성'), category: 'park', limit: 1, offset: 1 });
    expect(next.hits[0]?.place.id).not.toBe(page.hits[0]?.place.id);
    const bounds = { west: 129, south: 35, east: 130, north: 36 };
    expect(
      (await provider.searchPage({ ...q('합성'), bounds, category: 'park' })).hits.map(
        (h) => h.place.name,
      ),
    ).toEqual(['울산 합성산책공원']);
    expect(
      (await provider.searchPage({ ...q('합성'), center: [126.5, 33.5], radiusMeters: 100 }))
        .hits[0]?.place.name,
    ).toBe('제주 합성공원');
    expect((await provider.autocomplete(q('서울합'))).hits).toHaveLength(2);
    expect((await provider.autocomplete(q('서'))).hits).toEqual([]);
    expect(await provider.reverseNearby({ center: [0, 0] })).toBeNull();
    expect((await provider.reverseNearby({ center: [129.3, 35.5] }))?.kind).toBe('nearby-poi');
  });
  it('empty input is no request and invalid filters/offset/oversized input fail closed', async () => {
    const request = vi.fn();
    const provider = createRemoteKoreanSearchProvider(request, scheduler);
    expect(await provider.searchPage(q('  '))).toEqual({ hits: [], nextOffset: null });
    await expect(provider.searchPage({ ...q('서울'), offset: 1001 })).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    await expect(provider.searchPage({ ...q('서울'), sort: 'distance' })).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    await expect(provider.autocomplete({ ...q('서울'), limit: 20 })).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    expect(() => validateKoreanSearchQuery({ ...q('서울'), bounds: null as never })).toThrow();
    await expect(provider.searchPage(q('가'.repeat(121)))).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    expect(request).not.toHaveBeenCalled();
  });
  it('cancels a delayed response and rejects invalid pages without leaking raw errors', async () => {
    vi.useFakeTimers();
    try {
      let cancelled = false;
      const provider = createKoreanSearchProvider(
        {
          request: (_q, ctx) =>
            new Promise((_r, reject) => {
              ctx.signal.subscribe(() => {
                cancelled = true;
                reject(new Error('private upstream'));
              });
            }),
        },
        scheduler,
      );
      const pending = provider.searchPage(q('서울'), { timeoutMs: 25 });
      const check = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' });
      await vi.advanceTimersByTimeAsync(26);
      await check;
      expect(cancelled).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      const abort = createCancellationSource();
      const active = provider.autocomplete(q('서울'), { signal: abort.signal });
      const checkAbort = expect(active).rejects.toMatchObject({ code: 'ABORTED' });
      abort.cancel();
      await checkAbort;
    } finally {
      vi.useRealTimers();
    }
    const invalid = createRemoteKoreanSearchProvider(
      async () => ({ hits: [], nextOffset: 20 }),
      scheduler,
    );
    await expect(invalid.searchPage(q('서울'))).rejects.toThrow('INVALID_SEARCH_RESPONSE');
  });
  it('moves a selected located result and refuses to invent an unlocated position', async () => {
    const provider = createFixtureKoreanSearchProvider(scheduler),
      setCamera = vi.fn(async () => {});
    const map = { setCamera } as unknown as MapController;
    const hit = (await provider.searchPage(q('서울합성공원'))).hits[0]!;
    await focusSearchHit(map, hit);
    expect(setCamera).toHaveBeenCalledWith(
      expect.objectContaining({ center: [127, 37.5], zoom: 16 }),
      undefined,
    );
    await expect(
      focusSearchHit(map, { ...hit, place: { ...hit.place, location: null } }),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
});
