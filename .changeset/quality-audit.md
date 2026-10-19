---
'@korea-map-kit/web': patch
'@korea-map-kit/styles': patch
---

Avoid redundant camera updates and marker source/selector rebuilds when validated state values
are unchanged. Preserve immutable snapshots and notify for actual coordinate, order or content edits.

Publish explicit GeoJSON ambient type references for strict isolated Web/Bundler consumers.
