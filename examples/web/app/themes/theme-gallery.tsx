'use client';
import { useEffect, useRef, useState } from 'react';
import { createMap, createMapState, type MapHandle } from 'korea-map-web';
import {
  themeNames,
  resolveTheme,
  createThemeStyle,
  createPoiIcon,
  poiKinds,
  designAttribution,
  type ThemeName,
  type ThemeOverrides,
} from 'korea-map-styles';
const details = {
  standard: '일상의 길과 장소를 균형 있게',
  dark: '어두운 바탕에서 차분한 탐색',
  pastel: '부드러운 색으로 구분하는 동네',
  outdoor: '녹지와 산책길을 선명하게',
};
const fonts = ['Noto Sans CJK KR', 'Noto Sans KR', 'sans-serif'];
function ThemeMap({ theme, zoom, accent }: { theme: ThemeName; zoom: number; accent: string }) {
  const container = useRef<HTMLDivElement>(null);
  const handle = useRef<MapHandle | undefined>(undefined);
  const [status, setStatus] = useState('loading');
  const [counts, setCounts] = useState({ labels: 0, icons: 0 });
  const [state] = useState(() =>
    createMapState({ camera: { center: [126.979, 37.5685], zoom, bearing: 0, pitch: 0 } }),
  );
  useEffect(() => {
    handle.current?.zoomTo(zoom);
  }, [zoom]);
  useEffect(() => {
    if (!container.current) return;
    const abort = new AbortController();
    setStatus('loading');
    const overrides: ThemeOverrides = accent ? { colors: { water: accent } } : {};
    const tokens = resolveTheme(theme, overrides);
    const style = createThemeStyle({
      theme,
      target: 'web',
      data: { mode: 'fixture' },
      typography: { mode: 'local', fontStack: fonts },
      icons: true,
      overrides,
    });
    void createMap({
      container: container.current,
      state,
      signal: abort.signal,
      workerUrl: '/vendor/maplibre/maplibre-gl-worker.mjs',
      config: {
        mode: 'inline',
        style,
        allowedOrigins: [],
        attribution: designAttribution,
        costAcknowledged: true,
      },
      images: poiKinds.map((kind) => ({
        id: `korea-poi-${kind}`,
        image: createPoiIcon(kind, tokens.colors.poi, tokens.colors.poiInk),
      })),
    })
      .then(async (map) => {
        if (abort.signal.aborted) {
          map.destroy();
          return;
        }
        handle.current = map;
        map.on('status', setStatus);
        map.on('error', () => setStatus('error'));
        await map.ready;
        // Custom layer and caller-authored image extension, without external assets.
        map.addImage('user-park', createPoiIcon('park', tokens.colors.poi, tokens.colors.poiInk));
        map.addLayer({
          id: 'user-water-outline',
          type: 'line',
          source: 'korea-base',
          filter: ['==', ['get', 'kind'], 'water'],
          paint: { 'line-color': tokens.colors.water, 'line-width': 1 },
        });
        map.removeImage('user-park');
        setStatus('ready');
        map.on('idle', () => {
          setCounts({
            labels: map.getRenderedFeatures([
              'korea-label-place',
              'korea-label-poi',
              'korea-label-road',
            ]).length,
            icons: map.getRenderedFeatures(['korea-poi-icons']).length,
          });
        });
      })
      .catch(() => {
        if (!abort.signal.aborted) setStatus('error');
      });
    return () => {
      abort.abort();
      handle.current?.destroy();
      handle.current = undefined;
    };
  }, [theme, state, accent]);
  return (
    <article className={`theme-card theme-${theme}`} data-testid={`theme-${theme}`}>
      <header>
        <div>
          <p className="eyebrow">KOREA MAP KIT · {theme.toUpperCase()}</p>
          <h2>{theme.charAt(0).toUpperCase() + theme.slice(1)}</h2>
          <p>{details[theme]}</p>
        </div>
        <span className="theme-status" data-testid={`status-${theme}`}>
          {status}
        </span>
      </header>
      <div ref={container} className="theme-map" role="region" aria-label={`${theme} 합성 지도`} />
      <footer>
        <span>도로 · 건물 · 녹지 · 수역 · POI</span>
        <span data-testid={`layers-${theme}`}>
          라벨 {counts.labels}개 / 아이콘 {counts.icons}개
        </span>
      </footer>
    </article>
  );
}
export function ThemeGallery() {
  const [zoom, setZoom] = useState(14);
  const [accent, setAccent] = useState('');
  return (
    <main className="theme-gallery">
      <header className="theme-intro">
        <a href="/">← SDK 탐색 예제</a>
        <p className="eyebrow">KOREA MAP KIT / DESIGN SYSTEM</p>
        <h1>같은 동네, 네 가지 시선</h1>
        <p>
          독립적으로 만든 팔레트와 지도 기호. 모든 테마는 같은 합성 지역과 시작 카메라를 사용합니다.
        </p>
        <p>실제 한국 지도 데이터가 아닙니다. 화면의 한글은 설치된 폰트로 표시됩니다.</p>
      </header>
      <section className="theme-toolbar" aria-label="테마 비교 설정">
        <label>
          확대 레벨{' '}
          <select
            aria-label="확대 레벨"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          >
            {[10, 12, 14, 16].map((value) => (
              <option key={value} value={value}>
                z{value}
              </option>
            ))}
          </select>
        </label>
        <label>
          수역 색상{' '}
          <input
            aria-label="수역 사용자 색상"
            type="color"
            value={accent || '#8ccde0'}
            onChange={(event) => setAccent(event.target.value)}
          />
        </label>
        <button onClick={() => setAccent('')}>기본 팔레트</button>
        <p>한국어 우선 · 원래 이름 대체 · 출처 항상 표시</p>
      </section>
      <section className="theme-grid" aria-label="4종 지도 테마">
        {themeNames.map((theme) => (
          <ThemeMap key={theme} theme={theme} zoom={zoom} accent={accent} />
        ))}
      </section>
      <aside className="design-notes">
        <h2>읽기 쉬운 지도부터</h2>
        <p>
          라벨과 halo, 아이콘 전경과 배경의 대비를 검사합니다. 건물·POI는 z14부터, Outdoor 산책길은
          z10부터 표시합니다.
        </p>
        <p>
          폰트·glyph·데이터 서비스의 운영 비용과 이용 조건은 연결한 운영자에게 있습니다. 이 예제는
          외부 서비스 요청 없이 동작합니다.
        </p>
      </aside>
    </main>
  );
}
