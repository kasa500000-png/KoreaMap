# Stage 03 — 브라우저 및 반복 생명주기 QA

격리 실행 기준 소스는 `259d75e`이며 Playwright는 기존 고정 버전 `1.64.1`을 사용한다. SDK·예제·의존성은 변경하지 않았다. 기존 `pnpm test:web`의 Chromium 25개 검사를 유지하고, 선택형 실행기로 별도 검사를 추가한다. 아래 CI 미변경 등의 인계 문구는 격리 담당 시점이며, 루트 통합은 main `469bb3c` 위에서 새로운 표준 Ubuntu Chromium/Firefox/WebKit CI matrix도 추가한다.

```sh
pnpm exec tsc -b packages/core packages/styles packages/web packages/data-adapters
pnpm --dir examples/web build
node scripts/verify-browser-lifecycle.mjs --browser=chromium
node scripts/verify-browser-lifecycle.mjs --browser=firefox
node scripts/verify-browser-lifecycle.mjs --browser=webkit
```

각 브라우저는 운영자가 Playwright 공식 설치 명령으로 먼저 준비한다. 실행기는 설치·다운로드·외부 서비스 연결을 수행하지 않는다. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`는 Chromium에만 적용한다. `PLAYWRIGHT_BROWSERS_PATH`는 별도 공식 브라우저 설치 위치를 지정하는 표준 Playwright 설정이다. 화면 서버는 기존 loopback 주소를 사용하며 동시에 실행하지 않는다. Linux에서 준비된 display를 사용하는 경우 실행기에 `--headed`를 추가한다.

기존 기본 명령은 `KMK_QA_BROWSER` 미설정 시 정확히 25개 검사를 선택한다. 새 실행기는 허용한 세 브라우저 중 하나를 명시적으로 선택하고 새 파일의 네 검사만 실행한다. 알 수 없는 브라우저·중복 옵션·다운로드 옵션은 실패한다. Chromium 전용 실행 파일·SwiftShader 인자를 Firefox나 WebKit에 전달하지 않는다.

새 화면 검사는 390/768/1440px 각각에서 실제 지도 canvas, 마커 선택·카드·포커스 복귀, 이동·확대, 네 테마의 실제 라벨/아이콘·출처, 한글 글자의 raster, 세 이동 수단의 합성 도로 경로, 경로 없음, HTTP 503 복구, SDK 종료 후 canvas·팝업·selector 제거와 리스너 0을 확인한다. 각 테마를 viewport 안으로 스크롤하고 두 RAF 뒤 canvas screenshot을 별도 PNG 디코더로 읽어 실제 색상이 8개를 초과하는지 확인한다. 요청은 정확한 로컬 origin으로 제한하고, 외부 origin 요청 시도 및 브라우저 예외를 실패시킨다. 합성 경로는 실제 도로 서비스·현장 이동 검증이 아니다.

반복 검사는 안정화 3회 뒤 측정 20회에 걸쳐 매회 지도 시작, 실제 1,000마커 렌더링, 선택·팝업 닫기, 카메라 이동, 종료를 수행한다. 매회 실제 Worker 생존 수가 기준값으로 돌아오고 ResizeObserver 0, SDK 리스너 0, canvas·팝업·selector 0인지 확인한다. Worker 생성 누적값도 함께 기록하며 살아 있는 공유 worker pool을 누수로 단정하지 않는다.

Chromium은 CDP GC 뒤 주 스레드 heap을 기준 및 5/10/15/20회에 수집하고, 각 측정의 기준 대비 증가가 8MiB 미만인지 확인한다. Firefox·WebKit에는 CDP를 호출하지 않으며 heap은 `UNAVAILABLE`로 보고한다. 모든 브라우저에서 Worker/GPU 메모리의 전체 크기, 수 시간 사용, 실제 휴대기기 성능은 이 검사 범위 밖이다. 20회 검사를 장기간 운영 무누수 보장으로 표현하지 않는다.

2026-10-20 실제 실행 결과:

| 항목 | 결과 |
| --- | --- |
| 기본/선택형 테스트 목록 | PASS, 기존 25개 및 선택형 4개 분리 |
| 기존 Chromium 전체 회귀 | PASS, 25/25, 1.3분, skip/retry 0 |
| 실행기 옵션 검증 | PASS, 유효/오류 입력 10개 |
| 독립 PNG 검사 | PASS, 단색·다색·투명·손상 입력 4개 |
| TypeScript strict 집중 검사·SDK 관련 빌드 | PASS |
| Prettier·ESLint | PASS |
| Next.js production 빌드 | PASS, 11개 정적 페이지 |
| 선택형 Chromium 실제 QA | PASS, 4/4, 37.0초, skip/retry 0 |
| Chromium 반복 자원 | PASS, 모든 종료 표본 Worker 1·Observer 0·생성 Worker 누계 1 |
| Chromium GC heap | 기준 7,534,260B → 5회 8,405,112B → 10회 8,583,392B → 15회 8,661,216B → 20회 8,713,664B |
| Firefox 157.0 + Xvfb 실제 QA | PASS, 4/4, 40.0초, skip/retry 0, 표준 host preflight 사용 |
| Firefox 반복 자원 | PASS, 모든 종료 표본 Worker 1·Observer 0·생성 Worker 누계 1, heap 미검증 |
| Linux WebKit 27.2 실제 QA | PASS, 4/4, 32.2초, skip/retry 0, 아래 로컬 환경 조정 적용 |
| Linux WebKit 반복 자원 | PASS, 모든 종료 표본 Worker 2·Observer 0·생성 Worker 누계 2, heap 미검증 |

기본 환경의 실패도 보존했다. Firefox headless의 DOM 실행은 성공했으나 기본 및 명시적 software-WebGL 설정 모두 WebGL을 제공하지 못했다. 검증된 로컬 Xvfb의 인증된 Unix display와 software Mesa에서 headed Firefox의 실제 WebGL 2.0 및 네 검사를 다시 실행했다. Xvfb는 TCP를 열지 않고 종료 후 생성한 인증 파일과 display 프로세스를 정리했다. Linux WebKit의 초기 실행은 OS 라이브러리 부족으로 실패했다. Linux WebKit 결과는 Safari·iOS 실기기 검증으로 표시하지 않는다.

Firefox의 긴 full-page screenshot을 직접 검토하면서 화면 밖 Outdoor canvas가 빈 이미지로 캡처되는 것을 발견했다. feature count와 ready 상태만으로 실제 그림을 증명할 수 없어 테마별 viewport 캡처와 독립 PNG 검사를 추가했고 세 브라우저를 모두 다시 통과했다. Firefox·WebKit의 최종 Outdoor 390px 개별 캡처를 직접 열어 한글 지명·도로·녹지·수역·출처가 실제 표시되는 것을 확인했다. 테마별 개별 PNG가 렌더링 판정 근거이며 긴 페이지 overview는 화면 밖 WebGL compositing 제한이 있다. SDK runtime 수정이 필요한 문제는 아니었다.

공식 Playwright Firefox `1555`와 WebKit `2370` archive의 압축 해제 크기를 확인했다. 합계 607,828,410B로 엄격한 600MB 예산을 넘으므로 다운로드·실행·정리를 순차 수행한다. 다운로드는 공식 Playwright CDN만 사용하고, zip·실행 파일·스크린샷·로그·JSON은 ignored 운영자 artifacts에만 보관한다. SDK/npm에 브라우저 payload를 추가하지 않는다.

추가 OS 라이브러리는 관리자 권한 없이 사용자의 ignored 디렉터리에만 준비했다. 공식 Debian trixie InRelease를 시스템 archive keyring과 `sqv`로 검증했고 세 유효 서명을 확인했다. 서명된 index 및 11개 `.deb` 각각의 SHA-256과 크기를 확인한 뒤 설치 hook 없이 추출했다. 예상 다운로드 9,438,568B, Installed-Size 합계 33,501,184B이며 실제 메타데이터·다운로드·추출 경로 합계 53,272,408B로 100MiB 예산 안이다. 시스템 패키지 설치·권한 상승·전역 환경변수 변경은 수행하지 않았다.

WebKit의 모든 필수 ELF 의존성과 여섯 라이브러리의 실제 `ctypes.CDLL` 로드를 확인했다. Playwright의 별도 dlopen 사전검사는 하드코딩된 `/sbin/ldconfig -p`를 사용해 사용자 전용 라이브러리를 발견하지 못했다. 따라서 승인된 해당 QA child process에 한해 `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`을 명시했다. 보고서의 환경 표기는 정확히 `hostValidation='LOCAL_LOADER_VERIFIED_WITH_STANDARD_PREFLIGHT_NOT_USED'`다. 실행기·SDK·CI 기본값에는 이 설정을 넣지 않았다.

공식 MiniBrowser wrapper가 `LD_LIBRARY_PATH`를 자체 경로로 덮어쓰는 점도 실제 실패로 확인했다. 검증한 private OS 라이브러리의 필요한 SONAME만 기존 browser `sys/lib` 경로에 symlink 14개로 연결하고 target·SHA manifest를 보존했다. 링크 target은 검토된 private `usr/lib` 내부로 제한했다. archive의 기존 wrapper·실행 파일·라이브러리 원문 바이트는 수정하지 않았으며 `pw_run.sh` SHA-256은 계속 `a85baad3d8c07173ac387a59b41500c382b21ed692afe0964d29aac247ccc63b`다. 이 환경 체커 생략은 실제 launch·WebGL·네 검사 성공으로 검증했고, 초기 실패를 통과로 변경하지 않았다.

검사 보고서와 screenshot은 선택형 실행기 기준 `artifacts/qa/browser-lifecycle/{browser}/`에 있다. 환경 준비 기록은 운영자 `artifacts/ten-stages/stage03/`에만 있다. MIT 합성 fixture를 사용하며 제작자 소유 키·타일·검색·라우팅 endpoint를 요구하지 않는다. 이 단계 자체가 공개·배포·npm 발행 승인은 아니다.

변경 파일은 `playwright.config.ts`, `scripts/verify-browser-lifecycle.mjs`, `tests/e2e-web/browser-lifecycle.spec.ts`, `tests/e2e-web/png-raster.ts`, 본 문서다. 루트 통합 시 `package.json`에 `verify:browser-lifecycle` alias를 추가할 수 있으나 현재 수정하지 않았다. 기본 CI에 추가 다운로드·runner·artifact 업로드·schedule을 활성화하지 않았다. 브랜치는 `test/stage-03-browser-lifecycle`이며 커밋 전 상태다. 단계 커밋은 `git log -1 --format=%H -- docs/research/stage-03-browser-lifecycle.md`로 식별한다. 해당 브랜치의 브라우저 기능 QA는 통과했으며 루트의 전체 `pnpm check`와 출처·비용 검사 후 PR 통합을 진행할 수 있다. 실제 Safari/iOS·Android, Firefox/WebKit의 전체 heap·GPU 메모리 및 장기 운영 검증은 남아 있다.

루트 통합 추가: `verify:browser-lifecycle` alias와 기본 검사에 연결한 실행 옵션/CI 정책3회귀, 공식 문서 host의 docs-only 검토를 추가했다. 일반 CI의 독립 browser matrix는 공식 `playwright install --with-deps`·Noto·Xvfb 뒤 세 브라우저의 실제 headed 네 검사를 실행한다. 환경 사전검사 생략·실패 무시·유료 runner·cache/artifact 업로드·schedule을 추가하지 않는다. 새 원격 실행은 실제 PR/main 결과로 확인한다. 통합 브랜치는 `test/stage-03-cross-browser`다.

공식 근거(확인일 2026-10-20): [Playwright browser 설치·시스템 의존성](https://playwright.dev/docs/browsers), [BrowserContext의 Chromium 전용 CDP](https://playwright.dev/docs/api/class-browsercontext#browser-context-new-cdp-session), [Debian trixie signed InRelease](https://deb.debian.org/debian/dists/trixie/InRelease). 브라우저의 정확한 build는 고정한 Playwright의 `playwright install --dry-run firefox webkit`에서 확인했다.
