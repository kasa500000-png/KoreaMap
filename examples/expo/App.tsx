import { View, Text, StyleSheet, Button } from 'react-native';
import { useRef, useState } from 'react';
import { normalizeError, type MapController } from '@korea-map-kit/core';
import { GpsDemo } from './gps-demo';
import { MapView } from '@korea-map-kit/native';

const config = { mode: 'local-fixture', fixtureId: 'synthetic-v1' } as const;
function ApiDemo() {
  const map = useRef<MapController>(null);
  const initialized = useRef(false);
  const [status, setStatus] = useState('지도 준비 중');
  async function demonstrate() {
    const api = map.current;
    if (!api) return;
    try {
      await api.setCenter([126.978, 37.5665]);
      await api.setZoom(14);
      await api.addMarker({
        id: 'example',
        label: '합성 공통 API 장소',
        coordinate: [126.978, 37.5665],
      });
      await api.showRoute({
        id: 'walk',
        coordinates: [
          [126.97, 37.563],
          [126.978, 37.5665],
          [126.986, 37.57],
        ],
      });
      await api.fitBounds(
        { west: 126.97, south: 37.56, east: 126.99, north: 37.58 },
        { padding: 24 },
      );
      setStatus(JSON.stringify(await api.getVisibleBounds()));
    } catch (error) {
      setStatus(normalizeError(error).code);
    }
  }
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Korea Map Kit</Text>
      <Text style={styles.caption}>합성 로컬 데이터 · 실제 지도 아님 · MIT</Text>
      <Text accessibilityRole="text">{status}</Text>
      <MapView
        ref={map}
        config={config}
        onEvent={(event) => {
          if (event.type === 'ready' && !initialized.current) {
            initialized.current = true;
            void demonstrate();
          }
          if (event.type === 'error') setStatus(event.error.code);
        }}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 56, backgroundColor: '#f7f9f6' },
  title: { fontSize: 26, fontWeight: '700', paddingHorizontal: 20, color: '#18362b' },
  caption: { padding: 20, color: '#527a67' },
});

export default function App() {
  const [gps, setGps] = useState(false);
  return (
    <View style={{ flex: 1, paddingTop: 36 }}>
      <Button title={gps ? '지도 API 예제' : 'GPS 경로 예제'} onPress={() => setGps(!gps)} />
      {gps ? <GpsDemo /> : <ApiDemo />}
    </View>
  );
}
