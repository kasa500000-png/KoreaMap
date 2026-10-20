'use client';

import { useEffect, useRef, useState } from 'react';
import { KitError, defineMapStyle, normalizeError } from 'korea-map-core';
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
    const candidates = [
      'korea-road-major',
      'korea-road-minor',
      'korea-building',
      'korea-label-place',
      'korea-label-road',
      'korea-label-poi',
    ];
    const layers = candidates.filter((id) => session.layers.includes(id));
    const rendered = layers.length ? map.getRenderedFeatures(layers) : [];
    const labels = rendered.filter((feature) => feature.layerId.startsWith('korea-label-'));
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
        signal: session.controller.signal,
      });
      if (!current(session)) {
        map.destroy();
        return;
      }
      session.map = map;
      session.unsubscribe.push(
        map.on('idle', () => summarize(session)),
        map.on('camera', (value) => {
          if (current(session))
            setCamera(
              `${value.center.map((number) => number.toFixed(5)).join(', ')} · z${value.zoom.toFixed(1)}`,
            );
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
      await session.map.api.setCenter(cities[city].center);
      await session.map.api.setZoom(14);
      if (current(session)) summarize(session);
    } catch (error) {
      fail(error, session);
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
    <main>
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
      <div
        ref={container}
        role="region"
        aria-label="자체 한국 지도"
        className="map"
        style={{ height: 540, width: '100%', background: '#e8eee9', borderRadius: 12 }}
      />
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
