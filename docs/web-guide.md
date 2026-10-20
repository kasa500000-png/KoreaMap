# Next.js, styles, markers and routes

Use the exact peer `maplibre-gl@6.14.0`, TypeScript strict and `moduleResolution: "Bundler"`. Package imports are SSR-safe, but construction needs a client DOM. The checked examples are [client dynamic wrapper](../examples/web/app/api/api-client.tsx), [map lifecycle and shared commands](../examples/web/app/api/api-demo.tsx), and [Next configuration](../examples/web/next.config.mjs).

A client wrapper starts with `'use client'` and uses `dynamic(() => import('./map-view'), { ssr: false })` for a default-exported client map view. Create the map in `useEffect`, attach an `AbortController`, handle both construction and `ready` rejection, and abort/destroy in cleanup. Keep state outside the engine if it should survive remount. The example includes the asynchronous cleanup race handling; do not copy only map construction and omit cleanup.

Import `maplibre-gl/dist/maplibre-gl.css` in the app and give the map a nonzero height and relative positioning. Copy the installed `maplibre-gl/dist/maplibre-gl-worker.mjs` and its license to your own public directory. The repository build does this automatically. Never use an unrelated CDN worker or default demonstration tile server.

## Shared API

The following function is also compiled as a strict documentation fixture in `tests/release-guide.types.ts`. Pass Web `handle.api` after `await handle.ready`, or the Native `MapView` ref after its ready event.

```ts
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
```

The two-point line is an explicitly authored sample track, **not a computed walking/driving route**. Use an operator-configured RoutingProvider for actual road routing; unavailable routes must return an error. Themes are `standard`, `dark`, `pastel`, `outdoor`; theme overrides/custom style JSON and authored images are described in [the design system](design-system.md). Native must use `target: 'native'` and a verified glyph provider when labels are enabled; the Web no-text fixture does not verify Native Korean text.

`api.onEvent` returns an unsubscribe callback. Handle selection without inserting untrusted HTML. `addGeoJSON`, `removeMarker`, `fitBounds` and `showRoute` use [the public contracts](public-api.md). Custom engine layers have their own cleanup responsibilities. Attribution stays visible outside theme styling.

For real tiles pass explicit operator resources instead of fixture mode; see [providers](providers.md). There is no publisher backend fallback. CSP and the allowed resource origins must include the operator's actual style, tiles, glyphs, sprites and worker policies. Client origin validation is not a redirect firewall or a billing cap.
