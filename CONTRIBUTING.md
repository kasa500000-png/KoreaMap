# Contributing

Read [AGENTS.md](AGENTS.md) before making changes. Use Node 24.19.0, pnpm 12.14.0 and Python 3. Install with `pnpm install --frozen-lockfile`; dependency install hooks are disabled. Keep SDKs in `packages/`, apps in `examples/` and operator services in `services/`. Core must remain free of external dependencies and platform APIs.

Use a focused branch and PR. Run `pnpm check`, `pnpm pack:check` and `pnpm check:data --staged`. Web behavior requires `pnpm test:web`; SQL/ETL changes require `pnpm test:geo`; routing changes require `pnpm test:routing`. Report missing devices/tools as unverified. Review runtime source changes and update only their provenance hashes in `data/publication.json`.

After the initial v0.1.0 baseline, add `pnpm changeset` for public API or behavior changes. The five SDK packages form a fixed version group; breaking changes in 0.x require a minor version and a migration note. Patch releases must preserve existing behavior and types. Do not run version/publish commands automatically in a PR. See [release procedure](docs/releases/process.md).

Submit only code/assets/data you have the right to license. Project contributions use MIT; external datasets and fonts keep their own licenses and are excluded from Git/npm payloads. Use synthetic users and coordinates in tests. Do not submit credentials, personal tracks, downloaded map data, private app code or private endpoints.

PRs must state tests actually run, platform limitations, licensing and cost changes. Maintainer review does not authorize publishing: merging main, uploading a new public candidate, deploying, changing visibility, npm publishing and creating a GitHub Release require the applicable explicit approval.

`pnpm clean` removes SDK/service build outputs, example builds and transient browser test output. It preserves `artifacts/` (operator data, credentials, tile generations, package archives, QA receipts and worktrees) and `data/raw/`. Remove obsolete operator files explicitly after reviewing them. Cleanup rejects linked output paths and linked ancestors before deleting any output; this preflight is not an operating-system isolation boundary against concurrent filesystem changes.
