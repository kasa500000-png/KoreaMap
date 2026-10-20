---
'korea-map-native': patch
---

Preserve the public GeoJSON type reference and ship its existing type dependency so strict React-only consumers can resolve Native SDK declarations in Bundler and NodeNext modes. React Native application declaration failures remain release blockers.
