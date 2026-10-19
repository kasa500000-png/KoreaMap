'use client';
import { useEffect, useRef, useState } from 'react';
import { createMap, createMapState, type MapHandle, type MapMarker } from '@korea-map-kit/web';
const camera = { center: [126.978, 37.5665] as const, zoom: 13, bearing: 0, pitch: 0 };
function markers(count: number): MapMarker[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `place-${i}`,
    label: `합성 장소 ${i + 1}`,
    description: '직접 만든 테스트 지점입니다.',
    coordinate: [
      126.978 + ((i % 32) - 15.5) * 0.00035,
      37.5665 + (Math.floor(i / 32) - 15.5) * 0.00035,
    ],
  }));
}
export function MapDemo() {
  const container = useRef<HTMLDivElement>(null);
  const handle = useRef<MapHandle | undefined>(undefined);
  const [model] = useState(() => createMapState({ camera, markers: markers(100) }));
  const [mounted, setMounted] = useState(true);
  const [broken, setBroken] = useState(false);
  const [status, setStatus] = useState('loading');
  const [selected, setSelected] = useState('선택 없음');
  const [rendered, setRendered] = useState(0);
  const [cameraText, setCameraText] = useState('');
  const [cleanup, setCleanup] = useState('');
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    if (!mounted || !container.current) return;
    const abort = new AbortController();
    setStatus('loading');
    void createMap({
      container: container.current,
      state: model,
      signal: abort.signal,
      workerUrl: '/vendor/maplibre/maplibre-gl-worker.mjs',
      config: broken
        ? {
            mode: 'operator',
            styleUrl: '/missing-style.json',
            allowedOrigins: [window.location.origin],
            attribution: '합성 오류 테스트',
            costAcknowledged: true,
          }
        : { mode: 'local-fixture', fixtureId: 'synthetic-v1' },
    })
      .then(async (map) => {
        handle.current = map;
        map.on('status', setStatus);
        map.on('error', () => setStatus('error'));
        map.on('select', (marker) => setSelected(marker?.label ?? '선택 없음'));
        map.on('camera', (next) =>
          setCameraText(
            `${next.center[0].toFixed(5)},${next.center[1].toFixed(5)} / ${next.zoom.toFixed(2)} / ${next.bearing.toFixed(1)}`,
          ),
        );
        map.on('idle', () => {
          setRendered(map.diagnostics().renderedMarkers);
          if (container.current) container.current.dataset.motion = 'idle';
        });
        await map.ready;
        if (abort.signal.aborted) return;
        map.setRoute('walk', [
          [126.97, 37.563],
          [126.978, 37.5665],
          [126.986, 37.57],
        ]);
        map.setGeoJSON('shapes', {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: { type: 'Point', coordinates: [126.972, 37.57] },
            },
            {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [126.982, 37.561],
                    [126.986, 37.561],
                    [126.986, 37.565],
                    [126.982, 37.561],
                  ],
                ],
              },
            },
          ],
        });
        map.addLayer(
          {
            id: 'operator-background',
            type: 'background',
            paint: { 'background-color': '#eef5ef' },
          },
          'kmk-data-walk-fill',
        );
        map.removeLayer('operator-background');
      })
      .catch(() => {
        if (!abort.signal.aborted) setStatus('error');
      });
    return () => {
      abort.abort();
      const map = handle.current;
      map?.destroy();
      if (map) setCleanup(JSON.stringify(map.diagnostics()));
      handle.current = undefined;
    };
  }, [mounted, broken, model]);
  return (
    <main>
      <header>
        <p className="eyebrow">KOREA MAP KIT</p>
        <h1>내 환경에서 시작하는 지도</h1>
        <a href="/themes/">4종 지도 테마 비교 →</a>
        <p>직접 만든 합성 지형·장소·경로입니다. 실제 한국 지도나 길찾기 결과가 아닙니다.</p>
      </header>
      <section className="workspace">
        <aside>
          <h2>지도 탐색</h2>
          <p role="status" data-testid="status">
            {status}
          </p>
          <div className="actions">
            <button onClick={() => handle.current?.zoomTo(model.getSnapshot().camera.zoom + 1)}>
              확대
            </button>
            <button onClick={() => handle.current?.zoomTo(model.getSnapshot().camera.zoom - 1)}>
              축소
            </button>
            <button onClick={() => handle.current?.panTo([126.982, 37.57])}>이동</button>
            <button onClick={() => handle.current?.rotateTo(45)}>회전</button>
            <button onClick={() => handle.current?.setCamera(camera)}>카메라 초기화</button>
            <button onClick={() => handle.current?.setMarkers(markers(100))}>마커 100개</button>
            <button onClick={() => handle.current?.setMarkers(markers(1000))}>마커 1000개</button>
            <button onClick={() => handle.current?.selectMarker('place-0')}>첫 장소 선택</button>
            <button onClick={() => setCompact(!compact)}>지도 크기 변경</button>
            <button onClick={() => setMounted(!mounted)}>
              {mounted ? '지도 종료' : '지도 시작'}
            </button>
            <button onClick={() => setBroken(!broken)}>{broken ? '지도 복구' : '오류 재현'}</button>
          </div>
          <p aria-live="polite">{selected}</p>
          <p data-testid="rendered">화면 마커: {rendered}</p>
          <output data-testid="camera">{cameraText}</output>
          <output data-testid="cleanup">{cleanup}</output>
          <p>
            API 키 없이 동작합니다. 외부 서비스를 연결하면 설정한 운영자가 이용 조건과 비용을
            부담합니다.
          </p>
        </aside>
        {mounted && (
          <div
            className="map"
            style={{ height: compact ? 380 : 600 }}
            ref={container}
            role="region"
            aria-label="합성 지도"
          />
        )}
      </section>
      <footer>원본 합성 데이터 · Korea Map Kit contributors · MIT</footer>
    </main>
  );
}
