import { useEffect, useRef, useState } from 'react';
import { AppState, Button, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import { MapView, createExpoLocationClient } from '@korea-map-kit/native';
import {
  KitError,
  createCancellationSource,
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
  type MapController,
  type Track,
  type TrackReplay,
} from '@korea-map-kit/core';
const scheduler = {
  schedule(fn: () => void, ms: number) {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  },
};
const clock = {
  monotonicMs() {
    const timer = (globalThis as unknown as { performance?: { now(): number } }).performance;
    if (!timer) throw new KitError('UNAVAILABLE', 'MONOTONIC_CLOCK_REQUIRED');
    return timer.now();
  },
  epochMs: () => Date.now(),
};
export function GpsDemo() {
  const map = useRef<MapController>(null),
    client = useRef<LocationClient | null>(null),
    live = useRef(false);
  const subscription = useRef<LocationSubscription | null>(null),
    source = useRef<ReturnType<typeof createCancellationSource> | null>(null),
    replay = useRef<TrackReplay | null>(null);
  const loaded = useRef<readonly Track[]>([]);
  const viewOperations = useRef(createCancellationSource());
  const [recorder] = useState(() =>
    createTrackRecorder('native-current', {
      monotonicMs: clock.monotonicMs,
      epochMs: () => Date.now(),
    }),
  );
  const [snapshot, setSnapshot] = useState(recorder.getSnapshot),
    [consent, setConsent] = useState(false),
    [ready, setReady] = useState(false),
    [status, setStatus] = useState('동의 후에만 위치를 수집합니다');
  const [text, setText] = useState('');
  function stopWatch() {
    source.current?.cancel();
    source.current = null;
    subscription.current?.stop();
    subscription.current = null;
  }
  function pause() {
    stopWatch();
    if (recorder.getSnapshot().state === 'recording') recorder.pause();
    if (live.current) setSnapshot(recorder.getSnapshot());
  }
  function error(value: unknown) {
    if (live.current && normalizeError(value).code !== 'ABORTED')
      setStatus(normalizeError(value).code);
  }
  async function paint(fix?: LocationFix) {
    if (!live.current || !map.current) return;
    const options = { signal: viewOperations.current.signal };
    const next = recorder.getSnapshot();
    setSnapshot(next);
    await map.current.addGeoJSON(
      'gps-tracks',
      tracksToFeatureCollection([next.track, ...loaded.current]),
      options,
    );
    if (fix) {
      await map.current.addGeoJSON('gps-accuracy', locationAccuracyFeature(fix), options);
      await map.current.addMarker(
        {
          id: 'gps-position',
          coordinate: fix.coordinate,
          label: '현재 위치',
        },
        options,
      );
      await map.current.setCenter(fix.coordinate, options);
    }
  }
  useEffect(() => {
    live.current = true;
    viewOperations.current = createCancellationSource();
    client.current = createExpoLocationClient(Location, AppState, scheduler);
    return () => {
      live.current = false;
      viewOperations.current.cancel();
      stopWatch();
      replay.current?.destroy();
      client.current?.dispose();
      recorder.clear();
      loaded.current = [];
    };
  }, [recorder]);
  useEffect(() => {
    if (snapshot.state !== 'recording') return;
    const timer = setInterval(() => setSnapshot(recorder.getSnapshot()), 1000);
    return () => clearInterval(timer);
  }, [snapshot.state, recorder]);
  async function start() {
    const cancel = createCancellationSource();
    source.current = cancel;
    try {
      if (recorder.getSnapshot().state === 'paused') recorder.resume();
      else recorder.start();
      setSnapshot(recorder.getSnapshot());
      const active = await client.current!.watchPosition(
        {
          onLocation(fix) {
            if (!live.current) return;
            const result = recorder.ingest(fix);
            setStatus(
              result.accepted
                ? `정확도 ${fix.accuracyMeters.toFixed(0)}m`
                : `제외: ${result.reason}`,
            );
            if (recorder.getSnapshot().state !== 'recording') stopWatch();
            void paint(result.accepted ? fix : undefined).catch(error);
          },
          onError(reason) {
            if (!cancel.signal.aborted) {
              pause();
              error(reason);
            }
          },
        },
        { signal: cancel.signal },
      );
      if (cancel.signal.aborted) active.stop();
      else subscription.current = active;
    } catch (reason) {
      if (!cancel.signal.aborted) {
        pause();
        error(reason);
      }
    }
  }
  async function current() {
    const signal = viewOperations.current.signal;
    try {
      const fix = await client.current!.getCurrentPosition({ signal });
      if (signal.aborted || !live.current) return;
      await paint(fix);
      if (live.current) setStatus(`현재 위치 · 정확도 ${fix.accuracyMeters.toFixed(0)}m`);
    } catch (reason) {
      error(reason);
    }
  }
  function clear() {
    viewOperations.current.cancel();
    viewOperations.current = createCancellationSource();
    stopWatch();
    replay.current?.destroy();
    replay.current = null;
    recorder.clear();
    loaded.current = [];
    client.current?.setConsent(false);
    setConsent(false);
    setText('');
    setSnapshot(recorder.getSnapshot());
    setStatus('앱 메모리 기록 삭제 완료');
    void Promise.all([
      map.current?.removeGeoJSON('gps-tracks'),
      map.current?.removeGeoJSON('gps-accuracy'),
      map.current?.removeMarker('gps-position'),
      map.current?.removeMarker('gps-replay'),
    ]).catch(error);
  }
  function load() {
    try {
      loaded.current = (
        text.trimStart().startsWith('<') ? importTracksGPX(text) : importTracksGeoJSON(text)
      ).map((track, i) => ({ ...track, id: `loaded-${i}` }));
      void paint().catch(error);
      setStatus(`불러온 경로 ${loaded.current.length}개`);
    } catch (reason) {
      error(reason);
    }
  }
  function exportText(format: 'gpx' | 'geojson') {
    try {
      const tracks = [recorder.getSnapshot().track, ...loaded.current];
      setText(format === 'gpx' ? exportTracksGPX(tracks) : exportTracksGeoJSON(tracks));
      setStatus('내보낸 내용을 선택·복사할 수 있습니다');
    } catch (reason) {
      error(reason);
    }
  }
  function play() {
    try {
      replay.current?.destroy();
      const track = recorder.getSnapshot().track.segments.length
        ? recorder.getSnapshot().track
        : loaded.current[0];
      if (!track) return;
      replay.current = createTrackReplay(
        track,
        { monotonicMs: clock.monotonicMs },
        scheduler,
        (frame) => {
          if (!live.current) return;
          setStatus(frame.finished ? '리플레이 완료' : '리플레이 중');
          if (frame.coordinate)
            void map.current
              ?.addMarker({ id: 'gps-replay', coordinate: frame.coordinate, label: '리플레이' })
              .catch(error);
        },
      );
      replay.current.play();
    } catch (reason) {
      error(reason);
    }
  }
  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ maxHeight: 350, padding: 12 }}>
        <Text>GPS 경로 · 화면이 비활성화되면 수집 중단, 자동 재개 없음</Text>
        <Text>
          메모리만 사용하며 외부 전송·자동 저장하지 않습니다. 배경 지도는 자체 합성입니다.
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text>위치 수집·기록 동의</Text>
          <Switch
            accessibilityLabel="위치 수집 동의"
            value={consent}
            onValueChange={(value) => {
              if (!value) clear();
              else {
                setConsent(true);
                client.current?.setConsent(true);
              }
            }}
          />
        </View>
        <Text accessibilityLiveRegion="polite">{status}</Text>
        <Text>
          {snapshot.state} · {snapshot.pointCount}점 · {snapshot.distanceMeters.toFixed(1)}m · 활성
          기록 {((snapshot.track.durationMs ?? 0) / 1000).toFixed(1)}초
        </Text>
        <Button title="현재 위치" disabled={!consent || !ready} onPress={() => void current()} />
        <Button
          title={snapshot.state === 'paused' ? '기록 재개' : '기록 시작'}
          disabled={!consent || !ready || !['idle', 'paused'].includes(snapshot.state)}
          onPress={() => void start()}
        />
        <Button title="일시정지" disabled={snapshot.state !== 'recording'} onPress={pause} />
        <Button
          title="종료"
          disabled={!['recording', 'paused'].includes(snapshot.state)}
          onPress={() => {
            stopWatch();
            recorder.stop();
            setSnapshot(recorder.getSnapshot());
          }}
        />
        <Button title="모든 기록 삭제" onPress={clear} />
        <Button title="GeoJSON 내보내기" onPress={() => exportText('geojson')} />
        <Button title="GPX 내보내기" onPress={() => exportText('gpx')} />
        <Text>
          파일 내용에는 위치·시각이 포함됩니다. 다른 앱에 복사한 기록은 별도로 삭제하세요.
        </Text>
        <TextInput
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          accessibilityLabel="경로 파일 내용"
          multiline
          maxLength={2097152}
          value={text}
          onChangeText={setText}
          style={{ minHeight: 80, borderWidth: 1 }}
        />
        <Button
          title="경로 불러오기"
          disabled={!text || snapshot.state === 'recording' || !ready}
          onPress={load}
        />
        <Button
          title="경로 리플레이"
          disabled={snapshot.state === 'recording' || !ready}
          onPress={play}
        />
      </ScrollView>
      <MapView
        ref={map}
        config={{ mode: 'local-fixture', fixtureId: 'synthetic-v1' }}
        onEvent={(event) => {
          if (event.type === 'ready') setReady(true);
          if (event.type === 'error') error(event.error);
        }}
      />
    </View>
  );
}
