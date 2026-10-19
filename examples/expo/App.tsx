import { View, Text, StyleSheet } from 'react-native';
import { MapView } from '@korea-map-kit/native';

const config = { mode: 'local-fixture', fixtureId: 'synthetic-v1' } as const;
export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Korea Map Kit</Text>
      <Text style={styles.caption}>합성 로컬 데이터 · 실제 지도 아님 · MIT</Text>
      <MapView config={config} />
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 56, backgroundColor: '#f7f9f6' },
  title: { fontSize: 26, fontWeight: '700', paddingHorizontal: 20, color: '#18362b' },
  caption: { padding: 20, color: '#527a67' },
});
