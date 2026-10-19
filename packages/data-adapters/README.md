# @korea-map-kit/data-adapters

Korea Map Kit foundation package. Unpublished; this is not the complete MVP.

SDK code and the synthetic fixture are MIT. Third-party code/data keep their own licenses.
No publisher key, backend, or default remote endpoint is included.
Build from the repository root with `pnpm build:sdk`. Only `dist` and this README are packed.
`createFixturePlacesProvider()` explicitly selects original MIT test POIs without network.
`createRemotePlacesProvider(request)` accepts an operator-owned transport; there is no
implicit endpoint, key, fetch call or database dependency. Wrap either provider with
core `createPlacesClient()` for nearby/bounds/category queries, cancellation and deadlines.
See the repository's `docs/public-data-etl.md` for the HTTP contract and PostGIS service.
Actual public-source data and native device QA remain unverified.

`createFixtureKoreanSearchProvider(scheduler)` supplies seven original Korean test POIs.
`createRemoteKoreanSearchProvider(request, scheduler)` accepts an operator transport and validates
paginated search, prefix autocomplete and nearby-POI reverse results with portable cancellation.
No fetch/default URL or public Nominatim is embedded. Full geocoding is a separate contract.
See `docs/search.md` in the repository for PostGIS setup and working consumer examples.

`createMockLocationProvider()` is a manually driven, network-free GPS fixture for tests. Call
`push(fix)` to deliver a synthetic update, wrap its provider with core `createLocationClient()`,
and explicitly grant simulated consent. `clear()` removes its latest fix; the client owns watchers.
