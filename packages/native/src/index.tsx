// Published MapLibre style types use the ambient GeoJSON namespace.
/// <reference types="geojson" preserve="true" />
import {
  Map as LibreMapView,
  Camera,
  GeoJSONSource,
  Layer,
  type MapRef,
  type CameraRef,
  type GeoJSONSourceRef,
  type PressEvent,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import {
  validateMapConfig,
  defineMapStyle,
  KitError,
  type LocalMapConfig,
  type MapController,
  type MapEvent,
  type MapInteractionController,
  type MapMarker,
  type MapSelection,
  type MapStyle,
} from 'korea-map-core';
import { createFixtureStyle } from 'korea-map-styles';
import {
  memo,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type Ref,
} from 'react';
import {
  AccessibilityInfo,
  FlatList,
  findNodeHandle,
  Platform,
  Pressable,
  Text,
  View,
  type NativeSyntheticEvent,
} from 'react-native';
import type { NativeResourcePolicy } from './resources.js';
import {
  nativeClustering,
  nativeBoundsFit,
  pickNativeRenderedFeatures,
  nativeMarkerSelection,
  nativePickLayers,
  nativeTouchRadius,
  createNativePickRequests,
  type NativeMarkerClustering,
} from './features.js';
import { createNativeMapSession, type NativeSnapshot } from './controller.js';

export { createNativeVectorSource, type NativeResourcePolicy } from './resources.js';
export {
  createNativeMapSession,
  validateNativeStyle,
  type NativeBridge,
  type NativeCameraStop,
  type NativeSnapshot,
} from './controller.js';
export type { NativeMarkerClustering } from './features.js';
export type { MapController, MapInteractionController } from 'korea-map-core';
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
  /** Mount-scoped, off by default. Radius uses logical points; maximum clustering zoom defaults to 13. */
  readonly markerClustering?: boolean | NativeMarkerClustering;
  /** Mount-scoped allowlist for selectable basemap Point layers. SDK marker/overlay layers are included. */
  readonly interactionPoiLayers?: readonly string[];
  readonly ref?: Ref<MapController>;
  readonly onEvent?: (event: MapEvent) => void;
  /** Optional extension. Null is delivered on destruction and unmount. */
  readonly onInteractionsReady?: (controller: MapInteractionController | null) => void;
}
const MarkerButton = memo(function MarkerButton({
  marker,
  selected,
  onSelect,
}: {
  readonly marker: MapMarker;
  readonly selected: boolean;
  readonly onSelect: (marker: MapMarker) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={marker.label}
      accessibilityState={{ selected }}
      onPress={() => onSelect(marker)}
      style={{
        minWidth: 48,
        minHeight: 48,
        paddingHorizontal: 12,
        justifyContent: 'center',
        backgroundColor: selected ? '#dbeafe' : '#ffffff',
      }}
    >
      <Text style={{ color: '#111111' }}>{marker.label}</Text>
    </Pressable>
  );
});
function SelectionCard({
  selection,
  description,
  onClose,
}: {
  readonly selection: MapSelection;
  readonly description: string | undefined;
  readonly onClose: () => void;
}) {
  const heading = useRef<ComponentRef<typeof Text>>(null);
  useEffect(() => {
    const node = findNodeHandle(heading.current);
    if (typeof node === 'number') AccessibilityInfo.setAccessibilityFocus(node);
  }, [selection.key]);
  return (
    <View accessibilityLabel="선택한 장소" style={{ padding: 8, backgroundColor: '#ffffff' }}>
      <Text ref={heading} accessible accessibilityRole="header" style={{ color: '#111111' }}>
        {selection.label || '선택한 장소'}
      </Text>
      {description ? <Text style={{ color: '#111111' }}>{description}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="장소 카드 닫기"
        onPress={onClose}
        style={{ minWidth: 48, minHeight: 48, justifyContent: 'center', paddingHorizontal: 12 }}
      >
        <Text style={{ color: '#111111' }}>장소 카드 닫기</Text>
      </Pressable>
    </View>
  );
}
function CandidateList({
  candidates,
  onChoose,
  onClose,
}: {
  readonly candidates: readonly MapSelection[];
  readonly onChoose: (selection: MapSelection) => void;
  readonly onClose: () => void;
}) {
  const heading = useRef<ComponentRef<typeof Text>>(null);
  useEffect(() => {
    const node = findNodeHandle(heading.current);
    if (typeof node === 'number') AccessibilityInfo.setAccessibilityFocus(node);
  }, []);
  return (
    <View accessibilityViewIsModal style={{ backgroundColor: '#ffffff', padding: 8 }}>
      <Text ref={heading} accessible accessibilityRole="header" style={{ color: '#111111' }}>
        {candidates.length}개 장소가 겹칩니다. 장소를 선택하세요.
      </Text>
      <FlatList
        data={candidates}
        keyExtractor={(selection) => selection.key}
        initialNumToRender={8}
        style={{ maxHeight: 240 }}
        accessibilityLabel="겹친 장소 선택 목록"
        renderItem={({ item, index }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${index + 1}. ${item.label || item.id}`}
            onPress={() => onChoose(item)}
            style={{ minWidth: 48, minHeight: 48, paddingHorizontal: 12, justifyContent: 'center' }}
          >
            <Text style={{ color: '#111111' }}>{item.label || item.id}</Text>
          </Pressable>
        )}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="장소 선택 목록 닫기"
        onPress={onClose}
        style={{ minWidth: 48, minHeight: 48, paddingHorizontal: 12, justifyContent: 'center' }}
      >
        <Text style={{ color: '#111111' }}>장소 선택 목록 닫기</Text>
      </Pressable>
    </View>
  );
}
/** Configuration is mount-scoped. Change styles through the ref; remount to change provider policy. */
export function MapView({
  config,
  ref,
  onEvent,
  onInteractionsReady,
  gesturesEnabled = true,
  markerClustering = false,
  interactionPoiLayers,
}: MapViewProps) {
  const [initial] = useState(() => {
    const clustering = nativeClustering(markerClustering);
    const poiLayers = nativePickLayers(interactionPoiLayers);
    if (config.mode === 'operator')
      return { style: config.style, resources: config.resources, clustering, poiLayers };
    return {
      style: defineMapStyle(
        createFixtureStyle(validateMapConfig(config)),
        '합성 로컬 데이터 · 실제 지도 아님 · MIT',
      ),
      resources: undefined,
      clustering,
      poiLayers,
    };
  });
  const map = useRef<MapRef>(null);
  const camera = useRef<CameraRef>(null);
  const markerSource = useRef<GeoJSONSourceRef>(null);
  const cameraEpoch = useRef(0);
  const viewStateEventVersion = useRef(0);
  const mapSize = useRef({ width: 0, height: 0 });
  const reducedMotion = useRef(false);
  const viewState = useRef({
    center: [126.978, 37.5665] as [number, number],
    zoom: 13,
    bearing: 0,
    pitch: 0,
  });
  const eventCallback = useRef(onEvent);
  eventCallback.current = onEvent;
  const interactionCallback = useRef(onInteractionsReady);
  interactionCallback.current = onInteractionsReady;
  const [snapshot, setSnapshot] = useState<NativeSnapshot>();
  const [session, setSession] = useState<ReturnType<typeof createNativeMapSession>>();
  const [pickRequests] = useState(createNativePickRequests);
  const [candidates, setCandidates] = useState<{
    readonly request: number;
    readonly features: readonly MapSelection[];
  } | null>(null);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(
      (enabled) => {
        if (active) reducedMotion.current = enabled;
      },
      () => {},
    );
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      reducedMotion.current = enabled;
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  // Sessions live in the effect so Strict Mode setup/cleanup can safely replay.
  useEffect(() => {
    let active = true;
    let exposed = false;
    let nullNotified = false;
    let published: NativeSnapshot | undefined;
    const current = createNativeMapSession(
      initial.style,
      {
        async setCamera(stop) {
          const cameraRef = camera.current;
          if (!cameraRef) throw new KitError('UNAVAILABLE', 'MAP_NOT_READY');
          const epoch = ++cameraEpoch.current;
          const mapRef = map.current;
          await cameraRef.setStop(stop);
          if (!active || !mapRef || epoch !== cameraEpoch.current || map.current !== mapRef) return;
          const eventVersion = viewStateEventVersion.current;
          const state = await mapRef.getViewState();
          // Keep the zero-duration API's camera across a style remount; newer region events win.
          if (
            active &&
            epoch === cameraEpoch.current &&
            map.current === mapRef &&
            eventVersion === viewStateEventVersion.current
          )
            viewState.current = {
              center: [...state.center],
              zoom: state.zoom,
              bearing: state.bearing,
              pitch: state.pitch,
            };
        },
        async stopCamera() {
          const epoch = ++cameraEpoch.current;
          const mapRef = map.current,
            cameraRef = camera.current;
          if (!mapRef || !cameraRef) return;
          const state = await mapRef.getViewState();
          if (
            !active ||
            epoch !== cameraEpoch.current ||
            map.current !== mapRef ||
            camera.current !== cameraRef
          )
            return;
          await cameraRef.setStop({
            center: [...state.center],
            zoom: state.zoom,
            bearing: state.bearing,
            pitch: state.pitch,
            duration: 0,
          });
        },
        getBounds() {
          if (!map.current) throw new KitError('UNAVAILABLE', 'MAP_NOT_READY');
          return map.current.getBounds();
        },
        async getCamera() {
          if (!map.current) throw new KitError('UNAVAILABLE', 'MAP_NOT_READY');
          const state = await map.current.getViewState();
          return {
            center: [...state.center],
            zoom: state.zoom,
            bearing: state.bearing,
            pitch: state.pitch,
          };
        },
        async isBoundsFitted(bounds, insets) {
          const mapRef = map.current;
          if (!mapRef) return false;
          const [state, northWest, southEast] = await Promise.all([
            mapRef.getViewState(),
            mapRef.project([bounds.west, bounds.north]),
            mapRef.project([bounds.east, bounds.south]),
          ]);
          return (
            active &&
            map.current === mapRef &&
            nativeBoundsFit({
              ...mapSize.current,
              northWest,
              southEast,
              insets,
              zoom: state.zoom,
              bearing: state.bearing,
              pitch: state.pitch,
            })
          );
        },
        prefersReducedMotion: () => reducedMotion.current,
        getClusterExpansionZoom(id) {
          if (!markerSource.current || typeof id !== 'number')
            throw new KitError('UNAVAILABLE', 'CLUSTER_EXPANSION_UNAVAILABLE');
          return markerSource.current.getClusterExpansionZoom(id);
        },
        async pickFeatures(point, context) {
          const mapRef = map.current;
          if (!mapRef) throw new KitError('UNAVAILABLE', 'MAP_NOT_READY');
          const before = current.getSnapshot();
          const markers = new Map(before.markers.map((marker) => [marker.id, marker]));
          const layers: { id: string; source: string }[] = before.style.layers.flatMap((layer) =>
            initial.poiLayers.includes(layer.id) &&
            (layer.type === 'symbol' || layer.type === 'circle') &&
            'source' in layer &&
            typeof layer.source === 'string'
              ? [{ id: layer.id, source: layer.source }]
              : [],
          );
          layers.push({ id: 'kmk-marker-points', source: 'kmk-markers' });
          if (initial.clustering.enabled)
            layers.push({ id: 'kmk-marker-clusters', source: 'kmk-markers' });
          for (const id of before.overlays.keys())
            layers.push({ id: `kmk-data-${id}-point`, source: `kmk-data-${id}` });
          return pickNativeRenderedFeatures({
            point,
            radius: nativeTouchRadius(Platform.OS),
            layers,
            markers,
            query: (bounds, layerId) => mapRef.queryRenderedFeatures(bounds, { layers: [layerId] }),
            project: (coordinate) => mapRef.project(coordinate),
            isCurrent: () => {
              const latest = current.getSnapshot();
              return (
                active &&
                !context.signal.aborted &&
                map.current === mapRef &&
                !latest.destroyed &&
                latest.revision === before.revision &&
                latest.markers === before.markers &&
                latest.overlays === before.overlays
              );
            },
          });
        },
      },
      {
        schedule(callback, delayMs) {
          const timer = setTimeout(callback, delayMs);
          return () => clearTimeout(timer);
        },
      },
      (next) => {
        if (active) {
          if (
            published &&
            (published.revision !== next.revision ||
              published.markers !== next.markers ||
              published.overlays !== next.overlays ||
              next.destroyed)
          ) {
            pickRequests.cancel();
            setCandidates(null);
          }
          published = next;
          setSnapshot(next);
        }
      },
      initial.resources,
    );
    const off = current.api.onEvent((event) => {
      if (event.type === 'ready' && !exposed) {
        exposed = true;
        nullNotified = false;
        interactionCallback.current?.(current.interactions);
      }
      if (event.type === 'destroyed' && exposed) {
        exposed = false;
        nullNotified = true;
        interactionCallback.current?.(null);
      }
      eventCallback.current?.(event);
    });
    const timer = setTimeout(() => current.failed(), 15000);
    const offReady = current.api.onEvent((event) => {
      if (event.type === 'ready') clearTimeout(timer);
    });
    setSession(current);
    published = current.getSnapshot();
    setSnapshot(current.getSnapshot());
    return () => {
      active = false;
      clearTimeout(timer);
      cameraEpoch.current++;
      pickRequests.cancel();
      current.api.destroy();
      off();
      offReady();
      if (!nullNotified) {
        exposed = false;
        nullNotified = true;
        interactionCallback.current?.(null);
      }
    };
  }, [initial, pickRequests]);
  useImperativeHandle<MapController | null, MapController | null>(ref, () => session?.api ?? null, [
    session,
  ]);
  const markerData = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: (snapshot?.markers ?? []).map((marker) => ({
        type: 'Feature',
        id: marker.id,
        properties: { id: marker.id },
        geometry: { type: 'Point', coordinates: [...marker.coordinate] },
      })),
    }),
    [snapshot?.markers],
  );
  const reportInteractionFailure = useMemo(
    () => (error: unknown) => {
      if (
        !session ||
        session.getSnapshot().destroyed ||
        (error instanceof KitError && error.code === 'ABORTED')
      )
        return;
      session.emit({
        type: 'error',
        error: new KitError(
          error instanceof KitError ? error.code : 'UNAVAILABLE',
          'MAP_INTERACTION_FAILED',
        ),
        fatal: false,
      });
    },
    [session],
  );
  const onSelect = useMemo(
    () => (marker: MapMarker) => {
      pickRequests.cancel();
      setCandidates(null);
      void session?.interactions
        .selectFeature(nativeMarkerSelection(marker))
        .catch(reportInteractionFailure);
    },
    [session, pickRequests, reportInteractionFailure],
  );
  if (!session || !snapshot) return <View accessibilityLabel="지도 준비 중" />;
  if (snapshot.destroyed) return <Text accessibilityRole="alert">지도가 종료되었습니다.</Text>;
  const selection = snapshot.selection?.kind === 'cluster' ? null : snapshot.selection;
  const selectedMarker =
    selection?.kind === 'marker'
      ? snapshot.markers.find((marker) => marker.id === selection.id)
      : undefined;
  const region = (
    phase: 'will' | 'changing' | 'did',
    event: NativeSyntheticEvent<ViewStateChangeEvent>,
  ) => {
    const { nativeEvent } = event;
    if (session.getSnapshot().revision !== snapshot.revision || session.getSnapshot().destroyed)
      return;
    viewStateEventVersion.current++;
    viewState.current = {
      center: [...nativeEvent.center],
      zoom: nativeEvent.zoom,
      bearing: nativeEvent.bearing,
      pitch: nativeEvent.pitch,
    };
    if (nativeEvent.userInteraction) {
      pickRequests.cancel();
      setCandidates(null);
    }
    session.regionChanged(
      phase,
      viewState.current,
      nativeEvent.userInteraction,
      event.timeStamp,
      snapshot.revision,
    );
  };
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
        onLayout={({ nativeEvent }) => {
          mapSize.current = { width: nativeEvent.layout.width, height: nativeEvent.layout.height };
        }}
        mapStyle={snapshot.style}
        attribution
        onDidFinishLoadingStyle={() => session.loaded(snapshot.revision)}
        onDidFailLoadingMap={() => session.failed(snapshot.revision)}
        onPress={(event: NativeSyntheticEvent<PressEvent>) => {
          if (
            session.getSnapshot().revision !== snapshot.revision ||
            session.getSnapshot().destroyed
          )
            return;
          session.emit({ type: 'click', coordinate: event.nativeEvent.lngLat });
          const request = pickRequests.begin();
          setCandidates(null);
          const [x, y] = event.nativeEvent.point;
          void session.interactions
            .pickFeatures({ x, y })
            .then((features) => {
              if (
                session.getSnapshot().revision === snapshot.revision &&
                !session.getSnapshot().destroyed &&
                pickRequests.isCurrent(request)
              ) {
                if (features.length > 1) {
                  return session.interactions.selectFeature(null).then(() => {
                    if (pickRequests.isCurrent(request)) setCandidates({ request, features });
                  });
                }
                return session.interactions.selectFeature(features[0] ?? null);
              }
            })
            .catch(reportInteractionFailure);
        }}
        onRegionWillChange={(event) => region('will', event)}
        onRegionIsChanging={(event) => region('changing', event)}
        onRegionDidChange={(event) => region('did', event)}
      >
        <Camera ref={camera} minZoom={0} maxZoom={22} initialViewState={viewState.current} />
        <GeoJSONSource
          ref={markerSource}
          id="kmk-markers"
          data={markerData}
          cluster={initial.clustering.enabled}
          clusterRadius={initial.clustering.radius}
          clusterMaxZoom={initial.clustering.maxZoom}
          maxzoom={22}
        >
          <Layer
            id="kmk-marker-points"
            type="circle"
            filter={['!', ['has', 'point_count']]}
            paint={{
              'circle-color': '#0369a1',
              'circle-radius': 6,
              'circle-stroke-width': 1,
              'circle-stroke-color': '#ffffff',
            }}
          />
          {initial.clustering.enabled ? (
            <Layer
              id="kmk-marker-clusters"
              type="circle"
              filter={['has', 'point_count']}
              paint={{
                'circle-color': '#1e40af',
                'circle-radius': 18,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff',
              }}
            />
          ) : null}
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
        {selection ? (
          <GeoJSONSource
            id="kmk-selection"
            data={{
              type: 'Feature',
              properties: {},
              geometry: { type: 'Point', coordinates: [...selection.coordinate] },
            }}
          >
            <Layer
              id="kmk-selection-highlight"
              type="circle"
              paint={{
                'circle-color': '#f59e0b',
                'circle-radius': 10,
                'circle-stroke-width': 3,
                'circle-stroke-color': '#111827',
              }}
            />
          </GeoJSONSource>
        ) : null}
      </LibreMapView>
      <FlatList
        horizontal
        data={snapshot.markers}
        keyExtractor={(marker) => marker.id}
        extraData={selection?.key}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={3}
        style={{ flexGrow: 0, maxHeight: 56 }}
        accessibilityLabel="지도 장소 목록"
        renderItem={({ item }) => (
          <MarkerButton
            marker={item}
            selected={selection?.kind === 'marker' && selection.id === item.id}
            onSelect={onSelect}
          />
        )}
      />
      {candidates ? (
        <CandidateList
          key={candidates.request}
          candidates={candidates.features}
          onChoose={(feature) => {
            if (!pickRequests.isCurrent(candidates.request)) return;
            pickRequests.cancel();
            setCandidates(null);
            void session.interactions.selectFeature(feature).catch(reportInteractionFailure);
          }}
          onClose={() => {
            pickRequests.cancel();
            setCandidates(null);
          }}
        />
      ) : null}
      {selection ? (
        <SelectionCard
          key={selection.key}
          selection={selection}
          description={selectedMarker?.description}
          onClose={() => {
            pickRequests.cancel();
            setCandidates(null);
            void session.interactions.selectFeature(null).catch(reportInteractionFailure);
          }}
        />
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
