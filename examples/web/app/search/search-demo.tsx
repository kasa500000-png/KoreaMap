'use client';
import { useEffect, useRef, useState } from 'react';
import { createMap, type MapHandle } from 'korea-map-web';
import { createFixtureKoreanSearchProvider } from 'korea-map-data-adapters';
import {
  createCancellationSource,
  focusSearchHit,
  normalizeError,
  type KoreanSearchQuery,
  type PoiCategory,
  type SearchHit,
} from 'korea-map-core';

const provider = createFixtureKoreanSearchProvider({
  schedule(callback, milliseconds) {
    const timer = setTimeout(callback, milliseconds);
    return () => clearTimeout(timer);
  },
});
type Cancellation = ReturnType<typeof createCancellationSource>;
export function SearchDemo() {
  const container = useRef<HTMLDivElement>(null);
  const handle = useRef<MapHandle | null>(null);
  const pending = useRef<Cancellation | null>(null);
  const autoPending = useRef<Cancellation | null>(null);
  const [ready, setReady] = useState(false);
  const [text, setText] = useState('');
  const [composing, setComposing] = useState(false);
  const [category, setCategory] = useState<PoiCategory | ''>('');
  const [inBounds, setInBounds] = useState(false);
  const [nearby, setNearby] = useState(false);
  const [suggestions, setSuggestions] = useState<readonly SearchHit[]>([]);
  const [hits, setHits] = useState<readonly SearchHit[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [status, setStatus] = useState('지도 준비 중');
  const [camera, setCamera] = useState('');
  const [reverse, setReverse] = useState('');

  useEffect(() => {
    const abort = new AbortController();
    if (!container.current) return;
    void createMap({
      container: container.current,
      config: { mode: 'local-fixture', fixtureId: 'synthetic-v1' },
      workerUrl: '/vendor/maplibre/maplibre-gl-worker.mjs',
      signal: abort.signal,
    })
      .then(async (map) => {
        if (abort.signal.aborted) {
          map.destroy();
          return;
        }
        handle.current = map;
        map.api.onEvent((event) => {
          if (event.type === 'camera') setCamera(event.camera.center.join(', '));
        });
        await map.ready;
        if (!abort.signal.aborted) {
          setReady(true);
          setStatus('검색 준비 완료');
        }
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted) setStatus(normalizeError(error).code);
      });
    return () => {
      abort.abort();
      pending.current?.cancel();
      handle.current?.destroy();
      handle.current = null;
    };
  }, []);

  useEffect(() => {
    pending.current?.cancel();
    setHits([]);
    setNextOffset(null);
    setSuggestions([]);
    if (composing || text.trim().length < 2) return;
    const source = createCancellationSource();
    autoPending.current = source;
    const timer = setTimeout(() => {
      void provider
        .autocomplete(
          { text, language: 'ko', limit: 5, ...(category ? { category } : {}) },
          { signal: source.signal, timeoutMs: 1500 },
        )
        .then((items) => {
          if (!source.signal.aborted) setSuggestions(items.hits);
        })
        .catch((error: unknown) => {
          if (!source.signal.aborted) setStatus(normalizeError(error).code);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      source.cancel();
    };
  }, [text, composing, category, inBounds, nearby]);

  function report(error: unknown, source: Cancellation) {
    if (!source.signal.aborted) setStatus(normalizeError(error).code);
  }
  async function search(offset = 0) {
    const map = handle.current;
    if (!map) return;
    pending.current?.cancel();
    autoPending.current?.cancel();
    const source = createCancellationSource();
    pending.current = source;
    setStatus('검색 중');
    setSuggestions([]);
    try {
      const query: KoreanSearchQuery = {
        text,
        language: 'ko',
        limit: 2,
        offset,
        ...(category ? { category } : {}),
        ...(inBounds ? { bounds: await map.api.getVisibleBounds({ signal: source.signal }) } : {}),
        ...(nearby ? { center: map.state.getSnapshot().camera.center, radiusMeters: 5000 } : {}),
      };
      const page = await provider.searchPage(query, { signal: source.signal, timeoutMs: 1500 });
      if (source.signal.aborted) return;
      setHits((previous) => (offset ? [...previous, ...page.hits] : page.hits));
      setNextOffset(page.nextOffset);
      setStatus(page.hits.length ? '검색 완료' : '검색 결과 없음');
    } catch (error) {
      report(error, source);
    }
  }
  async function select(hit: SearchHit) {
    const map = handle.current;
    if (!map || !hit.place.location) return;
    pending.current?.cancel();
    autoPending.current?.cancel();
    const source = createCancellationSource();
    pending.current = source;
    try {
      await focusSearchHit(map.api, hit, { signal: source.signal });
      await map.api.addMarker(
        { id: 'search-result', coordinate: hit.place.location, label: hit.place.name },
        { signal: source.signal },
      );
      setSuggestions([]);
      setStatus(`선택: ${hit.place.name}`);
    } catch (error) {
      report(error, source);
    }
  }
  async function reverseNearby() {
    const map = handle.current;
    if (!map) return;
    pending.current?.cancel();
    autoPending.current?.cancel();
    const source = createCancellationSource();
    pending.current = source;
    setReverse('조회 중');
    try {
      const result = await provider.reverseNearby(
        { center: map.state.getSnapshot().camera.center, radiusMeters: 1000 },
        { signal: source.signal },
      );
      if (!source.signal.aborted)
        setReverse(
          result
            ? `${result.place.address ?? '주소 없음'} · ${Math.round(result.distanceMeters)}m · ${result.place.attribution}`
            : '주변 장소 없음',
        );
    } catch (error) {
      report(error, source);
    }
  }
  return (
    <main>
      <h1>한국 주소·장소 검색</h1>
      <p>
        서울·울산·제주의 자체 합성 자료 7건입니다. 실제 장소·주소가 아니며 외부 검색 서버를 사용하지
        않습니다.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!composing) void search();
        }}
      >
        <label>
          검색어{' '}
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            autoComplete="off"
            placeholder="서울 합성공원 또는 가상로"
          />
        </label>
        <label>
          카테고리{' '}
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as PoiCategory | '')}
          >
            <option value="">전체</option>
            <option value="park">공원</option>
            <option value="parking">주차장</option>
            <option value="tourism">관광</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={inBounds}
            onChange={(event) => setInBounds(event.target.checked)}
          />
          현재 지도 영역
        </label>
        <label>
          <input
            type="checkbox"
            checked={nearby}
            onChange={(event) => setNearby(event.target.checked)}
          />
          지도 중심 5km 이내
        </label>
        <button type="submit" disabled={!ready || composing}>
          검색
        </button>
      </form>
      <ul aria-label="자동완성">
        {suggestions.map((hit) => (
          <li key={hit.place.id}>
            <button disabled={!ready || !hit.place.location} onClick={() => void select(hit)}>
              {hit.place.name}
            </button>
          </li>
        ))}
      </ul>
      <p role="status" data-testid="search-status">
        {status}
      </p>
      <ul aria-label="검색 결과">
        {hits.map((hit) => (
          <li key={hit.place.id}>
            <button disabled={!hit.place.location} onClick={() => void select(hit)}>
              {hit.place.name}
            </button>
            <span>
              {' '}
              {hit.place.address ?? '주소 없음'}
              {hit.distanceMeters !== null ? ` · ${Math.round(hit.distanceMeters)}m` : ''}
              {!hit.place.location ? ' · 위치 미제공' : ''}
            </span>
            <small style={{ display: 'block' }}>{hit.place.attribution}</small>
          </li>
        ))}
      </ul>
      {nextOffset !== null && (
        <button onClick={() => void search(nextOffset)} disabled={status === '검색 중'}>
          더 보기
        </button>
      )}
      <button disabled={!ready} onClick={() => void reverseNearby()}>
        지도 중심 주변 POI 주소
      </button>
      <p>정확한 도로명·필지 역지오코딩이 아닌, 1km 이내 장소의 주소입니다.</p>
      <p data-testid="search-reverse" aria-live="polite">
        {reverse}
      </p>
      <output data-testid="search-camera" aria-label="지도 중심 좌표">
        {camera}
      </output>
      <div ref={container} style={{ position: 'relative', width: '100%', height: 520 }} />
    </main>
  );
}
