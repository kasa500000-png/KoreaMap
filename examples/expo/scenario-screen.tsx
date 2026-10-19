import { useEffect, useRef, useState } from 'react';
import { AppState, Button, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MapView, type MapController } from 'korea-map-native';
import {
  createScenarioSession,
  places,
  scenarioActions,
  scenarioStyle,
  type ScenarioKind,
  type ScenarioSession,
  type ScenarioSnapshot,
} from '@korea-map-kit/example-scenarios';
const scheduler = {
  schedule(fn: () => void, ms: number) {
    const timer = setTimeout(fn, ms);
    return () => clearTimeout(timer);
  },
};
export function ScenarioScreen({ kind }: { kind: ScenarioKind }) {
  const map = useRef<MapController>(null),
    app = useRef<ScenarioSession | null>(null);
  const live = useRef(true);
  const [state, setState] = useState<ScenarioSnapshot>(),
    [query, setQuery] = useState(''),
    [gestures, setGestures] = useState(false);
  const [config] = useState(() => ({
    mode: 'operator' as const,
    style: scenarioStyle(kind === 'walk' ? 'pastel' : 'standard'),
    resources: { allowedOrigins: [] },
  }));
  useEffect(() => {
    live.current = true;
    const off = AppState.addEventListener('change', (value) => {
      if (value !== 'active') app.current?.background();
    });
    return () => {
      live.current = false;
      off.remove();
      app.current?.dispose();
      app.current = null;
    };
  }, []);
  const session = app.current,
    busy = !state?.ready || state.busy;
  return (
    <ScrollView
      scrollEnabled={!gestures}
      contentContainerStyle={{
        padding: 14,
        backgroundColor: kind === 'walk' ? '#f6faf3' : '#f4f7fc',
        gap: 10,
      }}
    >
      <Text style={{ fontSize: 26, fontWeight: '700', color: '#203b32' }}>
        {kind === 'walk' ? '몽실 산책 지도' : '차곡 여행 지도'}
      </Text>
      <Text style={{ color: '#334b40' }}>가상 사용자·장소·GPS. 실제 위치를 수집하지 않습니다.</Text>
      <Text testID="scenario-status" accessibilityLiveRegion="polite">
        {state?.status ?? '지도 준비 중'}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text>지도 조작 (끄면 화면 스크롤)</Text>
        <Switch accessibilityLabel="지도 조작" value={gestures} onValueChange={setGestures} />
      </View>
      <View style={{ height: 320 }}>
        <MapView
          ref={map}
          config={config}
          gesturesEnabled={gestures}
          onEvent={(event) => {
            if (event.type === 'ready' && map.current && !app.current && live.current) {
              app.current = createScenarioSession(
                kind,
                map.current,
                AsyncStorage,
                scheduler,
                {
                  monotonicMs: () =>
                    (globalThis as unknown as { performance: { now(): number } }).performance.now(),
                },
                (next) => {
                  if (live.current) setState(next);
                },
              );
              setState(app.current.getSnapshot());
              void app.current.initialize();
            }
          }}
        />
      </View>
      <Text>
        {kind === 'walk'
          ? '가상 공원 · 동물병원 · 미용실'
          : `${state?.day ?? 1}일차 · 방문 순서 연결선 (실제 도로 경로 아님)`}
      </Text>
      {session && state ? (
        <>
          <Text testID="scenario-metrics">
            {kind === 'walk'
              ? `${state.state} · ${state.points}점 · ${state.meters.toFixed(1)}m · 저장 ${state.saved.walks.length}개 · ${state.theme}`
              : `${state.day}일차 · 저장 ${state.saved.visits.filter((v) => v.day === state.day).length}곳 · Standard`}
          </Text>
          <View style={{ gap: 6 }}>
            {scenarioActions(kind, session, state).map((a) => (
              <Button
                key={a.id}
                title={a.label}
                disabled={a.disabled}
                onPress={() => void a.run()}
              />
            ))}
          </View>
          {kind === 'trip' ? (
            <>
              <TextInput
                accessibilityLabel="방문 장소 검색"
                placeholder="가상 장소 이름"
                maxLength={120}
                value={query}
                onChangeText={setQuery}
                style={{
                  padding: 12,
                  borderWidth: 1,
                  borderColor: '#8ca49c',
                  borderRadius: 8,
                  backgroundColor: 'white',
                  color: '#203b32',
                }}
              />
              <Button title="검색" disabled={busy} onPress={() => void session.search(query)} />
              {state.results.map((p) => (
                <View key={p.id} style={{ padding: 6, backgroundColor: '#fff' }}>
                  <Button
                    title={p.label}
                    disabled={busy}
                    onPress={() => void session.focus(p.id)}
                  />
                  <Button
                    title={`${p.label} 저장`}
                    disabled={
                      busy || state.saved.visits.some((v) => v.id === p.id && v.day === state.day)
                    }
                    onPress={() => void session.savePlace(p.id)}
                  />
                </View>
              ))}
              <Text style={{ fontSize: 18, fontWeight: '700' }}>{state.day}일차 방문 순서</Text>
              {state.saved.visits
                .filter((v) => v.day === state.day)
                .map((v) => (
                  <View key={v.id}>
                    <Button
                      title={places.find((p) => p.id === v.id)!.label}
                      disabled={busy}
                      onPress={() => void session.focus(v.id)}
                    />
                    <Button
                      title={`${v.id} 일정 삭제`}
                      disabled={busy}
                      onPress={() => void session.removePlace(v.id)}
                    />
                  </View>
                ))}
            </>
          ) : (
            places
              .slice(0, 3)
              .map((p) => (
                <Button
                  key={p.id}
                  title={p.label}
                  disabled={busy}
                  onPress={() => void session.focus(p.id)}
                />
              ))
          )}
          {state.selected ? (
            <View accessibilityLabel="장소 카드" style={{ padding: 14, backgroundColor: 'white' }}>
              <Text style={{ fontWeight: '700' }}>{state.selected.label}</Text>
              <Text>{state.selected.categories.join(' · ')} · 자체 합성 장소</Text>
              <Button title="장소 카드 닫기" onPress={session.closeCard} />
            </View>
          ) : null}
          <Button
            title="모든 데모 저장 자료 삭제"
            disabled={busy}
            onPress={() => void session.reset()}
          />
        </>
      ) : null}
      <Text>MIT · 자체 합성 데이터 · 저장은 이 기기의 앱에만 유지됩니다.</Text>
    </ScrollView>
  );
}
