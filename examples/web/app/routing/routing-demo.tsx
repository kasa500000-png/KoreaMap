'use client';
import { useEffect, useRef, useState } from 'react';
import { createMap, type MapHandle } from '@korea-map-kit/web';
import {
  createCancellationSource,
  createRoadRoutingProvider,
  KitError,
  normalizeError,
  roadRouteToGeoJSON,
  type RoadRoute,
  type RoutingRequest,
} from '@korea-map-kit/core';

const start = [127, 37.5] as const,
  finish = [127.004, 37.502] as const;
/** Authored road graph results measured with Valhalla 3.9.1. Fixed scenarios, not a routing engine. */
const provider = createRoadRoutingProvider(
  {
    async request(input) {
      const via = input.waypoints.length === 3;
      if (input.waypoints.at(-1)?.[0] !== finish[0])
        throw new KitError('NOT_FOUND', 'ROUTE_NOT_FOUND');
      const middle =
        via || input.mode === 'cycling'
          ? ([127.004, 37.5] as const)
          : input.mode === 'walking'
            ? ([127.002, 37.501] as const)
            : ([127, 37.502] as const);
      return [
        {
          id: 'route',
          kind: 'road-route',
          mode: input.mode,
          coordinates: [start, middle, finish],
          matchedWaypoints: input.waypoints,
          distanceMeters: input.mode === 'walking' && !via ? 418 : 576,
          durationSeconds:
            input.mode === 'walking'
              ? via
                ? 406.588
                : 295.059
              : input.mode === 'cycling'
                ? 115.2
                : via
                  ? 103.68
                  : 74.515,
          dataset: {
            id: 'synthetic-urban',
            version: '1',
            source: 'synthetic-routing-v1',
            license: 'MIT',
            attribution: 'Korea Map Kit 자체 합성 도로망 · MIT',
          },
        },
      ];
    },
  },
  {
    schedule(f, ms) {
      const t = setTimeout(f, ms);
      return () => clearTimeout(t);
    },
  },
);
export function RoutingDemo() {
  const container = useRef<HTMLDivElement>(null),
    handle = useRef<MapHandle | null>(null);
  const pending = useRef<ReturnType<typeof createCancellationSource> | null>(null);
  const hasRoute = useRef(false);
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<RoutingRequest['mode']>('driving');
  const [scenario, setScenario] = useState('normal');
  const [status, setStatus] = useState('지도 준비 중'),
    [route, setRoute] = useState<RoadRoute | null>(null);
  const [rendered, setRendered] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    void createMap({
      container: container.current!,
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
          if (event.type === 'idle' && hasRoute.current)
            setRendered(map.getRenderedFeatures(['kmk-data-route-line']).length > 0 ? 1 : 0);
        });
        await map.ready;
        await map.api.fitBounds(
          { west: 126.999, east: 127.005, south: 37.499, north: 37.503 },
          { padding: 30 },
        );
        if (!abort.signal.aborted) {
          setReady(true);
          setStatus('준비 완료');
        }
      })
      .catch((error) => {
        if (!abort.signal.aborted) setStatus(normalizeError(error).code);
      });
    return () => {
      abort.abort();
      pending.current?.cancel();
      handle.current?.destroy();
      handle.current = null;
    };
  }, []);
  async function run(unconfigured = false) {
    const map = handle.current;
    if (!map) return;
    pending.current?.cancel();
    const source = createCancellationSource();
    pending.current = source;
    hasRoute.current = false;
    setRendered(0);
    setRoute(null);
    setBusy(true);
    setStatus('경로 확인 중');
    try {
      await map.api.removeGeoJSON('route', { signal: source.signal });
      await map.api.removeMarker('start', { signal: source.signal });
      await map.api.removeMarker('finish', { signal: source.signal });
      if (unconfigured) throw new KitError('UNAVAILABLE', 'ROUTING_PROVIDER_REQUIRED');
      const points =
        scenario === 'via'
          ? [start, [127.004, 37.5] as const, finish]
          : [start, scenario === 'island' ? ([127.02, 37.5] as const) : finish];
      const [result] = await provider.route({ mode, waypoints: points }, { signal: source.signal });
      if (!result) throw new KitError('NOT_FOUND', 'ROUTE_NOT_FOUND');
      await map.api.showRoute(result, { signal: source.signal });
      hasRoute.current = true;
      await map.api.addMarker(
        { id: 'start', label: '합성 출발지', coordinate: start },
        { signal: source.signal },
      );
      await map.api.addMarker(
        { id: 'finish', label: '합성 도착지', coordinate: finish },
        { signal: source.signal },
      );
      if (!source.signal.aborted) {
        setRoute(result);
        setStatus('합성 도로 경로 표시');
      }
    } catch (error) {
      if (!source.signal.aborted) setStatus(normalizeError(error).detail);
    } finally {
      if (!source.signal.aborted) setBusy(false);
    }
  }
  return (
    <main>
      <h1>선택형 길찾기</h1>
      <p>
        자체 합성 도로망의 고정 테스트 결과입니다. 실제 한국 도로 안내에 사용하지 마세요. 외부
        서비스 요청은 없습니다.
      </p>
      <p>
        실제 경로는 운영자가 설정한 RoutingProvider로 요청합니다. 예상 시간이며 실시간 교통·보행
        안전을 보장하지 않습니다.
      </p>
      <label>
        이동 수단{' '}
        <select
          value={mode}
          disabled={busy}
          onChange={(e) => setMode(e.target.value as RoutingRequest['mode'])}
        >
          <option value="driving">차량</option>
          <option value="walking">도보</option>
          <option value="cycling">자전거</option>
        </select>
      </label>
      <label>
        테스트 구간{' '}
        <select value={scenario} disabled={busy} onChange={(e) => setScenario(e.target.value)}>
          <option value="normal">출발지 → 도착지</option>
          <option value="via">경유지 포함</option>
          <option value="island">연결 없는 섬</option>
        </select>
      </label>
      <button disabled={!ready || busy} onClick={() => void run()}>
        합성 경로 표시
      </button>
      <button disabled={!ready || busy} onClick={() => void run(true)}>
        공급자 미설정 확인
      </button>
      <p role="status" data-testid="routing-status">
        {status}
      </p>
      <p data-testid="routing-summary">
        {route
          ? `${route.distanceMeters} m · 예상 ${route.durationSeconds.toFixed(1)} 초 · ${route.matchedWaypoints.length}개 지점`
          : '표시 경로 없음'}
      </p>
      <p data-testid="routing-rendered">렌더링된 선 {rendered}개</p>
      <p>{route?.dataset.attribution ?? 'Korea Map Kit 자체 합성 도로망 · MIT'}</p>
      <div ref={container} style={{ position: 'relative', width: '100%', height: 480 }} />
      {route && (
        <details>
          <summary>경로 GeoJSON</summary>
          <pre>{JSON.stringify(roadRouteToGeoJSON(route), null, 2)}</pre>
        </details>
      )}
    </main>
  );
}
