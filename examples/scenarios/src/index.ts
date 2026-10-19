import {
  boundsFromCoordinates,
  createCancellationSource,
  createTrackRecorder,
  createTrackReplay,
  defineMapStyle,
  normalizeError,
  normalizeSearchText,
  tracksToFeatureCollection,
  trackDistanceMeters,
  validateTrack,
  type Coordinate,
  type MapController,
  type MapStyle,
  type Place,
  type Scheduler,
  type SearchProvider,
  type Track,
  type TrackingClock,
} from '@korea-map-kit/core';
import { createThemeStyle, designAttribution, type ThemeName } from '@korea-map-kit/styles';

export type ScenarioKind = 'walk' | 'trip';
export interface DemoStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
export const storageKey = 'kmk-synthetic-scenarios-v1';
export const places: readonly Place[] = [
  ['park', '구름 공원 (가상)', '공원', 126.977, 37.566],
  ['vet', '별빛 동물병원 (가상)', '동물병원', 126.98, 37.568],
  ['salon', '몽실 미용실 (가상)', '미용실', 126.975, 37.569],
  ['museum', '종이 박물관 (가상)', '여행', 126.982, 37.571],
  ['cafe', '바람 카페 (가상)', '여행', 126.985, 37.565],
  ['garden', '달빛 정원 (가상)', '여행', 126.973, 37.563],
].map(([id, label, category, longitude, latitude]) => ({
  id: String(id),
  label: String(label),
  coordinate: [Number(longitude), Number(latitude)],
  categories: [String(category)],
  provenance: { sourceId: 'project-synthetic', datasetVersion: '1' },
}));
export const searchProvider: SearchProvider = {
  capabilities: { autocomplete: false, reverse: false },
  async search(query, options) {
    if (options?.signal?.aborted) throw new Error('ABORTED');
    const text = normalizeSearchText(query.text);
    return places
      .filter((place) => normalizeSearchText(place.label).includes(text))
      .slice(0, query.limit);
  },
};
export function scenarioStyle(theme: ThemeName): MapStyle {
  return defineMapStyle(
    createThemeStyle({
      theme,
      target: 'native',
      data: { mode: 'fixture' },
      typography: { mode: 'none' },
    }),
    `${designAttribution} · 모든 장소·사용자·GPS는 가상`,
  );
}
export function simulatedCoordinate(step: number): Coordinate {
  return [
    126.977 + (Math.floor(step / 60) % 2 === 0 ? step % 60 : 59 - (step % 60)) * 0.000025,
    37.566 + Math.floor(step / 60) * 0.000025,
  ];
}
export interface Visit {
  id: string;
  day: 1 | 2 | 3;
}
interface Saved {
  walks: Track[];
  visits: Visit[];
}
export interface ScenarioSnapshot {
  ready: boolean;
  busy: boolean;
  status: string;
  state: string;
  theme: ThemeName;
  points: number;
  meters: number;
  saved: Saved;
  results: readonly Place[];
  day: 1 | 2 | 3;
  selected: Place | null;
  replaying: boolean;
}
function decode(text: string | null): Saved {
  if (text === null) return { walks: [], visits: [] };
  if (text.length > 200000) throw new Error('STORAGE_LIMIT');
  const value = JSON.parse(text) as { version: number; walks: Track[]; visits: Visit[] };
  if (
    value.version !== 1 ||
    !Array.isArray(value.walks) ||
    !Array.isArray(value.visits) ||
    value.walks.length > 5 ||
    value.visits.length > 18
  )
    throw new Error('INVALID_DEMO_STORAGE');
  const walks = value.walks.map((walk) => {
    const track = validateTrack(walk);
    if (!/^demo-walk-[0-9]+$/.test(track.id)) throw new Error('NON_SYNTHETIC_TRACK');
    for (const point of track.segments.flat()) {
      if (
        !Array.from({ length: 120 }, (_, i) => simulatedCoordinate(i)).some(
          (c) => c[0] === point.coordinate[0] && c[1] === point.coordinate[1],
        )
      )
        throw new Error('NON_SYNTHETIC_COORDINATE');
    }
    return track;
  });
  const keys = new Set<string>();
  const visits = value.visits.map((v) => {
    const key = `${v.day}:${v.id}`;
    if (![1, 2, 3].includes(v.day) || !places.some((p) => p.id === v.id) || keys.has(key))
      throw new Error('INVALID_DEMO_VISIT');
    keys.add(key);
    return { id: v.id, day: v.day };
  });
  return { walks, visits };
}
/** App-only session. Both platform UIs inject precisely the same public MapController. */
export function createScenarioSession(
  kind: ScenarioKind,
  map: MapController,
  storage: DemoStorage,
  scheduler: Scheduler,
  clock: Pick<TrackingClock, 'monotonicMs'>,
  changed: (state: ScenarioSnapshot) => void,
) {
  let disposed = false,
    blockedStorage = false,
    step = 0,
    time = 0,
    trackSerial = 0;
  let cancelTick = () => {},
    replay: ReturnType<typeof createTrackReplay> | undefined;
  const lifetime = createCancellationSource(),
    options = { signal: lifetime.signal };
  let recorder = makeRecorder();
  let snapshot: ScenarioSnapshot = {
    ready: false,
    busy: false,
    status: '지도 준비 중',
    state: 'idle',
    theme: kind === 'walk' ? 'pastel' : 'standard',
    points: 0,
    meters: 0,
    saved: { walks: [], visits: [] },
    results: places,
    day: 1,
    selected: null,
    replaying: false,
  };
  function makeRecorder() {
    return createTrackRecorder(
      `demo-walk-${++trackSerial}`,
      { monotonicMs: () => time, epochMs: () => 1700000000000 + time },
      { maxPoints: 120, minDistanceMeters: 1 },
    );
  }
  function update(patch: Partial<ScenarioSnapshot>) {
    if (!disposed) {
      snapshot = { ...snapshot, ...patch };
      changed(snapshot);
    }
  }
  async function run(action: () => Promise<void>) {
    if (disposed || snapshot.busy) return;
    update({ busy: true });
    try {
      await action();
    } catch (error) {
      if (!disposed) update({ status: `오류: ${normalizeError(error).code}` });
    } finally {
      update({ busy: false });
    }
  }
  async function persist(next: Saved) {
    if (blockedStorage) throw new Error('RESET_CORRUPT_STORAGE_FIRST');
    await storage.setItem(storageKey, JSON.stringify({ version: 1, ...next }));
    update({ saved: next });
  }
  async function fit(coordinates: readonly Coordinate[]) {
    if (!coordinates.length) return;
    if (coordinates.length === 1) {
      await map.setCenter(coordinates[0]!, options);
      await map.setZoom(16, options);
    } else await map.fitBounds(boundsFromCoordinates(coordinates), { padding: 36 }, options);
  }
  function metrics() {
    const s = recorder.getSnapshot();
    update({ state: s.state, points: s.pointCount, meters: s.distanceMeters });
  }
  async function paintWalk() {
    metrics();
    await map.addGeoJSON(
      'walk-track',
      tracksToFeatureCollection([recorder.getSnapshot().track]),
      options,
    );
    await map.addMarker(
      {
        id: 'current',
        label: '모의 현재 위치',
        coordinate: simulatedCoordinate(Math.max(0, step - 1)),
      },
      options,
    );
  }
  async function paintTrip() {
    for (const p of places) await map.removeMarker(p.id, options);
    const visits = snapshot.saved.visits.filter((v) => v.day === snapshot.day);
    const selected = visits.map((v) => places.find((p) => p.id === v.id)!);
    for (const [i, p] of selected.entries())
      await map.addMarker(
        { id: p.id, label: `${snapshot.day}일차 ${i + 1}. ${p.label}`, coordinate: p.coordinate },
        options,
      );
    await map.removeGeoJSON('trip-order', options);
    if (selected.length > 1)
      await map.showRoute(
        { id: 'trip-order', coordinates: selected.map((p) => p.coordinate) },
        options,
      );
    await fit(selected.map((p) => p.coordinate));
  }
  function pause() {
    cancelTick();
    if (recorder.getSnapshot().state === 'recording') recorder.pause();
    replay?.pause();
    update({ replaying: false });
    metrics();
  }
  function schedule() {
    cancelTick();
    if (disposed || recorder.getSnapshot().state !== 'recording') return;
    cancelTick = scheduler.schedule(() => {
      void run(async () => {
        if (recorder.getSnapshot().state !== 'recording') return;
        time += 1000;
        recorder.ingest({
          coordinate: simulatedCoordinate(step++),
          timestampMs: 1700000000000 + time,
          accuracyMeters: 5,
        });
        await paintWalk();
        if (step >= 120) {
          pause();
          update({ status: '합성 경로 최대 120점에 도달했습니다' });
        }
      }).then(schedule);
    }, 1000);
  }
  const off = map.onEvent((event) => {
    if (event.type === 'select')
      update({ selected: places.find((p) => p.id === event.marker?.id) ?? null });
    if (event.type === 'error' && event.fatal) {
      pause();
      update({ ready: false, status: '지도 오류: 화면을 다시 열어주세요' });
    }
  });
  return {
    getSnapshot: () => snapshot,
    initialize: () =>
      run(async () => {
        try {
          const saved = decode(await storage.getItem(storageKey));
          trackSerial = Math.max(0, ...saved.walks.map((w) => Number(w.id.slice(10))));
          recorder = makeRecorder();
          update({ saved });
        } catch {
          blockedStorage = true;
          update({ status: '저장 자료 오류: 데모 초기화가 필요합니다' });
        }
        await map.setStyle(scenarioStyle(snapshot.theme), options);
        await fit(places.map((p) => p.coordinate));
        if (kind === 'walk')
          for (const p of places.slice(0, 3))
            await map.addMarker({ id: p.id, label: p.label, coordinate: p.coordinate }, options);
        else await paintTrip();
        update({ ready: true, ...(blockedStorage ? {} : { status: '준비 완료 · 합성 데이터' }) });
      }),
    current: () =>
      run(async () => {
        await map.addMarker(
          {
            id: 'current',
            label: '모의 현재 위치',
            coordinate: simulatedCoordinate(Math.max(0, step - 1)),
          },
          options,
        );
        await fit([simulatedCoordinate(Math.max(0, step - 1))]);
        update({ status: '모의 현재 위치 · 센서 미사용' });
      }),
    start: () =>
      run(async () => {
        replay?.destroy();
        replay = undefined;
        update({ replaying: false });
        recorder = makeRecorder();
        step = 0;
        recorder.start();
        time += 1000;
        recorder.ingest({
          coordinate: simulatedCoordinate(step++),
          timestampMs: 1700000000000 + time,
          accuracyMeters: 5,
        });
        await paintWalk();
        update({ status: '산책 기록 중' });
        schedule();
      }),
    pause: () => {
      pause();
      update({ status: '일시정지' });
    },
    resume: () =>
      run(async () => {
        recorder.resume();
        metrics();
        update({ status: '산책 기록 중' });
        schedule();
      }),
    finish: () =>
      run(async () => {
        pause();
        recorder.stop();
        metrics();
        update({ status: '산책 종료 · 저장할 수 있습니다' });
      }),
    saveWalk: () =>
      run(async () => {
        if (recorder.getSnapshot().state !== 'stopped' || snapshot.points < 2)
          throw new Error('FINISH_WALK_FIRST');
        const track = recorder.getSnapshot().track;
        await persist({
          ...snapshot.saved,
          walks: [...snapshot.saved.walks.filter((w) => w.id !== track.id), track].slice(-5),
        });
        update({ status: '산책 저장 완료' });
      }),
    replay: (id: string) =>
      run(async () => {
        pause();
        replay?.destroy();
        replay = undefined;
        const track = snapshot.saved.walks.find((w) => w.id === id);
        if (!track) throw new Error('TRACK_REQUIRED');
        await map.addGeoJSON('walk-track', tracksToFeatureCollection([track]), options);
        await fit(track.segments.flat().map((p) => p.coordinate));
        update({
          replaying: true,
          state: 'replay',
          points: track.segments.flat().length,
          meters: trackDistanceMeters(track),
          status: '저장 경로 다시 보기',
        });
        let painting = false;
        replay = createTrackReplay(
          track,
          clock,
          scheduler,
          (frame) => {
            if (!frame.coordinate || disposed) return;
            if (frame.finished) update({ replaying: false, status: '경로 다시 보기 완료' });
            if (painting && !frame.finished) return;
            painting = true;
            void map
              .addMarker(
                { id: 'current', label: '모의 경로 재생', coordinate: frame.coordinate },
                options,
              )
              .catch(() => {})
              .finally(() => {
                painting = false;
              });
          },
          { speed: 4, tickMs: 250 },
        );
        replay.play();
      }),
    theme: (theme: 'pastel' | 'outdoor') =>
      run(async () => {
        await map.setStyle(scenarioStyle(theme), options);
        update({ theme });
      }),
    search: (text: string) =>
      run(async () => {
        const results = await searchProvider.search({ text, language: 'ko', limit: 20 }, options);
        update({
          results,
          status: results.length ? `${results.length}개 가상 장소` : '검색 결과 없음',
        });
      }),
    focus: (id: string) =>
      run(async () => {
        const place = places.find((p) => p.id === id);
        if (!place) return;
        update({ selected: place });
        await map.setCenter(place.coordinate, options);
        await map.setZoom(16, options);
      }),
    closeCard: () => update({ selected: null }),
    savePlace: (id: string) =>
      run(async () => {
        if (!places.some((p) => p.id === id)) throw new Error('UNKNOWN_PLACE');
        if (!snapshot.saved.visits.some((v) => v.day === snapshot.day && v.id === id))
          await persist({
            ...snapshot.saved,
            visits: [...snapshot.saved.visits, { id, day: snapshot.day }],
          });
        await paintTrip();
        update({ status: '일정 저장 완료' });
      }),
    removePlace: (id: string) =>
      run(async () => {
        await persist({
          ...snapshot.saved,
          visits: snapshot.saved.visits.filter((v) => !(v.id === id && v.day === snapshot.day)),
        });
        await paintTrip();
      }),
    day: (day: 1 | 2 | 3) =>
      run(async () => {
        update({ day, selected: null });
        await paintTrip();
        update({ status: `${day}일차 일정` });
      }),
    reset: () =>
      run(async () => {
        pause();
        replay?.destroy();
        replay = undefined;
        await storage.removeItem(storageKey);
        blockedStorage = false;
        recorder.clear();
        metrics();
        update({
          saved: { walks: [], visits: [] },
          selected: null,
          status: '데모 저장 자료 삭제 완료',
        });
        await map.removeGeoJSON('walk-track', options);
        await map.removeMarker('current', options);
        if (kind === 'trip') await paintTrip();
      }),
    background: () => {
      pause();
      update({ status: '화면 비활성: 일시정지' });
    },
    dispose() {
      if (disposed) return;
      pause();
      disposed = true;
      cancelTick();
      replay?.destroy();
      replay = undefined;
      lifetime.cancel();
      off();
      recorder.clear();
    },
  };
}
export type ScenarioSession = ReturnType<typeof createScenarioSession>;

export function scenarioActions(
  kind: ScenarioKind,
  session: ScenarioSession,
  state: ScenarioSnapshot,
) {
  const action = (
    id: string,
    label: string,
    run: () => void | Promise<void>,
    disabled = false,
  ) => ({ id, label, run, disabled: disabled || !state.ready || state.busy });
  return kind === 'walk'
    ? [
        action('current', '모의 현재 위치', session.current),
        action('start', '산책 시작', session.start, ['recording', 'paused'].includes(state.state)),
        action('pause', '일시정지', session.pause, state.state !== 'recording'),
        action('resume', '산책 재개', session.resume, state.state !== 'paused'),
        action(
          'finish',
          '산책 종료',
          session.finish,
          !['recording', 'paused'].includes(state.state),
        ),
        action(
          'save',
          '산책 저장',
          session.saveWalk,
          state.state !== 'stopped' || state.points < 2,
        ),
        action(
          'pastel',
          'Pastel 테마',
          () => session.theme('pastel'),
          state.replaying || state.state === 'recording',
        ),
        action(
          'outdoor',
          'Outdoor 테마',
          () => session.theme('outdoor'),
          state.replaying || state.state === 'recording',
        ),
        ...state.saved.walks.map((walk, i) =>
          action(
            walk.id,
            `저장 산책 ${i + 1} 다시 보기`,
            () => session.replay(walk.id),
            state.state === 'recording',
          ),
        ),
      ]
    : ([1, 2, 3] as const).map((day) =>
        action(`day-${day}`, `${day}일차 보기`, () => session.day(day)),
      );
}
