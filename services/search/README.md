# search service

Private workspace boundary; not an npm SDK package or a running service.
`src/index.ts` exports an explicit `not-implemented` descriptor only.
No HTTP port, database, downloader, cloud resource or fallback is started.
The SDK packages must never import this directory.

Implementation is deferred to the roadmap: geo-data pipelines M3/M6, search/routing engines M5.
Operators will supply licensed input and their own infrastructure and pay its operating costs.
