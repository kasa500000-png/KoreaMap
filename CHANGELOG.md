# Changelog

## 0.1.0 — Unreleased candidate

Initial baseline, prepared 2026-10-19. No npm publication or GitHub Release has occurred. Earlier pending feature Changesets are consolidated here at the existing 0.1.0 version; applying them again would incorrectly create a 0.2.0 first release. Future changes use Changesets normally.

Package names change from the unverified `@korea-map-kit/*` scope to candidate unscoped names `korea-map-core`, `korea-map-web`, `korea-map-native`, `korea-map-styles` and `korea-map-data-adapters`. Update SDK imports accordingly; private workspace example/service names stay unchanged. Availability is not registration.

### Included work

#### gps-tracks

Add consent-gated foreground location clients, filtered in-memory track recording, geodesic
distance, active duration, pause segments, GeoJSON/GPX exchange and replay. Provide browser and
injected Expo adapters plus a mock GPS. No storage, background collection or remote endpoint is
enabled by default. Native device/background verification remains pending.

#### korean-poi-search

Add portable Korean POI search, autocomplete, spatial filters, paginated results with provenance,
nearby-POI reverse lookup, cancellation and map selection. Provide an explicit synthetic fixture
and operator-injected transport without a default endpoint. Full address geocoding remains a
separate GeocodingProvider contract.

#### map-design-system

Add Standard, Dark, Pastel and Outdoor design tokens and style builders, Korean name fallback, font cmap and glyph coverage checks, original MIT POI icons, custom style validation/extensions and a local comparison gallery. Web now accepts explicit inline styles and caller-owned RGBA images. Native text requires an explicit glyph provider; physical Native font rendering remains unverified.

#### native-sdk

Add explicit operator XYZ/glyph/sprite resources, experimental PMTiles with HTTP fallback source
selection, four-theme Expo Development Build example, accessible marker cards and gesture controls.
Keep overlay state across style revisions and ignore stale native load callbacks. No default remote
provider; native resource validation does not enforce redirect destinations. Device QA remains gated.

#### optional-local-routing

Add opt-in road routing contracts, validated provenance and GeoJSON conversion, and a Valhalla adapter with injected transport, cancellation and bounded waypoint matching. No default routing endpoint or straight-line fallback.

#### quality-audit

Avoid redundant camera updates and marker source/selector rebuilds when validated state values
are unchanged. Preserve immutable snapshots and notify for actual coordinate, order or content edits.

Publish explicit GeoJSON ambient type references for strict isolated Web/Bundler consumers.

#### quiet-local-foundation

Add the strict TypeScript workspace and explicitly selected local fixture foundation.

#### quiet-public-places

Add attributed PublicPlace records and portable nearby/bounds/category query contracts with explicit fixture and operator transport providers. Keep database clients and ETL outside SDK packages. Existing Place and PlaceRepository contracts remain compatible.

#### scenario-apps

Add platform-free boundsFromCoordinates with shortest dateline-spanning longitude bounds.
Keep one visible attribution control when replacing Web styles, preventing overlapping stale credits.
Validate the shared API through private walking and itinerary examples; app storage and scenario
branches stay outside published SDK packages.

#### shared-public-api

Add a platform-neutral MapController, shared map/provider contracts, JSON/geometry validation and portable cancellation/deadlines. Web exposes handle.api; Native exposes the same controller through MapView ref, with local geometry styles only until a resource-origin gate is implemented. Preserve legacy Web methods and core type names.

The KitErrorCode union gains TIMEOUT, PERMISSION_DENIED, NETWORK_ERROR and NOT_FOUND. Consumers using exhaustive switches must handle these values in this 0.x minor release. Cancellation does not imply rollback; cancelling an in-progress style replacement disposes that map. Native real-device rendering remains unverified.

Native resolves upstream declarations with Bundler mode and validates inline styles using the binding's existing pinned Style Spec 26.2.1 (ISC). A CI guard rejects component/ref types that silently resolve to any. Web/styles keep Style Spec 26.4.4; engine and transitive versions are unchanged.

#### web-map-sdk

Add shared camera/marker/geometry contracts and a lifecycle-managed MapLibre web SDK with explicit operator configuration, batched markers, accessible place selection, overlays and client-only Next.js example. Replace the preview raw `map` escape hatch with controlled methods and `on`; use `createMapState` instead of the old `center` option.

### Local completion work — 2026-10-20

Add a private, explicit operator tile pipeline with a pinned Planetiler profile, verified OSM
input, immutable MBTiles generations, manual activation/rollback, read-only loopback XYZ service
and offline licensed glyph builder. Add the opt-in `/tiles/` Web example and the optional Web
`useLocalIdeographs: false` setting for configured CJK glyph PBFs. Defaults and the 0.1.0 unpublished
baseline remain unchanged; real map/font payloads are excluded from SDK packages and Git.

Add independent Native tarball consumption and real-POI verification tools, enforce dependency
audit in CI and bind release inputs to an approved main-integrated commit. See the
[execution report](docs/research/completion-validation.md) for exact passes and external blockers.

### Release preparation

English/Korean entry docs, community policies, source/asset license separation, package metadata, guarded manual publication preparation, tarball integrity manifest and release notes. Known high-severity advisories, strict Web NodeNext incompatibility, native device/iOS gaps, registry permissions and final publication validation remain open. See [release report](docs/releases/v0.1.0.md).

### Additional unpublished work consolidated — 2026-10-21

These three records are included in the first unpublished 0.1.0 baseline, following the existing initial release policy. No published version or tag exists. Future changes after publication use the normal fixed-group Changesets process.

#### fast-web-map-commands

Avoid rendered-marker queries during internal command readiness checks, batch accessible marker selector updates, and reuse marker ID indexes for picking. Camera events, marker content, selection ordering and explicit diagnostics remain unchanged.

#### readable-maps-and-interactions

Add an optional shared interaction controller for completed camera transitions, asymmetric insets, batch markers and portable selection. Preserve the existing controller and default marker behavior. Add opt-in clustering, accessible example controls and a detailed cartography style with an explicitly versioned tile schema. This changeset does not publish packages or certify physical Android/iOS support.

#### native-public-geojson-types

Preserve the public GeoJSON type reference and ship its existing type dependency so strict React-only consumers can resolve Native SDK declarations in Bundler and NodeNext modes. React Native application declaration failures remain release blockers.
