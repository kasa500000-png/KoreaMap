# @korea-map-kit/web

MapLibre GL JS web SDK preview. SDK code and authored synthetic data are MIT; renderer and operator data retain their own licenses. No default remote endpoint or publisher account is included.

Install the exact peer version in this workspace: `maplibre-gl@6.14.0`. Import `maplibre-gl/dist/maplibre-gl.css` in the application, give the container a nonzero height and `position: relative`, and serve the locally installed `maplibre-gl/dist/maplibre-gl-worker.mjs` under your own origin, preserving its license. The repository example copies this file during build.

```ts
import { createMap, createMapState } from '@korea-map-kit/web';

const state = createMapState();
const abort = new AbortController();
const map = await createMap({
  container: document.getElementById('map')!,
  workerUrl: '/vendor/maplibre/maplibre-gl-worker.mjs',
  config: { mode: 'local-fixture', fixtureId: 'synthetic-v1' },
  state,
  signal: abort.signal,
});
await map.ready;
map.setMarkers([{ id: 'place', coordinate: [126.978, 37.5665], label: 'My authored point' }]);
const unsubscribe = map.on('select', (marker) => console.log(marker?.id));
map.selectMarker('place');
// On component removal: abort also cancels construction during dynamic import.
unsubscribe();
abort.abort();
map.destroy(); // idempotent; keep state separately if remounting
```

`panTo`, `zoomTo`, `rotateTo`, `setCamera` apply immediately; gestures and keyboard controls update the same state. `setGeoJSON(id, collection)` handles Point/LineString/Polygon; `setRoute(id, coordinates)` draws an already computed route, without calling a routing service. Remove with `removeGeoJSON`. `addLayer` / `removeLayer` support MapLibre style and custom WebGL layers after `ready`. IDs beginning with `kmk-` are reserved. Custom layers are trusted application code: their author owns GPU allocations, requests and `onRemove` cleanup. Source-backed custom layers can target sources in the operator style; this preview does not expose raw engine mutation or runtime style replacement.

Events: `status`, `camera`, `select`, `click`, `idle`, `error`; `on` returns an unsubscribe function. `ready` rejects on initial resource failure, abort or timeout (default 15 seconds). Errors expose stable codes without URLs/tokens. Later resource errors are nonfatal events. Register callbacks immediately after construction; current status is available through `diagnostics()`. Destroy detaches SDK events, state subscription, popup, controls, observer, scheduled resize and the renderer. Calling engine operations after destruction fails. The caller retains ownership of its state and subscriptions. The first worker URL is fixed for the lifetime of the SDK module. MapLibre 6.14.0 retains one shared global dispatcher worker even after the final map is removed; repeated mounts must not accumulate workers. Full worker termination is not guaranteed.

Markers use one GeoJSON source and batched circle layers, with a keyboard-accessible place selector and text-only popup. There are no external glyphs, icons or fonts in fixture mode. The selector is Korean in this preview; full locale customization is deferred. Data coordinates are WGS84 longitude/latitude within Web Mercator bounds. Maximum 10,000 markers/features is a validation limit, not a performance guarantee; 100/1,000 markers are the measured scenarios.

For a real provider, explicitly pass `mode: 'operator'`, `styleUrl`, `allowedOrigins` (exact origins covering style, TileJSON, tiles, glyphs and sprites), nonempty plain-text `attribution`, and `costAcknowledged: true`. HTTPS is required except local loopback tests. Provider configuration and all client values are public; never pass private credentials. The operator must verify source-specific rights and attribution in the style. Only reviewed A/B catalog uses may be adopted under project policy. No provider is automatically selected from that catalog.

Origin checks govern renderer requests, not arbitrary application code, HTTP redirects or custom layer fetches. Use trusted styles, operator-controlled redirects, restrictive CSP and service quotas. An origin allowlist is not a secret vault or a billing cap. Costs belong to the operator configuring the service. No public demo proxies or shared keys are provided.

Next.js: importing the package is SSR-safe; call `createMap` only in a client effect. A client wrapper can use `dynamic(() => import('./map-view'), { ssr: false })`; the example demonstrates it. Abort in effect cleanup and handle `ready` rejection. Styles/markers/selection survive remount only when you retain the state; imperative overlays/custom layers must be reattached.

From the repository root: `pnpm check`, `pnpm pack:check`, `pnpm test:web`. Browser evidence uses Chromium software WebGL, including mobile touch emulation. Safari, Firefox and physical mobile browser QA remain unverified. This preview is not a production release.

Design-system styles can be passed using `config: { mode: 'inline', style, allowedOrigins: [], attribution, costAcknowledged: true }`. Inline JSON is validated and copied before renderer construction; every required resource origin must be explicitly listed. Empty origins allow local GeoJSON and installed fonts without HTTP resources. `images: [{id, image: {width, height, data: Uint8Array}}]` registers caller-authored RGBA images on style load. IDs must be unique and dimensions at most 512×512. After ready, use `addImage`/`removeImage` with your own layer lifecycle. `getRenderedFeatures(layerIds)` returns detached layer/property records for querying rendered content. No raw engine is exposed. The `/themes/` example uses this API with all four themes and always-visible attribution.

The shared async API is available as `handle.api` after `await handle.ready`. It adds `setCenter`, `setZoom`, `fitBounds`, `setStyle`, marker upsert/removal, GeoJSON, routes and visible bounds. See [Public API and parity](../../docs/public-api.md) and the `/api/` demo. Existing synchronous methods remain available. Style replacement preserves common overlays/markers and registered images; legacy custom layers must be included in the replacement style. Cancelling a pending style load disposes the map.

`createBrowserLocationClient()` provides consent-gated foreground GPS with current-position and
watch APIs. It never prompts on import/construction; call `setConsent(true)` only after the user
agrees. Visibility loss stops collection without automatic resume. Use core track/GPX/GeoJSON/replay
functions and the repository's `docs/gps-tracks.md`. No persistence or remote upload is included.
