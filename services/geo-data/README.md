# geo-data service

Private PostgreSQL/PostGIS service; never packed into the SDK. Importing `src/index.ts`
starts no server, download or database connection. All operations are explicit.

From the repository root: `pnpm build:sdk`, `pnpm geo:local start`, `pnpm geo:migrate`,
`pnpm geo:fixture`, then `pnpm geo:serve`. `pnpm test:geo` uses an isolated disposable DB.
Default fixture records are project-authored MIT examples, not government data.

The A-only CSV pipeline validates rights, review dates, source profiles, snapshot hashes,
fields, coordinates and duplicate IDs before atomic upsert. Query roles use RLS and
read-only permissions. Raw downloads remain in memory; only selected fields are stored.
Credentials and data stay in ignored operator storage. No Supabase dependency exists.

Read [the full operating guide](../../docs/public-data-etl.md) and
[validation limits](../../docs/research/poi-etl-validation.md) before connecting data.
Official source access currently returned HTTP 503: live-file ingestion is unverified.
Operators own the DB/transport/account and its operating costs. Do not expose the local
HTTP sample directly to the public Internet; supply an authenticated application proxy.
