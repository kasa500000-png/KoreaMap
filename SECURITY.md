# Security policy

v0.1.0 is an unpublished candidate. No stable release or response-time guarantee is offered. Maintainers review the current candidate; no previous-version support window exists yet.

Do not post vulnerabilities, access tokens, personal GPS records or exploit details in public issues. If the repository Security tab offers **Report a vulnerability**, use that private reporting flow. Its availability has not yet been verified. If unavailable, open only a non-sensitive request for a private contact channel and wait before sharing details. Confirm a private security/contact channel before public release.

Reports should describe affected package/version, impact, minimal synthetic reproduction and suggested remediation. Coordinate disclosure after a fix and regression checks. Never send credentials in a report.

Run `pnpm audit:dependencies`, `pnpm audit:cost`, `pnpm check:licenses`, `pnpm check:data` and `pnpm pack:check`. Scanners are bounded checks, not a guarantee that all secrets, licensing issues or runtime network costs are absent. Client environment values are public. Providers, redirects, custom layers and operator infrastructure remain operator responsibilities.

Known release blockers include high-severity `node-forge` GHSA-86w9-cpqp-85rv and `braces` GHSA-vfj7-8cjw-p6xm in the Expo/RN development graph. See the [candidate report](docs/releases/v0.1.0.md). Do not suppress advisories or claim a production security pass while unresolved.
