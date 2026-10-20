# Web SDK 검증 — 2026-10-19

## 구현과 공식 근거

정확한 기존 버전 MapLibre GL JS 6.14.0, Next.js 16.4.2를 유지했다. dependency 및 lockfile 변경은 없다. 확인한 공식 계약:

- [Map API](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/): camera, source/layer, event, resize/remove.
- [Popup API](https://maplibre.org/maplibre-gl-js/docs/API/classes/Popup/): setDOMContent와 close 이벤트.
- [Next lazy loading](https://nextjs.org/docs/app/guides/lazy-loading): Client Component 내부 `dynamic` + `ssr:false`.

`MapState`는 DOM/renderer와 독립이며 caller 소유다. 순수 데이터 계약은 core에 두고 외부 의존성을 추가하지 않았다. 최초 preview의 raw `handle.map`과 `center` 옵션은 `on`/통제 API 및 `createMapState`로 대체했으며 Changeset에 명시했다. 실행 중 스타일 교체는 지원하지 않는다. overlay/custom layer는 재생성 시 caller가 다시 연결한다.

## 실행 결과

- Linux Node 24.19.0 / pnpm 12.14.0. 유료 계정/API 키 없이 실행.
- Vitest 18개: 순수 상태 복사·구독 해제·검증 실패 원자성, SSR import/호출 방어, 운영자 설정/비용동의/리소스 origin, 출처 escaping, GeoJSON 검증 및 기존 core/fixture 계약.
- TypeScript strict와 ESLint 통과. Next production webpack static build 통과; 서버에서 MapLibre 생성 없음.
- Chromium 실제 WebGL renderer 4개 E2E: 100/1,000 실제 `queryRenderedFeatures` 고유 마커 수, 지도 클릭·선택기·팝업, 줌/이동/회전, 포인터 드래그, ResizeObserver, 다섯 번 종료/재생성 및 선택 유지, 잘못된 style 오류 복구, 운영자 로컬 스타일과 외부 리소스 차단.
- 모바일 viewport 390×844 + Chromium CDP touch drag/pinch. 실제 터치 이벤트로 카메라 변화 확인. 물리 모바일 장치·iOS Safari 검증은 아니다.
- 데스크톱/모바일 screenshot을 직접 확인했다. 합성 지형·경로·Point/Polygon·마커·장소 카드·한글 조작 UI·MIT 출처가 표시된다. 실제 한국 도로/지명·한글 glyph는 포함하지 않는다.

## 종료와 메모리 제한

다섯 번 mount/unmount 후 지도 canvas/popup/selector 없음, SDK 엔진 리스너 0, 실제 감시 중 ResizeObserver 0을 확인한다. state subscription·abort listener·timeout/RAF·popup close listener도 cleanup에서 해제한다. engine 참조와 callback Set, overlay registry를 비운다. caller가 보유한 MapState와 caller 구독은 보존한다.

초기 테스트의 “worker 0” 가정은 실패했다. 설치된 MapLibre 6.14.0 `src/util/dispatcher.ts`의 `getGlobalDispatcher()`가 GLOBAL_DISPATCHER_ID로 공유 pool을 유지하며, 지도별 `remove()` 후에도 worker 1개가 남는다. 공개 `clearPrewarmedResources()`는 이 dispatcher 해제 API가 아니다. 임의로 제거하면 다른 지도/재생성을 깨뜨릴 수 있어 수행하지 않는다. 수정한 검사는 다섯 번 종료 후 매번 worker 정확히 1개, observer 0이며 worker 누적 증가가 없음을 확인한다. worker URL은 SDK 모듈의 최초 설정 이후 고정한다. 완전한 worker 종료 보장은 **미충족**이며 상위 엔진 해결 또는 격리 실행 설계가 필요하다.

CDP 강제 GC 후 첫 지도와 다섯 번 재생성의 used heap 차이가 8 MiB 미만인지 검사한다. 이 기준은 작은 반복 회귀 탐지용이며 장시간 누수 없음, GPU/worker heap 또는 모바일 메모리 성능을 증명하지 않는다. 1,000 마커 표시 검증을 FPS/전국 규모 성능 보장으로 해석하지 않는다.

## 라이선스·출시 제한

SDK/합성 fixture만 MIT. MapLibre worker의 기존 BSD 고지를 유지한다. 실제 제3자 지도·폰트·사진은 없음. 변경한 source의 SHA 검토는 합성 데이터/자체 작성 코드임을 확인한 파일에만 적용했다. 라이선스 정책 자동 검사는 법적 권리 판단을 대체하지 않는다.

기존 dependency high2, 실제 타일/glyph, Safari/Firefox와 실제 모바일 QA는 남아 있다. main 병합·공개 전환·운영 배포·npm 발행을 수행하지 않는다. 전체 `pnpm check`, `pnpm pack:check`, staged 데이터 검사 및 최종 빌드 E2E 결과는 진행 문서와 PR checks에 함께 기록한다.

## 최종 로컬 실행 확정

- `pnpm check` 통과: 데이터 정책 회귀 16, Vitest 18, 비용 감사 회귀 11, 경계/문서/원장/출처/포맷/타입/lint/SDK·서비스/Next·Expo JS export/Changesets. Expo 결과는 Native 컴파일이 아니다.
- 최종 production build의 Playwright 4개 통과, 0 skipped/flaky (11.75초). 예약 ID 충돌 graceful failure도 추가 확인했다. 데스크톱 fixture와 운영자 origin 시나리오에서 외부 HTTP 시도 0.
- GC 후 주 스레드 used heap: 9,017,344 → 9,223,352 bytes (5회 재생성, +206,008 bytes). worker/GPU memory는 이 측정에 포함되지 않는다.
- `pnpm pack:check` 다섯 실제 tarball 멤버·내용·출처·비밀값/비용 검사 통과. staged 검사는 커밋 직전에 실행한다. 원격 CI는 PR checks를 확인한다.

| 패키지 | SHA-256 |
| --- | --- |
| korea-map-kit-core-0.1.0.tgz | `59077d7f26b82d7de5290f3863df379ca9d01350f54de341b571824e7c144ffe` |
| korea-map-kit-web-0.1.0.tgz | `f624ad672c3dbdc1e9a83ff20bf9709ee56755f28b9c028ab859cb766efdfc35` |
| korea-map-kit-native-0.1.0.tgz | `5599d1217d2bdc56450b33b05a2544581b56d920255c928507db9bd2d09c9fe5` |
| korea-map-kit-styles-0.1.0.tgz | `ce495e6de54ed7a07f741000718be7186221eef42bcf4f59fb5ad6ad3c520e0b` |
| korea-map-kit-data-adapters-0.1.0.tgz | `8a2052a82af5fa4c9ed3c8f4a80cdc8e2894da777144753aadfec76e145ab117` |
