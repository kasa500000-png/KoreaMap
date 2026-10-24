# 다른 컴퓨터의 Codex로 이어서 개발하기

기준일: **2026-10-24 KST**. 저장소는 <https://github.com/kasa500000-png/KoreaMap>이며 SDK·예제·서비스 소스는 `main`에 있다. **소스 프리뷰 인계이며 v0.1.0 발행 준비 완료가 아니다.**

새 Codex 대화에는 [복사용 인계 프롬프트](codex-handoff-prompt.md)의 코드 블록을 붙여 넣는다. 이 문서 자체는 병합·배포·발행의 추가 승인이 아니며 실제 사용자 지시의 범위를 따른다.

## 새 컴퓨터에서 시작

Git, Node **24.19.0**, pnpm **12.14.0**, Python **3.12 이상**을 준비한다. 현재 고정값의 원본은 `.node-version`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`이다. Python은 Windows `py -3`, `python`, `python3`를 공통 실행기가 탐색한다. 초기 인계 과정에서 의존성 버전이나 lockfile을 자동 갱신하지 않는다.

2026-10-24 원격 확인에서도 기본 브랜치는 `chore/project-policy`였다. 새 빈 작업 폴더의 부모에서 **`--branch main`을 명시**해 실행한다. 아래 명령은 PowerShell·macOS·Linux에서 한 줄씩 실행할 수 있다.

```sh
git clone --branch main https://github.com/kasa500000-png/KoreaMap.git
cd KoreaMap
git status --short --branch
git log -5 --oneline
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm dev:web
```

`http://localhost:3000`에서 합성 지도를 확인한다. API 키·`.env`·DB·Docker·유료 계정은 기본 데모에 필요하지 않다. 최초 의존성 설치에는 공개 npm 네트워크가 필요하다. `.npmrc`와 workspace의 설치 hook 차단·strict peer·최소 릴리스 경과시간 정책은 유지한다. 전체 최초 설치가 offline이라는 뜻은 아니다.

이미 checkout이 있으면 다시 clone하거나 덮어쓰지 않는다. 올바른 저장소인지 자격증명을 출력하지 않고 확인한 뒤 사용자 변경을 보존한다. 변경이 없는 경우에만 `git fetch origin main`, `git switch main`, `git merge --ff-only origin/main`을 순서대로 사용한다. 충돌·분기·작업 중 변경은 강제 reset이나 삭제 대신 별도 branch/worktree로 분리한다. 기존 ignored 운영자 자료도 삭제하지 않는다.

## 먼저 읽을 문서

1. [AGENTS.md](../AGENTS.md): 프로젝트 정책과 단계별 8개 보고 항목.
2. [한국어 README](../README.ko.md), [빠른 설치](quickstart.md), 이 인계 문서.
3. [권장 후속 실행 결과](research/recommended-execution.md), [10단계 결과](research/ten-stage-execution.md).
4. [로드맵](roadmap.md), [진행 기록](progress.md), [비용 감사](cost-audit.md)의 최신 관련 절.
5. 실제 수정 영역의 [설계](architecture.md), [공통 API](public-api.md), [품질 계약](map-quality.md)과 서비스/플랫폼 가이드.

## 인수 기준과 실패 상태

인계 문서 작성 전 원격 main은 **`a305b1113a4b397fffcb1abee12c50f6d58fd9f4`**였다. PR28~34의 7개 후속 변경을 포함한다. 이 해시는 과거 기능 검증의 기준이며 새 PC를 그 해시로 되돌리라는 명령이 아니다. 인계 문서 병합 이후에는 **clone된 최신 main의 실제 SHA와 CI**를 확인한다.

과거 stacked PR가 열려 있어도 미반영 작업이라고 단정해 일괄 병합하지 않는다. 최신 main과 정확한 head/차이·기존 통합 이력을 비교한 뒤 실제 필요한 변경만 검증한다.

기준 main의 [CI39573700105](https://github.com/kasa500000-png/KoreaMap/actions/runs/39573700105)를 2026-10-24에 재확인했다. Linux/Windows/macOS 및 Chromium/Firefox/WebKit의 기능 job 6개는 성공, dependency audit와 Web/Native 소비 선언 job 3개는 실패였다. 과거 실행은 Vitest 203개·기본 Web E2E 25개·브라우저별 lifecycle 6개 통과를 기록한다. 이는 새 PC에서 다시 실행한 결과가 아니다.

| 남은 항목            | 인계 상태와 다음 확인                                                                                                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 보안                 | **2026-10-24 새 전체 audit: FAIL/exit1, high 2·critical 0.** `node-forge` GHSA-86w9-cpqp-85rv(`<=1.4.0`, 수정 범위 없음)와 `zod` GHSA-mrhx-c7xc-m3w5(`<4.6.6`, 수정 범위 `>=4.6.6`)다. 수락/예외 추가 없이 차단한다.       |
| 과거 advisory와 구분 | 10-21 기록은 forge/braces였다. 현재 audit가 braces를 보고하지 않는다는 사실만으로 수정·의존 경로 제거·안전이 증명되지는 않는다. 날짜·현재 audit·공식 권고·실제 graph를 다시 대조한다.                                      |
| Web 공개 선언        | 문서와 기준 CI의 full NodeNext TS2834 실패. Bundler/custom layer/core/SSR/browser 부분 성공을 전체 타입 수락으로 바꾸지 않는다.                                                                                            |
| Native 공개 선언     | 문서와 기준 CI의 RN TS2411/TS2344/TS2416 실패. SDK/plugin/JS export 성공은 APK·IPA·OS 실행 통과가 아니다.                                                                                                                  |
| 실제 공공 POI        | A 프로파일 3개의 원본 CSV·exact header·SHA·독립 기준점 확보와 실제 ETL/검색 수락이 남는다. 합성 fixture로 대신 완료하지 않는다.                                                                                            |
| 성능·전국 지도       | 과거 software WebGL frame p95 약116.7ms는 목표33ms에 미달했다. 30회 cold/warm p95 3초/1.5초, 승인 해안선·전국 상세·자원 gate도 유지한다.                                                                                   |
| Native 실행·고지     | foreground GPS, glyph/PMTiles/HTTP·OS egress·복귀/메모리 검증과 최종 APK dependency/notice 연결이 남는다. 고지 후보 목록은 법적 적합성 승인이 아니다. Android 실기기와 macOS/Xcode iOS 검증은 이전 작업 범위에서 제외됐다. |
| 공개 발행·배포       | npm 이름/주체·권한·보호 환경·실제 registry 설치, 외부 호스팅 대상/운영 조건이 미완료다. 소스 저장소는 이미 Public이지만 npm/tag/Release/운영 배포는 실행하지 않았다.                                                       |

새 audit의 근거는 [forge 권고](https://github.com/advisories/GHSA-86w9-cpqp-85rv)와 [Zod 권고](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)다. Zod 수정 범위가 표시돼도 Expo/CLI/RN의 지원 graph와 공식 호환성을 확인하기 전에 임의 override나 일괄 업데이트를 적용하지 않는다. 이번 인계는 SDK·dependency·lockfile을 변경하지 않았다.

## 새 환경에서 검증할 순서

데모를 확인한 뒤 해당 dev 서버를 종료하고 검사한다. 각 명령을 **독립 실행**해 종료 코드·실패 원인·도구 부재를 남긴다. `&&` 긴 연결이나 실패 무시 옵션 때문에 뒤의 검사가 생략되거나 실패가 성공으로 보이지 않게 한다.

```sh
pnpm check
pnpm pack:check
pnpm check:data --staged
pnpm audit:dependencies
```

실제 브라우저 검사는 [개발 안내](development.md)와 [오류 해결](troubleshooting.md)에 따라 공식 Playwright Chromium 및 **Noto Sans CJK KR**를 먼저 준비한다. 기존 E2E는 실제 platform font family까지 확인하므로 다른 한글 글꼴이 보인다는 사실만으로 해당 검사를 통과하지 않는다. 필요할 때 `pnpm exec playwright install chromium`으로 browser를 명시적으로 설치한다.

Linux의 검증된 절차는 [CI 설정](../.github/workflows/ci.yml)의 `fonts-noto-cjk` 설치와 아래 검사를 참고한다. 관리자 권한이 필요한 OS 설치는 해당 컴퓨터의 정책을 따른다. Windows/macOS는 정식 배포처의 Noto CJK KR를 OS 폰트로 설치하고 family를 확인한다. 폰트/OFL 원문과 실제 파일 해시를 보존하며 Git/npm에 폰트를 추가하지 않는다. 파일 검사는 로컬 TTF/OTF/TTC 경로로 `check-font.mjs`를 실행하고 TTC의 정확한 KR face를 선택한다. 다음 경로/face는 Linux CI의 예시이며 다른 OS의 경로로 복사하지 않는다.

```sh
node scripts/check-font.mjs --font /usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc --face 1
```

OS 라이브러리와 폰트 준비 후 아래 명령도 각각 실행한다.

```sh
pnpm test:web
pnpm verify:browser-lifecycle --browser=chromium
pnpm verify:packages
pnpm verify:native-consumer
```

Firefox/WebKit도 공식 browser와 해당 OS/display 전제조건을 준비한 뒤 개별 실행한다. Windows와 macOS의 환경변수 문법은 다르므로 Bash 전용 대입문을 공통 설치 절차로 복사하지 않는다. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`를 사용할 경우 새 PC의 실제 로컬 경로를 지정하고 Git에 저장하지 않는다.

현재 알려진 release gate는 nonzero일 수 있다. 새로운 원인까지 기존 실패로 취급하지 말고 코드/로그를 비교한다. 도구·원본·장비가 없어 실행하지 못하면 **NOT_RUN/미검증**이며 통과가 아니다. `pnpm check`는 별도 전체 audit나 소비 verifier를 대체하지 않는다. DB/ETL/SQL 변경은 Docker의 `pnpm test:geo`, routing 변경은 `pnpm test:routing`, Native/tiles 변경은 AGENTS의 추가 검사를 따른다.

## 이번 인계에서 실제 재확인한 clone

2026-10-24에 원격 HTTPS에서 별도 빈 디렉터리로 `--branch main` clone해 위 기준 SHA를 확인했다. 이전 checkout의 dist·타일·font/glyph·DB·환경 파일·APK·QA 자료는 복사하지 않았다. 실제 `.env`/`.env.local`, 운영자 DB·고지 원문 저장소·APK 입력이 없는 상태에서 `pnpm install --frozen-lockfile`과 `pnpm check`가 PASS였다. Vitest 203/203(20파일), strict·lint·정책·Next production·Expo 양 OS JS export를 포함한다.

새 clone의 `pnpm pack:check`도 SDK tarball 5개 생성·출처·정적 검사를 통과했다. SDK 소스는 기준 main과 같으며 이번 인계 branch의 최종 전체 check도 203/203 PASS다. 문서 위치/포맷의 초기 검사 실패는 수정 후 재실행했고 감사 정책 예외는 추가하지 않았다.

같은 Linux 호스트의 Node/pnpm/Python과 준비된 pnpm store 645개를 재사용했고 다운로드는 0이었다. 새 물리 PC·Windows/macOS·빈 content store의 최초 설치나 Native 기기 실행을 검증한 결과는 아니다. Expo export도 APK/IPA 실행을 뜻하지 않는다. 인계 문서의 최종 commit/PR/main 결과는 원격 이력과 완료 보고를 따른다.

## clone되지 않는 자료

`node_modules`, dist/export, `artifacts/`, 타일/OSM 원본/archive, glyph·폰트·JAR, DB/자격증명, 생성 Android/iOS 프로젝트, 서명·APK/IPA, 성능 프로파일·실지도 캡처·로컬 QA 로그는 제공되지 않는다. Planetiler 소스 profile과 구분한다. 기존 cloud의 `/workspace/...` 절대 경로나 캐시를 새 PC의 입력으로 재사용하지 않는다.

기본 합성 데모는 소스만으로 다시 빌드한다. 실제 자료는 [타일 가이드](tiles.md), [공공데이터 원장](data-sources.md), [Native 가이드](native-sdk.md)의 권리·체크섬·도구 조건을 충족해 별도로 준비한다. 과거 문서의 “통과”를 원본/장비 없이 재현했다고 주장하지 않는다. 자료 공유가 필요해도 비밀·개인정보·재배포 불허 payload를 Git/npm에 넣지 않는다.

## 다음 개발 우선순위와 권한

먼저 현재 환경과 release gate를 다시 측정한다. 이후 **공식 보안 수정 및 지원 dependency graph → Web/RN 선언 호환성 → 허가된 공공 CSV·독립 검색/경로 정답 → 성능/Native 실행·고지 → 발행 운영 조건** 순으로 실행 가능한 작업을 고른다. 앞 항목이 외부 원인으로 막히면 원인을 기록하고 독립된 검증 가능한 작업을 진행한다. 전체 프로젝트를 재생성하지 않는다.

SDK MIT와 데이터·폰트·아이콘의 라이선스를 분리하고 A 원장만 조건부 수집한다. 기본 제작자 endpoint·공유 키·유료 클라우드 계정은 추가하지 않는다. Secret·토큰·개인 위치·인증된 원격 URL·환경변수 값을 로그에 출력하지 않는다. 보안 suppression, 무근거 patch/override, canary, 검사 완화로 release gate를 통과시키지 않는다.

이번 사용자 요청은 **인계 문서의 커밋/PR/정상 main 병합**을 승인했다. 새 대화의 후속 소스 병합은 사용자가 전달한 [복사용 프롬프트](codex-handoff-prompt.md)의 명시적 지시 범위를 따른다. npm 발행·태그/GitHub Release·운영 배포·공개 설정 변경·과금 설정은 별도 승인 없이 수행하지 않는다. 각 단계는 AGENTS의 8개 항목을 기록하고 `docs/roadmap.md`, `docs/progress.md`, `docs/cost-audit.md`를 유지한다.

공개 clone과 기본 빌드에는 GitHub 로그인도 필수가 아니다. **push·PR·병합에는 새 컴퓨터의 본인 GitHub 쓰기 권한이 별도로 필요**하다. 기존 cloud의 Git 커넥터 연결·인증은 clone으로 이전되지 않는다. 로컬 Codex에서 사용 가능한 GitHub 연결 또는 인증된 Git/지원되는 PR 도구를 확인한다. GitHub CLI가 설치돼 있다면 `gh auth status`로 상태를 확인할 수 있지만 토큰 출력 명령이나 환경변수 dump는 사용하지 않는다. 도구/권한이 없으면 가능한 로컬 검사·commit을 진행하고 원격 push/PR/merge는 NOT_RUN으로 보고한다. 토큰을 채팅·저장소에 붙여 넣거나 다른 계정/보호 우회로 해결하지 않는다. 이는 유지관리자의 쓰기 권한이며 SDK 사용자에게 GitHub·지도 유료 계정을 요구하는 정책이 아니다.
