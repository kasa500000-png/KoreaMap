# main 소스 통합과 새 clone 검증

확인일: 2026-10-20 KST. 사용자가 현재 작업을 다른 컴퓨터에서 clone할 수 있도록 병합 커밋을 명시적으로 요청했다. 미완료 preview 소스의 통합이며 보안·타입·성능·모든 플랫폼 수락이나 npm 릴리스 완료를 의미하지 않는다.

## 1. 구현 완료 기능

GitHub 커넥터로 두 단계를 각각 일반 merge commit으로 main에 반영했다. expected head SHA를 지정했고 squash/rebase/force push나 보호 설정 우회는 사용하지 않았다.

| 단계 | PR head | 실제 main 병합 커밋 |
| --- | --- | --- |
| SDK 누적 기반·보안/공개 타입 검증 도구 | `0390182482a1c2b2da26eea353971ae603080e7b` | [PR15](https://github.com/kasa500000-png/KoreaMap/pull/15) — `8d068bf6935b0290001695071db66d3e754c81b3` |
| 지도 조작 비용 감소·분리된 프로파일 | `2bca9a968b021e9a423bd5974fa4e59983833774` | [PR16](https://github.com/kasa500000-png/KoreaMap/pull/16) — `49e8aac64d7b7f2de3236cfaaff2373da602999e` |

PR16은 PR15 병합 후 main으로 retarget했다. 최종 소스 통합 커밋 `49e8aac`의 tree가 기존 검증된 `2bca9a9`와 동일함을 `git diff --exit-code`로 확인했다. 이전 SDK·예제·서비스·문서 커밋은 main 조상에 포함됐다. 이 문서 후속 단계는 Markdown만 변경한다.

저장소는 이미 Public이었다. 커넥터에 저장소 설정 변경 기능이 없어 `gh api`로 기본 브랜치 main 변경을 시도했으나 **HTTP403 / Resource not accessible by integration**으로 거부됐다. 다른 인증이나 보호 해제로 우회하지 않았다. 기본 브랜치는 `chore/project-policy`로 남아 있으므로 다음처럼 명시한다.

```sh
git clone --branch main https://github.com/kasa500000-png/KoreaMap.git
cd KoreaMap
pnpm install --frozen-lockfile
pnpm dev:web
```

Node24.19.0/pnpm12.14.0이 필요하며 검사에는 Python3.12+도 사용한다. `http://localhost:3000`은 API 키·DB·Docker 없이 합성 지도 데모를 제공한다. 운영자 실제 지도 연결은 [타일 가이드](../tiles.md)를 따른다.

## 2. 생성·수정 파일

누적 SDK는 위 두 PR로 통합했다. 문서 후속 단계는 README 양 언어, [빠른 설치](../quickstart.md), [개발 안내](../development.md), [로드맵](../roadmap.md), [진행 기록](../progress.md), [비용 감사](../cost-audit.md), [릴리스 보고](../releases/v0.1.0.md), 보안/성능 검증 기록의 현재 상태 주석과 이 보고서다. 런타임·lockfile·배포 workflow·출처 허용 범위를 변경하지 않는다.

## 3. 실제 실행한 검사

원격 HTTPS에서 별도 빈 폴더에 main을 clone해 HEAD `49e8aac64d7b7f2de3236cfaaff2373da602999e`를 확인했다. 원래 작업 폴더의 SDK dist·타일·glyph·DB·환경 파일을 복사하지 않았다. 도구와 pnpm content store는 같은 Linux 호스트의 기존 환경을 사용했다.

| 명령/검사 | 실제 결과 |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS, 13 workspace·645개 의존성; 기존 store645개 재사용/다운로드0; 새 컴퓨터의 빈 store 설치를 대신하는 결과는 아님 |
| `pnpm check` | PASS, strict·ESLint·포맷·경계·라이선스645·출처·API 문서·Vitest181/18파일·Next production·Expo 양OS JS export·정책 회귀 포함 |
| `pnpm pack:check` | PASS, 5개 실제 tarball, 해시가 기존 검증본과 모두 동일, 출처·정적 비밀/비용 findings0 |
| `pnpm check:data --staged` | PASS, source16/index348파일 |
| `pnpm test:web` | PASS, Chromium25/25, 1.3분; 390/768/1440px·100/1000마커·터치 모의·선택·테마·네트워크 오류/복구·종료 정리 |
| `pnpm dev:web` + 실제 브라우저 | PASS, 390×800에서 ready/canvas, 외부 HTTP 요청0·pageerror0 |
| `pnpm audit:dependencies` | **FAIL / exit1, high2**; 기존 node-forge/braces 취약점 차단 유지 |

새 clone 실행 로그·스크린샷은 ignored `artifacts/clone-verification/`에만 있다. 기본 소스에는 실제 타일·font·glyph·PBF·JAR·DB·개인 기록·QA 산출물을 넣지 않는다. `pnpm check` 성공은 별도 보안 감사와 독립 소비 선언 검사의 성공이 아니다.

main push CI도 종료됐다. `49e8aac`의 [실행](https://github.com/kasa500000-png/KoreaMap/actions/runs/39416905754)은 Windows/macOS 성공·Dependency audit high2 실패·Linux `verify:packages` 상위 TS2834 실패다. 실제 실패 로그에서 Bundler/core/SSR/browser 성공 후 PARTIAL_PASS/exit1을 확인했다. 이전 exact head `2bca9a9`의 [PR CI](https://github.com/kasa500000-png/KoreaMap/actions/runs/39413777617)도 같은 범위의 실패였다. 이후 문서 PR/main push는 별도 CI이며 미종료 실행을 성공으로 보고하지 않는다.

## 4. 실화면 QA

새 clone의 Chromium154/SwiftShader에서 E2E `web-sdk.png`의 1000마커·합성 장소1 팝업·출처를 직접 확인했다. 별도 dev 서버 `dev-390.png`는390px·ready·86개 visible 마커·선택 없음·출처 화면이며 팝업 검증 캡처와 구분한다. 기본 지도는 직접 만든 합성 fixture이며 실제 한국 지형이 아니다. E2E는 기존 Web 범위를 새 clone에서 재실행한 결과다. 실제 한국 240화면·30cold/warm·프레임 프로토콜·Android 실기기·iOS는 이번 통합에서 재실행하지 않았다. 다른 물리 컴퓨터, Firefox/WebKit 및 Native OS 네트워크도 미검증이다.

## 5. 라이선스·보안·비용

SDK MIT, OSM ODbL, 글꼴 OFL을 분리한다. 실제 데이터/font payload와 자격 증명을 추가하지 않는다. 새로운 기본 Provider·제작자 endpoint·공유 키·유료 계정·백엔드·배포 경로는 없다. 처음 의존성 설치 시 공개 npm 연결은 필요할 수 있으며 지도 운영 비용은 이용자 설정 책임이다. 문서 커밋 전 작업 트리349파일/index349blob/로컬32커밋838blob·실제5tarball 정적 스캔 findings0(`PASS_STATIC_ONLY`)이며 휴리스틱 범위로만 해석한다.

main push는 표준 runner의 Foundation CI만 실행한다. npm workflow는 manual dispatch·main·enabled 변수·정확한 approved SHA·npm-release 환경·감사/소비 검사 조건을 유지하며 실행하지 않았다. GitHub Release·tag·운영 배포·visibility 변경도 수행하지 않았다. 기본 브랜치 설정 권한 실패는 npm/Release 승인을 요청할 이유가 아니며 clone 명령으로 우회 없이 목적을 충족한다.

## 6. 남은 작업·차단 요인

high2, Web NodeNext TS2834 및 RN TS2411/TS2344/TS2416, 1,000마커 frame p95116.7ms>33ms, 실제 Android/iOS·Native glyph/PMTiles·OS egress, 공식 POI 실파일·승인 해안선/전국 상세·장기 부하·릴리스 계정/이름/OIDC 검증이 남는다. 두 독립 소비 명령은 기존 **PARTIAL_PASS / exit1**이며 이번 문서 전용 단계에서 재실행하지 않았다. 기본 브랜치 변경은 설정 권한이 있는 관리자가 처리해야 한다. 실패 검사·발행 차단을 해제하지 않았다.

## 7. Git

main 병합 SHA는 위 표를 따른다. 문서 브랜치는 `docs/clone-ready-preview`이며 커밋은 `git log -1 --format='%H %s' --grep='^docs: document clone-ready main preview$'`로 식별한다. 마지막 문서 PR/병합 SHA와 최신 원격 상태는 완료 보고에 제공한다.

## 8. 다음 단계

다른 컴퓨터에서 명시적으로 main을 clone해 개발을 이어갈 수 있다. SDK 전체 품질 수락·npm 발행·GitHub Release·운영 배포는 현재 차단 상태이며 별도 검증과 명시적 승인을 요구한다.
