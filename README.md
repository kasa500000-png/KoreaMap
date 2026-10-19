# Korea Map Kit

[한국어](README.ko.md) · [Quick start](docs/quickstart.md) · [API](docs/public-api.md) · [Release status](docs/releases/v0.1.0.md)

An MIT TypeScript map SDK built on MapLibre, with shared Web and React Native APIs and Korean label support. Coordinates always use `[longitude, latitude]` in WGS84.

**v0.1.0 is an unpublished release candidate, not approved for production or publication.** Package names are candidates, not reserved names. The GitHub repository was already public when this release preparation began; this candidate is local until approved for upload.

## Packages

| Package                   | Purpose                                                                | Status                                            |
| ------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------- |
| `korea-map-core`          | Shared models, providers, GPS track utilities; no runtime dependencies | Tested independently                              |
| `korea-map-web`           | MapLibre GL JS adapter, lifecycle, accessible markers and overlays     | Chromium / Next.js tested                         |
| `korea-map-styles`        | Standard, Dark, Pastel and Outdoor themes                              | Web synthetic fixtures tested                     |
| `korea-map-native`        | MapLibre React Native adapter and foreground location port             | Experimental; physical Android and iOS unverified |
| `korea-map-data-adapters` | Explicit operator-configured POI, search and routing clients           | Local synthetic integration tests                 |

ES modules only. Web consumers use TypeScript `moduleResolution: "Bundler"`; strict Web NodeNext consumers currently hit upstream TS2834 declarations. Core works independently with NodeNext. See the [QA report](docs/qa-report.md) for measured limits.

## Run without external API keys

From a checkout containing this candidate, install Node **24.19.0**, pnpm **12.14.0**, and Python 3, then:

```sh
pnpm install --frozen-lockfile
pnpm build:sdk
pnpm dev:web
```

Open `http://localhost:3000`. `/themes/`, `/api/` and `/walk/`, `/trip/` demonstrate themes, common APIs, dog walking and trip planning. All default map geometry and users are authored synthetic fixtures, **not a real Korean basemap**. No paid API registration is required. The initial dependency installation uses the public npm registry; normal fixture map use does not contact publisher-owned services.

The candidate is not on npm. Follow [local tarball installation](docs/quickstart.md) now; registry install commands in that guide apply only after an approved publication. The repository default branch is currently `chore/project-policy`, so cloning the default branch does not guarantee this candidate's contents.

## Guides

- [Next.js, styles, markers and routes](docs/web-guide.md)
- [Expo Development Build](docs/native-sdk.md) — Expo Go is not supported evidence
- [Public data and self-hosted tiles](docs/providers.md)
- [Search](docs/search.md), [GPS and tracks](docs/gps-tracks.md), [self-hosted routing](docs/routing.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Data licenses](DATA_LICENSES.md), [attribution](docs/attribution.md), [third-party notices](THIRD_PARTY_NOTICES.md)
- [Contributing](CONTRIBUTING.md), [security](SECURITY.md), [changelog](CHANGELOG.md)

## Cost and responsibility

The SDK source is free under MIT. Source distribution through GitHub/npm is separate from running map, tile, search, routing, database and bandwidth infrastructure. Operators choose and pay for their own providers, hosting and quotas. The SDK supplies no shared publisher API key, fallback server or paid cloud requirement. Missing configuration fails safely or uses the explicitly selected synthetic fixture.

Public browser/mobile configuration is visible to end users; keep secrets on operator-controlled servers. Map styles, glyphs, sprites, tiles and search/routing responses have their own licenses. MIT does not relicense OSM or public data. Default packages contain no third-party map datasets or font files.

## Validation and release limits

```sh
pnpm check
pnpm pack:check
pnpm verify:packages
pnpm test:web
pnpm release:prepare
```

Standard Linux/Windows/macOS CI is configured. Android physical devices, iOS, native PMTiles and native Korean glyph rendering remain unverified. Two high-severity development dependency advisories remain release blockers; see [candidate report](docs/releases/v0.1.0.md). No registry publication, tag, GitHub Release, deployment or visibility change is authorized by these commands.
