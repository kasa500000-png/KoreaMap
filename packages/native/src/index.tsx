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
  type MapStyle,
} from '@korea-map-kit/core';
import { createFixtureStyle } from '@korea-map-kit/styles';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Button, ScrollView, Text, View, type NativeSyntheticEvent } from 'react-native';
import type { NativeResourcePolicy } from './resources.js';
export { createNativeVectorSource, type NativeResourcePolicy } from './resources.js';
import { createNativeMapSession, type NativeSnapshot } from './controller.js';
export {
  createNativeMapSession,
  validateNativeStyle,
  type NativeBridge,
  type NativeCameraStop,
  type NativeSnapshot,
} from './controller.js';
export type { MapController } from '@korea-map-kit/core';
export type NativeMapConfig =
  | LocalMapConfig
  | {
      readonly mode: 'operator';
      readonly style: MapStyle;
      readonly resources: NativeResourcePolicy;
    };
export interface MapViewProps {
  readonly config: NativeMapConfig;
  /** Disable map gestures inside a scrolling parent; the app owns gesture arbitration. */
  readonly gesturesEnabled?: boolean;
  readonly ref?: Ref<MapController>;
  readonly onEvent?: (event: MapEvent) => void;
}
/** Configuration is mount-scoped. Change styles through the ref; remount to change provider policy. */
export function MapView({ config, ref, onEvent, gesturesEnabled = true }: MapViewProps) {
  const [initial] = useState(() => {
    if (config.mode === 'operator') return { style: config.style, resources: config.resources };
    return {
      style: defineMapStyle(
        createFixtureStyle(validateMapConfig(config)),
        '합성 로컬 데이터 · 실제 지도 아님 · MIT',
      ),
      resources: undefined,
    };
  });
  const map = useRef<MapRef>(null);
  const camera = useRef<CameraRef>(null);
  const viewState = useRef({
    center: [126.978, 37.5665] as [number, number],
    zoom: 13,
    bearing: 0,
    pitch: 0,
  });
  const eventCallback = useRef(onEvent);
  eventCallback.current = onEvent;
  const [snapshot, setSnapshot] = useState<NativeSnapshot>();
  const [selected, setSelected] = useState<string | null>(null);
  const [session, setSession] = useState<ReturnType<typeof createNativeMapSession>>();
  // Creating and destroying sessions in the effect supports React Strict Mode setup/cleanup replay.
  useEffect(() => {
    let active = true;
    const current = createNativeMapSession(
      initial.style,
      {
        async setCamera(stop) {
          if (!camera.current) throw new KitError('UNAVAILABLE', 'MAP_NOT_READY');
          const currentMap = map.current;
          await camera.current.setStop(stop);
          if (currentMap && map.current === currentMap) {
            const state = await currentMap.getViewState();
            viewState.current = {
              center: [...state.center],
              zoom: state.zoom,
              bearing: state.bearing,
              pitch: state.pitch,
            };
          }
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
      initial.resources,
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
  }, [initial]);
  useImperativeHandle<MapController | null, MapController | null>(ref, () => session?.api ?? null, [
    session,
  ]);
  if (!session || !snapshot) return <View accessibilityLabel="지도 준비 중" />;
  if (snapshot.destroyed) return <Text accessibilityRole="alert">지도가 종료되었습니다.</Text>;
  const selectedMarker = snapshot.markers.find((marker) => marker.id === selected);
  return (
    <View style={{ flex: 1 }}>
      <LibreMapView
        key={snapshot.revision}
        ref={map}
        androidView="texture"
        dragPan={gesturesEnabled}
        touchZoom={gesturesEnabled}
        doubleTapZoom={gesturesEnabled}
        doubleTapHoldZoom={gesturesEnabled}
        touchRotate={gesturesEnabled}
        touchPitch={gesturesEnabled}
        style={{ flex: 1 }}
        mapStyle={snapshot.style}
        attribution
        onDidFinishLoadingStyle={() => session.loaded(snapshot.revision)}
        onDidFailLoadingMap={() => session.failed(snapshot.revision)}
        onPress={({ nativeEvent }: NativeSyntheticEvent<PressEvent>) => {
          if (session.getSnapshot().revision === snapshot.revision)
            session.emit({ type: 'click', coordinate: nativeEvent.lngLat });
        }}
        onRegionDidChange={({ nativeEvent }: NativeSyntheticEvent<ViewStateChangeEvent>) => {
          if (
            session.getSnapshot().revision !== snapshot.revision ||
            session.getSnapshot().destroyed
          )
            return;
          viewState.current = {
            center: [...nativeEvent.center],
            zoom: nativeEvent.zoom,
            bearing: nativeEvent.bearing,
            pitch: nativeEvent.pitch,
          };
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
        <Camera ref={camera} minZoom={0} maxZoom={22} initialViewState={viewState.current} />
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
            if (
              session.getSnapshot().revision !== snapshot.revision ||
              session.getSnapshot().destroyed
            )
              return;
            const id = nativeEvent.features[0]?.properties?.['id'];
            const marker = snapshot.markers.find((entry) => entry.id === id) ?? null;
            setSelected(marker?.id ?? null);
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
      <ScrollView
        horizontal
        style={{ flexGrow: 0, maxHeight: 48 }}
        accessibilityLabel="지도 장소 목록"
      >
        {snapshot.markers.map((marker) => (
          <Button
            key={marker.id}
            title={marker.label || marker.id}
            onPress={() => {
              setSelected(marker.id);
              session.emit({ type: 'select', marker });
            }}
          />
        ))}
      </ScrollView>
      {selectedMarker ? (
        <View accessibilityLabel="선택한 장소" style={{ padding: 8, backgroundColor: '#ffffff' }}>
          <Text style={{ color: '#111111' }}>{selectedMarker.label || selectedMarker.id}</Text>
          <Button
            title="장소 카드 닫기"
            onPress={() => {
              setSelected(null);
              session.emit({ type: 'select', marker: null });
            }}
          />
        </View>
      ) : null}
      <Text
        accessibilityLabel="지도 데이터 출처"
        style={{ backgroundColor: '#ffffff', color: '#111111', padding: 4 }}
      >
        {snapshot.attribution}
      </Text>
    </View>
  );
}

export {
  createExpoLocationClient,
  type ExpoLocationPort,
  type NativeAppLifecycle,
} from './location.js';
