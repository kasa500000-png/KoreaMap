# Public API 검증 — 2026-10-19

대상: `feat/shared-public-api`, 기반 `f112fb0330e8de88e85bc75591d6cf4f7c3ee509`. [API 계약](../public-api.md), [비용 감사](../cost-audit.md), [진행 기록](../progress.md).

## 검증 범위

| 항목 | 실행/판정 |
| --- | --- |
| TypeScript strict | SDK, Web, Expo, tests 빌드/타입 검사 통과. tests/types/public-api.ts 양성/음성 컴파일 검사 |
| Vitest | 41개 통과. 공통 명령, 입력 복사, 잘못된 GeoJSON, 날짜변경선/world copy, pre-cancel·진행 중 취소·timeout·late result·리스너/타이머 정리 |
| Native bridge | 동일 컨트롤러 명령/스타일 완료·거부·timeout/종료 mock 검증. 실제 Native 엔진 실행 아님 |
| core 독립 실행 | core만 tsc 빌드 후 node_modules 없는 OS 임시 폴더로 dist 복사; Node 내장 테스트 1개 통과. fetch 금지, UI 패키지 없이 주요 9 API 호출 |
| 문서 | TypeScript 배포 선언에서 API 참조 생성. 재생성 결과 일치와 Markdown 내부 링크 검사 |
| Next.js | production static export, `/api/` 클라이언트 dynamic import 포함. SSR import 오류 없음 |
| Expo | Android/iOS JavaScript export 통과; APK/IPA/native compile 아님 |
| Playwright | Chromium 6개 통과. 기존 100/1,000 마커·터치·오류/복구·테마 회귀 + 공통 API 2회 스타일 교체, 마커/Point/Polygon/경로 유지, bounds, 선택, pre-cancel, 종료 |
| 외부 요청 | 공통 API 예제와 기존 로컬 예제에서 외부 HTTP 요청 시도 0. 브라우저 네트워크 이벤트 수집 + 비로컬 요청 차단 |
| 실화면 | test-results/public-api.png 직접 확인: Dark 합성 도형/경로/팝업, 한글 UI, 밝은 출처 패널 표시. 파일은 ignored 로컬 증거이며 Git/npm 미포함 |
| 전체 정책/배포물 | 최종 `pnpm check`, `pnpm pack:check`, staged 결과는 아래 확정 기록 |

초기 E2E에서 style.load를 초기 ready로 처리한 회귀가 발견됐다. 외부 리소스가 차단되어도 캔버스가 남았다. 초기 load(리소스 로딩 완료)와 실행 중 style.load를 분리한 후 동일 origin 차단 회귀와 전체 6개를 통과했다. 실패 실행을 합격으로 집계하지 않는다.

## 제한

- `/usr/bin/chromium` software WebGL로 검사했다. 실제 Android/iOS 기기, ADB, Xcode/xcrun이 없어 Native 실행·메모리·폰트·접근성/제스처는 **미검증**이다. Expo JS export를 대체 증거로 쓰지 않는다.
- core 독립 테스트는 복사한 compiled core를 실행한다. npm 실제 발행/설치를 의미하지 않는다. 다섯 실제 tarball의 allowlist/bytes/라이선스·비용 경로는 별도 pack 검사에서 확인한다.
- Native 외부 리소스/symbol 스타일은 의도적으로 거부한다. Web origin 정책은 초기 설정을 유지하며 arbitrary custom JavaScript/redirect에 대한 네트워크 sandbox를 보장하지 않는다.
- provider 실 구현, 외부 서비스 비용 한도, GPS permission UX, 실제 공공데이터/tiles/glyph, Safari/Firefox, 장시간 GPU/heap와 이전 MapLibre singleton worker 제약은 남아 있다.
- 기존 전이 dependency high2 출시 차단 유지. 엔진/전이 그래프 버전 변경이나 신규 advisory 조회는 하지 않았다. Native 직접 의존성은 기존 RN 내부 버전인 Style Spec 26.2.1(ISC)로 명시했다.

## 재현

```sh
pnpm install --frozen-lockfile
pnpm test:core
pnpm check
pnpm pack:check
pnpm exec playwright install --with-deps chromium
pnpm test:web
pnpm check:data --staged
```

Linux 로컬은 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`을 사용했다. 테마 QA에는 기존 [폰트 검증](../font-icon-licenses.md)의 로컬 Noto CJK가 필요하다. API 예제 자체는 glyph/외부 폰트를 요구하지 않는다. 원격 3 OS CI는 PR의 해당 커밋 결과로 구분한다.

## 최종 로컬 확정

`pnpm check` 통과: Vitest 41, 독립 core Node 1, 데이터 정책 17, 비용 검사 12, strict 타입/ESLint/Prettier/생성 API 문서 및 Next·Expo JS build. `pnpm pack:check`는 5개 tarball의 파일·bytes·출처·보안/비용 경로를 통과했다. 그 뒤 최종 Next 배포물을 대상으로 Playwright 6개 통과(0 skipped/flaky), 외부 HTTP 시도 0. staged 검사 후 커밋하며 원격 3 OS 결과는 PR에서 구분한다.

| 로컬 artifact | SHA-256 |
| --- | --- |
| korea-map-kit-core-0.1.0.tgz | `ac7ff54ffd2cf229a8b8b01b3e5d822a41fd8569b4601154a01ceee1f839303b` |
| korea-map-kit-data-adapters-0.1.0.tgz | `8d13a03c440ed00a1e02e856d147b8ec185cf450ca6321fa14f95549b88de48f` |
| korea-map-kit-native-0.1.0.tgz | `d026392123c4b276f59b6dea0329bd0565e2b5c9fb082c1049575c10d5a73505` |
| korea-map-kit-styles-0.1.0.tgz | `2deb1e5dfb44706ab07a4c04110f54d826df9168f8ddd46ce9b6ee2b5897f8d6` |
| korea-map-kit-web-0.1.0.tgz | `6c324bf1e5f759992e795ce86af36450b01ef3f9ec465b7254b780c55ae8115f` |
| ignored public-api.png | `ad26ec8ab04930ce534f7df1d1de695d6fe8343f5e154218e06cc6ca20e35b54` |

## Native 타입 해석·원격 회귀 보강

초기 커밋 `1c86947`의 원격 CI에서 Windows/macOS check·pack은 통과했지만 Linux의 기존 font-probe KR face 단발 조회가 실패했다. 해당 실행을 전체 CI 합격으로 표시하지 않는다. probe를 실제 표시하고 document.fonts.ready/레이아웃 이후 정확한 KR family와 glyphCount를 기다리도록 보강했다. 허용 폰트를 넓히거나 검사를 생략하지 않았다. 최종 후속 커밋의 원격 결과는 PR checks를 따른다.

별도 타입 심층 검사에서 Native의 NodeNext 해석이 상위 RN의 extensionless 선언 import를 any로 처리함을 확인했다. Native를 ESNext/Bundler로 변경하고 실제 CameraStop union을 만족하도록 center/bounds 상호 배제 구조를 적용했다. RN의 고정 Style Spec 26.2.1과 Web/styles 26.4.4의 타입 차이는 무조건 캐스팅하지 않고 Native 전용 26.2.1 validator로 확인한다. 새 직접 의존성은 이미 lockfile에 존재하던 동일 버전이며 ISC 조건을 유지한다. `pnpm check:native-types`가 실제 component/ref/method 해석에서 any/unknown을 발견하면 CI를 실패시킨다.

보강 후 로컬 전체 `pnpm check`(새 Native 타입 해석 검사 포함), `pnpm pack:check`, 최종 Playwright 6개를 다시 통과했다. 위 tarball SHA는 보강 후 산출물이다. 원격 결과는 후속 커밋에 연결된 PR checks로 확인한다.
