'use client';
import { useEffect, useRef, useState } from 'react';
import { createMap, createBrowserLocationClient, type MapHandle } from '@korea-map-kit/web';
import { createMockLocationProvider } from '@korea-map-kit/data-adapters';
import {
  createCancellationSource,
  createLocationClient,
  createTrackRecorder,
  createTrackReplay,
  exportTracksGeoJSON,
  exportTracksGPX,
  importTracksGeoJSON,
  importTracksGPX,
  locationAccuracyFeature,
  normalizeError,
  tracksToFeatureCollection,
  type LocationClient,
  type LocationFix,
  type LocationSubscription,
  type Track,
  type TrackReplay,
} from '@korea-map-kit/core';
const scheduler = {
  schedule(fn: () => void, ms: number) {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  },
};
export function GpsDemo() {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<MapHandle | null>(null),
    live = useRef(false);
  const syntheticTime = useRef<number | null>(0),
    baseTime = useRef(1700000000000),
    step = useRef(0);
  const [mock] = useState(createMockLocationProvider);
  const viewOperations = useRef(createCancellationSource());
  const [recorder] = useState(() =>
    createTrackRecorder('current', {
      monotonicMs: () => syntheticTime.current ?? performance.now(),
      epochMs: () =>
        syntheticTime.current === null ? Date.now() : baseTime.current + syntheticTime.current,
    }),
  );
  const browser = useRef<LocationClient | null>(null),
    simulation = useRef<LocationClient | null>(null);
  const subscription = useRef<LocationSubscription | null>(null),
    capture = useRef<ReturnType<typeof createCancellationSource> | null>(null);
  const replay = useRef<TrackReplay | null>(null),
    imported = useRef<readonly Track[]>([]),
    latest = useRef<LocationFix | null>(null);
  const [mode, setMode] = useState('mock'),
    [consent, setConsent] = useState(false),
    [ready, setReady] = useState(false);
  const [snapshot, setSnapshot] = useState(recorder.getSnapshot),
    [status, setStatus] = useState('지도 준비 중');
  const [fileText, setFileText] = useState(''),
    [trackCount, setTrackCount] = useState(0),
    [replayState, setReplayState] = useState('대기');
  function client() {
    return mode === 'mock' ? simulation.current : browser.current;
  }
  function stopWatch() {
    capture.current?.cancel();
    capture.current = null;
    subscription.current?.stop();
    subscription.current = null;
  }
  function report(error: unknown) {
    if (live.current && normalizeError(error).code !== 'ABORTED')
      setStatus(normalizeError(error).code);
  }
  async function paint() {
    const handle = map.current;
    if (!handle || !live.current) return;
    const options = { signal: viewOperations.current.signal };
    const next = recorder.getSnapshot();
    setSnapshot(next);
    const tracks = [next.track, ...imported.current];
    setTrackCount(tracks.filter((t) => t.segments.length).length);
    await handle.api.addGeoJSON('recorded-tracks', tracksToFeatureCollection(tracks), options);
    if (latest.current) {
      await handle.api.addGeoJSON('gps-accuracy', locationAccuracyFeature(latest.current), options);
      await handle.api.addMarker(
        {
          id: 'gps-position',
          coordinate: latest.current.coordinate,
          label: '현재 위치',
        },
        options,
      );
    }
  }
  function pause() {
    stopWatch();
    if (recorder.getSnapshot().state === 'recording') recorder.pause();
    setSnapshot(recorder.getSnapshot());
  }
  useEffect(() => {
    live.current = true;
    viewOperations.current = createCancellationSource();
    browser.current = createBrowserLocationClient();
    simulation.current = createLocationClient(mock.provider, scheduler);
    const abort = new AbortController();
    if (container.current)
      void createMap({
        container: container.current,
        config: { mode: 'local-fixture', fixtureId: 'synthetic-v1' },
        workerUrl: '/vendor/maplibre/maplibre-gl-worker.mjs',
        signal: abort.signal,
      })
        .then(async (handle) => {
          if (abort.signal.aborted) {
            handle.destroy();
            return;
          }
          map.current = handle;
          await handle.ready;
          if (!abort.signal.aborted) await handle.api.setZoom(18);
          if (live.current) {
            setReady(true);
            setStatus('준비 완료');
          }
        })
        .catch(report);
    const hidden = () => {
      if (document.visibilityState !== 'visible') {
        pause();
        setStatus('화면 비활성: 기록 일시정지');
      }
    };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      live.current = false;
      viewOperations.current.cancel();
      stopWatch();
      replay.current?.destroy();
      browser.current?.dispose();
      simulation.current?.dispose();
      recorder.clear();
      mock.clear();
      imported.current = [];
      latest.current = null;
      abort.abort();
      map.current?.destroy();
      map.current = null;
      document.removeEventListener('visibilitychange', hidden);
    };
    // All resources above are created once for this mounted demo; handlers read their refs.
  }, []);
  useEffect(() => {
    if (snapshot.state !== 'recording' || mode === 'mock') return;
    const timer = setInterval(() => setSnapshot(recorder.getSnapshot()), 500);
    return () => clearInterval(timer);
  }, [snapshot.state, mode, recorder]);
  function received(fix: LocationFix) {
    if (!live.current) return;
    const result = recorder.ingest(fix);
    if (result.accepted) {
      latest.current = fix;
      setStatus('위치 기록 중');
    } else setStatus(`제외: ${result.reason}`);
    if (recorder.getSnapshot().state !== 'recording') stopWatch();
    void paint().catch(report);
  }
  async function start(resume = false) {
    const source = createCancellationSource();
    capture.current = source;
    try {
      if (resume) recorder.resume();
      else recorder.start();
      setSnapshot(recorder.getSnapshot());
      setStatus('위치 권한·구독 준비 중');
      const sub = await client()!.watchPosition(
        {
          onLocation: received,
          onError(error) {
            if (!source.signal.aborted && live.current) {
              pause();
              report(error);
            }
          },
        },
        { signal: source.signal, timeoutMs: 10000 },
      );
      if (source.signal.aborted) sub.stop();
      else {
        subscription.current = sub;
        if (live.current) setStatus('위치 구독 중');
      }
    } catch (error) {
      if (!source.signal.aborted && live.current) {
        pause();
        report(error);
      }
    }
  }
  async function currentPosition() {
    const signal = viewOperations.current.signal;
    try {
      const fix = await client()!.getCurrentPosition({ timeoutMs: 10000, signal });
      if (!live.current || signal.aborted) return;
      latest.current = fix;
      await paint();
      await map.current?.api.setCenter(fix.coordinate, { signal });
      setStatus(`현재 위치 · 정확도 ${Math.round(fix.accuracyMeters)}m`);
    } catch (error) {
      report(error);
    }
  }
  function simulate() {
    step.current++;
    syntheticTime.current = step.current * 1000;
    mock.push({
      coordinate: [126.978 + step.current * 0.00005, 37.5665 + step.current * 0.00002],
      accuracyMeters: 8,
      timestampMs: baseTime.current + syntheticTime.current,
    });
  }
  function stop() {
    stopWatch();
    recorder.stop();
    setSnapshot(recorder.getSnapshot());
    setStatus('기록 종료');
  }
  function deleteAll() {
    viewOperations.current.cancel();
    viewOperations.current = createCancellationSource();
    stopWatch();
    replay.current?.destroy();
    replay.current = null;
    recorder.clear();
    mock.clear();
    imported.current = [];
    latest.current = null;
    browser.current?.setConsent(false);
    simulation.current?.setConsent(false);
    setConsent(false);
    setFileText('');
    setSnapshot(recorder.getSnapshot());
    setTrackCount(0);
    setReplayState('대기');
    setStatus('앱 메모리 기록 삭제 완료');
    void Promise.all([
      map.current?.api.removeGeoJSON('recorded-tracks'),
      map.current?.api.removeGeoJSON('gps-accuracy'),
      map.current?.api.removeMarker('gps-position'),
      map.current?.api.removeMarker('gps-replay'),
    ]).catch(report);
  }
  function exportFile(format: 'geojson' | 'gpx') {
    try {
      const tracks = [recorder.getSnapshot().track, ...imported.current];
      const text = format === 'gpx' ? exportTracksGPX(tracks) : exportTracksGeoJSON(tracks);
      setFileText(text);
      const url = URL.createObjectURL(
        new Blob([text], {
          type: format === 'gpx' ? 'application/gpx+xml' : 'application/geo+json',
        }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `korea-map-track.${format}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setStatus('내보내기 완료: 파일에 위치·시각 포함');
    } catch (error) {
      report(error);
    }
  }
  function loadText() {
    try {
      const tracks = fileText.trimStart().startsWith('<')
        ? importTracksGPX(fileText)
        : importTracksGeoJSON(fileText);
      imported.current = tracks.map((track, i) => ({ ...track, id: `loaded-${i}` }));
      void paint().catch(report);
      setStatus('경로 불러오기 완료');
    } catch (error) {
      report(error);
    }
  }
  function replayTrack() {
    try {
      replay.current?.destroy();
      const track = recorder.getSnapshot().track.segments.length
        ? recorder.getSnapshot().track
        : imported.current[0];
      if (!track) return;
      replay.current = createTrackReplay(
        track,
        { monotonicMs: () => performance.now() },
        scheduler,
        (frame) => {
          if (!live.current) return;
          setReplayState(frame.finished ? '완료' : `${Math.round(frame.elapsedMs)}ms`);
          if (frame.coordinate)
            void map.current?.api
              .addMarker({ id: 'gps-replay', coordinate: frame.coordinate, label: '경로 리플레이' })
              .catch(report);
        },
        { speed: 2 },
      );
      replay.current.play();
    } catch (error) {
      report(error);
    }
  }
  return (
    <main>
      <h1>GPS · 이동 경로</h1>
      <p>
        기본값은 모의 GPS입니다. 실제 위치는 동의와 브라우저 권한 허용 후에만 조회합니다. 기록은 이
        화면의 메모리에만 있으며 자동 외부 전송·저장은 없습니다.
      </p>
      <label>
        위치 공급자{' '}
        <select
          value={mode}
          onChange={(e) => {
            deleteAll();
            setMode(e.target.value);
            syntheticTime.current = e.target.value === 'mock' ? step.current * 1000 : null;
          }}
        >
          <option value="mock">모의 GPS</option>
          <option value="browser">이 기기의 브라우저 GPS</option>
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => {
            if (!e.target.checked) {
              deleteAll();
              return;
            }
            setConsent(true);
            browser.current?.setConsent(true);
            simulation.current?.setConsent(true);
          }}
        />
        선택한 공급자의 위치 수집·기록에 동의합니다
      </label>
      <div className="actions" style={{ marginTop: 16 }}>
        <button disabled={!ready || !consent} onClick={() => void currentPosition()}>
          현재 위치
        </button>
        <button
          disabled={!ready || !consent || snapshot.state !== 'idle'}
          onClick={() => void start()}
        >
          기록 시작
        </button>
        <button
          disabled={
            mode !== 'mock' || snapshot.state !== 'recording' || status === '위치 권한·구독 준비 중'
          }
          onClick={simulate}
        >
          모의 GPS 한 걸음
        </button>
        <button disabled={snapshot.state !== 'recording'} onClick={pause}>
          일시정지
        </button>
        <button disabled={!consent || snapshot.state !== 'paused'} onClick={() => void start(true)}>
          재개
        </button>
        <button disabled={!['recording', 'paused'].includes(snapshot.state)} onClick={stop}>
          종료
        </button>
        <button disabled={!ready} onClick={deleteAll}>
          모든 기록 삭제
        </button>
      </div>
      <p role="status" data-testid="gps-status">
        {status}
      </p>
      <p data-testid="gps-metrics">
        {snapshot.state} · {snapshot.pointCount}점 · {snapshot.distanceMeters.toFixed(1)}m · 활성
        기록 {((snapshot.track.durationMs ?? 0) / 1000).toFixed(1)}초 · 정확도{' '}
        {snapshot.accuracyMeters ?? latest.current?.accuracyMeters ?? '-'}m · 제외{' '}
        {snapshot.rejectedCount}건
      </p>
      <p>
        활성 기록 시간에는 멈춰 있던 시간이 포함됩니다. 일시정지·GPS 공백 사이를 직선으로 연결하지
        않습니다.
      </p>
      <div className="actions">
        <button onClick={() => exportFile('geojson')}>GeoJSON 내보내기</button>
        <button onClick={() => exportFile('gpx')}>GPX 내보내기</button>
        <button disabled={!trackCount || snapshot.state === 'recording'} onClick={replayTrack}>
          경로 리플레이
        </button>
        <button disabled={!replay.current} onClick={() => replay.current?.pause()}>
          리플레이 일시정지
        </button>
        <button disabled={!replay.current} onClick={() => replay.current?.play()}>
          리플레이 재개
        </button>
      </div>
      <p data-testid="gps-replay">리플레이: {replayState}</p>
      <label>
        경로 파일{' '}
        <input
          type="file"
          accept=".gpx,.geojson,.json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            const signal = viewOperations.current.signal;
            if (!file) return;
            if (file.size > 2097152) {
              setStatus('파일 크기 제한 초과');
              return;
            }
            void file
              .text()
              .then((text) => {
                if (live.current && !signal.aborted) setFileText(text);
              })
              .catch(report);
          }}
        />
      </label>
      <label style={{ display: 'block' }}>
        경로 파일 내용
        <textarea
          spellCheck={false}
          autoComplete="off"
          aria-label="경로 파일 내용"
          maxLength={2097152}
          value={fileText}
          onChange={(e) => setFileText(e.target.value)}
          style={{ display: 'block', width: '100%', height: 90 }}
        />
      </label>
      <button disabled={!fileText || !ready || snapshot.state === 'recording'} onClick={loadText}>
        경로 불러오기
      </button>
      <p data-testid="gps-tracks">표시 경로 {trackCount}개</p>
      <p>
        내보낸 파일에는 위치·시각이 포함됩니다. 이 화면의 삭제는 이미 다운로드하거나 다른 앱에
        저장한 파일까지 삭제하지 않습니다. GPX에서는 정확도와 활성 기록 시간 메타데이터가 보존되지
        않습니다.
      </p>
      <div ref={container} style={{ position: 'relative', width: '100%', height: 500 }} />
    </main>
  );
}
