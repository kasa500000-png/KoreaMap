# Third-party notices

Korea Map Kit source is MIT; see [LICENSE](LICENSE). Dependencies retain their own copyrights and licenses. SDK tarballs do not bundle dependency source, fonts, map datasets or service databases. Package managers install dependencies separately with their upstream notices. Redistributors bundling dependency code must preserve the actual notices from the installed version, not rely only on this summary.

| Component             | Reviewed version                         | License / use                                                              |
| --------------------- | ---------------------------------------- | -------------------------------------------------------------------------- |
| MapLibre GL JS        | 6.14.0                                   | BSD-3-Clause; Web peer and demo worker                                     |
| MapLibre style spec   | 26.4.4 / 26.2.1                          | ISC; Web/styles and Native validation                                      |
| MapLibre React Native | 11.5.0                                   | MIT; Native peer                                                           |
| React / React Native  | 19.3.0 / 0.88.0                          | MIT; application/native peers                                              |
| Expo                  | 58.0.14                                  | MIT; example development environment                                       |
| GeoJSON types         | 7946.0.16                                | MIT; public type dependency                                                |
| PostgreSQL / PostGIS  | Operator service images                  | PostgreSQL license / GPL; separate server processes, not embedded SDK code |
| Valhalla              | Pinned local service image in repository | MIT engine; data and third-party components have separate terms            |

The Web example copies the installed MapLibre worker and its license into generated assets. Keep those notices when deploying. The Native application also links native/transitive components; a final APK/IPA dependency and notice inventory remains a release gate, especially iOS which is unbuilt here.

Windows x64 development installs include `@img/sharp-win32-x64@0.35.5` under Apache-2.0 **AND** LGPL-3.0-or-later, including libvips 8.18.7 DLLs. Preserve its Apache license and bundled third-party notices; binary redistribution requires separate source/relinking and transitive-license review. This exact-version metadata review does not authorize binary distribution or relicense these components as MIT. See the [Windows review and hashes](docs/research/windows-license-review.md).

`pnpm check:licenses` checks the resolved workspace graph. Reviewed special cases include libvips (LGPL-3.0-or-later), lightningcss (MPL-2.0), caniuse-lite (CC-BY-4.0), argparse (Python-2.0) and node-forge's BSD-3-Clause OR GPL-2.0 choice (use BSD). Their presence in development tools does not relicense SDK source; distributing those components may create additional obligations. See [QA limitations](docs/qa-report.md).

No third-party font or icon binary is included in SDK tarballs. POI icons are project-authored procedural shapes under MIT; local Noto font QA does not authorize bundling every font. Follow [font/icon licenses](docs/font-icon-licenses.md) and [data licenses](DATA_LICENSES.md).

The inspected Android debug Development Build contains 19 native-library filename candidates, three TFLite assets and five notice-name candidates. Selected cached AAR bytes match MapLibre Native, Hermes and MLKit barcode scanning; MLKit's cached POM declares its own Terms of Service. These are development APK findings, not SDK npm payloads or license approval. See the [binary inventory investigation](docs/research/native-binary-notices.md). Exact variant dependency graphs, applicable license texts and bundled notices still require review before binary distribution.
