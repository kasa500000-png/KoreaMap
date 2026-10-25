# Stage 09 — 발행 전 운영 조건 검사

2026-10-25 후속: [소비 증거 완전성](complete-release-receipts.md)에 따라 Web 레이어 타입, Native SDK strict Bundler/NodeNext와 registry lock 준비 결과도 필수 검사한다. 이전 receipt의 누락을 PASS로 보완하지 않고 실제 재실행한다.

확인일: 2026-10-21 KST. 조사·실행 기준은 `259d75e116a2de456f546c736014d50197774a4d`의 별도 worktree다. 이 단계는 private 개발 도구를 추가하며 npm 발행·GitHub Release·배포·계정 설정을 실행하지 않는다. 프로그램 회귀 통과와 실제 릴리스 수락을 구분한다.

## 1. 구현 완료 기능

`scripts/release-preflight.mjs`는 로컬 설정과 최종 소스에 결합된 운영 증거를 검사한다. 기본 실행은 Git 조회와 로컬 파일 읽기뿐이며 GitHub·npm registry 요청을 보내지 않는다.

```sh
node scripts/release-preflight.mjs
```

GitHub 조회는 다음 명시적 옵션에서만 현재 `gh` 인증을 상속해 실행한다. 모든 요청은 `gh api --hostname github.com --method GET`이며 토큰·환경변수·원문 인증 오류를 출력하지 않는다. 설정·변수·환경·브랜치·발행물은 변경하지 않는다.

```sh
node scripts/release-preflight.mjs --github-repository=kasa500000-png/KoreaMap
```

검사 대상은 다섯 패키지 이름·공통 버전·repository directory, Changesets fixed group, 기존 release script 및 npm workflow의 버전 정합성, 기존 수동 발행 보호 조건이다. 현재 `0.1.0`을 유지하고 pending Changesets가 있으면 `PENDING_VERSION_DECISION`으로 차단한다. minor/patch를 자동 소비·삭제하거나 전체 패키지를 `0.2.0`으로 올리지 않는다.

발행 workflow는 현재 검토된 파일의 SHA-256 `2b7059f148357aae94e43b657bc959a3960608825eebd1443b4853e934be296f`와도 일치해야 한다. CRLF만 LF로 정규화한다. 보호 명령/조건의 주석 처리, 실행 순서 변경, `if:false`, `echo`·shell 우회를 비롯한 모든 다른 편집은 보수적으로 차단한다. 이 검사는 임의 YAML을 해석하는 일반 parser가 아니며 정당한 향후 정책 편집도 별도 검토 후 fingerprint 갱신이 필요하다.

준비된 `artifacts/release/integrity.json`은 clean 전체 SHA 및 버전·다섯 패키지와 일치해야 한다. 실제 tarball을 기존 `verifyRecord`로 다시 읽어 SHA-256·SHA-512 SRI·bytes·파일명을 검증한다. Web/Native 독립 소비 보고서도 그 tarball의 SHA-256과 일치해야 한다. manifest가 가리키는 임의 경로, 증거/파일의 symlink 및 ancestor symlink는 허용하지 않는다. JSON/소스 파일은 1 MiB, tarball은 개당 16 MiB로 제한한다.

운영 증거가 없으면 개별 결과는 `NOT_RUN`이고 전체는 **`BLOCKED`, exit 1**이다. 하나라도 실패·미완료·미확인이면 동일하게 차단한다. 모든 조건을 만족한 가짜 unit fixture의 상태명도 `READY_FOR_REVIEW`이며, 모든 출력에서 `publicationAuthorized=false`다. 이 도구는 전체 플랫폼 QA·성능 수락·사용자 발행 승인·CI/환경 보호를 대신하지 않는다.

## 2. 생성·수정 파일

- `scripts/release-preflight.mjs`: private preflight와 순수 판단 함수, 선택형 GitHub GET.
- `tests/release-preflight.test.mjs`: 허위 완료·오래된 증거·부분 성공·파일 변조·원격 권한 실패의 의미 검증.
- `docs/research/stage-09-release-preflight.md`: 증거 계약, 실제 관측과 차단 항목.

SDK·의존성·lockfile·기존 release script·발행 workflow는 이 단계에서 바꾸지 않는다. 루트 테스트 명령 연결과 전역 진행 문서는 통합 단계가 담당한다.

## 3. 실행한 테스트와 결과

`node --test tests/release-preflight.test.mjs`의 **16/16 PASS**는 preflight 프로그램 검증이다. 가짜 정상 fixture는 임시 폴더의 자체 작성 bytes와 모의 GET만 사용한다. 이 결과를 실제 security/consumer/release PASS로 사용하지 않는다.

회귀는 다섯 버전·고정 그룹 불일치, pending 버전 결정, 증거 누락, 다른 SHA/dirty/24시간 초과/5분 초과 미래 시각, high/critical 및 미완료 감사, Web/RN 선언 실패·`PARTIAL_PASS`·timeout·signal, tarball 누락·중복·SHA 변조, 기본 no-network, GitHub GET-only·default workflow 누락·환경 권한 실패·main 배포정책, symlink ancestor, 실제 CLI exit 1을 검사한다. 독립 리뷰에서 발견한 main GET 403/404/timeout과 custom policy의 조합, 보호 step/조건의 주석·순서·shell 우회, Native schema 1 문자열 PASS 필드의 모순 object도 추가로 거부한다. 기존 release/declaration 회귀와 합계 **28/28 PASS**, scoped ESLint·소스 Prettier·문서 링크 검사도 PASS다. 로그 수집의 첫 lint/format 호출은 다른 pnpm 11.25.0의 engine 검사에서 중단돼 미실행으로 보존했고, 정확한 12.14.0 CLI로 다시 실행해 위 결과를 확인했다. 의존성 변경은 없다.

실제 로컬 명령과 명시적 GitHub 명령은 2026-10-21 07:42 KST경 각각 **exit 1 / BLOCKED**였다. 작업 중 소스는 `sourceDirty=true`, fresh 최종 SHA의 manifest/감사/소비 증거는 없고 pending Changesets도 남는다. 기본 명령의 GitHub와 registry는 `NOT_RUN`이다. 외부 옵션 명령에서도 registry는 자동 조회하지 않는다. 원문 결과는 ignored `artifacts/ten-stages/stage09/{local-preflight,github-preflight}.json`과 실행 metadata에 보존한다.

### 운영 증거 계약

기본 위치는 ignored `artifacts/release/evidence/`다. `--evidence-dir=`로 지정할 때는 현재 workspace의 `artifacts/` 안에 있는 절대 경로만 허용한다. 아직 완료하지 않은 검사를 PASS로 수기 작성하지 않는다. 원본 stdout JSON과 실제 명령의 정상 완료 정보를 검토해 다음 envelope에 보존해야 한다.

| 파일 | 필수 근거 |
| --- | --- |
| `audit.json` | `pnpm audit --json`의 실제 report, exit 0, 명시적 info/low/moderate/high/critical 수, high=0·critical=0 |
| `web.json` | `pnpm verify:packages`의 실제 schema 2 report, 전체 PASS·blocked=false, 정상 NodeNext/Bundler/core/SSR compiler 완료, 재현 빌드·독립 설치·브라우저 표시/선택/종료 PASS 및 외부 요청/오류 0, 동일 tarball 5개 |
| `native.json` | `pnpm verify:native-consumer`의 실제 schema 1 report, 전체 PASS·releaseBlocked=false, strict upstream 선언까지 정상 완료, 독립 설치·config plugin·양OS JS export PASS, 동일 core/native/styles tarball |
| `registry.json` | 관리자가 재확인한 최초 발행 이름 5개·버전·HTTP404 관측과 발행 주체/권한·provenance bootstrap 계획 검토 기록. 관측은 이름 예약이나 발행 권한을 증명하지 않음 |

실행 envelope는 `schemaVersion:1`, 현재 clean 전체 `sourceCommit`, `sourceDirty:false`, ISO `checkedAt`, 정확한 `command` 배열, `completed:true`, `exitCode:0`, `signal:null`, `errorCode:null`, 원본 `report`를 요구한다. receipt와 inner consumer report 양쪽의 source가 맞아야 한다. 24시간이 지난 증거와 5분보다 먼 미래 시각은 거부한다. registry 기록도 같은 SHA·기한을 가지며 `status:PASS`, `mode:FIRST_PUBLICATION`, `publisherAccessReviewed:true`, `provenancePlanReviewed:true`, 이름별 `{name,version,httpStatus:404}`를 요구한다.

이 JSON은 서명된 provenance가 아닌 운영자 검토 기록이다. 명령 실행을 암호학적으로 증명하거나 이름·계정 권한을 예약하지 않는다. 실패 결과를 보존하되 exit code/status를 고쳐 통과시켜서는 안 된다. 최종 commit이 바뀌면 이전 성공도 재사용하지 않는다. 현재 알려진 실패를 포함한 과거 report를 fresh final-SHA PASS로 포장하지 않았으며, 이 단계는 무거운 consumer/build를 재실행하지 않았다.

## 4. 실화면 QA 결과

CLI 도구여서 별도 지도 UI 변경이 없다. Web 실화면·프레임·실제 Android·iOS를 이 단계에서 재실행하지 않았다. Native JS export 검사는 APK/IPA나 실기기 검증이 아니다. 기존 QA 결과를 이 단계의 수락으로 재분류하지 않는다.

## 5. 라이선스·보안·비용

새 코드는 직접 작성한 private MIT 개발 도구이며 외부 지도·글꼴·사용자 payload나 새 의존성을 넣지 않는다. 명시적 GitHub GET 이외 제작자 과금 endpoint·설정 write·토큰 수집·2FA 요청·npm 인증/발행·유료 runner는 추가하지 않는다. 기존 audit·consumer·SHA 승인·수동 workflow 조건을 완화하지 않는다.

2026-10-21 07:13 KST의 Stage 01 실제 감사는 high 2/critical 0 및 exit 1이다. 당시 공식 조회에서 node-forge/braces의 지원 수정 경로를 확인하지 못했다. 이 Stage 09의 도구 테스트가 그 취약점을 해결하거나 최신 패치 부재를 새로 증명하지 않는다. upstream 선언과 성능 등 전체 릴리스 차단은 별도 기록을 따른다.

## 6. 남은 작업·차단 요인

| 분류 | 실제 상태와 담당 |
| --- | --- |
| 유지보수자 버전 결정 | 루트 통합에서 기존 unpublished 정책에 따라 3개 기록 본문을 CHANGELOG에 보존/소비했다. 5개 버전/발행 workflow는 0.1.0 그대로이며 실제 pending check PASS. 이후 공개 변경은 일반 SemVer/Changesets를 사용 |
| 최종 SHA 검증 | 모든 통합이 끝난 clean SHA에서 감사·Web/Native 독립 소비·tarball 증거를 다시 만들고 검토해야 함. high/공개 선언 실패·부분 성공은 승인이나 시간 경과로 PASS가 되지 않음 |
| GitHub 관리자 | 07:42 KST GET에서 default=`chore/project-policy`, npm workflow 등록=false·default file=false·환경 보호 확인=false. `MANUAL_WORKFLOW_MISSING_OR_UNVERIFIED_ON_DEFAULT_BRANCH`로 차단. 기존 설정 변경 403을 우회하지 않음 |
| npm 발행 주체 | 07:21 KST public registry GET의 다섯 이름 HTTP404는 그 시점의 미등록 관측뿐임. 계정 소유권·사용 가능 권한·최초 bootstrap/OIDC trusted publisher·provenance 계획은 관리자 검토 필요. script가 자동 가입/발행하지 않음 |
| 전체 수락·승인 | 전체 품질·성능·플랫폼 검증과 별도 명시적 발행 승인이 필요. preflight의 `READY_FOR_REVIEW`로 대체하지 않음 |

GitHub 공식 [workflow_dispatch 문서](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch)는 파일이 **default branch에 있어야** 이 이벤트가 실행된다고 명시한다. `main`의 YAML 존재만으로 운영 준비를 완료 처리하지 않는다. optional GET은 default branch의 실제 파일과 workflow 등록을 함께 검사하며, npm-release 환경의 required reviewer·self-review 방지·main 허용 정책이 불명확하면 차단한다. 이 작업은 관리자의 권한/설정 문제를 발견할 뿐 설정을 바꾸지 않는다.

## 7. Git 브랜치·커밋

브랜치: `chore/stage-09-release-preflight`. 작업 기준: `259d75e116a2de456f546c736014d50197774a4d`. 이 보고서 작성 시 커밋·stage·push를 수행하지 않았다. 통합 담당자가 전역 검사 후 커밋/PR을 만들며 실제 SHA는 완료 보고에서 제공한다. 최종 소스에 대한 preflight 증거도 그 SHA에서 별도로 다시 검증해야 한다.

## 8. 다음 단계 진행 가능 여부

private preflight 구현·단위 회귀는 완료했으며 통합 검토를 진행할 수 있다. 실제 릴리스 준비는 **BLOCKED**다. 명시적 사용자 승인 전 npm 발행·GitHub Release·운영 배포를 진행하지 않는다.

## 루트 통합의 최초 버전 결정

위07:42 KST의pending관측은당시기록이다. 루트통합에서는사용자가요청한최초v0.1.0과기존CHANGELOG의unpublished baseline정책을적용했다. 공개registry5이름404관측과GitHub tag없음을확인하고, 이후추가된fast-web-map-commands/readable-maps-and-interactions/native-public-geojson-types 3개기록본문을CHANGELOG에보존한뒤소비했다. 5개version0.1.0·fixedgroup·빈initial-release-baseline·발행workflow/SHAguard는그대로다. 최초미발행기록을다시적용해0.2.0을만들지않는다. 이는발행·tag·Release가아니며공개후에는일반SemVer/Changesets를사용한다. 실제preflight에서pendingcheck PASS를확인하되전체수락은다른미해결게이트로BLOCKED다.

루트전체pnpm check와preflight16개회귀가PASS다. 실제명시적GitHub GET에서전체BLOCKED/exit1·publicationAuthorized:false, pending check PASS를확인했다. 삭제된changeset파일을읽던2개회귀는독립합성frontmatter와운영증거부재검사로고쳐pending차단정책을유지했다. 초기실패로그와수정후결과는ignored 단계09에보존했다.
