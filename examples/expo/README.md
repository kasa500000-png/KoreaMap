# Expo example

Private Expo consumer with the MapLibre config plugin. Expo Go is unsupported.
Run `pnpm dev:expo` from the root to start Metro in offline/localhost mode.
Use `pnpm --filter @korea-map-kit/example-expo android` with a local Android SDK/device,
or `pnpm --filter @korea-map-kit/example-expo ios` on macOS with Xcode.
Build the SDK first with `pnpm build:sdk`.

`pnpm build` exports Android and iOS JavaScript bundles with local assets. It does **not** compile
Gradle/CocoaPods, produce APK/IPA, sign, install or prove native rendering.
No EAS account, paid API, cloud build, OTA service or environment file is required.
All displayed geometry is original synthetic fixture data, not a real basemap.

GPS example: open **GPS 경로 예제**, explicitly agree, then request current location or start recording.
`expo-location` 58.0.17 is exact-pinned to this Expo SDK's bundled recommendation. Only foreground
permissions are configured. Background collection/service/task registration is disabled.
AppState inactive/background stops the watch; resume is explicit. Export/import uses a text field
for copy/paste; file picker/encrypted persistence is app-specific. Actual Android/iOS device QA is
blocked by unavailable devices/SDK tools; see `docs/research/gps-validation.md` in the repository.
