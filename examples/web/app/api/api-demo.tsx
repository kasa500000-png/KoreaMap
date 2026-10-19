'use client';
import { useEffect, useRef, useState } from 'react';
import { createMap, type MapHandle } from '@korea-map-kit/web';
import {
  createCancellationSource,
  defineMapStyle,
  normalizeError,
  type MapController,
} from '@korea-map-kit/core';
import { createThemeStyle } from '@korea-map-kit/styles';
/** This function accepts the same type as the React Native MapView ref. */
async function runExample(map: MapController) {
  await map.setCenter([126.978, 37.5665]);
  await map.setZoom(14);
  await map.fitBounds({ west: 126.97, south: 37.56, east: 126.99, north: 37.58 }, { padding: 24 });
  await map.addMarker({ id: 'one', label: '공통 API 장소', coordinate: [126.978, 37.5665] });
  await map.addMarker({ id: 'temporary', label: '임시 장소', coordinate: [126.98, 37.57] });
  await map.removeMarker('temporary');
  await map.addGeoJSON('shapes', {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [126.975, 37.57] },
      },
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [126.98, 37.57],
              [126.985, 37.57],
              [126.985, 37.575],
              [126.98, 37.57],
            ],
          ],
        },
      },
    ],
  });
  await map.showRoute({
    id: 'walk',
    coordinates: [
      [126.97, 37.563],
      [126.978, 37.5665],
      [126.986, 37.57],
    ],
  });
  await map.setStyle(
    defineMapStyle(
      createThemeStyle({
        theme: 'dark',
        target: 'web',
        data: { mode: 'fixture' },
        typography: { mode: 'none' },
      }),
      '자체 합성 공통 API 예제 · MIT',
    ),
  );
  return map.getVisibleBounds();
}
export function ApiDemo() {
  const container = useRef<HTMLDivElement>(null);
  const handle = useRef<MapHandle | null>(null);
  const [status, setStatus] = useState('loading');
  const [result, setResult] = useState('');
  const [rendered, setRendered] = useState('');
  const [selected, setSelected] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    if (!container.current) return;
    void createMap({
      container: container.current,
      config: { mode: 'local-fixture', fixtureId: 'synthetic-v1' },
      workerUrl: '/vendor/maplibre/maplibre-gl-worker.mjs',
      signal: abort.signal,
    })
      .then(async (map) => {
        if (abort.signal.aborted) {
          map.destroy();
          return;
        }
        handle.current = map;
        map.api.onEvent((event) => {
          if (event.type === 'select') setSelected(event.marker?.label ?? '');
          if (event.type === 'idle' && map.diagnostics().status === 'ready') {
            const layers = ['kmk-data-shapes-point', 'kmk-data-shapes-fill', 'kmk-data-walk-line'];
            // Layers exist after the scenario; avoid querying absent layers during initial load.
            if (map.state.getSnapshot().markers.length)
              setRendered(
                `${map.diagnostics().renderedMarkers} / ${new Set(map.getRenderedFeatures(layers).map((feature) => feature.layerId)).size}`,
              );
          }
        });
        await map.ready;
        if (!abort.signal.aborted) setStatus('ready');
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted) setStatus(normalizeError(error).code);
      });
    return () => {
      abort.abort();
      handle.current?.destroy();
      handle.current = null;
    };
  }, []);
  async function exercise() {
    const map = handle.current;
    if (!map) return;
    setStatus('running');
    try {
      setResult(JSON.stringify(await runExample(map.api)));
      setStatus('passed');
    } catch (error) {
      setStatus(normalizeError(error).code);
    }
  }
  async function cancel() {
    const source = createCancellationSource();
    source.cancel();
    try {
      await handle.current?.api.setZoom(18, { signal: source.signal });
    } catch (error) {
      setResult(normalizeError(error).code);
    }
  }
  async function destroy() {
    const map = handle.current;
    if (!map) return;
    map.api.destroy();
    try {
      await map.api.getVisibleBounds();
    } catch (error) {
      setResult(normalizeError(error).detail);
      setStatus('destroyed');
    }
  }
  return (
    <main>
      <h1>공통 지도 API</h1>
      <p>직접 만든 합성 데이터입니다. 실제 검색·길찾기 서비스에 연결하지 않습니다.</p>
      <button onClick={() => void exercise()} disabled={!['ready', 'passed'].includes(status)}>
        공통 API 실행
      </button>
      <button onClick={() => void cancel()} disabled={status !== 'passed'}>
        취소 확인
      </button>
      <button onClick={() => void destroy()} disabled={status !== 'passed'}>
        지도 종료
      </button>
      <p role="status" data-testid="api-status">
        {status}
      </p>
      <p data-testid="api-result">{result}</p>
      <p data-testid="api-rendered">{rendered}</p>
      <p data-testid="api-selection">{selected}</p>
      <div ref={container} style={{ position: 'relative', width: '100%', height: 540 }} />
    </main>
  );
}
