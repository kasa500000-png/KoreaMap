'use client';

import { useEffect, useRef, useState } from 'react';
import { KitError, defineMapStyle, normalizeError, type MapSelection } from 'korea-map-core';
import { createMap, type MapHandle } from 'korea-map-web';
import { parseCustomStyle, themeNames, type ThemeName } from 'korea-map-styles';

const attribution = '© OpenStreetMap contributors · ODbL-1.0';
const cities = {
  seoul: { label: '서울', center: [126.978, 37.5665] },
  ulsan: { label: '울산', center: [129.3114, 35.5384] },
  busan: { label: '부산', center: [129.0756, 35.1302] },
  jeju: { label: '제주', center: [126.5312, 33.4996] },
} as const;
type City = keyof typeof cities;
type Status = 'disconnected' | 'connecting' | 'ready' | 'styling' | 'error';
const statusText: Record<Status, string> = {
  disconnected: '연결 전',
  connecting: '지도 연결 중',
  ready: '지도 준비 완료',
  styling: '테마 변경 중',
  error: '연결 오류',
};
interface Session {
  controller: AbortController;
  map: MapHandle | null;
  styleUrl: URL;
  layers: readonly string[];
  unsubscribe: (() => void)[];
  cameraText: string;
}
interface VisibleFeatures {
  roads: number;
  buildings: number;
  labels: number;
  names: readonly string[];
}

// Validate before the explicit metadata fetch; createMap also enforces the SDK provider policy.
function styleAddress(value: string): URL {
  const url = new URL(value.trim());
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))
  )
    throw new KitError('INVALID_ARGUMENT', 'UNSAFE_PROVIDER_URL');
  return url;
}

async function readStyle(url: URL, signal: AbortSignal) {
  const pending = new AbortController();
  const cancel = () => pending.abort();
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  const timeout = setTimeout(cancel, 15000);
  try {
    const response = await fetch(url.href, {
      signal: pending.signal,
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
    });
    if (!response.ok) throw new KitError('NETWORK_ERROR', 'STYLE_LOAD_FAILED');
    return parseCustomStyle(await response.json());
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
  }
}

export function TilesDemo() {
  const container = useRef<HTMLDivElement>(null);
  const active = useRef<Session | null>(null);
  const mounted = useRef(false);
  const [address, setAddress] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [status, setStatus] = useState<Status>('disconnected');
  const [notice, setNotice] = useState('');
  const [city, setCity] = useState<City>('seoul');
  const [theme, setTheme] = useState<ThemeName>('standard');
  const [themed, setThemed] = useState(false);
  const [camera, setCamera] = useState('');
  const [features, setFeatures] = useState<VisibleFeatures | null>(null);
  const [selection, setSelection] = useState<MapSelection | null>(null);
  const [candidates, setCandidates] = useState<readonly MapSelection[]>([]);
  const [origin, setOrigin] = useState('');
  const cardTitle = useRef<HTMLHeadingElement>(null);
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const pickRevision = useRef(0);

  function current(session: Session) {
    return mounted.current && active.current === session && !session.controller.signal.aborted;
  }
  function closeSession() {
    const session = active.current;
    active.current = null;
    if (!session) return;
    for (const off of session.unsubscribe) off();
    session.controller.abort();
    session.map?.destroy();
  }
  function disconnect() {
    closeSession();
    setStatus('disconnected');
    setNotice('');
    setCamera('');
    setFeatures(null);
    setThemed(false);
    setSelection(null);
    setCandidates([]);
    setOrigin('');
    pickRevision.current++;
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      closeSession();
    };
  }, []);

  function summarize(session: Session) {
    const map = session.map;
    if (!current(session) || !map || map.diagnostics().status !== 'ready') return;
    const layers = session.layers.filter(
      (id) =>
        id.startsWith('korea-road-') ||
        id === 'korea-building' ||
        id.startsWith('korea-label-') ||
        id.startsWith('korea-poi-priority-'),
    );
    const rendered = layers.length ? map.getRenderedFeatures(layers) : [];
    const labels = rendered.filter(
      (feature) =>
        feature.layerId.startsWith('korea-label-') ||
        feature.layerId.startsWith('korea-poi-priority-'),
    );
    const names = labels
      .map(({ properties }) => properties['name:ko'] ?? properties['name'] ?? properties['name:en'])
      .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);
    setFeatures({
      roads: rendered.filter((feature) => feature.layerId.startsWith('korea-road-')).length,
      buildings: rendered.filter((feature) => feature.layerId === 'korea-building').length,
      labels: labels.length,
      names: [...new Set(names)].slice(0, 8),
    });
  }
  function fail(error: unknown, session?: Session) {
    if (session && !current(session)) return;
    const invalid = normalizeError(error).code === 'INVALID_ARGUMENT' || error instanceof TypeError;
    setStatus('error');
    setNotice(
      invalid
        ? 'HTTPS 또는 localhost 스타일 주소와 서버 설정을 확인해 주세요. URL에 로그인 정보를 넣을 수 없습니다.'
        : '지도 자료를 불러오지 못했습니다. 서버 연결, 출처와 브라우저 접근 허용 설정을 확인한 뒤 다시 연결해 주세요.',
    );
  }
  async function connect() {
    if (!accepted || !address.trim() || !container.current) return;
    closeSession();
    setFeatures(null);
    setCamera('');
    setNotice('');
    setThemed(false);
    let url: URL;
    try {
      url = styleAddress(address);
    } catch (error) {
      fail(error);
      return;
    }
    const session: Session = {
      controller: new AbortController(),
      map: null,
      styleUrl: url,
      layers: [],
      unsubscribe: [],
      cameraText: '',
    };
    active.current = session;
    setStatus('connecting');
    try {
      // Fetch only after Connect. Known layer IDs keep diagnostic queries safe for no-label styles.
      const style = await readStyle(url, session.controller.signal);
      if (!current(session)) return;
      session.layers = style.layers.map((layer) => layer.id);
      const map = await createMap({
        container: container.current,
        config: {
          mode: 'operator',
          styleUrl: url.href,
          allowedOrigins: [url.origin],
          attribution,
          costAcknowledged: true,
        },
        workerUrl: '/vendor/maplibre/maplibre-gl-worker.mjs',
        useLocalIdeographs: false,
        clustering: { radius: 48, maxZoom: 13 },
        interactionPoiLayers: session.layers.filter(
          (id) =>
            id === 'korea-label-poi' ||
            (!id.endsWith('-context') &&
              (id.startsWith('korea-poi-priority-') || id.startsWith('korea-label-transport-'))),
        ),
        signal: session.controller.signal,
      });
      if (!current(session)) {
        map.destroy();
        return;
      }
      session.map = map;
      if (map.interactions)
        session.unsubscribe.push(
          map.interactions.onEvent((event) => {
            if (!current(session)) return;
            if (event.type === 'selection')
              setSelection(event.selection?.kind === 'cluster' ? null : event.selection);
            if (event.type === 'camera')
              setOrigin(
                event.origin === 'gesture'
                  ? '직접 지도 이동'
                  : event.origin === 'api'
                    ? '버튼·장소로 이동'
                    : '지도 위치 변경',
              );
          }),
        );
      session.unsubscribe.push(
        map.on('idle', () => {
          summarize(session);
          if (current(session)) setCamera(session.cameraText);
        }),
        map.on('camera', (value) => {
          if (current(session))
            session.cameraText = `${value.center.map((number) => number.toFixed(5)).join(', ')} · z${value.zoom.toFixed(1)}`;
        }),
        map.on('error', (error) => {
          if (!current(session)) return;
          if (error.fatal) fail(new KitError('NETWORK_ERROR', 'MAP_LOAD_FAILED'), session);
          else setNotice('일부 지도 자료를 불러오지 못했습니다. 서버 연결을 확인해 주세요.');
        }),
      );
      await map.ready;
      if (!current(session)) return;
      await map.api.setCenter(cities[city].center);
      await map.api.setZoom(14);
      if (!current(session)) return;
      const match = /\/(standard|dark|pastel|outdoor)\.json$/.exec(url.pathname);
      setThemed(Boolean(match && !url.search && !url.hash));
      if (match) setTheme(match[1] as ThemeName);
      setStatus('ready');
      summarize(session);
    } catch (error) {
      if (!current(session)) return;
      fail(error, session);
      closeSession();
    }
  }
  async function move() {
    const session = active.current;
    if (!session?.map || !current(session) || status !== 'ready') return;
    try {
      if (session.map.interactions)
        await session.map.interactions.transitionCamera({
          center: cities[city].center,
          zoom: 14,
          bearing: 0,
          pitch: 0,
        });
      else {
        await session.map.api.setCenter(cities[city].center);
        await session.map.api.setZoom(14);
      }
      if (current(session)) summarize(session);
    } catch (error) {
      if (normalizeError(error).code !== 'ABORTED') fail(error, session);
    }
  }
  async function choose(value: MapSelection) {
    const session = active.current;
    if (!session?.map?.interactions || !current(session)) return;
    try {
      await session.map.interactions.selectFeature(value);
      if (!current(session)) return;
      setCandidates([]);
      if (value.kind !== 'cluster') {
        const small = window.matchMedia('(max-width:680px)').matches;
        await session.map.interactions.transitionCamera(
          { ...session.map.state.getSnapshot().camera, center: value.coordinate },
          { insets: small ? { bottom: 240 } : { right: 320 } },
        );
        if (current(session)) cardTitle.current?.focus({ preventScroll: true });
      }
    } catch (error) {
      if (normalizeError(error).code !== 'ABORTED') fail(error, session);
    }
  }
  async function pick(x: number, y: number) {
    const session = active.current,
      revision = ++pickRevision.current;
    if (!session?.map?.interactions || !current(session) || status !== 'ready') return;
    try {
      const values = await session.map.interactions.pickFeatures({ x, y });
      if (!current(session) || revision !== pickRevision.current) return;
      setCandidates(values);
      if (values.length === 1) await choose(values[0]!);
      else {
        await session.map.interactions.selectFeature(null);
        if (current(session)) setSelection(null);
      }
    } catch (error) {
      if (normalizeError(error).code !== 'ABORTED') fail(error, session);
    }
  }
  async function closeCard() {
    const session = active.current;
    if (!session?.map?.interactions || !current(session)) return;
    try {
      await session.map.interactions.selectFeature(null);
      await session.map.interactions.transitionCamera(session.map.state.getSnapshot().camera, {
        insets: {},
        durationMs: 0,
      });
      if (current(session)) {
        setSelection(null);
        setCandidates([]);
        container.current?.querySelector('canvas')?.focus({ preventScroll: true });
      }
    } catch (error) {
      if (normalizeError(error).code !== 'ABORTED') fail(error, session);
    }
  }
  async function zoom(delta: number) {
    const session = active.current;
    if (!session?.map || !current(session)) return;
    const camera = session.map.state.getSnapshot().camera;
    try {
      const value = Math.max(0, Math.min(20, camera.zoom + delta));
      if (session.map.interactions)
        await session.map.interactions.transitionCamera({ ...camera, zoom: value });
      else await session.map.api.setZoom(value);
    } catch (error) {
      if (normalizeError(error).code !== 'ABORTED') fail(error, session);
    }
  }
  async function changeTheme(value: ThemeName) {
    const session = active.current;
    if (!session?.map || !current(session) || status !== 'ready' || !themed) return;
    const url = new URL(session.styleUrl);
    url.pathname = url.pathname.replace(
      /\/(standard|dark|pastel|outdoor)\.json$/,
      `/${value}.json`,
    );
    setStatus('styling');
    setNotice('');
    try {
      const style = await readStyle(url, session.controller.signal);
      if (!current(session)) return;
      await session.map.api.setStyle(defineMapStyle(style, attribution));
      if (!current(session)) return;
      session.layers = style.layers.map((layer) => layer.id);
      setTheme(value);
      setStatus('ready');
      summarize(session);
    } catch (error) {
      if (!current(session)) return;
      fail(error, session);
      closeSession();
    }
  }
  const busy = status === 'connecting' || status === 'styling';
  return (
    <main className="tiles-demo">
      <p className="eyebrow">KOREA MAP KIT</p>
      <h1>내 타일 서버로 한국 지도 연결</h1>
      <p>
        직접 운영하는 OSM 기반 지도 스타일 주소를 입력하세요. 서버 운영비와 데이터 이용 조건은 해당
        서버를 설정한 운영자가 관리합니다. 이 화면은 연결하기 전까지 지도 서버를 호출하지 않습니다.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void connect();
        }}
        style={{ display: 'grid', gap: 16, marginBlock: 24 }}
      >
        <label style={{ display: 'grid', gap: 8 }}>
          지도 스타일 URL
          <input
            value={address}
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(event) => {
              disconnect();
              setAccepted(false);
              setAddress(event.target.value);
            }}
            aria-describedby="tile-address-help"
            style={{ width: '100%', padding: 12, font: 'inherit' }}
          />
        </label>
        <p id="tile-address-help" style={{ margin: 0 }}>
          HTTPS 또는 localhost 주소를 사용하세요. 브라우저에 공개할 수 있는 주소만 입력하고 비밀
          키는 운영자 서버에서 관리하세요.
        </p>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => {
              setAccepted(event.target.checked);
              if (!event.target.checked) disconnect();
            }}
          />
          이 서버의 운영 비용과 OSM 출처·라이선스 조건을 확인했습니다.
        </label>
        <div className="actions">
          <button type="submit" disabled={busy || !accepted || !address.trim()}>
            지도 연결
          </button>
          <button type="button" disabled={status === 'disconnected'} onClick={disconnect}>
            연결 해제
          </button>
        </div>
      </form>
      <p role="status" data-testid="tiles-status" data-state={status}>
        {statusText[status]}
      </p>
      {notice && <p role="alert">{notice}</p>}
      <div className="actions" style={{ alignItems: 'center', marginBlock: 16 }}>
        <label>
          이동할 지역{' '}
          <select
            value={city}
            disabled={status !== 'ready'}
            onChange={(event) => setCity(event.target.value as City)}
            style={{ padding: 8, font: 'inherit' }}
          >
            {Object.entries(cities).map(([id, value]) => (
              <option key={id} value={id}>
                {value.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={status !== 'ready'} onClick={() => void move()}>
          지역으로 이동
        </button>
        <button
          type="button"
          disabled={status !== 'ready'}
          onClick={() => {
            const rect = container.current?.getBoundingClientRect();
            if (rect) void pick(rect.width / 2, rect.height / 2);
          }}
        >
          지도 중심 장소 찾기
        </button>
      </div>
      {themed && (
        <div className="actions" aria-label="지도 테마" style={{ marginBlock: 16 }}>
          {themeNames.map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={theme === value}
              disabled={status !== 'ready'}
              onClick={() => void changeTheme(value)}
            >
              {value}
            </button>
          ))}
        </div>
      )}
      <div className="tiles-map-shell">
        <div
          ref={container}
          role="region"
          aria-label="자체 한국 지도"
          className="map"
          onPointerDown={(event) => {
            pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
          }}
          onPointerCancel={() => {
            pointer.current = null;
          }}
          onPointerUp={(event) => {
            const start = pointer.current;
            pointer.current = null;
            if (
              !start ||
              start.id !== event.pointerId ||
              Math.hypot(start.x - event.clientX, start.y - event.clientY) > 8
            )
              return;
            if ((event.target as HTMLElement).closest('button,a,select,input')) return;
            const rect = event.currentTarget.getBoundingClientRect();
            void pick(event.clientX - rect.left, event.clientY - rect.top);
          }}
          style={{ height: 540, width: '100%', background: '#e8eee9', borderRadius: 12 }}
        />
        <div className="tiles-zoom" aria-label="지도 확대 축소">
          <button
            type="button"
            aria-label="지도 확대"
            disabled={status !== 'ready'}
            onClick={() => void zoom(1)}
          >
            ＋
          </button>
          <button
            type="button"
            aria-label="지도 축소"
            disabled={status !== 'ready'}
            onClick={() => void zoom(-1)}
          >
            −
          </button>
        </div>
        {(selection || candidates.length > 1) && (
          <section className="tiles-place-card" aria-label="선택한 장소">
            {selection ? (
              <>
                <h2 ref={cardTitle} tabIndex={-1}>
                  {selection.label || '이름 없는 장소'}
                </h2>
                <p>지도에 표시된 장소 · OSM</p>
                <button type="button" onClick={() => void closeCard()}>
                  장소 카드 닫기
                </button>
              </>
            ) : (
              <>
                <h2>가까운 장소 선택</h2>
                <ul>
                  {candidates.map((value) => (
                    <li key={value.key}>
                      <button type="button" onClick={() => void choose(value)}>
                        {value.label || '이름 없는 장소'}
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => setCandidates([])}>
                  선택 취소
                </button>
              </>
            )}
          </section>
        )}
      </div>
      <p className="tiles-help">
        지도 위 장소를 눌러 카드를 여세요. 겹친 장소는 목록에서 선택할 수 있습니다. 드래그하면 진행
        중인 자동 이동이 멈춥니다.
      </p>
      <p role="status" aria-live="polite">
        {selection ? `${selection.label} 선택됨` : origin}
      </p>
      <p data-testid="tiles-camera">{camera}</p>
      <p data-testid="tiles-rendered">
        {features
          ? `화면 도로 ${features.roads}개 · 건물 ${features.buildings}개 · 라벨 ${features.labels}개`
          : '연결 후 화면의 지도 자료를 확인할 수 있습니다.'}
      </p>
      <p data-testid="tiles-labels">{features?.names.join(' · ')}</p>
      <p style={{ fontSize: 13 }}>
        화면에 표시된 도형 수이며 전체 데이터 수가 아닙니다. 지역별 지도 자료와 한글 글꼴은 연결한
        서버에서 제공해야 합니다.
      </p>
    </main>
  );
}
