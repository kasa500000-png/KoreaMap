# 독립 지도 디자인 시스템 검증 — 2026-10-19

## 근거·도구·범위

[MapLibre Style Spec](https://maplibre.org/maplibre-style-spec/), [Glyphs](https://maplibre.org/maplibre-style-spec/glyphs/), [font-faces](https://maplibre.org/maplibre-style-spec/font-faces/), [MapOptions](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MapOptions/)를 확인했다. 설치된 Style Spec 26.4.4의 `validateStyleMin`으로 실제 생성 JSON과 사용자 JSON을 검사한다. GL JS 6.14.0과 Next 16.4.2를 유지했다. 새 외부 라이브러리 버전은 없다.

REA/Ghidra MCP 없음, ADB/Ghidra/xcrun 실행 파일 없음. 공개 MapLibre 문서와 기존 공개 예제 관찰 화면을 참고했고 상용 앱 보호 우회·바이너리/비공개 데이터 추출은 없다. 독립 팔레트·기호·합성 좌표를 직접 작성했다.

SDK는 렌더러 독립 styles 패키지, Web inline provider 및 RGBA 이미지 API, Next 클라이언트 비교 예제로 나누었다. Native 실화면을 새로 만들었다고 주장하지 않으며 Native용 JSON/글리프 설정 계약 검사와 실제 앱 렌더링을 구분한다.

## 단위·빌드 검증

- 4종 Style Spec, 토큰 독립 복사/오버라이드, 폭/색/zoom/대비 실패, 실제 expression의 name:ko→name→name:en, Native의 local 모드 거부, vector source-layer 계약, custom JSON/추가 레이어/출처 보존, cmap 누락·손상 파일, 자체 아이콘 생성, inline 원점 제한을 검사한다.
- 글리프 ID 존재 검사는 `auditGlyphCoverage`, 실제 TTF/OTF/TTC cmap 4/12는 `inspectFontCoverage`. parser regression용 최소 font metadata는 테스트에서 직접 구성했고 외부 font outline은 없다.
- 로컬 Noto CJK KR TTC face 1, SHA `b76b0433203017ca80401b2ee0dd69350349871c4b19d504c34dbdd80541690a`: 현대 완성형 한글 11,172자 및 corpus 총 11,190 코드포인트 누락 0. font 파일 보유/라이선스/버전 정보는 [폰트 문서](../font-icon-licenses.md)에 있다.
- Next production static export에서 `/`와 `/themes/`를 빌드한다. 공개 API 키 없이 SDK/services/Web/Expo JS 빌드를 실행하며 Expo export는 Native 앱 빌드가 아니다.

## 브라우저·화면 검증

- Chromium/Linux, software WebGL. 4종은 동일 중심·z14·bearing/pitch 0의 자체 합성 데이터다. [비교 문서](../design-system.md)의 PNG 네 장을 실제 캡처하고 직접 열어 확인한다.
- 실제 renderer query로 label/icon이 존재함을 확인한다. z10에서 라벨/POI가 사라지고, 색상 override 후 출처가 유지된다. 출처 control은 visible/display:block/opacity:1, 흰 바탕 rgb(255,255,255)와 글자 rgb(35,53,47)를 유지한다.
- CDP font resolution: `Noto Sans CJK KR`, PostScript `NotoSansCJKkr-Regular`, probe glyphCount 84, isCustomFont=false. 한/글/힣/ㄱ의 실제 canvas raster가 미지원 U+10FFFF의 모양과 다름을 검사했다. 지도 screenshot의 한글 지명/원래 이름 대체도 육안 확인한다.
- 최종 캡처는 viewport 1440×2200 안에 네 카드가 모두 포함되는지를 검사한 뒤 저장한다. 최초 canvas readback 성능 warning은 테스트 context의 willReadFrequently 설정으로 해결했다.
- 외부 HTTP 시도/페이지 오류/폰트·glyph·image 경고가 없어야 통과한다. 기존 Web SDK의 100/1,000 마커·터치·종료·provider 오류 회귀도 함께 실행한다.

## 공개 산출물과 제한

네 PNG는 `docs/screenshots/themes`의 exact path+SHA/PNG 구조/CRC/크기/출처로 제한한다. 테스트는 다른 경로, 변경 hash, 승인 없는 PNG, trailing payload 등을 거부한다. raw 데이터·폰트·외부 이미지를 일반 허용하지 않는다. npm package 멤버 allowlist는 기존 dist JS/d.ts/LICENSE/README 그대로다.

전체 검사와 tarball/staged 최종 결과 및 SHA는 아래 확정 기록과 PR checks를 따른다. 법적 권리·변조된 픽셀 의미·모든 브라우저 호환성을 hash 검사만으로 보증하지 않는다.

Android/iOS 실화면·OS 폰트 shaping, Safari/Firefox, 실제 glyph pack/range 서버, 장시간/GPU 성능 및 실제 전국 지도 데이터는 **미검증**이다. Native 재현 순서는 폰트 문서에 기록했다. 기존 MapLibre 공유 worker 1개 유지 및 dependency high2 출시 차단도 해결되지 않았다. main 병합·운영 배포·npm 발행은 수행하지 않는다.

## 최종 로컬 검사 확정

- `pnpm check` 통과: Vitest 31, 데이터 정책 17, 비용 감사 회귀 12, 경계/포맷/타입/lint/문서/출처/SDK·서비스/Next·Expo JS export/Changesets 모두 통과.
- `pnpm pack:check` 다섯 실제 tarball 멤버·내용·라이선스/출처·비밀값/비용 검사 통과. 폰트·glyph·PNG가 SDK tarball에 없음을 확인했다.
- 최종 Next 빌드에 대한 Playwright 5개 통과, skipped/flaky 0, 18.12초. 수역 override의 실제 screenshot RGB 픽셀도 검사했다. 외부 HTTP 시도 0, 페이지 오류/폰트·glyph·image 경고 0.
- Noto KR face 1의 11,190 코드포인트 검사 통과. Chromium 플랫폼 폰트/누락 문자 비교 결과와 네 screenshot을 별도로 확인했다.
- `pnpm check:data --staged`는 커밋 직전에 검사한다. 원격 3 OS 및 Linux font/browser CI 결과는 PR checks와 사용자 보고에 기록한다. Native 실화면은 위 제한대로 미검증이다.

| 실제 tarball | SHA-256 |
| --- | --- |
| korea-map-kit-core-0.1.0.tgz | `59077d7f26b82d7de5290f3863df379ca9d01350f54de341b571824e7c144ffe` |
| korea-map-kit-web-0.1.0.tgz | `2cc6d7db6329c499e20b8c9c253f0fbb747a61ce3644e8a41916423ae7dde38c` |
| korea-map-kit-native-0.1.0.tgz | `5599d1217d2bdc56450b33b05a2544581b56d920255c928507db9bd2d09c9fe5` |
| korea-map-kit-styles-0.1.0.tgz | `2deb1e5dfb44706ab07a4c04110f54d826df9168f8ddd46ce9b6ee2b5897f8d6` |
| korea-map-kit-data-adapters-0.1.0.tgz | `8a2052a82af5fa4c9ed3c8f4a80cdc8e2894da777144753aadfec76e145ab117` |
