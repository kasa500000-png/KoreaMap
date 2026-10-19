# @korea-map-kit/core

Korea Map Kit foundation package. Unpublished; this is not the complete MVP.

SDK code and the synthetic fixture are MIT. Third-party code/data keep their own licenses.
No publisher key, backend, or default remote endpoint is included.
Build from the repository root with `pnpm build:sdk`. Only `dist` and this README are packed.
Operator HTTP providers and full platform parity remain later milestones.

Shared contracts and `MapController` are available from this package without renderer or backend dependencies. See [Public API](../../docs/public-api.md) and the [generated reference](../../docs/api/core.md).

Run `pnpm test:core` from the repository root to compile only core and exercise its API in a temporary directory with no node_modules or MapLibre. `pnpm docs:api` regenerates declaration-based API documentation.
