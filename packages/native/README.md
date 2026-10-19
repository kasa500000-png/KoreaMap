# @korea-map-kit/native

Korea Map Kit foundation package. Unpublished; this is not the complete MVP.

SDK code and the synthetic fixture are MIT. Third-party code/data keep their own licenses.
No publisher key, backend, or default remote endpoint is included.
Build from the repository root with `pnpm build:sdk`. Only `dist` and this README are packed.
Operator HTTP providers and full platform parity remain later milestones.

React 19 `MapView` accepts `ref: Ref<MapController>` and `onEvent`. Wait for the `ready` event, then call the same async methods as Web's `handle.api`. Shared marker/GeoJSON/route rendering and camera refs are implemented; mock bridge tests and Expo JS export are not device rendering QA. External-resource and symbol styles fail with `UNSUPPORTED` until native request-origin enforcement is implemented. See [contracts, examples and parity](../../docs/public-api.md).

`createExpoLocationClient(expoLocation, AppState, scheduler)` adapts an operator-injected Expo
Location module. Consent starts false. Only foreground permissions/watches are used; background
AppState stops collection and returning never restarts it automatically. Expo Location is not an
SDK dependency. The example pins the version recommended by its installed Expo SDK.
See `docs/gps-tracks.md`; Android/iOS device and OS background behavior remain unverified.
