# Data licenses

MIT applies to Korea Map Kit code and explicitly authored synthetic fixtures. It does not apply automatically to map datasets, tiles, photographs, third-party icons, glyphs or fonts.

The maintained record is [data/sources.json](data/sources.json), with [source research](docs/data-sources.md), [license conditions](docs/data-licenses.md) and [attribution requirements](docs/attribution.md). Review each dataset and its current terms, not the provider organization as a whole.

- **A:** confirmed storage/redistribution scope; only these may be eligible for operator-initiated collection, with source profile, review deadline and license checks.
- **B:** confirmed API-only permission; optional operator-configured API access only.
- **C:** unresolved conditions; excluded from execution.
- **D:** excluded/unusable for the intended purpose.

Even A datasets are not shipped in Git or npm. Public POI services and raw/derived databases belong to operator-managed storage. OSM is ODbL; derived database/share-alike and attribution obligations must be evaluated separately from the MIT SDK. Tile hosting policies are additional conditions. API access does not prove long-term storage or redistribution permission.

Default demos use authored synthetic geometry and fictional people, labeled as such. No OSM extract, public-data payload, font binary or external photograph is bundled. Font/icon conditions are in [the asset license record](docs/font-icon-licenses.md). Never hide required attribution when changing themes.
