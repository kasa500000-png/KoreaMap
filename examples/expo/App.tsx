import { View, Text, StyleSheet, Button, ScrollView, Switch } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  defineMapStyle,
  normalizeError,
  type MapController,
  type MapInteractionController,
} from 'korea-map-core';
import {
  createCartographyStyle,
  designAttribution,
  themeNames,
  type ThemeName,
} from 'korea-map-styles';
import { GpsDemo } from './gps-demo';
import { ScenarioScreen } from './scenario-screen';
import { MapView } from 'korea-map-native';

function themeStyle(theme: ThemeName) {
  const document = createCartographyStyle({
    theme,
    target: 'native',
    data: { mode: 'fixture', capabilities: { rail: true, waterway: true, transport: true } },
    typography: { mode: 'none' },
    icons: false,
  });
  // An app-owned custom layer. Supply all custom layers again when changing styles.
  document.layers.push({
    id: 'demo-custom-background',
    type: 'background',
    paint: { 'background-opacity': 0 },
  });
  return defineMapStyle(document, designAttribution);
}
const config = {
  mode: 'operator',
  style: themeStyle('standard'),
  resources: { allowedOrigins: [] },
} as const;
function ApiDemo() {
  const map = useRef<MapController>(null);
  const initialized = useRef(false);
  const interactions = useRef<MapInteractionController | null>(null);
  const offInteractions = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState('지도 준비 중');
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState<ThemeName>('standard');
  const [gestures, setGestures] = useState(true);
  const [motionStatus, setMotionStatus] = useState('');
  const receiveInteractions = useCallback((controller: MapInteractionController | null) => {
    offInteractions.current?.();
    offInteractions.current = null;
    interactions.current = controller;
    if (controller)
      offInteractions.current = controller.onEvent((event) => {
        if (event.type === 'selection')
          setMotionStatus(event.selection ? `${event.selection.label} 선택됨` : '선택 해제');
        if (event.type === 'gesture') setMotionStatus('직접 지도 조작 · 자동 이동 중단');
      });
  }, []);
  useEffect(
    () => () => {
      offInteractions.current?.();
      interactions.current = null;
    },
    [],
  );
  async function interact(run: (controller: MapInteractionController) => Promise<unknown>) {
    if (!interactions.current) return;
    try {
      await run(interactions.current);
      setStatus('완료');
    } catch (error) {
      const code = normalizeError(error).code;
      setStatus(code === 'ABORTED' ? '이동 중단' : code);
    }
  }
  async function action(run: (api: MapController) => Promise<unknown>) {
    if (!map.current) return;
    try {
      await run(map.current);
      setStatus('완료');
    } catch (error) {
      setStatus(normalizeError(error).code);
    }
  }
  async function demonstrate() {
    await action(async (api) => {
      await api.setCenter([126.978, 37.5665]);
      await api.setZoom(14);
      for (const [id, coordinate] of [
        ['park', [126.978, 37.5665]],
        ['trail', [126.984, 37.57]],
      ] as const)
        await api.addMarker({ id, label: id === 'park' ? '합성 공원' : '합성 산책로', coordinate });
      await api.showRoute({
        id: 'walk',
        coordinates: [
          [126.97, 37.563],
          [126.978, 37.5665],
          [126.986, 37.57],
        ],
      });
      await api.addGeoJSON('area', {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [126.972, 37.562],
                  [126.975, 37.562],
                  [126.975, 37.565],
                  [126.972, 37.562],
                ],
              ],
            },
          },
        ],
      });
      await api.fitBounds(
        { west: 126.965, south: 37.555, east: 126.995, north: 37.58 },
        { padding: 24 },
      );
    });
  }
  return (
    <ScrollView style={styles.container} scrollEnabled={!gestures}>
      <Text style={styles.title}>Korea Map Kit</Text>
      <Text style={styles.caption}>
        자체 합성 데이터 · 실제 지도·도로 경로 아님. 한글 지도 glyph는 운영자 설정이 필요합니다.
      </Text>
      <Text accessibilityRole="text">{status}</Text>
      <View style={styles.row}>
        <Text>지도 제스처 (끄면 화면 스크롤)</Text>
        <Switch accessibilityLabel="지도 제스처" value={gestures} onValueChange={setGestures} />
      </View>
      <View style={styles.row}>
        {themeNames.map((name) => (
          <Button
            key={name}
            title={name === theme ? `${name} ✓` : name}
            disabled={!ready}
            onPress={() => {
              setReady(false);
              void action(async (api) => {
                await api.setStyle(themeStyle(name));
                setTheme(name);
              });
            }}
          />
        ))}
      </View>
      <View style={{ height: 440 }}>
        <MapView
          ref={map}
          config={config}
          gesturesEnabled={gestures}
          markerClustering={{ radius: 48, maxZoom: 13 }}
          onInteractionsReady={receiveInteractions}
          onEvent={(event) => {
            if (event.type === 'ready') {
              setReady(true);
              if (!initialized.current) {
                initialized.current = true;
                void demonstrate();
              }
            }
            if (event.type === 'error') {
              setReady(false);
              setStatus(event.error.code);
            }
          }}
        />
      </View>
      <View style={styles.row}>
        <Button
          title="부드러운 이동"
          disabled={!ready}
          onPress={() =>
            void interact((api) =>
              api.transitionCamera(
                { center: [126.978, 37.5665], zoom: 15, bearing: 0, pitch: 0 },
                { insets: { bottom: 100 } },
              ),
            )
          }
        />
        <Button
          title="1000개 합성 마커"
          disabled={!ready}
          onPress={() =>
            void interact((api) =>
              api.setMarkers(
                Array.from({ length: 1000 }, (_, index) => ({
                  id: `synthetic-${index}`,
                  label: `합성 장소 ${index + 1}`,
                  coordinate: [
                    126.978 + ((index % 40) - 20) * 0.0001,
                    37.5665 + (Math.floor(index / 40) - 12) * 0.0001,
                  ],
                })),
              ),
            )
          }
        />
        <Button
          title="확대"
          disabled={!ready}
          onPress={() => void action((api) => api.setZoom(16))}
        />
        <Button
          title="축소"
          disabled={!ready}
          onPress={() => void action((api) => api.setZoom(12))}
        />
        <Button
          title="회전·기울기"
          disabled={!ready}
          onPress={() =>
            void action((api) =>
              api.setCamera({ center: [126.978, 37.5665], zoom: 14, bearing: 45, pitch: 40 }),
            )
          }
        />
        <Button
          title="전체 영역"
          disabled={!ready}
          onPress={() =>
            void action((api) =>
              api.fitBounds({ west: 126.965, south: 37.555, east: 126.995, north: 37.58 }),
            )
          }
        />
      </View>
      <Text accessibilityLiveRegion="polite" style={styles.caption}>
        {motionStatus}
      </Text>
      <Text style={styles.caption}>
        마커 또는 아래 장소 버튼으로 카드를 엽니다. 테마 전환 후 마커·경로가 유지되어야 합니다. 화면
        회전, 홈 이동 후 복귀, 예제 전환으로 지도 해제를 확인하세요.
      </Text>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f9f6' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '700', paddingHorizontal: 20, color: '#18362b' },
  caption: { padding: 12, color: '#345342' },
});
export default function App() {
  const [screen, setScreen] = useState<'api' | 'gps' | 'walk' | 'trip'>('walk');
  return (
    <View style={{ flex: 1, paddingTop: 48, paddingBottom: 28 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        <Button title="산책 앱" onPress={() => setScreen('walk')} />
        <Button title="여행 앱" onPress={() => setScreen('trip')} />
        <Button title="SDK API" onPress={() => setScreen('api')} />
        <Button title="GPS 도구" onPress={() => setScreen('gps')} />
      </View>
      {screen === 'walk' || screen === 'trip' ? (
        <ScenarioScreen key={screen} kind={screen} />
      ) : screen === 'gps' ? (
        <GpsDemo />
      ) : (
        <ApiDemo />
      )}
    </View>
  );
}
