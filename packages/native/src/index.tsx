import {
  Map as LibreMapView,
  Camera,
  GeoJSONSource,
  Layer,
  type MapRef,
  type CameraRef,
  type PressEvent,
  type PressEventWithFeatures,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import {
  validateMapConfig,
  defineMapStyle,
  KitError,
  type LocalMapConfig,
  type MapController,
  type MapEvent,
  type MapMarker,
} from '@korea-map-kit/core';
import { createFixtureStyle } from '@korea-map-kit/styles';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Text, View, type NativeSyntheticEvent } from 'react-native';
import { createNativeMapSession, type NativeSnapshot } from './controller.js';
export {
  createNativeMapSession,
  validateNativeStyle,
  type NativeBridge,
  type NativeSnapshot,
} from './controller.js';
export type { MapController } from '@korea-map-kit/core';
export interface MapViewProps {
  readonly config: LocalMapConfig;
  readonly ref?: Ref<MapController>;
  readonly onEvent?: (event: MapEvent) => void;
}
/** Configuration is mount-scoped. Change styles through the ref; remount to change provider policy. */
export function MapView({ config, ref, onEvent }: MapViewProps) {
  const validated = validateMapConfig(config);
  const map = useRef<MapRef>(null);
  const camera = useRef<CameraRef>(null);
  const eventCallback = useRef(onEvent);
  eventCallback.current = onEvent;
  const [snapshot, setSnapshot] = useState<NativeSnapshot>();
  const [selected, setSelected] = useState<MapMarker | null>(null);
  const [session, setSession] = useState<ReturnType<typeof createNativeMapSession>>();
  // Creating and destroying sessions in the effect supports React Strict Mode setup/cleanup replay.
  useEffect(() => {
    let active = true;
    const current = createNativeMapSession(
      defineMapStyle(createFixtureStyle(validated), '합성 로컬 데이터 · 실제 지도 아님 · MIT'),
      {
        setCamera(stop) {
          if (!camera.current) throw new KitError('UNAVAILABLE', 'MAP_NOT_READY');
          return camera.current.setStop(stop);
        },
        getBounds() {
          if (!map.current) throw new KitError('UNAVAILABLE', 'MAP_NOT_READY');
          return map.current.getBounds();
        },
      },
      {
        schedule(callback, delayMs) {
          const timer = setTimeout(callback, delayMs);
          return () => clearTimeout(timer);
        },
      },
      (next) => {
        if (active) setSnapshot(next);
      },
    );
    const off = current.api.onEvent((event) => {
      eventCallback.current?.(event);
    });
    const timer = setTimeout(() => current.failed(), 15000);
    const offReady = current.api.onEvent((event) => {
      if (event.type === 'ready') clearTimeout(timer);
    });
    setSession(current);
    setSnapshot(current.getSnapshot());
    return () => {
      active = false;
      clearTimeout(timer);
      current.api.destroy();
      off();
      offReady();
    };
    // validated fixture ID is the complete initial policy; no implicit provider discovery.
  }, [validated.fixtureId]);
  useImperativeHandle<MapController | null, MapController | null>(ref, () => session?.api ?? null, [
    session,
  ]);
  if (!session || !snapshot) return <View accessibilityLabel="지도 준비 중" />;
  if (snapshot.destroyed) return <Text accessibilityRole="alert">지도가 종료되었습니다.</Text>;
  return (
    <View style={{ flex: 1 }}>
      <LibreMapView
        ref={map}
        style={{ flex: 1 }}
        mapStyle={snapshot.style}
        attribution
        onDidFinishLoadingStyle={() => session.loaded()}
        onDidFailLoadingMap={() => session.failed()}
        onPress={({ nativeEvent }: NativeSyntheticEvent<PressEvent>) =>
          session.emit({ type: 'click', coordinate: nativeEvent.lngLat })
        }
        onRegionDidChange={({ nativeEvent }: NativeSyntheticEvent<ViewStateChangeEvent>) => {
          session.emit({
            type: 'camera',
            camera: {
              center: nativeEvent.center,
              zoom: nativeEvent.zoom,
              bearing: nativeEvent.bearing,
              pitch: nativeEvent.pitch,
            },
          });
          session.emit({ type: 'idle' });
        }}
      >
        <Camera
          ref={camera}
          minZoom={0}
          maxZoom={22}
          initialViewState={{ center: [126.978, 37.5665], zoom: 13 }}
        />
        <GeoJSONSource
          id="kmk-markers"
          data={{
            type: 'FeatureCollection',
            features: snapshot.markers.map((marker) => ({
              type: 'Feature',
              properties: { id: marker.id },
              geometry: { type: 'Point', coordinates: [...marker.coordinate] },
            })),
          }}
          onPress={({ nativeEvent }: NativeSyntheticEvent<PressEventWithFeatures>) => {
            const id = nativeEvent.features[0]?.properties?.['id'];
            const marker = snapshot.markers.find((entry) => entry.id === id) ?? null;
            setSelected(marker);
            session.emit({ type: 'select', marker });
          }}
        >
          <Layer
            id="kmk-marker-points"
            type="circle"
            paint={{
              'circle-color': '#0369a1',
              'circle-radius': 5,
              'circle-stroke-width': 1,
              'circle-stroke-color': '#ffffff',
            }}
          />
        </GeoJSONSource>
        {[...snapshot.overlays].map(([id, data]) => (
          <GeoJSONSource key={id} id={`kmk-data-${id}`} data={data}>
            <Layer
              id={`kmk-data-${id}-fill`}
              type="fill"
              filter={['==', '$type', 'Polygon']}
              paint={{ 'fill-color': '#60a5fa', 'fill-opacity': 0.3 }}
            />
            <Layer
              id={`kmk-data-${id}-line`}
              type="line"
              filter={['!=', '$type', 'Point']}
              paint={{ 'line-color': '#2563eb', 'line-width': 4 }}
            />
            <Layer
              id={`kmk-data-${id}-point`}
              type="circle"
              filter={['==', '$type', 'Point']}
              paint={{ 'circle-color': '#a855f7', 'circle-radius': 7 }}
            />
          </GeoJSONSource>
        ))}
      </LibreMapView>
      {selected && snapshot.markers.some((marker) => marker.id === selected.id) ? (
        <Text accessibilityLabel="선택한 장소">{selected.label}</Text>
      ) : null}
      <Text style={{ backgroundColor: '#ffffff', color: '#111111', padding: 4 }}>
        {snapshot.attribution}
      </Text>
    </View>
  );
}
