# Korea Map Kit PostGIS search service

Private operator service; not an npm SDK package. Importing it starts no connection or listener.
Explicit PostgreSQL connection and migrations are required. Uses the existing geo-data POI table,
pg_trgm GIN/prefix indexes, geography filters/distances and read-only transactions.

From the repository root: `pnpm build:sdk`, `pnpm geo:local start`, `pnpm geo:migrate`,
`pnpm geo:fixture`, `pnpm search:migrate`, then `pnpm search:serve`.
The loopback server accepts POST /search with search/autocomplete/reverse requests.
`GEO_DATABASE_URL` is server-only; `KMK_SEARCH_PORT` defaults to 8100.
No public Nominatim, publisher endpoint, secret, remote fallback or automatic data collection.

Reverse lookup returns a nearby POI's address, not an exact road-address determination.
A separate GeocodingProvider is required for nationwide address geocoding.
Deploy behind an operator-owned authenticated/rate-limited gateway; do not expose the sample directly.
See [search guide](../../docs/search.md) and [validation](../../docs/research/search-validation.md).
