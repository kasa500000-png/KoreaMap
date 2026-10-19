'use client';

import { useEffect, useRef, useState } from 'react';
import { createMap, type MapHandle } from '@korea-map-kit/web';
import { createFixtureSearchProvider } from '@korea-map-kit/data-adapters';

const config = { mode: 'local-fixture', fixtureId: 'synthetic-v1' } as const;
const search = createFixtureSearchProvider();

export function MapDemo() {
  const container = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('로컬 지도 준비 중');
  const [result, setResult] = useState('');
  useEffect(() => {
    if (!container.current) return;
    let cancelled = false;
    let handle: MapHandle | undefined;
    void createMap({
      container: container.current,
      config,
      workerUrl: '/vendor/maplibre/maplibre-gl-worker.mjs',
    })
      .then((created) => {
        if (cancelled) {
          created.destroy();
          return;
        }
        handle = created;
        created.map.on('movestart', () => {
          if (container.current) container.current.dataset.motion = 'moving';
        });
        created.map.on('idle', () => {
          if (container.current) container.current.dataset.motion = 'idle';
        });
        created.map.on('load', () => {
          if (!cancelled) setStatus('로컬 지도 준비 완료');
        });
        created.map.on('error', () => {
          if (!cancelled) setStatus('지도 오류');
        });
      })
      .catch(() => {
        if (!cancelled) setStatus('지도 오류');
      });
    return () => {
      cancelled = true;
      handle?.destroy();
    };
  }, []);
  return (
    <main>
      <header>
        <p className="eyebrow">KOREA MAP KIT</p>
        <h1>내 환경에서 시작하는 지도</h1>
        <p>합성 데이터로 동작하는 로컬 예제입니다. 실제 지도·검색·길찾기 서비스가 아닙니다.</p>
      </header>
      <section className="workspace">
        <aside>
          <h2>로컬 데이터</h2>
          <p role="status">{status}</p>
          <button
            onClick={() => {
              void search
                .search({ text: '합성', language: 'ko', limit: 5 })
                .then((places) => setResult(places.map((p) => p.label).join(', ')));
            }}
          >
            합성 지점 찾기
          </button>
          <p aria-live="polite">{result}</p>
          <p>외부 API 키 없이 사용합니다. 운영자 서비스 연결은 후속 단계에서 지원합니다.</p>
        </aside>
        <div className="map" ref={container} role="region" aria-label="합성 지도" />
      </section>
      <footer>원본 합성 데이터 · Korea Map Kit contributors · MIT</footer>
    </main>
  );
}
