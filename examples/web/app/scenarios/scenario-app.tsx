'use client';
import { useEffect, useRef, useState } from 'react';
import { parseCustomStyle } from '@korea-map-kit/styles';
import { createMap, type MapHandle } from '@korea-map-kit/web';
import {
  createScenarioSession,
  scenarioActions,
  scenarioStyle,
  places,
  type ScenarioKind,
  type ScenarioSession,
  type ScenarioSnapshot,
  type DemoStorage,
} from '@korea-map-kit/example-scenarios';
import './scenarios.css';
const storage: DemoStorage = {
  async getItem(key) {
    return localStorage.getItem(key);
  },
  async setItem(key, value) {
    localStorage.setItem(key, value);
  },
  async removeItem(key) {
    localStorage.removeItem(key);
  },
};
const scheduler = {
  schedule(fn: () => void, ms: number) {
    const timer = setTimeout(fn, ms);
    return () => clearTimeout(timer);
  },
};
export function ScenarioApp({ kind }: { kind: ScenarioKind }) {
  const container = useRef<HTMLDivElement>(null),
    session = useRef<ScenarioSession | null>(null);
  const [state, setState] = useState<ScenarioSnapshot>(),
    [query, setQuery] = useState(''),
    [error, setError] = useState(false);
  useEffect(() => {
    let active = true,
      handle: MapHandle | undefined;
    const abort = new AbortController();
    const style = scenarioStyle(kind === 'walk' ? 'pastel' : 'standard');
    if (container.current)
      void createMap({
        container: container.current,
        signal: abort.signal,
        workerUrl: '/vendor/maplibre/maplibre-gl-worker.mjs',
        config: {
          mode: 'inline',
          style: parseCustomStyle(style.document),
          allowedOrigins: [],
          attribution: style.attribution,
          costAcknowledged: true,
        },
      })
        .then(async (map) => {
          if (!active) {
            map.destroy();
            return;
          }
          handle = map;
          await map.ready;
          if (!active) return;
          session.current = createScenarioSession(
            kind,
            map.api,
            storage,
            scheduler,
            { monotonicMs: () => performance.now() },
            (next) => {
              if (active) setState(next);
            },
          );
          setState(session.current.getSnapshot());
          await session.current.initialize();
        })
        .catch(() => {
          if (active) setError(true);
        });
    const hidden = () => {
      if (document.visibilityState !== 'visible') session.current?.background();
    };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', hidden);
      session.current?.dispose();
      session.current = null;
      abort.abort();
      handle?.destroy();
    };
  }, [kind]);
  const app = session.current,
    busy = !state?.ready || state.busy;
  return (
    <main className={`scenario-shell scenario-${kind}`}>
      <header className="scenario-header">
        <div>
          <p className="scenario-eyebrow">KOREA MAP KIT / TWO WAYS TO EXPLORE</p>
          <h1>{kind === 'walk' ? '몽실 산책 지도' : '차곡 여행 지도'}</h1>
          <p>
            {kind === 'walk'
              ? '작은 발걸음을 기록하고 다시 만나보세요.'
              : '가고 싶은 장소를 모아 하루의 순서를 그려보세요.'}
          </p>
        </div>
        <nav>
          <a href="/walk/">산책 지도</a>
          <a href="/trip/">여행 지도</a>
          <a href="/">SDK 홈</a>
        </nav>
      </header>
      <p className="scenario-notice">
        가상 사용자 · 가상 장소 · 합성 GPS만 사용합니다. 실제 위치를 수집하지 않습니다.
      </p>
      <div className="scenario-grid">
        <section className="scenario-map-panel" aria-label="지도 영역">
          <div ref={container} className="scenario-map" />
          <p className="scenario-map-note">
            {kind === 'walk'
              ? '가상 공원 · 동물병원 · 미용실'
              : `${state?.day ?? 1}일차 · 방문 순서 연결선이며 실제 도로 경로가 아닙니다.`}
          </p>
        </section>
        <aside className="scenario-sidebar">
          <p role="status" data-testid="scenario-status">
            {error ? '지도 오류: 새로고침해주세요' : (state?.status ?? '지도 준비 중')}
          </p>
          {state && app ? (
            <>
              <div className="scenario-metrics" data-testid="scenario-metrics">
                {kind === 'walk'
                  ? `${state.state} · ${state.points}점 · ${state.meters.toFixed(1)}m · 저장 ${state.saved.walks.length}개 · ${state.theme}`
                  : `${state.day}일차 · 저장 ${state.saved.visits.filter((v) => v.day === state.day).length}곳 · Standard`}
              </div>
              <div className="scenario-actions">
                {scenarioActions(kind, app, state).map((a) => (
                  <button key={a.id} disabled={a.disabled} onClick={() => void a.run()}>
                    {a.label}
                  </button>
                ))}
              </div>
              {kind === 'trip' ? (
                <>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void app.search(query);
                    }}
                  >
                    <label htmlFor="place-search">방문 장소 검색</label>
                    <div className="scenario-search">
                      <input
                        id="place-search"
                        value={query}
                        maxLength={120}
                        onChange={(event) => setQuery(event.target.value)}
                      />
                      <button disabled={busy}>검색</button>
                    </div>
                  </form>
                  <ul className="scenario-places">
                    {state.results.map((p) => (
                      <li key={p.id}>
                        <button disabled={busy} onClick={() => void app.focus(p.id)}>
                          {p.label}
                        </button>
                        <button
                          aria-label={`${p.label} 저장`}
                          disabled={
                            busy ||
                            state.saved.visits.some((v) => v.id === p.id && v.day === state.day)
                          }
                          onClick={() => void app.savePlace(p.id)}
                        >
                          + 일정
                        </button>
                      </li>
                    ))}
                  </ul>
                  <h2>{state.day}일차 방문 순서</h2>
                  <ol>
                    {state.saved.visits
                      .filter((v) => v.day === state.day)
                      .map((v) => (
                        <li key={v.id}>
                          <button disabled={busy} onClick={() => void app.focus(v.id)}>
                            {places.find((p) => p.id === v.id)?.label}
                          </button>
                          <button
                            disabled={busy}
                            aria-label={`${v.id} 일정 삭제`}
                            onClick={() => void app.removePlace(v.id)}
                          >
                            삭제
                          </button>
                        </li>
                      ))}
                  </ol>
                </>
              ) : (
                <ul className="scenario-places">
                  {places.slice(0, 3).map((p) => (
                    <li key={p.id}>
                      <button disabled={busy} onClick={() => void app.focus(p.id)}>
                        {p.label}
                      </button>
                      <span>{p.categories[0]}</span>
                    </li>
                  ))}
                </ul>
              )}
              {state.selected ? (
                <section className="scenario-place-card" aria-label="장소 카드">
                  <h2>{state.selected.label}</h2>
                  <p>{state.selected.categories.join(' · ')} · 자체 합성 장소</p>
                  <button onClick={app.closeCard}>장소 카드 닫기</button>
                </section>
              ) : null}
              <button className="scenario-reset" disabled={busy} onClick={() => void app.reset()}>
                모든 데모 저장 자료 삭제
              </button>
            </>
          ) : null}
        </aside>
      </div>
      <footer>
        SDK 코드 MIT · 모든 표시 자료는 자체 합성 데이터입니다. 저장은 이 브라우저에만 유지됩니다.
      </footer>
    </main>
  );
}
