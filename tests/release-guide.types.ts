import { defineMapStyle, type MapController } from 'korea-map-core';
import { createThemeStyle } from 'korea-map-styles';

export async function configureExample(map: MapController) {
  await map.setCenter([126.978, 37.5665]);
  await map.setZoom(14);
  await map.addMarker({ id: 'authored', coordinate: [126.978, 37.5665], label: '합성 장소' });
  await map.showRoute({
    id: 'authored-track',
    coordinates: [
      [126.978, 37.5665],
      [126.98, 37.567],
    ],
  });
  await map.setStyle(
    defineMapStyle(
      createThemeStyle({
        theme: 'pastel',
        target: 'web',
        data: { mode: 'fixture' },
        typography: { mode: 'none' },
      }),
      '자체 합성 데이터 · MIT',
    ),
  );
  return map.getVisibleBounds();
}
