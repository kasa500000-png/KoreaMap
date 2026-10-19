import { Map as LibreMapView, Camera } from '@maplibre/maplibre-react-native';
import { validateMapConfig, type LocalMapConfig } from '@korea-map-kit/core';
import { createFixtureStyle } from '@korea-map-kit/styles';
import { useMemo } from 'react';

export interface MapViewProps {
  readonly config: LocalMapConfig;
}

/** Explicit local style prevents upstream demo URL fallback. Native runtime QA is separate. */
export function MapView({ config }: MapViewProps) {
  const validated = validateMapConfig(config);
  const style = useMemo(() => createFixtureStyle(validated), [validated.fixtureId]);
  return (
    <LibreMapView style={{ flex: 1 }} mapStyle={style}>
      <Camera initialViewState={{ center: [126.978, 37.5665], zoom: 13 }} />
    </LibreMapView>
  );
}
