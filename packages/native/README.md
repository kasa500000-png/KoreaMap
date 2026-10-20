# korea-map-native

React Native MapLibre SDK using the same `MapController` as Web. Unpublished; native device
certification is incomplete. SDK code and original synthetic fixtures are MIT.

Requires React 19.3.0, React Native 0.88.0 (New Architecture), MapLibre React Native 11.5.0.
For Expo, use SDK 58.0.14, the MapLibre config plugin and a **Development Build**, never Expo Go.
Build this workspace with `pnpm build:sdk` before using `examples/expo`.

```tsx
import { useRef } from 'react';
import { MapView, type MapController } from 'korea-map-native';

const map = useRef<MapController>(null);
<MapView
  ref={map}
  config={{ mode: 'local-fixture', fixtureId: 'synthetic-v1' }}
  onEvent={(event) => {
    if (event.type === 'ready') void map.current?.setZoom(14);
  }}
/>;
```

Give the parent a height or flex layout. Coordinates are `[longitude, latitude]`.
Use `setCenter`, `setZoom`, `setCamera`, `fitBounds`, `setStyle`, `addMarker`, `removeMarker`,
`addGeoJSON`, `removeGeoJSON`, `showRoute`, `getVisibleBounds`, `onEvent`, `destroy` after ready.
Handle rejected promises. Markers have accessible selection buttons and a dismissible place card.
Point/Line/Polygon overlays and routes survive style changes. Layers belong in inline style JSON.
`gesturesEnabled={false}` hands scroll gestures to the parent; coordinate its ScrollView setting.
Unmount/destroy releases the session and native view. Remount after fatal errors.

Four themes come from `korea-map-styles`. Korean map labels require an operator glyph
endpoint and font stack. Default fixtures use no fonts/tiles/network; RN Text labels are not map
glyph validation. Attribution stays outside the themed map and the engine control stays enabled.

`config={{ mode: 'operator', style, resources: { allowedOrigins: [...] } }}` opts into explicit
HTTPS/loopback HTTP XYZ, glyph and sprite URLs. Remote styles/TileJSON/remote GeoJSON and URL
credentials/query parameters are rejected. Configuration is mount-scoped; `setStyle` cannot
expand allowed origins. This is input validation, **not a native redirect firewall**. Operators
must serve direct responses and own service costs. No publisher backend, API key or implicit
provider exists. `createNativeVectorSource` selects HTTP by default. PMTiles requires both
`transport: 'experimental-pmtiles'` and `resources.experimentalPMTiles: true`; OS/RN runtime
compatibility remains unverified. Retry with explicit HTTP tiles and a remounted map on failure.

`createExpoLocationClient(expoLocation, AppState, scheduler)` uses injected Expo Location;
it is not a required SDK dependency. Consent and foreground permission are required. Background
stops collection; returning does not automatically restart it. No default transmission/storage.

Full setup, source schema, Korean glyphs, PMTiles fallback and validation limitations:
[Repository documentation](https://github.com/kasa500000-png/KoreaMap/tree/HEAD/docs),
including `native-sdk.md` and `research/native-consumer-validation.md`, follows the integrated
default branch. Before integration, use those paths in the reviewed candidate source checkout.
Third-party fonts/data keep their own licenses and are not included in this package.
