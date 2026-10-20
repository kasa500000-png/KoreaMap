# Korea Map Kit

[한국어](README.ko.md) · [Quick start](docs/quickstart.md) · [API](docs/public-api.md) · [Implementation plan](docs/execution-plan.md) · [Release status](docs/releases/v0.1.0.md)

An MIT TypeScript map SDK built on MapLibre, with shared Web and React Native APIs and Korean label support. Coordinates always use `[longitude, latitude]` in WGS84.

**The source preview is available on `main`. v0.1.0 remains unpublished and blocked for release.** Source integration does not approve production deployment, npm publication, tags or a GitHub Release. Package names remain candidates, not reserved names.

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

Install Node **24.19.0** and pnpm **12.14.0**. Repository checks also require Python **3.12+**. The default branch remains `chore/project-policy`, so explicitly clone `main`:

```sh
git clone --branch main https://github.com/kasa500000-png/KoreaMap.git
cd KoreaMap
pnpm install --frozen-lockfile
pnpm dev:web
```

Open `http://localhost:3000`. `/themes/`, `/api/` and `/walk/`, `/trip/` demonstrate themes, common APIs, dog walking and trip planning. All default map geometry and users are authored synthetic fixtures, **not a real Korean basemap**. No paid API registration is required. The initial dependency installation uses the public npm registry; normal fixture map use does not contact publisher-owned services.

`pnpm dev:web` builds the SDK and prepares the local MapLibre worker. Operator tile archives, source data, glyphs/fonts, databases and QA artifacts are ignored and are not included in a clone. Connect real map services explicitly using the [tile guide](docs/tiles.md). The packages are not on npm; [local tarball installation](docs/quickstart.md) is available now. Registry install commands apply only after an approved publication.

## Guides

- [Next.js, styles, markers and routes](docs/web-guide.md)
- [Expo Development Build](docs/native-sdk.md) — Expo Go is not supported evidence
- [Public data providers](docs/providers.md) and [local Korean tile generation / XYZ](docs/tiles.md)
- [Search](docs/search.md), [GPS and tracks](docs/gps-tracks.md), [self-hosted routing](docs/routing.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Data licenses](DATA_LICENSES.md), [attribution](docs/attribution.md), [third-party notices](THIRD_PARTY_NOTICES.md)
- [Contributing](CONTRIBUTING.md), [security](SECURITY.md), [changelog](CHANGELOG.md)

## Cost and responsibility

The SDK source is free under MIT. Source distribution through GitHub/npm is separate from running map, tile, search, routing, database and bandwidth infrastructure. Operators choose and pay for their own providers, hosting and quotas. The SDK supplies no shared publisher API key, fallback server or paid cloud requirement. Missing configuration fails safely or uses the explicitly selected synthetic fixture.

Public browser/mobile configuration is visible to end users; keep secrets on operator-controlled servers. Map styles, glyphs, sprites, tiles and search/routing responses have their own licenses. MIT does not relicense OSM or public data. Default packages contain no third-party map datasets or font files.

## Validation and release limits

These checks are separate from starting the fixture demo. `audit:dependencies`, `verify:packages` and `verify:native-consumer` currently exit nonzero for the documented security and upstream declaration failures; their partial results do not pass the release gates.

```sh
pnpm check
pnpm pack:check
pnpm test:web
pnpm audit:dependencies
pnpm verify:packages
pnpm verify:native-consumer
pnpm release:prepare
```

All five SDK packages and Web/Android/iOS remain the final target; Web Alpha is an intermediate gate. Actual OSM tiles for Seoul/Ulsan/Busan/Jeju, Korean glyphs, nine Chromium views, generation rollback and four real Valhalla routes rendered on the Seoul map passed their scoped checks; see the [tile guide](docs/tiles.md). Real public POI ingestion is blocked by unavailable source files. Isolated Native installation/plugin/JS exports passed, while full upstream React Native declaration checks failed, leaving Native consumer QA at `PARTIAL_PASS`. Standard Linux/Windows/macOS CI is configured. Android physical devices, iOS, native PMTiles and native Korean glyph rendering remain unverified. Two high-severity dependency advisories, Web NodeNext/RN declaration failures and a host Chromium/SwiftShader frame p95 of **116.7ms against the 33ms target** remain open; see the [candidate report](docs/releases/v0.1.0.md). Source preview availability does not close these release gates. No registry publication, tag, GitHub Release, deployment or visibility change is authorized by these commands.

## Map quality work

Optional shared camera/selection interactions and detailed `design-v2` cartography preserve the existing APIs and default provider policy. See the [quality plan](docs/map-quality.md) and [validation report](docs/research/map-quality-validation.md) for actual regional evidence and remaining release gates. Physical Android/iOS validation, approved coastlines and nationwide detail remain separate acceptance work.

Ten-stage preview integration: [results, PRs and remaining gates](docs/research/ten-stage-execution.md). [Fixture-only static export](docs/research/stage-10-web-deployment.md) is locally verified; external hosting and npm publication remain incomplete.
