# 브라우저 검증의 클라이언트 시작 대기

2026-10-21 UTC. 대상은 private Playwright 검증 코드이며 SDK나 데모 구현을 변경하지 않는다.

## 발견한 실패와 범위

main `c32ffb26e72f77fd1e890eda0a1e0cba158cd796`의 CI [39566617312](https://github.com/kasa500000-png/KoreaMap/actions/runs/39566617312)에서 Chromium 첫 390px 검사가 실패했다. `status` 요소를 5초 ready assertion 동안 찾지 못했다. 나머지 768px·1440px·20회 생명주기 검사는 통과했다. Windows/macOS/Linux/Firefox/WebKit은 통과했고, 별도 기존 audit/Web/Native 릴리스 gate는 실패했다.

`examples/web/app/map-client.tsx`는 `ssr:false` dynamic import로 `MapDemo`를 읽는다. navigation 완료와 클라이언트 컴포넌트의 부착은 별도 단계이며 이전 검사는 두 단계에 같은 ready assertion의 5초를 사용했다. 다만 이 로그만으로 당시 CI 실패의 근본 원인을 확정하지 않는다.

## 검증 코드 수정

`tests/e2e-web/map-startup.ts`에서 document navigation, 실제 `status` 요소 부착, 기존 map-ready assertion을 분리한다. `domcontentloaded` 뒤 실제 요소를 기다리며 부착 뒤의 `toHaveText('ready')`는 기존 기본 5초를 유지한다. 기존 90초/180초 테스트 상한은 바꾸지 않고 명시한 navigationTimeout이 있다면 그 상한도 공유한다. 전체 테스트의 남은 시간은 Playwright runner가 강제하며 공개 API에 없는 시작 시각을 추측하지 않는다.

단계별 시각은 diagnosticOnly로 첨부하며 초기 렌더링이나 1000마커 p95 성능 합격값으로 사용하지 않는다. 재시도·skip·추가 사전 준비·SDK 설정/의존성 변경은 없다.

실제 빌드 manifest로 식별한 map-demo dynamic chunk를 보류하는 회귀 검사를 기존 4검사 뒤에 추가한다. 이전 5초 assertion이 요소 부재로 실패하는 것을 확인한 뒤 chunk를 해제하고 같은 실제 지도가 새 대기 처리에서 ready가 되는지 검증한다. 가짜 지도나 mock renderer로 실화면 통과를 대신하지 않는다. 네트워크는 기존 loopback 제한을 유지한다.

## 검증 기록

첫 로컬 시도는 작성한 helper가 존재하지 않는 `TestInfo.startTime`을 읽어 5건 모두 즉시 TypeError였다. 이 실패는 검증 코드 오류이며 수정 뒤 실행과 구분한다.

수정본의 담당 worktree와 루트 통합 `pnpm check`는 모두 PASS다. Vitest는 새 부정 검사 5개를 포함한 193/193이며 실제 최종 파일의 TypeScript·lint·format도 통과했다. 독립 리뷰는 수정본을 다시 검사해 남은 지적이 없었다.

담당 실제 Chromium 검사는 기존 화면 3개·20회 생명주기와 새 chunk 회귀를 포함해 5/5 PASS였다. 해당 chunk는 5008ms 보류됐고 기존 assertion은 요소 부재로 실패했다. 해제 뒤 실제 부착 5579ms·ready 5618ms를 기록했다. 별도 ignored never-mount 탐침은 helper 이전 1초를 소비한 3000ms 전체 테스트에서 3032ms에 runner timeout으로 의도대로 실패했다. 이 음성 탐침 실패를 제품 QA 통과로 세지 않으며 실제 남은 테스트 상한이 유지됨을 확인한 근거로만 쓴다.

루트 기본 `pnpm test:web`는 실제 Chromium 25/25 PASS(1.4분), 최종 `pnpm verify:browser-lifecycle --browser=chromium`은 5/5 PASS(43.2초)다. 390px 네 테마 캡처를 직접 확인해 한글 라벨·아이콘·출처가 보임을 확인했다. `pnpm pack:check`도 통과했으며 SDK tarball 5개 SHA는 이전 후보와 동일하다. 루트 로그는 ignored `artifacts/recommended/browser-startup-{check,pack,web,lifecycle}.log`에 보관한다.

원격 PR와 병합 main 결과는 실제 실행 뒤 사용자 보고 및 원격 이력으로 제공한다. Android 실기기 및 macOS/Xcode iOS 빌드·화면 검사는 범위 밖이다. 기존 보안 high 2건, 공개 선언, 실제 공공 CSV, APK 라이선스, 성능·릴리스 조건은 이 수정으로 해제하지 않는다.
