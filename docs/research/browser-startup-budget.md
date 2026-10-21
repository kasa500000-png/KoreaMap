# 합성 지도 초기화의 명시적 기능 검증 상한

2026-10-21 UTC. 범위는 private Playwright 검증 코드다. SDK·예제 runtime·외부 Provider·dependency를 바꾸지 않는다.

## 새 실패와 기준 검토

권장 후속 6의 PR33은 OS 3종과 브라우저 3종의 기능 CI를 통과해 main `a9b424ba4f40876e7f91e0dc80ce676dab72ca87`에 병합됐다. 이후 [main CI39569788795](https://github.com/kasa500000-png/KoreaMap/actions/runs/39569788795)에서 Chromium 첫 390px 검사는 `status` 요소가 부착된 뒤에도 5초간 `loading`이라 실패했다. 나머지 네 lifecycle 검사는 PASS였다. OS 3종·Firefox·WebKit은 PASS이고 기존 release gate 세 개는 FAIL이다. 이 실패는 앞선 요소 미부착 실패와 다르며 통과로 바꾸지 않는다.

5초는 Playwright assertion의 암묵적인 기본값이다. 기존 `tests/e2e-web/quality.spec.ts`와 `docs/qa-report.md`의 합성 지도 기능 상한은 navigation 시작부터 ready 및 실제 초기 100마커까지 **10초 미만**이다. SDK의 `loadTimeoutMs` 기본 15초는 dynamic renderer import·생성 뒤 시작하므로 end-to-end 상한과 같지 않다.

실자료의 30회 cold/warm navigation-to-idle p95 목표 3초/1.5초와 1000마커 frame p95 33ms는 [기존 품질 계약](../map-quality.md)을 그대로 유지한다. 합성 기능 상한을 통과했다고 실제 cold p95·프레임 성능이 통과하는 것은 아니다. 후속 6에서 보존했던 기본 5초 assertion 정책은 이번 단계의 명시적인 전체 10초 기능 계약으로 대체하며 과거 실패를 지우지 않는다.

## 실행 관측

CI와 같은 공식 Playwright Chromium 156.0.8078.4/revision1248을 명시적으로 ignored 저장소에 준비했다. 기존 검증된 Xvfb의 인증된 Unix display·TCP 차단을 사용했다. 새 browser profile·전용 XDG cache의 단일 페이지에서 navigation 67ms, 부착 뒤 ready 297ms, navigation부터 ready 602ms였다. 외부 요청/page error는 0이다. 이 관측은 CI의 5초 loading 실패를 재현하거나 설명하지 못한다. 한 번의 로컬 관측을 cold 성능 수락으로 사용하지 않는다.

실제 Worker 응답을 6000ms 보류한 별도 단일 페이지는 5초 시점에 실제 `loading`이었다. 같은 요청/페이지가 부착 뒤 6287ms, navigation 뒤 6595ms에 실제 ready·100마커 표시를 마쳤다. 탐침은 이전 5초 검사 실패를 지우지 않고 PARTIAL_FAIL/exit1로 반환했다. 이는 정상 지연 상태를 암묵적 5초 검사로 오판할 수 있다는 대조 증거이며 당시 CI 원인의 재현은 아니다.

실제 Worker 요청을 abort한 별도 탐침은 부착 뒤 135ms에 SDK/UI error·canvas 0을 관찰하고 FAIL/exit1로 반환했다. 이미 오류가 나서 5초 결과는 NOT_EVALUATED이며 대기 성공으로 세지 않았다. 모든 원문 로그·브라우저·스크린샷은 ignored 운영자 저장소에만 보관하며 Git/npm payload에 추가하지 않는다.

## 수정 원칙

navigation 전부터 실제 ready·초기 100마커까지 하나의 10초 상한을 공유한다. 명시한 navigationTimeout과 기존 runner 전체 상한도 유지한다. terminal error/destroyed는 기다림이나 재시도로 숨기지 않고 즉시 실패한다. navigation·부착·ready·markers·실패 상태의 제한된 진단을 성공/실패 모두 보존한다. 재시도·reload·추가 사전 준비·성능 기준 변경은 없다.

진단의 `legacyReadyFiveSeconds`는 후속 6과 같은 **클라이언트 부착 뒤부터 ready까지**의 5초 비교다. navigation 전이나 dynamic chunk 부착 전부터 측정한 값으로 혼용하지 않는다. 이 비교는 진단이며 현재 합성 기능 판정은 전체 10초 상한을 사용한다.

## 최종 검증

담당 worktree와 루트 통합의 `pnpm check`는 PASS이며 Vitest 203/203(20파일), 새 상한/marker/terminal 오류 부정 검사 15개와 전체 strict·lint·build·정책 회귀를 포함한다. 독립 리뷰에서도 최종 코드와 실제 DOM predicate를 실행하는 부정 검사 15개를 확인했다. 전체 소스의 final diff 검사도 통과했다.

담당 실제 공식 Chromium 156 headed 6/6은 51.4초에 통과했다. cold 첫 390px의 navigation/부착/ready/100마커는 84/474/708/802ms였다. Worker를 실제 6002ms 보류한 회귀의 ready/100마커는 전체 6695/6778ms로 기능 상한을 만족했다. 이때 부착 뒤 5초 비교는 FAIL6368ms로 stdout과 attachment에 남겼다. 기본 네 검사의 순서·20회 정리·기타 assertion은 유지하고 새 회귀는 뒤에 둔다.

루트 `pnpm pack:check`는 PASS이며 5 tarball SHA는 이전 후보와 동일하다. 실제 공식 Chromium 156 headless도 6/6 PASS(48.7초)였고 Worker 지연의 실제 초기 100마커는 6682ms, 부착 뒤 기존 5초 진단은 FAIL6349ms였다. 최종 원격 결과는 실제 실행 뒤 사용자 보고와 원격 이력으로 제공한다. 루트 로그는 ignored `artifacts/recommended/browser-budget-{check,pack,lifecycle}.log`다.

원래 CI의 근본 원인은 여전히 미확정이다. 이 단계는 기능 검사 기준과 진단의 개선이며 SDK 성능 개선이나 당시 runtime 문제 해결을 주장하지 않는다. 기존 보안 high 2건·Web/RN 선언·실제 공공 CSV/정답·APK 법적 고지·성능·Native/배포/발행 차단은 유지한다. Android 실기기와 macOS/Xcode iOS 검증은 제외 범위다.
