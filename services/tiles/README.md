# Private operator tile tools

This service is not an npm SDK package or a hosted map provider. See [the operator guide](../../docs/tiles.md) for pinned tools, explicit source rights/checksums, offline glyph generation, commands and actual validation limits.

`pnpm build:sdk` compiles the TypeScript wrapper using Node's built-in SQLite. Actual tile generation separately requires JDK 21, the verified Planetiler 0.10.2 JAR and an operator-selected OSM PBF. Glyph generation separately requires reviewed OFL font input and pinned optional Python tools. None is downloaded by SDK install, import, build or default tests.

The supplied HTTP service binds to loopback, pins one verified generation and has no upstream proxy or fallback. Restart it after an explicit generation switch. Public hosting, TLS, quotas, monitoring and operating costs belong to the operator. The service is a local integration path; no production SLA is promised.

Project-authored code is MIT. OSM inputs and derived archives retain ODbL obligations; fonts/glyphs retain their own notices. Keep all generated payloads outside Git/npm. Default tests use original synthetic input only; real-data QA requires explicit opt-in.
