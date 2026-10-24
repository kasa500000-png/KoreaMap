# Zero Publisher Cost — 보안 및 비용 경로 감사

현재 판정은 [전체 QA 보고서](qa-report.md)와 문서 마지막 감사 기록을 따른다. 아래 1~8절은 SDK 구현 전 정책 단계의 증거다. Android 개발 APK의 이전 실행 증거는 있으나 실제 기기/iOS 및 보안 high2 미해결로 공개 출시는 차단된다.

감사일: 2026-10-19 (UTC). 대상 브랜치: `docs/zero-publisher-cost`. 기준 설계 커밋: `e832012f341c41f6670ba27c423195f97ad927d1`. 정책: [AGENTS.md](../AGENTS.md), 설계: [ADR-009](decisions/009-zero-publisher-cost.md), 책임 구분: [README](../README.md).

**이전 정책 단계 판정(보존): 정책·정적 감사 통과, 제품 설치/실행/테스트 네트워크는 미검증. SDK 발행·데모 운영 배포 승인이 아니다.** 현재 package.json, SDK 런타임, 실제 npm tarball, 배포된 데모, GitHub Actions workflow가 없다. 따라서 제작자 과금 endpoint 요청이 없다는 실행 결과를 만들어 보고하지 않는다.

## 1. 감사 범위와 책임

Zero Publisher Cost는 기본 SDK 사용이 제작자의 API 키·DB·타일·검색·경로·공공데이터·backend 유료 계정 사용량을 발생시키지 않는다는 설계 원칙이다. 소스코드 배포와 정적 파일 전송, 개발 장비 등의 비용까지 자동으로 사라지는 것은 아니다. 서비스와 계정을 설정한 운영자가 사용료·무료 quota·사용량 상한·license 의무를 관리한다.

운영자 설정은 private 로컬 파일/서버 환경에 보관하며 Git·npm에 넣지 않는다. 브라우저/앱의 public identifier도 노출 가능하고 비용 사용량을 발생시킬 수 있다. 제작자의 public key를 샘플 값으로 배포하지 않는다.

## 2. 현재 저장소 감사 결과

| 항목 | 실제 확인 결과 | 판정 |
| --- | --- | --- |
| 작업 트리 | 추적 파일 및 ignore되지 않은 신규 파일의 secret/URL/config 정적 검사 | 통과 |
| Git index | staged blob을 작업 파일과 별도로 검사해 staged 비밀값 은폐 방지 | 통과 |
| Git 이력 | fetch 후 로컬 refs에서 도달 가능한 4개 기존 커밋의 고유 path/blob 검사; shallow 저장소 아님 | 해당 범위 통과 |
| 비밀정보/개인 endpoint | 구현한 탐지 규칙에 해당하는 발견 사항 0건 | 정적 범위 통과 |
| 외부 URL | 현재 문서 출처, npm 조사 metadata, 검사기의 registry URL 형식 검증 문자열 | 실행 endpoint로 사용되지 않음을 수동 확인 |
| package.json / lifecycle hook | 없음 | 제품 설치 검증 불가 |
| npm tarball / Web bundle / APK·IPA | 실제 제품 산출물 없음 | 미검증, 발행 차단 |
| 데모 웹사이트 | 저장소에 데모 앱/배포 설정 없음; 기존 공식 예제 관찰은 외부 연구였음 | 자체 데모 미배포·런타임 미검증 |
| GitHub Actions | workflow 없음; runner·artifact/cache·유료 기능 활성화 안 함 | 저장소 설정 범위 통과 |
| 원격 계정 결제/한도 | GitHub/외부 provider의 billing 계정 설정을 조회·변경하지 않음 | 미검증; 무료 보장으로 해석 금지 |

이력 감사는 reflog·삭제된 remote branch·fetch되지 않은 refs·별도 저장소·GitHub 계정 secret 값까지 포함하지 않는다. 민감 정보가 발견되면 먼저 노출 차단/키 폐기 후 이력 정리를 검토하며 자동 force-push하지 않는다. 스캐너는 발견값 자체를 출력하지 않는다.

## 3. 비용 발생 경로별 방침과 출시 gate

| 경로 | 기본 동작/차단 설계 | 구현 후 필요한 증거 |
| --- | --- | --- |
| npm 설치·import | 자체 install/prepare 네트워크 hook 없음, 제작자 계정 lookup 없음 | clean 소비 앱에서 설치/import 요청 inventory, transitive hook 검토 |
| 지도 최초 mount | provider 필수, 없으면 renderer 생성 전 실패 | 무설정/불완전 설정의 네트워크 시도 0 |
| 기본 fixture | 명시적 local-fixture, 허가된 작은 bundled assets | 외부 네트워크 없이 지도·마커·한글 테스트 |
| style·TileJSON·tiles | 운영자 지정 endpoint와 allowed origins만 | direct/redirect/worker/Native 요청 URL 검사 |
| glyph·font·sprite·image·terrain | 동일한 설정 범위; 상위 demo CDN fallback 금지 | 누락 자산을 포함한 모든 2차 요청 경로 확인 |
| 검색·역지오코딩 | provider 미설정 시 비활성/명시적 실패 | 무설정 0건, 명시적 로컬 mock에만 요청 |
| 경로·교통 | routing provider 미설정 시 계산 안 함 | 경로 fixture 표시와 실제 provider 요청의 구분 |
| 공공데이터 수집·타일 빌드 | 운영자 input/config opt-in; 기본 test에 대량 다운로드 없음 | 명령 기본값/실패 경로 및 다운로드 소유자 확인 |
| 저장·Supabase·telemetry | 저장 provider 선택, telemetry 기본 off | import/mount/unmount/오류에도 제작자 backend 요청 0 |
| 앱 환경변수/설정 plugin | 공개 값만, private key는 운영자 서버 | JS/source map/native resources/string table 정적 검사 |
| 공개 데모 | same-origin 로컬 fixture, 공유 키/proxy/token 발급 없음 | 최초 로드·search 입력·route·오류·새로고침 외부 요청 차단 확인 |
| CI·remote cache·배포 | 무료 표준 runner 기본, 유료 기능 별도 승인 | runner SKU·공개 여부·storage/retention·실행 graph·과금 설정 감사 |

서버 주소를 숨기는 것으로 비용 문제를 해결하지 않는다. 임의 URL을 받는 공개 proxy는 사용량을 제작자에게 집중시키므로 제공하지 않는다. 공용 무료 OSM/Nominatim을 임의 fallback으로 쓰지 않는다. 운영자 직접 입력 API라도 endpoint·비용·quota·라이선스 확인 책임을 안내해야 한다.

## 4. 재현 가능한 정적 검사

```sh
python3 scripts/check-design.py
python3 scripts/audit-cost-security.py
python3 scripts/test-cost-audit.py
git diff --check
git diff --cached --check
```

이미 만든 npm 배포 파일은 아래 형태로 별도 검사한다. 실제 파일 경로를 지정하며 이 명령이 패키지를 생성하거나 발행하지는 않는다.

```sh
python3 scripts/audit-cost-security.py --artifact /path/to/package.tgz
```

[감사 도구](../scripts/audit-cost-security.py)는 Python 표준 라이브러리와 로컬 Git만 사용하고 외부 요청·package hook 실행·tar 압축 해제를 하지 않는다. 실제 npm 산출물을 받으면 tar 경로 탈출·symlink/특수 파일·크기 제한도 검사한다. tar 내부 archive나 너무 큰 항목은 별도 검토 대상으로 실패한다. `PASS_STATIC_ONLY`와 `runtime_verified: false`를 명시적으로 반환한다.

탐지 범위: 알려진 token/private-key 형식, 명명된 key/secret/token 값, credential 파일, URL userinfo/query 인증, 사설 주소, 검토되지 않은 외부 URL, npm lifecycle hook과 publish allowlist, 비표준/dynamic runner 및 cache/artifact/secret workflow 설정, 주요 배포/과금 config. 실제 값을 출력하지 않고 파일/규칙/행만 보고한다.

정적 예외는 공개 문서 출처 host, lockfile의 registry metadata, `scripts/check-design.py`의 로컬 metadata 검증용 registry URL 문자열과 감사 도구 안의 동일 문자열뿐이다. `.invalid`는 회귀 fixture의 예약 도메인으로 사용하며 실제 API가 아니다. localhost/loopback은 로컬 테스트용이다. host 목록은 원격 사용 허가 목록이 아니며 런타임 provider의 내장 endpoint로 전용할 수 없다. 새 출처는 의미를 검토한 후 목록에 추가한다.

한계: 정적 정규식은 임의 secret·난독화/문자열 결합/압축 binary·DNS 소유권·redirect의 모든 경로를 증명하지 못한다. `.gitignore`도 이미 추적된 비밀정보나 실제 npm 포함 파일을 제거하지 않는다. 업무용 Git secret scanner와 artifact 전용 검사, 실제 요청 관측을 배포 전에 추가해야 한다. no-findings는 보안 절대 보장이 아니다.

## 5. 실행한 검사 결과

- `scripts/test-cost-audit.py`: **11개 회귀 테스트 통과**. 깨끗한 fixture, 비밀값 미출력, DB 접속 문자열, 외부/사설 URL, 삭제된 이력의 secret, index에만 남은 secret, 유료 runner/cache/hook, 표준 runner, npm tarball 내용, 경로 탈출, 배포 config를 확인했다.
- `scripts/audit-cost-security.py`: **PASS_STATIC_ONLY**, 발견 사항 0건. 초기 실행에서 검사기 자신의 정규식 변수와 합성 fixture 문자열, 기존 검사기의 URL 형식 확인 문자열을 검토 대상으로 식별했다. 표현을 정리하고 알려진 오프라인 참조를 명시한 뒤 재검사했다. 실제 키/endpoint를 허용 예외로 추가하지 않았다.
- 설계 추적성: Z01~Z12를 추가해 총 36개 요구사항과 ADR 9개로 검사한다. 최종 검사 결과는 진행 기록에 남긴다.
- SDK runtime·설치·Web/모바일 bundle·CI 실제 실행·원격 계정 과금 설정: **미검증**. 제품 발행 승인으로 처리하지 않는다.

## 6. 구현 후 필수 네트워크 검증 절차

1. 검사 대상을 commit SHA와 실제 tarball/Web build/APK·IPA SHA256으로 고정한다. 테스트 계정·개인 endpoint·토큰은 결과물에 넣지 않는다.
2. 격리된 소비 앱에서 일반 공개 레지스트리 의존성 다운로드를 기록한다. install hooks는 사전 검토하고 허가된 registry 이외 egress를 차단한 환경에서 기본 설치를 검증한다. 제작자별 auth 설정/공유 유료 캐시 없이 실행한다.
3. 의존성 캐시가 준비되면 외부 네트워크를 차단하고 core import/build/default tests를 실행한다. fixture 서버는 loopback만 사용하고 공식 MapLibre demo style/공용 geocoder 자동 접속도 실패 원인으로 처리한다.
4. Web은 page·iframe·worker·service worker 포함 browser 기록과 OS egress 기록을 함께 본다. Native는 emulator/device의 OS 수준 네트워크 관측을 사용한다. JS fetch mock만으로 Native 요청 부재를 증명하지 않는다. 권한 있는 자사 앱 시험이며 타사 보호 조치를 우회하지 않는다.
5. 무설정·불완전 설정·style 자산 누락·네트워크 실패·mount/unmount·검색/경로 미설정 시나리오에서 외부 요청 **시도**가 0인지 검사한다. 차단돼 실패한 요청도 무요청 통과가 아니다.
6. 명시적 운영자 provider는 controlled local mock으로 시험한다. source/TileJSON/glyph/sprite/redirect가 허용 범위를 벗어나면 전송 전에 거부되는지 검증한다. 실제 유료 API는 기본 CI에서 호출하지 않는다.
7. 목적지별 요청 수·기능·소유 주체·과금 주체·설정 출처를 표로 남긴다. URL query/token·개인 도메인을 원문 공개하지 않고 redacted service ID로 식별한다. **제작자 소유 과금 endpoint 0건**, 미확인 목적지 0건, 무설정 외부 시도 0건이 합격 조건이다.
8. 공개 데모의 CSP, local assets, quota 초과 중지 정책, 공유 proxy/token endpoint 부재를 확인한다. 호스팅/Actions 계정의 무료 한도·유료 전환 차단은 코드 밖에서 별도로 확인한다.

배포마다 날짜, 검사자, commit/artifact hash, 설치/실행/테스트별 요청 요약, 플랫폼, 금액/한도 확인 근거, 실패·미검증, 승인 범위를 갱신한다. 하나라도 미해결이면 해당 제품/플랫폼 배포를 차단하고 문서 변경만 검토할 수 있다.

## 7. GitHub Actions와 비용 승인

2026-10-19 [공식 Actions 과금 문서](https://docs.github.com/en/billing/concepts/product-billing/github-actions)를 확인했다. 공개 저장소의 표준 runner 사용과 larger runner 과금, artifact/cache 저장 비용의 조건은 서로 다르다. 기본 workflow를 추가할 때 무료 표준 SKU를 확인하고 runner label을 명시한다. dynamic matrix/reusable workflow/외부 action의 실제 실행 경로도 감사한다.

유료 runner, 비용이 발생하는 self-hosted 장비, 초과 storage/cache, custom image, cloud deployment, remote build cache는 별도 명시적 승인 없이 활성화하지 않는다. 이번 변경은 Actions workflow·결제 계정·예산 한도·서비스를 만들거나 변경하지 않았다. 기존 최초 main 병합 승인은 이 기능들의 승인으로 간주하지 않는다.

## 8. 후속 작업

정책/정적 감사는 현재 적용 가능하다. SDK M1~M4의 설치·실행 네트워크, 실제 package allowlist/tarball, Native bundle과 공개 데모 감사는 구현 시 수행한다. 그때까지 제품 Zero Publisher Cost 런타임 검증은 미완료다. 실제 비용 책임은 외부 서비스를 설정한 운영자에게 있다는 고지를 provider 설명과 예제에도 유지한다.

## 9. 모노레포 foundation 감사 — 2026-10-19

대상: `feat/monorepo-foundation`, base `131a1789231745d1dc791597d0a9844f384a2bb5`. 최종 커밋은 `git log -1 --format='%H' --grep='^feat: bootstrap Korea Map Kit monorepo$'`로 식별한다. 산출물은 발행하지 않았고 서비스/DB/클라우드 계정을 만들지 않았다.

### 구성과 비용 경로

- SDK 5개, private 예제 2개, private 서비스 상태 경계 3개, private root. core는 외부 의존성 0개이고 ES-only다. 서비스는 descriptor만 내보내며 listener나 다운로드를 실행하지 않는다.
- fixture 모드를 앱이 명시적으로 선택한다. 설정 누락/미지원 모드는 renderer 생성 전에 실패한다. 실제 운영자 HTTP provider는 아직 미구현이며 자동 기본 endpoint가 없다.
- 초기 설치는 공개 registry를 사용한다. 모든 install hook은 `ignoreScripts: true`; 직접 버전/lockfile을 고정한다. 새 임시 workspace의 `pnpm offline:check`는 캐시에서 618개 패키지를 재사용해 성공했다. 해당 Linux `strace -f -e trace=connect` 관측에서 AF_INET/AF_INET6 connect 0건이었다.
- SDK 함수/테스트는 API 키가 필요 없다. Web의 worker는 설치된 MapLibre에서 로컬 public 경로로 복사하고 BSD 고지를 함께 제공한다. GeoJSON/스타일은 직접 작성한 합성 fixture로 source/glyph/sprite/tile 원격 URL이 없다.
- Next/Expo telemetry를 실행기에서 끄고 Expo dotenv/OTA를 비활성화했다. 실제 환경파일은 없다. `.env.example`만 Git에 들어간다. 사용자 provider 값은 클라이언트에 공개될 수 있다는 고지를 유지한다.
- Next16.4 기본 agentUpgrade 조회가 초기 trace에서 공개 registry 접속을 시도했다. 공식 `experimental.agentUpgrade: false`로 일반 build의 자동 조회를 비활성화했다. 보안 검사를 생략하는 승인이 아니며 별도 `pnpm audit` 결과를 아래와 같이 보존한다.
- Expo58의 `lan-network`가 로컬 인터페이스 선택을 위해 UDP connect 방식으로 기본 경로를 검사하는 점을 조사했다. SDK provider 요청이나 제작자 과금 endpoint가 아니다. `EXPO_OFFLINE`에서도 이 내부 주소 탐색이 실행될 수 있으며 기본 build 전체를 단순히 “모든 socket 생성 0”으로 표현하지 않는다. 최종 실행 관측은 진행 기록에 추가한다.

### 검사 결과와 한계

| 대상 | 결과 | 범위/제한 |
| --- | --- | --- |
| 단위/타입/경계/lint/format | 통과 | core·fixture·web lifecycle 단위 테스트 16개, 실제 Native rendering 아님 |
| SDK/services/Next/Expo build | 통과 | Expo는 Android/iOS JavaScript export, APK/IPA 아님 |
| Web Chromium E2E | 통과 | 로드·pan·합성검색·새로고침, 관측 외부 HTTP 요청 0, pageerror 0 |
| SDK tarball 5개 | 정적 검사 통과 | 실제 pack 내용에 JS/d.ts/MIT 고지/manifest/README만 포함; 발행 없음 |
| Git 작업 트리/index/이력 | 정적 검사 통과 | heuristic rule 범위; 배포물 전체의 임의 secret 부재를 증명하지 않음 |
| Python 감사 회귀 | 11개 통과 | 이력/index/합성 token/tar/CI 규칙 |
| Native 실빌드·실화면·네트워크 | 미검증 | 로컬 SDK/기기 환경 미구비; CI는 JS export만 구성 |
| 초기 온라인 설치 전체 packet inventory | 미수집 | registry 조회 및 scripts 차단 확인과 캐시 오프라인 재설치 증거로 구분 |
| 원격 CI | [3 OS 재실행 통과](https://github.com/kasa500000-png/KoreaMap/actions/runs/39205327239), `b538e95` | check/pack 및 Linux browser E2E; Native compiler 미포함 |
| 결제 계정/운영 데모 | 변경·배포 없음 | 실제 무료 한도/과금 설정 검증 전 운영 배포 금지 |

브라우저 QA는 context 요청 계측/차단과 화면 관찰이며 OS/Native 모든 전송 경로의 완전한 증거는 아니다. service worker는 차단하며 로컬 MapLibre worker를 사용했다. Linux syscall 추적은 작업 환경에 한정한다. `unshare -n` 네트워크 namespace 격리는 권한 부족으로 실행 불가였으므로 격리 환경 검증으로 보고하지 않는다.

### 의존성 보안 — 미통과, 출시 차단

`pnpm audit --json`의 최초 결과는 moderate1/high2였다. `xcode>uuid`를 CommonJS v4 호환이 있는 11.1.1로 한정 override하고 합성 xcode project ID 생성·빌드를 재검증해 moderate 항목을 제거했다. 최종 결과는 **high 2, critical 0**, exit code 1이다. suppression/ignoreCves로 통과 처리하지 않았다.

| 패키지/경로 | 알려진 문제 | 현재 조치 |
| --- | --- | --- |
| node-forge 1.4.0 / Expo CLI·code-signing 도구 | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv), signature 검증 | registry 수정 버전 없음. 클라우드/서명 기능 미사용, 배포 차단; upstream 수정 후 갱신·재검증 |
| braces 3.0.3 / Metro file-map | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | registry 수정 버전 없음. 신뢰된 로컬 소스 fixture에서만 검증; upstream 수정 후 갱신·재검증 |

이 항목은 MIT SDK 자체 코드의 취약점 여부와 별개로 소비 앱/도구 공급망 위험이다. 영향을 자동으로 무시하지 않으며 제품 전체 보안 합격·출시 완료를 선언하지 않는다. 실제 서비스 연결/불특정 입력 처리/패키지 발행 전에 해결 또는 검토된 대체 도구 결정이 필요하다.

### GitHub Actions 비용

이번 사용자 지시에 따라 무료 표준 runner 3종으로 CI를 구성했다. cache·artifact 업로드·스케줄·대형 runner·배포·발행은 없다. setup-node 자동 cache도 `package-manager-cache: false`로 끄고 실행당 20분 timeout과 concurrency 취소를 둔다. 공개 저장소의 표준 runner 무료 조건을 적용하며 결제 한도를 올리지 않는다. `contents: read` 및 checkout credential 비보존이다. 워크플로를 실제 실행한 결과/차단은 PR checks와 진행 기록/사용자 보고를 따른다.

### 재현 명령

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm offline:check
pnpm pack:check
pnpm exec playwright install chromium
pnpm test:web
pnpm audit --json
```

마지막 audit는 현재 high2로 실패한다. 앞선 기능/정적 검사 통과를 이 실패의 해결로 해석하지 않는다. artifact hash와 실행 플랫폼/미검증은 [foundation 검증 기록](research/foundation-validation.md)에 보존한다.

## 10. 데이터 출처·배포 gate 단계 — 2026-10-19

- 조사 목적으로 공식 문서/메타데이터 페이지를 열람했다. 실제 지도 파일·사진을 내려받거나 API 키를 발급/사용하지 않았다. 파일 원본 QA와 quota 계정 검증은 미실행이다.
- `data/sources.json`의 URL은 검토 메타데이터다. 비용 감사에서 이 정확한 경로만 문서로 구분하고, 공식 호스트·HTTPS·credential 없는 URL은 데이터 검사에서 추가 검증한다. SDK가 이 원장을 import하거나 기본 endpoint로 사용하지 않는다.
- 모든 후보 `defaultEnabled=false`, 수집은 A + 운영자 opt-in 자격 검사만 가능하다. 서비스 collector, B 실 API 어댑터, 새 backend/proxy, shared key, 배포·발행 workflow를 추가하지 않았다.
- `pnpm check`와 source/index 검사, 실제 다섯 `pnpm pack:check`가 통과했다. 데이터 정책 회귀 16개, 기존 비용 감사 회귀 11개가 잘못된 승인·payload·민감 설정 경로를 검사한다. tarball의 catalog/원본 데이터/사진 유입은 허용하지 않는다.
- Linux에서 `strace -f -qq -e trace=network python scripts/check-data.py --select osm-geofabrik-kr --operator-opt-in` 실행: 네트워크 syscall 0건. 자격 판정만 출력하며 다운로드하지 않았다. 최초 pnpm wrapper를 직접 strace하는 시도는 Exec format error로 실패해 Python 진입점으로 범위를 명시하여 다시 확인했다.
- 로컬 Chromium fixture E2E 통과: 외부 HTTP 시도 0, 화면 오류 0; 합성 지도/한글 UI/출처를 screenshot으로 확인했다. 이 결과는 외부 데이터 provider 및 Native 네트워크 검증이 아니다.
- 의존성/lockfile 변경 없음. 앞 단계 high 2건은 해결되지 않은 출시 차단으로 유지하며 이번에 새로운 advisory 조회를 수행하지 않았다. 실제 배포 전 전체 dependency·비용·라이선스 감사를 다시 실행한다.
- CI는 기존 무료 표준 3 OS job에 데이터 검사와 staged 검사만 추가했다. 유료 runner/cache/artifact/스케줄/운영 서비스는 추가하지 않았다. 원격 실행 결과는 PR과 진행 기록에 별도로 보고한다.

산출물 SHA-256과 검증 범위는 [데이터 검증 기록](research/data-validation.md)에 있다. 정책 검사 통과는 제작자 계정의 실제 청구 설정이나 법적 권리 판단의 정확성을 자동 보증하지 않는다.

- 원격 추가 증거: `ac2d4d2`의 [3 OS CI](https://github.com/kasa500000-png/KoreaMap/actions/runs/39207562003) 모두 통과. XML/RDF/줄 단위 JSON 및 검토되지 않은 경로의 JSON 차단을 보강했으며 새로운 네트워크 기능은 없다. 후속 커밋은 같은 PR의 CI로 확인한다.

## 11. Web SDK — 2026-10-19

- 기본 fixture에는 외부 style/tile/sprite/glyph/font/API endpoint가 없다. 데모는 자체 합성 GeoJSON과 로컬 worker를 사용한다. 100/1,000 마커·경로 표시는 네트워크 서비스 호출이 아니다.
- 선택형 `operator` 설정은 style URL, 정확한 허용 origin, 출처, 비용 책임 동의를 모두 요구한다. HTTPS 또는 HTTP loopback만 허용하며 URL 내 username/password는 거부한다. 제작자 계정·환경변수 탐색·무료 공용 fallback은 없다. 운영자 요청 비용은 해당 운영자 책임이다.
- `transformRequest`로 허용되지 않은 리소스 origin을 거부한다. 테스트에서 같은 origin의 운영자 스타일 성공 및 다른 origin의 GeoJSON 차단을 확인했다. HTTP redirect와 사용자 custom layer JavaScript는 이 검사만으로 격리되지 않으므로 신뢰할 수 있는 스타일/redirect와 CSP·서비스 quota가 필요하다. allowlist를 청구 한도나 비밀키 보호 장치로 표시하지 않는다.
- 공개 클라이언트 값은 비밀이 아니다. 팝업은 textContent만 사용하고 직접 제공하는 출처는 escape한다. 운영자 스타일 내부의 외부 링크/출처 역시 운영자가 검토해야 한다. SDK 오류 이벤트는 원본 URL/credential을 전달하지 않는다.
- Playwright의 실제 fixture 탐색·선택·반복 종료 및 운영자 origin 차단 시나리오에서 외부 HTTP 시도 0건을 검사한다. 모바일 Chromium은 터치 에뮬레이션이며 실제 Safari/Android 환경의 네트워크 감사는 아니다.
- dependency/lockfile·CI 인프라 변경 없음. 기존 high2는 미해결 출시 차단으로 유지한다. 이번 작업은 advisory 재조회를 대신하지 않는다. 실제 공개/발행 전 감사를 다시 수행한다.
- 작업 트리/index 및 다섯 실제 npm tarball의 provenance·비밀값·endpoint 검사를 수행한다. 자체 작성 runtime 파일만 수동 검토 후 publication manifest를 갱신한다. 제3자 지도 payload는 추가하지 않았다.
- MapLibre 전역 dispatcher의 공유 worker 1개 유지가 관측된다. 지도 종료 후 새로운 요청은 발생하지 않으며, SDK가 다른 지도 인스턴스에 영향을 줄 수 있는 강제 종료를 수행하지 않는다. 반복 mount 시 worker 증가 여부와 제한된 heap regression을 검사한다.

상세 실행 결과 및 제한은 [Web SDK 검증 기록](research/web-sdk-validation.md)에 기록한다.

## 12. 독립 지도 디자인 시스템 — 2026-10-19

- 테마 토큰·GeoJSON fixture·POI RGBA는 자체 작성 코드다. 스타일 생성/이름 fallback/폰트 cmap 검사 함수는 네트워크 요청을 하지 않는다. 폰트 파일·glyph PBF·sprite를 Git/npm에 추가하지 않았다.
- Web `inline` config도 attribution, 허용 origin, 비용 동의를 요구한다. 비교 예제의 허용 origin은 빈 목록이다. 설치된 Noto CJK를 사용하며 glyph/sprite/font-face URL 또는 제작자 endpoint를 넣지 않는다. 사용자 glyph URL은 명시적인 운영자 설정이며 Native local 생략은 거부한다.
- 브라우저 E2E에서 4종 실제 렌더링, 한글 폰트 선택/픽셀, zoom 규칙, 사용자 수역색 및 출처 표시를 검사하며 외부 HTTP 시도 0을 확인한다. 외부 glyph 운영자의 과금·redirect·quota와 실제 Native 트래픽은 검증하지 않았다.
- 코드 런타임의 새 기본 다운로드/telemetry/install hook은 없다. lockfile 변경은 examples/web→styles의 내부 workspace 연결뿐이다. Linux 무료 표준 CI runner의 Noto OS 패키지 설치는 QA 준비 동작이며 SDK 설치 경로가 아니다. 배포판 제공 폰트 SHA를 실행 로그에 출력하고 고정된 로컬 QA SHA도 문서에 기록한다.
- 사용자가 요청한 자체 테마 screenshot 네 경로만 PNG 구조·크기·CRC·해시·출처 검사로 허용한다. 임의 PNG/font/raw 데이터는 계속 차단한다. npm tarball에는 screenshot도 포함하지 않는다. 픽셀에 담긴 권리를 자동 검사만으로 증명하지 않으며 네 장을 직접 열어 검토한다.
- 새로운 외부 dependency 버전은 없고 기존 high2 취약점은 미해결 출시 차단으로 유지한다. 이번 작업에서 advisory 재조회나 실제 폰트/glyph 서버 배포를 수행하지 않았다.
- main 병합·공개 전환·배포·npm 발행 및 유료 Actions 기능 변경은 없다. 로컬/원격 최종 결과는 [디자인 검증](research/design-system-validation.md)과 PR checks에 기록한다.

- 디자인 단계 최종 로컬 검사: `pnpm check`, 5개 tarball 및 최종 Web E2E 5개 통과. Noto/OFL 공식 문서 호스트 두 개를 문서 참조용으로 검토했으며 runtime URL 허용으로 확대되지 않음을 새 회귀 검사로 확인했다(비용 회귀 총 12개).

## 공통 Public API 감사 — 2026-10-19

이번 core 계약·검증·취소 로직은 외부 import/DOM/backend 의존성 0이며 경계 검사는 `import('…')` 타입 참조도 검사한다. standalone 테스트는 node_modules 없는 임시 폴더에서 fetch 금지 상태로 주요 API를 실행한다. Provider는 인터페이스만으로 자동 생성·호출되지 않고 운영자가 주입한다. 공개 클라이언트 설정은 비밀 저장소가 아니다.

Web `/api/`는 직접 작성한 합성 데이터만 inline으로 사용한다. 초기 config의 resource origin gate는 setStyle로 확대할 수 없다. Native는 origin interceptor가 아직 없어 외부 URL source/glyph/sprite 및 symbol 스타일을 실패시킨다. 스타일 timeout/취소는 해당 인스턴스를 종료하며 자동 재시도·공유계정 fallback이 없다. 공통 API 브라우저 테스트 외부 HTTP 시도 0, mock Native 검증을 native 실제 트래픽 감사로 표시하지 않는다.

새 데이터·아이콘·폰트 payload나 credentials, paid endpoint, install hook, 유료 CI 기능을 추가하지 않았다. 17개 변경/추가 runtime source는 자체 계약/로컬 합성 예제/bridge 구현으로 검토하고 publication 해시를 갱신했다. API 화면 캡처는 ignored test-results에만 보관하며 승인된 테마 screenshot 예외를 확대하지 않는다. 실제 5개 SDK tarball/배포 JS 정적 검사와 Git worktree/index/도달 가능한 이력 검사는 최종 확정 기록을 따른다. 이 정적 검사는 숨겨진 비밀이나 운영자 과금 설정의 완전한 증명이 아니다.

기존 dependency high2, Android/iOS 실제 compile·런타임 네트워크/메모리/권한 QA가 남아 있어 제품 출시는 차단된다. 신규 registry advisory 조회는 이번 범위에서 실행하지 않았다. Native가 이미 포함하던 Style Spec 26.2.1(ISC)을 직접 의존성으로 고정했으며 엔진/전이 그래프 버전은 바뀌지 않았다. main 병합·운영 배포·공개 전환·npm 발행을 수행하지 않는다.

최종 로컬 판정: check/5개 실제 tarball/최종 Playwright 6개 통과, static findings 0, 로컬 브라우저 외부 HTTP 시도 0. artifact SHA는 [Public API 검증](research/public-api-validation.md)에 기록했다. staged index는 커밋 직전 별도 검사한다. 비용 없는 모든 운영 환경이나 Native 런타임 검증 완료를 뜻하지 않는다.
## 공공 POI ETL / 2026-10-19

- 기본 SDK 설치/빌드/단위 테스트에 pg·DB·API 계정·다운로드 URL을 추가하지 않았다. pg 8.23.1과 csv-parse 7.0.3은 private `services/geo-data`에만 있다. 공통 core는 외부 의존성 0, data-adapters는 core만 의존한다.
- `createFixturePlacesProvider()`는 명시적 자체 합성 데이터이고 remote provider는 운영자가 transport를 주입해야 한다. 사용자의 DB/HTTP/프록시/원천 파일 접근과 운영 비용은 사용자가 책임진다. 제작자 endpoint, secret, 결제 설정, 계정 fallback 없음.
- 다운로드는 명시적 A 프로파일·opt-in·권리/기한/CRS·원본 해시 확인 후에만 실행하며 HTTPS 공식 호스트·30초·10MiB, 키/쿠키/redirect 차단을 적용한다. 원본 HTTP 본문은 디스크/DB에 저장하지 않고 허용 열만 적재한다. 수동 취득 원본/설정은 ignored data/raw에 둔다. 실원천 HTTP 503으로 실제 성공 수집은 미검증이다.
- Docker는 개발자가 명시적으로 실행할 때만 시작한다. digest 고정 amd64 이미지, loopback DB/HTTP, 실행 시 무작위 암호, ignored 서버 전용 설정, session writer/reader 역할·RLS·파라미터 SQL 적용. 원격 DB는 명시적 사용자·암호와 인증서 검증 TLS를 요구한다. 서비스 URL은 공개 클라이언트 설정, DB 암호는 서버 secret으로 구분한다.
- CLI/DB 로그는 source·SHA·건수·run ID·안전한 오류 코드만 출력한다. HTTP 응답/원본 행/연결 문자열/키는 로그에 넣지 않는다. 읽기 서버는 요청 크기·동시성·시간/SQL 제한과 no-store를 적용하며 공개 운영에는 별도 인증·인가 프록시가 필요하다.
- 실제 Docker PostGIS 테스트 12개에서 SDK→loopback HTTP→사용자 테스트 DB 경로를 확인했다. fixture 단위 테스트는 fetch 차단, mock 다운로드는 공식 요청 성공과 구분한다. PROJ 네트워크는 비활성이다. 스캐너의 `PASS_STATIC_ONLY`는 모든 동적/OS 트래픽을 증명하지 않는다.
- CI는 기존 무료 표준 Linux runner에 임시 DB 검사만 추가했다. 클라우드 DB/유료 runner/cache/artifact/배포·cron은 추가하지 않았다. 일반 `pnpm check`는 DB 없이 가능하다. Docker image/의존성 설치는 공개 레지스트리 접속이 필요하다.
- `pnpm audit` 재조회: high 2(기존 node-forge GHSA-86w9-cpqp-85rv, braces GHSA-vfj7-8cjw-p6xm), moderate/critical 0. 성공으로 억제하지 않으며 출시 차단 상태를 유지한다. 이번 조회에 신규 pg/csv-parse 취약점은 보고되지 않았다. 컨테이너 OS CVE 전수 검사는 수행하지 않았다.
- 원장 A6/B0/C8/D2와 Git/npm의 제3자 payload 금지를 유지한다. 자체 코드·fixture 출처 12개 파일을 개별 검토해 manifest hash를 갱신했다. CSV parser 공식 문서 호스트 허용은 docs에만 적용하며 runtime endpoint 허용으로 번지지 않는 회귀 검사도 추가했다.

전체 check·실제 tarball·staged 최종 결과와 원격 CI 상태는 [진행 기록](progress.md) 및 PR을 따른다. Supabase 프로젝트 접근/생성/배포, main 병합, npm 발행은 수행하지 않았다.

로컬 최종 `pack:check`에서 SDK 5개 실제 tarball의 출처/파일 allowlist/빌드 바이트 일치와 키·endpoint 검사가 통과했다(발행 아님). core SHA-256 `1dc1236adf46d061f126218f497297297e3b40af02901cac8efed7de686791ba`, data-adapters `a37409fadd336e3e9f76fff1fe61e43517d34692861ddf960d68c82ab2975fe2`. 기존 Web Playwright 6개도 외부 HTTP 차단 아래 통과했다. 실제 공공 원천 다운로드 성공/운영 계정 과금/Native 네트워크까지 검증했다는 뜻은 아니다.

## 한국 POI 검색 / 2026-10-19

- core/data-adapters에 pg·fetch·URL·키를 추가하지 않았다. 검색은 명시적 합성 provider 또는 운영자 transport다.
  Next `/search/`는 자체 MIT 자료 7건으로만 실행한다. 외부 Nominatim/지오코더/검색 API 호출 경로 없음.
- pg8.23.1은 private search 서비스에서 기존 exact 버전을 재사용한다. DB 연결은 서버 전용 명시 설정,
  reader 역할·파라미터 SQL·statement/lock/요청 기한·동시성/body 제한·loopback·Origin 거부를 적용한다.
  검색어/좌표/원문 응답/DB 암호는 로그하지 않고 HTTP 응답은 no-store다. 공개 운영은 사용자 인증 gateway가 필요하다.
- 검색 이용자가 늘어도 제작자 endpoint를 호출하는 경로가 없으며, 운영자가 자신의 DB/프록시/트래픽 비용을 부담한다.
  브라우저/모바일에 DB 비밀을 넣지 않는다. 별도 전국 주소 provider에도 같은 비용·권리 gate를 적용한다.
- 기존 Linux 임시 Docker CI 테스트에 검색 검사를 추가했다. 유료 runner/cache/artifact/클라우드 서비스/cron 추가 없음.
  기본 check는 DB 없이 가능하다. 실제 통합 검사 시 공개 registry의 Docker 이미지 다운로드가 필요하다.
- 검색 코드·SQL·합성 fixture·Web source 12개를 개별 검토해 출처 해시를 추가/갱신한다. 제3자 payload 허용 없음.
  PostgreSQL 문서 URL은 문서 allowlist에만 추가하고 runtime URL 차단 회귀 검사를 추가했다.
- 기존 high2(node-forge/braces) 미해결 상태 유지. 이번 변경은 새 전이 버전을 도입하지 않았으며 advisory 재조회는 하지 않았다.
  서비스/DB 컨테이너 OS CVE, 실제 Native 네트워크와 운영 계정 과금 설정은 미검증이다.

최종 전체 check/pack·staged·Chromium 외부 요청 검사와 화면 결과는 [검색 검증](research/search-validation.md),
[진행 기록](progress.md)을 따른다. main 병합·배포·npm 발행은 수행하지 않는다.

로컬 최종 check/SDK5개 pack/Chromium7개/실제 Docker19개 통과. 정적 findings0, 데모 외부 HTTP 시도0.
SDK core/data-adapters 실제 tarball SHA는 [검색 검증](research/search-validation.md)에 기록했다.
로컬 CLI 가이드를 실행해 pnpm 내장 search 충돌을 제거했고, DB migration·서버 조회·정상 종료까지 확인했다.
공식 문서와 의존성 registry/Docker 다운로드는 SDK 런타임 provider 요청과 구분한다.

## GPS·이동 경로 / 2026-10-19

- SDK는 사용자 동의 false로 생성되며 current/watch의 명시적 호출에서만 위치를 수집한다.
  core에 브라우저/Native/저장소/네트워크 의존성을 추가하지 않았다. 외부 업로드·telemetry·위치 로그 없음.
- Web Geolocation/Expo foreground adapter는 위치 갱신을 앱 메모리로만 전달한다. pause/삭제/철회/비활성/종료에서 구독을 해제한다.
  늦은 구독 생성은 즉시 정리하며 지도 작업/파일 읽기에도 취소를 적용한다. 공개 Web 데모의 기본은 수동 모의 GPS다.
- 위치 수집과 장기 보관 정책은 분리했다. 내보낸 파일은 위치·시각을 포함한다는 안내 후 사용자 클릭으로만 생성한다.
  recorder.clear와 예제 삭제는 앱이 소유한 메모리/지도/textarea 참조만 제거하며 이미 다운로드/복사한 외부 파일은 별도 삭제 대상이다.
- GeoJSON/GPX parser는 크기/점/깊이 상한과 좌표/시각 검증을 적용한다. DTD·외부 entity·XML schema 요청 없음.
  GPX namespace 한 문자열은 정확한 소스/산출물 경로의 상수 선언에서만 정적 예외로 검토했다.
  같은 URL의 fetch 표현/다른 경로는 계속 차단하는 회귀 검사를 추가했다. 일반 endpoint 허용이 아니다.
- expo-location58.0.17(MIT)은 Expo 예제에만 exact 추가했고 SDK는 모듈 주입형이다. 설치된 Expo58 권장 버전과 공식 registry/소스를 확인했다.
  background 권한·서비스·TaskManager를 추가하지 않았다. config introspect에 전경 Android/iOS 권한만 있는지 확인했다.
  SDK5개 tarball에는 Expo 모듈/기기 기록/파일을 넣지 않는다.
- 새 단위17개 fetch 차단, Chromium GPS2개 local-only route 검사에서 외부 HTTP 요청 시도0을 확인했다.
  플랫폼 위치 결정 자체의 OS 네트워크·Native 진단 로그는 실제 기기가 없어 미검증이다. 기기 전체 무통신을 주장하지 않는다.
- CI는 기존 무료 표준 runner만 사용한다. 유료 기기 farm/클라우드 GPS/새 artifact·cache·cron/배포 설정 없음.
- pnpm audit 재조회: 기존 high2(node-forge GHSA-86w9-cpqp-85rv, braces GHSA-vfj7-8cjw-p6xm), moderate/critical0.
  실패 상태를 통과로 바꾸지 않으며 제품 출시 차단은 유지한다. 새 expo-location 항목의 advisory는 이번 응답에 없었다.

최종 check/pack/staged·전체 브라우저 검사 결과는 [진행 기록](progress.md), [GPS 검증](research/gps-validation.md)을 따른다.
실제 위치/원본 파일은 Git/npm/공개 screenshot/CI 로그에 포함하지 않는다. 모든 경로 테스트/capture는 자체 합성 자료다.

Expo의 추가 화면과 JS 모듈도 출처 검사에서 빠지지 않도록 기존 두 파일 한정을 전체 Expo JS/TS 소스로 확대했다.
새 GPS 관련 소스16개와 기존 단순 Metro 설정1개를 개별 검토해 manifest에 기록했다. 검토되지 않은 중첩 화면을 거부하는 회귀 검사도 추가했다.

## 선택형 자체 라우팅 추가 감사 — 2026-10-19

- core/data-adapters는 주입된 transport만 호출하며 URL/키·환경변수 기본 탐색·엔진 설치 hook이 없다. 지도 초기화와 SDK 기본 check는 라우팅 서비스 없이 동작한다.
- Valhalla 공식 base 이미지를 digest로 고정했다. scripted 이미지의 tile/timezone/default-speeds 다운로드는 사용하지 않는다. Docker image pull은 로컬 test/build의 명시적 실행에서만 발생하며 데이터 다운로드와 서버 운영은 운영자 책임이다.
- 한국 공개 OSM PBF 289,590,631 bytes를 이번 QA에서 수동 다운로드해 로컬 graph를 빌드했다. SDK 설치/CI가 이를 받지 않으며 원본/graph/admin DB/.env는 ignored artifacts에만 있다. A/기한/권리 opt-in/해시/기준일을 확인한다.
- build network none, 서빙 loopback 8002와 Node gateway 8093. 로컬 bridge는 egress 방화벽 보장이 아니다. 엔진 원격 tile·traffic·telemetry URL 없음, 요청/위치 로그 비활성. 검색/PostGIS 또는 제작자 계정에 연결하지 않는다.
- gateway는 명시적 운영자 URL, HTTPS 또는 loopback HTTP, redirect 금지, 4KiB 입력/8MiB upstream, concurrency/deadline/cancel/Origin/Host 검사다. 공개 demo에 gateway나 공유 인증정보를 포함하지 않는다. Web /routing은 자체 고정 합성 경로만 표시한다.
- Linux 표준 runner에 pnpm test:routing만 추가했다. 유료/larger runner·캐시·artifact 업로드·cron·배포 없음. 실제 계정 과금 설정을 코드만으로 보장하지 않는다.
- 실제 Web E2E는 외부 HTTP 시도0을 확인했다. OS 전체 엔진 egress/Native 기기 실행은 별도이며 정적 감사로 대체하지 않는다. 최종 check/실제 npm tarball/index 결과는 진행 기록을 따른다.
- npm audit는 기존 node-forge/braces high2로 종료1, 신규 외부 npm dependency 없음. 이미지 전체 SBOM/CVE 감사와 공개 운영 인프라 검증은 후속이다. 출시 차단 유지.

최종 로컬 결과: `pnpm check`, `pnpm pack:check` SDK5개, `pnpm test:routing`8개, 한국 공개 OSM5개,
Chromium E2E10개 통과. worktree/index/도달 가능한 history 및 실제 tarball 정적 findings0,
Web 외부 HTTP 시도0. 이는 OS 전체 또는 원격 과금 계정의 안전성 증명은 아니다.

## Native SDK 확장 감사 — 2026-10-19

- 기본 합성 지도와 4종 도형 테마는 타일/glyph/sprite/검색/라우팅 endpoint가 없다. 운영자 설정은 mount 시 명시적으로 받으며 SDK가 환경변수나 제작자 계정을 자동 탐색하지 않는다.
- 직접 XYZ/glyph/sprite origin 입력 검사를 추가했다. remote style/TileJSON/GeoJSON 자동 탐색, URL credentials/query/fragment, 비-loopback 평문 HTTP는 거부한다. Native redirect 차단은 구현하지 않았으며 운영자 서버는 직접 응답해야 한다. OS 전체 요청 감사는 별도 출시 조건이다.
- PMTiles는 두 가지 명시적 실험 설정이 필요하다. HTTP가 기본이며 사용자가 제공한 XYZ로만 전환한다. RN/Android/iOS 실제 PMTiles 검증은 문서상의 엔진 지원과 구분한다.
- expo-dev-client 58.0.14만 새 외부 직접 의존성으로 추가했다. Expo 공식 버전 범위와 대조했다. 로컬 launcher/Metro를 사용하고 OTA/EAS/계정·비공개 API 키는 설정하지 않는다. 개발 launcher의 모든 OS 네트워크 요청까지 정적 검사로 보장하지 않는다.
- 로컬 SDK/Gradle/에뮬레이터 다운로드는 개발 검증용이며 SDK 설치 hook이 아니다. 인증/결제 계정 없이 수행한다. APK/생성 프로젝트·SDK·타일·glyph·폰트·실화면은 Git/npm에 포함하지 않는다.
- npm audit high 2(node-forge, braces) 유지, exit 1. 취약점 해결 및 native runtime 네트워크/메모리/실기기/iOS QA 전 공개 출시 차단 유지.
- 최종 worktree/index/history/tarball 결과와 실제 빌드 상태는 [Native 검증 기록](research/native-sdk-validation.md), [진행 기록](progress.md)에 구분해 기록한다.

## 두 예제 앱 감사 — 2026-10-19

- private `examples/scenarios`에만 산책/여행 분기·가짜 장소·저장 정책을 둔다. SDK가 이 패키지를 import하지 않으며 npm SDK tarball에 포함하지 않는다.
- 새 예제는 실제 GPS/외부 검색·라우팅·tile/glyph API를 호출하지 않는다. 모든 지도와 사용자 기록은 합성 자료다. Web localStorage/Native AsyncStorage의 지정 키에 명시적 저장만 수행한다.
- AsyncStorage 2.2.0(MIT)은 Expo 권장 버전으로 고정한 예제 전용 의존성이다. 저장 내용은 비암호화이며 실제 개인정보 정책으로 재사용하지 않는다. 서버·키·과금 계정·OTA를 추가하지 않았다.
- Android SDK/JDK 다운로드와 Gradle dependency resolution은 로컬 개발 빌드에서만 수행한다. JDK는 공식 metadata checksum과 환경 CA trust를 유지하며 APK·기기 로그·캡처는 ignored artifacts에만 둔다.
- 검토된 private scenario 소스를 데이터 출처 해시 검사에 포함하고 누락을 거부하는 회귀 검사를 추가한다. APK/지도/font payload 공개 허용 규칙을 확대하지 않는다.
- 실제 브라우저 시나리오에서 외부 요청 0을 검사한다. Native OS 전체 egress/암호화/실기기 보안 보증은 아니다. 최종 검사·npm audit 결과는 검증/진행 문서를 따른다.

로컬 최종 확인: check(99 단위/19 데이터/16 비용 회귀), SDK tarball5, Web E2E12 통과.
새 두 앱의 Web 외부 HTTP 시도0, worktree/index/도달 가능한 history/tarball 정적 findings0.
Android APK 빌드·설치 및 합성 앱 화면 실행은 성공했다. 초기 startup ANR가 있었으며 OS 전체 요청 검증은 미완료다.
npm audit는 기존 high2/exit1이며 공개 출시 차단을 유지한다.


## 전체 품질 감사 — 2026-10-19

- 동일값 Web 카메라/마커 갱신을 줄이고 GeoJSON 공개 타입 누락을 고쳤다. 새로운 runtime endpoint/키/계정은 추가하지 않았다. @types/geojson은 기존 고정 버전을 web/styles의 명시적 타입 의존성으로 이동·추가한 것이며 core 의존성은 0이다.
- 오프라인 검사가 12개 manifest/27개 workspace 연결을 확인하도록 보강했다. 별도 임시 소비 앱이 실제 SDK4개 tarball을 설치해 strict 타입·SSR import·브라우저 렌더/선택/종료와 외부 요청0을 확인한다. SDK5개 clean rebuild tarball 바이트 일치 및 크기를 측정한다.
- 작업 트리/index/로컬 refs 이력/SDK tarball의 정적 발견0과 built app 후보 검토를 구분한다. 실제 Next/Expo 출력94파일에서는 URL120·credential 형식5개 후보가 발생했다. Next URL probe/RN TextInput 토큰은 upstream 소스와 대조했으며 Expo Go home 조건부 asset CDN도 기록했다. Native OS egress까지 통과로 표시하지 않는다.
- 라이선스 metadata는 recursive 전체 설치 그래프645개 버전으로 확대했다. LGPL(libvips)·MPL(lightningcss)·CC-BY(caniuse-lite) 등의 별도 의무와 미실행 native/image SBOM 범위를 QA 보고서에 명시한다. SDK tarball은 제3자 데이터/폰트/SDK 외 서버를 포함하지 않는다.
- Web15, 실제 PostGIS19, 실제 합성 Valhalla8, 단위100 및 출처19/비용16 회귀가 통과했다. 390/768/1440 Web와 독립 소비 앱 외부 HTTP 요청0. 모든 앱/운영자 설정에서 비용이 없음을 보증하지 않는다.
- npm audit는 high2/exit1, 공식 수정 버전 없음으로 재확인했다. Web NodeNext 외부 선언, Android 물리 기기/iOS, 장시간 메모리/실데이터 부하/OS 네트워크는 미검증 또는 미해결이며 출시 차단을 유지한다.
- 기존 표준 runner에서 license/offline/독립 tarball 소비 앱 검사만 추가했다. paid runner·remote cache·artifact 업로드·cron·배포·공유 계정·npm publish 없음.


소비 앱 CI 보완: package store만 있는 새 runner에서는 registry metadata가 부족해 최초 Linux 검사가 실패했다.
`verify:packages`는 빈 전용 metadata 캐시에서 공개 registry로 lock만 명시적으로 준비한 다음
frozen/offline·hook 차단 설치를 검증한다. 실제 설치 버전을 기존 검토된 그래프와 대조한다.
이 개발용 metadata 요청은 제작자 API/계정을 사용하지 않는다. Web 실행 외부 요청0과 설치 준비 통신을 혼동하지 않는다.
전체 workspace의 `offline:check`는 기존대로 frozen/offline 전용이다.

## v0.1.0 릴리스 비용 경로 — 2026-10-19

영문/국문·커뮤니티·설치·운영 문서, 5개 비스코프 후보 패키지 이름, 초기 CHANGELOG와 승인 제한 발행 자동화를 로컬 후보로 준비했다. 기능/패키지/실화면 검증은 보고서의 실제 실행 범위에서 통과했으나 공개 발행은 차단 상태다. 상세 구현 파일, 테스트, 실화면, 보안/라이선스, 차단 사항과 다음 단계는 [후보 보고서](releases/v0.1.0.md)를 따른다. 현재 high 취약점과 Native/registry 미검증은 공개 차단으로 유지한다. 브랜치 `release/v0.1.0-preparation`; 커밋은 `git log -1 --format=%H release/v0.1.0-preparation`로 식별한다. 제작자 provider를 추가하지 않았고 공개 npm 메타데이터 조회/의존성 설치만 수행한다. 원격 공개 업로드·배포·npm 발행·GitHub Release는 승인 전 실행하지 않는다.


## 남은 작업 구현 감사 — 2026-10-20 KST

대상 `feat/korean-map-completion`, 기반 `76b379b9dd2abbb6393e90f789a78ac2fd352762`. [실행 보고](research/completion-validation.md)·[실제 타일](research/real-tiles-validation.md)·[독립 Native](research/native-consumer-validation.md)에 실행 범위와 한계를 기록한다. 전체 공개 판정은 high2/Native·실자료 등의 게이트로 차단 유지다.

- 기본 SDK/합성 예제는 제작자 endpoint·계정·유료 키를 추가하지 않았다. `/tiles/`는 빈 URL·미동의 상태에 provider 요청0이며 Connect 뒤 운영자가 지정한 origin만 사용한다. 브라우저 설정/URL은 공개 값으로 안내한다. Next static QA 서버의 추가 connect-src는 명시적인 exact loopback `--tile-origin` 옵션에만 적용되고 기본 CSP는 그대로다.
- 새 private 타일 CLI만 공식 pinned Planetiler JAR 및 검토한 Geofabrik PBF URL을 가진다. import/SDK install/build/test는 다운로드하지 않는다. operator opt-in, SHA/크기/시간/권리/기준일 검사, source redirect 거부 및 tool의 제한된 공식 redirect, 실패 시 partial 제거·기존 성공본 보존을 테스트했다. 감사의 URL 예외도 exact source path+literal URL 2종 및 해당 mock 회귀로 한정했다. 같은 URL을 SDK에 넣거나 query/경로를 바꾸면 차단하는 회귀를 추가했다.
- 이번 실제 생성은 기존 권리/해시 검증 한국 PBF를 재사용했다. JAR/선택형 도구 설치는 공개 GitHub/PyPI, 의존성 설치·공식 보안 metadata 조회는 공개 registry였다. 유료 지도/API 계정은 사용하지 않았다. 폰트는 로컬 검토본이며 자동 다운로드가 없다. 실제 PBF·OSM MBTiles·OFL glyph/폰트·실지도 screenshot·원본 파일·기기/개인 위치는 새 Git/npm에 포함하지 않았다.
- 실제4지역 Web QA: style12/tile66/glyph353 HTTP200, 미확인 외부 origin·HTTP 오류·pageerror·console error·타일 서버 오류0. 별도 실제 Valhalla→서울 지도2폭 QA: style1/tile20/glyph52, 외부/HTTP/페이지/SDK 오류0. 로컬 서비스 요청은 운영자가 실행한 loopback만이다. 브라우저 기록은 OS 전체 egress 증명이 아니며 Native 실제 OS 요청은 미검증이다.
- 기본 Chromium E2E19개와 격리 Web tarball 소비는 외부 browser 요청0, 새 offline설치는 준비된 store에서13manifest/29link·다운로드0·hook0을 확인했다. Native 실제 core/native/styles tarball 소비도 offline+ignore-scripts·앱 타입/plugin/JS export를 통과했으나 전체 상위 선언 실패3건으로 PARTIAL_PASS다. APK/IPA·Native glyph/PMTiles·OS egress·계정 청구 설정은 통과로 표시하지 않는다.
- `pnpm audit:dependencies` 실제 exit1, high2/critical0. 공식 patch 없음과 최신 호환 상위 그래프의 동일 취약 경로를 기록했다. CI는 별도 표준 Linux audit job을 실행하고 ignore/continue-on-error가 없다. Linux 기능/발행 workflow에 독립 Native 소비도 추가했다. 발행은 manual main ref·정확한 승인 SHA·main ancestry·보호 환경·전체 audit/Web/pack 게이트 뒤에만 가능하며 현재 비활성이다.
- Actions는 기존 무료 표준 runner 종류만 유지했다. 새로운 paid runner/cloud/EAS/배포·정기수집·cache/artifact 업로드·공개 proxy·공유 키·원격 쓰기를 활성화하지 않았다. 계정 무료 한도/결제 제한·branch protection required-check·보호 환경 실제 설정은 미검증이다.
- 작업 트리/index/도달 가능한 로컬 Git 이력과5개 실제 tarball에 정적 검사, data publication 검사, cost 회귀19개를 실행한다. 발견0은 heuristic 범위다. 최종 staged 검사와 commit binding은 구현 보고 및 최종 커밋 결과를 따른다. 루프백 테스트를 제작자 유료 endpoint 무요청의 모든 OS/모든 실행에 대한 보증으로 확대하지 않는다.

추가 점검: 실제 OSM 스타일의 클릭 가능한 공식 copyright/ODbL 고지를 제공했다. 이 exact 표시 링크는 private config 한 경로에만 정적 검토했으며 자동 fetch가 아니다. 현재 워크스페이스 Android debug APK의 offline compile도 성공했으나 JS 내장·독립tarballAPK/기기/OS egress 검증을 대신하지 않는다. 모바일 경로 QA의 resize 경쟁 조건을 수정하고 전체 경로 bounds와 실제 waypoint3개를 재검증했다.
## 지도 품질 개선 비용·공개 감사 — 2026-10-20 UTC

브랜치 `feat/map-quality`, 시작점 `964e9674ee626f60942be4d0f4bfe4f1aec9bbc8`. [품질 결과](research/map-quality-validation.md)와 [ADR-010](decisions/010-map-quality-and-interactions.md)을 따른다. 기능 검사 통과와 성능·보안·기기/공개 수락을 구분한다.

- 공통 interaction·4테마 cartography·클러스터·예제 카드/가상화/접근성을 구현했으며 새 외부 의존성·제작자 endpoint·공유 키·DB·telemetry·자동 백엔드가 없다. 기본은 합성 데이터 또는 필수 설정 누락의 안전한 실패다. `/tiles/`는 빈 주소·미동의에서0 요청이며 새 Web 회귀가 이를 재검사한다.
- v2 타일·context와 glyph 서버는 명시적 운영자 opt-in, loopback, 원장A/기한/원본SHA·시점/컴파일 원문SHA/세대SHA·capability 검증을 유지한다. 지역 상세와 context의 기존 성공본을 보존했다. 신규 coastline 공급원은 공식 HTML만 읽었고 원장 승격·자료 다운로드·auto collection을 하지 않았다. 원본PBF/MBTiles/폰트/OFL glyph/실지도 screenshot은 ignored 저장소에만 있다.
- generation/style revision/glyph hash URL에만 immutable 캐시를 적용한다. mutable alias·다른 세대에 최신 자료 fallback·범용 proxy·공유 API endpoint는 없다. glyph gzip 캐시는 byte bound와 원본 hash 검사 뒤에만 사용한다. 캐시가 있다는 사실을 무료 공개 호스팅·영구 retention·운영 SLA로 표현하지 않는다.
- production QA 도구는 public SDK exports를 로컬 bundle로 만들고 환경변수 주입·외부 asset import를 차단한다. loopback 정적 서버와 운영자 타일 서버만 연결한다. 도시 보존 수정 후 최종240화면 검사의 예상 밖 origin/HTTP/page 오류는0이다. 최종30cold/warm p95는2,934/1,493ms로이번호스트 목표를 통과했고, 별도1,000marker의56frame delta p95는116.7ms로목표33ms에 미달했다. matrix의11delta는불충분 표본으로 보존한다. 프로파일 수정 전 cold3,071ms/warm1,570ms·별도47delta p95150ms 실패도 이력으로 남기며 임계값을 낮추지 않았다. 실제 운영자 연결 예제9화면도 browser style12/tile73/glyph333·예상 밖/HTTP/page/console 오류0과 종료 정리를 확인했다. 단일 호스트/loopback 관측을 전체 장치 성능·OS egress 보증으로 확대하지 않는다.
- `pnpm check`와 Web24 E2E, SDK5 tarball의 데이터/원본/비밀·비용 스캔, byte 동일 재빌드, 격리 Web 설치·SSR·브라우저의 외부 요청0이 통과했다. 격리 Native offline 설치·앱타입·plugin/JS export는 부분 통과지만 상위 RN 선언 전체 검사3건은 실패다. Android workspace debug의 offline compile은 기기 실행·현재JS 내장·Native OS egress를 증명하지 않는다.
- metadata 라이선스645개와 strict 경계를 확인했다. runtime26개 수정/추가는 팀이 직접 작성한 MIT 코드·합성 fixture·공식 API adapter로 개별 검토한 경로만 출처 SHA를 갱신했다. 기존 미수정 원장과 제3자 payload 금지는 보존했다. 공식 attribution href를 확인하는 QA의 exact URL만 offline assertion으로 검토했고, 새 coastline host는 docs-only 허용이다. 실제 비밀 패턴·runtime endpoint 검사를 완화하지 않았다.
- `pnpm audit`는 high2/critical0·exit1이며 공개 차단이다. 공식 지원 수정·Native 기기/상위 타입·해안선·전국/장기 성능이 남아 있다. audit ignore/continue-on-error, paid runner/EAS/cloud/remote cache/cron/artifact 업로드/배포/발행·GitHub 원격 쓰기를 추가하지 않았다. SDK 코드 배포와 운영자의 지도·검색·라우팅 서비스 비용은 계속 분리한다.

최종 커밋 전 검사에서 작업 트리342파일·index342blob·도달 가능한 로컬26커밋/739blob과 실제5개 tarball의 정적 findings는0(`PASS_STATIC_ONLY`)이다. staged 데이터 검사16원천/342파일과 diff 검사도 통과했다. 결과는 ignored `artifacts/map-quality-final-cost.json`, 커밋 식별은 [진행 기록](progress.md)의 최신 단계를 따른다. 정적 findings0·브라우저 외부 요청0을 모든 Native OS 트래픽·운영자 청구 설정·상용 서비스 전체 검증으로 확대하지 않는다.

## 후속 1단계 — 2026-10-20 KST

[보안·타입 조사](research/security-types-validation.md)에서 공식 registry·advisory·지원 버전을 재확인했다. high2/critical0와 공개 선언 오류는 유지된다. Web/Native 독립 소비 명령이 PARTIAL_PASS를 exit0으로 넘기던 결함을 수정해 실패/미실행에서 발행을 차단한다. 정상 Bundler/core/SSR/browser·Native 앱/plugin/JS 결과와 source commit·진단은 보존한다. 키·제작자 서비스·SDK 의존성·lockfile·기본 provider·CI runner/발행 승인 조건은 바꾸지 않았다. 공식 MapLibre tarball 및 실진단/프로파일은 ignored artifacts에만 있다.

사용자는1·2단계의 공개 commit/PR·main merge를 승인했다. 실패 감사/선언을 억제한 병합이나 npm/Release/운영 배포는 승인 범위로 확대하지 않는다. 이번 독립 Web 브라우저의 외부 요청0은 OS 전체/Native 실행 감사가 아니다. 최종 staged·로컬 이력·실제5tarball 비밀/비용 스캔은 단계 커밋 전에 실행한다.

## 후속 2단계 — 2026-10-20 KST

최종 staged 데이터 검사16원천/348파일과 diff 검사를 통과했다. 작업 트리348파일·index348blob·도달 가능한 로컬29커밋/820blob·실제5tarball의 정적 findings는0(`PASS_STATIC_ONLY`)이다. ignored `artifacts/performance-step2/cost-final.json`에 결과를 보존한다.

[성능 기록](research/map-performance-validation.md)의 Web query/DOM/index·예제 idle 변경은5개 기존 자체MIT runtime 경로만 개별 검토·SHA 갱신했다. 새 dependency/lockfile·제작자endpoint·credential·기본 서비스·외부 Provider·다운로드·CI/과금 설정은 없다. Web25 E2E·격리 tarball 브라우저·실제 서울 unprofiled/profile 검사에서 예상 밖 외부 origin0을 확인했다. profile은 opt-in 운영자 로컬 자료와 동일 loopback 소비자만 사용하고 CPU+trace를64MiB로 제한한다. 수집 report는NON_ACCEPTANCE/exit2, 기본성능 report는FAIL/exit1로 남겨 발행 수락과 혼동하지 않는다.

실지도/OSM·glyph/폰트·브라우저 screenshot·원본 trace는 ignored 저장소에만 있다. 새 Web tarball19,672B와 나머지4개 모두 pack 출처/비밀/비용 검사 및 byte 동일 재현을 확인했다. 독립 Web 전체 검증은 NodeNext 오류로exit1, 전체 의존 audit도high2로차단이다. 원격PR15의 Windows/macOS CI는 성공했고 audit/Linux 공개 타입은 실패하며 억제하지 않았다. 두 단계의 공개 PR 작업만 사용자 승인에 따라 수행하고 main 병합·기본브랜치 설정·npm/Release/운영 배포·유료 인프라는 실행하지 않는다. Static findings0이나 loopback Web 요청0을 Native OS egress/청구 설정/전체 보안 보증으로 확대하지 않는다.

## main 소스 통합·새 clone 비용 검증 — 2026-10-20 KST

사용자가 이후 다른 컴퓨터에서 clone할 수 있도록 현재 작업의 병합을 명시적으로 요청했다. 이에 PR15/16을 main에 각각 `8d068bf6935b0290001695071db66d3e754c81b3`·`49e8aac64d7b7f2de3236cfaaff2373da602999e`로 통합했다. 보안·타입·성능 실패를 유지하는 preview 소스 병합이며 발행 수락은 아니다. [clone 검증 기록](research/clone-validation.md)에 범위를 남긴다.

- 원격 main을 별도 빈 폴더에 clone해 frozen install(기존 store645재사용/다운로드0)·check·5pack·Web25 E2E를 통과했다. dev:web을 실제 실행한390px 브라우저의 외부 HTTP 요청/pageerror0도 확인했다. 로컬 폰트·Chromium·pnpm store는 기존 호스트 도구이며 다른 물리 PC/Native 전체 OS 결과로 확대하지 않는다.
- 실제 타일/font/glyph/원본·DB·환경/서명·개인기록·QA 자료는 복사하거나 Git에 넣지 않았다. 새 clone의 5개 tarball은 기존 검증 SHA와 동일하고, pack 내 정적 비밀/비용 findings0이다. 최종 문서 커밋 전에는 작업 트리/index/도달 이력·5개 실제 tarball을 다시 스캔한다. 휴리스틱 통과를 모든 비밀 부재/계정 청구 보증으로 보지 않는다.
- runtime·SDK 의존성·lockfile·기본 provider·공유 키·제작자endpoint·CI runner/발행 조건 변경이 없다. main push는 Foundation CI만 실행하며 npm은 manual/main/enabled/approved SHA/보호 환경/전체 감사 조건을 유지한다. npm publish·Release·tag·운영 배포·visibility 변경·유료 인프라를 실행하지 않았다. 실제 audit는 high2/exit1이며 그대로 실패한다.
- 기본 브랜치 변경 도구가 커넥터에 없어 gh API로 main 설정을 시도했지만 HTTP403(Resource not accessible by integration)으로 거부됐다. 권한 우회는 하지 않았고 기본 브랜치는 여전히 `chore/project-policy`다. 명시적 `git clone --branch main`을 안내한다. 이는 과금·발행 설정 변경을 요구하지 않는다.

최종 문서 커밋 전 작업 트리349파일/index349blob/도달 가능한 로컬32커밋838blob·실제5tarball 정적 스캔은 `PASS_STATIC_ONLY`/findings0이다. 새 main CI `49e8aac`는 Windows/macOS 성공, audit high2 및 Linux 상위 NodeNext TS2834 실패로 종료됐으며 억제하지 않았다. 문서 변경 이후 CI 결과는 별도 실행에서 판단한다.

## 우선순위 10단계 — 01 보안·CI — 2026-10-21 KST

[10단계 실행](ten-stage-plan.md)은 사용자의 단계별 commit/PR/main 반영과 지정 대상 배포 요청에 따른다. 이번 단계는 공식 registry/advisory의 읽기 전용 재확인 및 실제 pnpm audit/why와 CI 격리 수정이다. 재조사시각은22:13 UTC/07:13 KST, high2/critical0·exit1이며 안전한 공식 수정 경로를 확인하지 못했다. 원문·실행 메타데이터는 ignored `artifacts/ten-stages/stage01`에만 보관한다.

일반 Foundation CI에 표준 Ubuntu Web/Native 소비 job을 분리했다. 모든 기존 audit·선언·Web/geo/routing 검사를 유지하고 needs/조건부 skip/continue-on-error를 추가하지 않았다. 표준 runner 실행량은 늘지만 유료 runner·cache·artifact upload·cron·shared service·제작자 키를 추가하지 않는다. SDK/lock/기본Provider·npm 발행 workflow는 그대로다. 초기 install/보안 metadata 조회는 공개 registry이며 유료 지도 호출과 구분한다. 계정 과금 제한과 모든 OS egress를 정적 검사만으로 보장하지 않는다.

단계01의 보안 수락은 BLOCKED다. 단계별 소스 통합 승인을 실패 감사 억제·npm 최초 발행·불명확한 외부 호스팅 활성화로 확대하지 않는다. 배포 대상 선택 전에는 준비와 검증을 진행하고 외부 배포 결과를 만들어내지 않는다. 최종 staged/작업 트리·이력·실제5tarball 정적 감사는 commit 전에 실행한다.

## 우선순위 10단계 — 02 공개 타입 — 2026-10-21 KST

Native 공개 index의 공식 GeoJSON 보존 참조와 @types/geojson7946.0.16 dependency 승격을 개별 검토했다. runtime 실행문은 그대로이며 manifest/lock은 기존 버전의 importer 역할만 바꾼다. 새 Provider·URL·계정·data/font payload가 없다. Native sourceSHA1개만 갱신했다.

실제 소비 verifier에서 직접 GeoJSON 타입 주입을 제거하고 설치된 Native tarball의 전이 의존성으로 해결하도록 했다. SDK 자체의 strict Bundler/NodeNext 선언2개는 통과했지만 전체 RN 선언3건은 기존대로 PARTIAL_PASS/exit1이다. 신규 공식 TypeScript/React Native 근거 host2개는 문서에만 허용하며 코드/runtime의 같은 URL을 거부하는 회귀로 비용 경계를 유지한다. 초기 pack의 미검토host/sourcehash 실패는 근거와 함께 보존하고 루트 개별 검토 후 다시 검사한다. CI·발행 승인 조건·기본 외부 요청은 변경하지 않는다.

## 우선순위 10단계 — 03 브라우저 QA — 2026-10-21 KST

SDK/예제/Provider/lockfile 변경 없이 합성 데이터 browser QA를 추가했다. 로컬 실제 Chromium25와 선택형 Chromium/Firefox/Linux WebKit12가 통과했고 외부 origin/page 오류는0이다. 20회 반복 정리·실제PNG는 확인했으나 전체GPU/worker메모리·장기운영·실기기 결과로 확대하지 않는다.

공식 Playwright payload와 서명/SHA 검증된 최소 Debian 사용자 전용 라이브러리는 ignored 저장소에서만 사용했다. 환경별 실패와 해당 WebKit 실행에서만의 독립 loader 검증/표준 preflight 미사용을 그대로 기록한다. SDK/실행기/CI 기본에는 우회 환경값을 넣지 않았다. 두 공식 문서 host는 docs-only로 검토하고 같은 host의 runtime URL 차단 회귀를 유지한다.

일반 Foundation CI의 세 브라우저 matrix는 표준 Ubuntu·공식 설치와 Xvfb만 사용한다. 공개 repository의 표준 runner 외 유료/GPU runner·새 계정·cache/artifact upload·schedule·배포·지도 endpoint를 추가하지 않는다. 기본 SDK 설치/테스트가 브라우저 다운로드나 OS 의존성을 요구하지 않으며 선택형 QA와 서비스 운영 비용을 분리한다. 원격 CI는 해당 실제 결과를 따르며 미종료를 성공으로 처리하지 않는다.


## 우선순위 10단계 — 04 프레임 증거

QA 보고서의 실제 context 속성 수집은 측정·선택형 profiler 정지 뒤 한 번만 수행한다. 기본 SDK 실행과 네트워크·비용 경로를 변경하지 않는다. 환경값은 ignored 로컬 보고서만 기록하고 외부 전송하지 않는다. 소프트웨어 GPU 단일 비교가33ms 목표를 통과하지 못했으므로 임시 SDK 설정을 제거했다. 실제 지도/glyph/PNG는 Git/npm에서 제외하며 프로파일링/하드웨어 미확인을 성능 수락으로 바꾸지 않는다.


## 우선순위 10단계 — 05 Android APK

선택형localtool을명시적으로설정한격리tarball APK빌드만수행했다. offlineGradle335tasks와내장Hermes/ELF/rawZIP검증은PASS_BUILD_ONLY이며전체RN선언/OS네트워크/기기/바이너리고지수락은미완료다. 기본pnpm check에는가짜APK단위회귀만연결하고JDK/SDK/Gradle/EAS/기기/클라우드요구를추가하지않았다. no-shell/PID시작시각확인·출력/시간상한을사용하나PPIDpolling이모든재부모화자손을발견함을보장하지않는다. 실제APK·번들·프로젝트는ignored로보존하고Git/npm에넣지않았다. 외부배포·유료runner·새endpoint·서명키없음.


## 우선순위 10단계 — 06 공공 POI 파일 입력 보호

private ETL CLI가 data/raw 밖으로 이어지는 symlink/junction·일반파일 아닌 입력·크기초과를 거부하고 단일 fd로 읽는다. 합성 Vitest188/19·실제 Docker PostGIS19·compiled CLI 링크 거부3개 PASS. 공식8원본 URL은503, 실제CSV 미확보로 실자료통합 NOT_RUN. SDK기본요청·제작자서비스·유료인프라·외부원본payload를추가하지않았다. 실패한수락과선택형운영비용은그대로유지한다. 상세조건은 [단계보고서](research/stage-06-poi-ingestion.md)를따른다.


## 우선순위 10단계 — 07 한국어 검색·라우팅 품질 평가

최소100고유한국어질의와30경로의 독립정답·출처·권리·기간을 검사하는 offline 평가 도구다. 합성결과는 NON_ACCEPTANCE/releaseAcceptance:false다. Node14개 PASS, 자료없는 실제실행 NOT_RUN/exit2. 한국어질의 희석과 syntheticID 보고서 유출 회귀를 포함한다. SDK기본요청·제작자서비스·유료인프라·외부원본payload를추가하지않았다. 실패한수락과선택형운영비용은그대로유지한다. 상세조건은 [단계보고서](research/stage-07-service-quality.md)를따른다.


## 우선순위 10단계 — 08 타일 CRC·MVT 무결성

모든archive행의 bounded gzip CRC/끝·MVT protobuf/geometry를 검증한다.4096fragment 상한과BOM이름보존으로 우회/과다할당을 거부한다. javac의 암묵적상위소스 컴파일도 제거한다. tile39회귀 PASS; 실제기존9archive/2348tiles 모두PASS·archive/PBF SHA불변. Java v1 40/v2 85·codec78tile267feature PASS, 새compile의 MBTiles byte동일. SDK기본요청·제작자서비스·유료인프라·외부원본payload를추가하지않았다. 실패한수락과선택형운영비용은그대로유지한다. 상세조건은 [단계보고서](research/stage-08-tile-integrity.md)를따른다.

처음통합검사에서미검토공식docsURL2건으로감사가실패했다. JDK21 javac옵션과NaturalEarth약관host를문서전용으로개별검토하고같은host의runtime URL거부회귀를확장했다. 이는신규지도원본A등록이나수집허용이아니다. 기존실패로그를보존하고수정후전체검사를재실행한다.


## 우선순위 10단계 — 09 릴리스 운영 조건 사전검사

clean 최종SHA와24h이내 완료된 감사/소비/registry 근거·5tarball·버전·검토된workflow를 검사한다. 기본은로컬만, 명시적GitHub옵션은GET만 수행하며 publicationAuthorized:false다. preflight16개 PASS, 원격main조회실패·주석처리된발행guard·Native부분성공우회3건 회귀포함. 실제실행 BLOCKED/exit1을 유지한다. SDK기본요청·제작자서비스·유료인프라·외부원본payload를추가하지않았다. 실패한수락과선택형운영비용은그대로유지한다. 상세조건은 [단계보고서](research/stage-09-release-preflight.md)를따른다.

최초미발행0.1.0기준선정리는기존CHANGELOG정책과사용자요청에따라3개기록본문을보존/소비했다. package버전·lock·발행workflow·보호조건은미변경이다. preflight의pending음성검사는삭제된실파일대신독립합성frontmatter로유지한다. 현재원격/보안/소비근거가없으면여전히BLOCKED다.


## 우선순위 10단계 — 10 최종 회귀와 정적 배포물

SDK를 바꾸지 않고 합성 정적 export의 OS필수환경만 전달하며 operator/public provider·NODE_OPTIONS·npm인증/proxy와실제.env주입을차단한다. 준비/검증도구 자체에는 다운로드·유료계정·원격write·자동배포가없다. 선택형브라우저 smoke는 loopback origin만허용하고7route외부요청0/pageerror0을확인했다. CSP/파일경계·크기·확장자/비밀정보·URI와실제browser증거를분리한다. 정적휴리스틱과browser관측은모든동적코드·OS트래픽·향후요금/호스팅계정정책을증명하지않는다.

실제Nextpolyfill3버전의공식tarball SRI·LICENSE SHA와 MapLibre main/worker sourcemap의17개런타임정확버전/고지를검토해31notice를함께보존한다. 기존SDK MIT·MapLibre BSD·의존성권리를분리하고지도/폰트/이미지/타일/개인자료를배포하지않는다. sourceDirty=true candidate는최종clean릴리스근거가아니며최종main에서다시생성해해당SHA를기록한다. 5npm tarball재현/격리소비의부분성공은Web/RN전체선언실패를해제하지않는다. actualaudit high2/critical0·exit1을유지한다.

배포대상응답이없어실제외부배포NOT_RUN이다. GitHubPages조회404는활성사이트/설정권한으로간주하지않았다. origin root전용site를후속운영자가선택한호스트에올릴때HTTPS·MIME·nosniff/CSP·캐시·권한/쿼터/비용을검증해야한다. GitHub main소스통합은외부배포가아니며npm·tag·Release·visibility·서버설정을변경하지않았다.

## 2026-10-21 — 정리 명령의 운영자 자료 보존

`pnpm clean`에서 `artifacts/` 전체 삭제를 제거했다. 운영자 타일·DB 설정·검증 기록·패키지·별도 worktree는 유지하며 명시한 SDK/service/example 생성물과 임시 브라우저 결과만 삭제한다. 모든 대상의 링크·junction 경로를 먼저 검사한다. 동시 파일시스템 변조에 대한 OS 격리를 주장하지 않는다. 새 외부 요청·의존성·키·유료 서비스·워크플로 권한은 없다. 합성 파일로 실제 정리 entrypoint와 거부 시 보존을 검증하며 실제 운영자 자료를 삭제하는 시험은 하지 않는다. 기존 보안·타입·공개 발행 차단은 유지한다.

## 2026-10-21 — 공개 타입 계약 및 보안 재조사

격리된 실제 Web tarball의 사용자 정의 레이어 계약을 strict/skipLibCheck:false로 검사한다. 기존 metadata 준비 이후 offline install, SSR 및 loopback Chromium smoke를 유지한다. SDK/Provider/의존성 버전·실행 endpoint·설치 hook·발행 workflow는 바꾸지 않는다. 공식 자료 재조회와 선택형 조사 compiler는 개발 조사 범위이며 SDK 기본 요청에 포함되지 않는다. 새 레이어 계약 성공은 Web NodeNext TS2834·RN 선언 세 오류·full audit high 2건을 해제하지 않는다. 근거는 [Web](research/web-declaration-compatibility.md), [Native](research/native-types-followup.md), [보안](research/security-followup.md)에 구분했다.

## 2026-10-21 — 공식 공공 POI 접근 검사

기본 SDK 요청 없이 운영자가 private probe를 명시적으로 실행할 때만 기존 A 3개 공식 상세 URL을 조회한다. 기본 3회, `--retry-once`도 최대 6회이며 429/502/503/504·유효한 5초 이하 Retry-After만 재시도한다. 401/403·redirect·timeout·network/본문 정리 실패는 중단한다. 기본 metadata 검사와 원본 다운로드/저장·실제 ETL을 구분한다. 응답 본문·원시 MIME/Retry-After·오류·키를 기록하지 않으며 고정 MIME/사유만 보존한다. 실제503 원본 미확보를 성공으로 바꾸지 않는다. Provider·데이터 등급·SDK·제작자 계정·유료 경로는 추가하지 않았다.

통합 첫 감사는 새 세 고정 URL을 미검토 실행 주소로 차단했다. 세 주소는 기존 A 원장의 개별 공식 상세 페이지이며, `scripts/verify-real-poi.mjs`의 명시적 metadata probe에서만 쓰이는 것을 코드/호출 경로로 검토했다. `OPERATOR_PROBE_URLS`는 해당 파일과 정확한 세 문자열에만 적용한다. 같은 주소를 SDK에 넣거나 query/다른 자료 번호로 바꾸면 계속 거부하는 black-box 회귀를 추가했다. 도메인 전체 허용·공공데이터 등급 변경·SDK 기본 endpoint 허용은 아니다.

## 2026-10-21 — Android APK 고지 후보 조사

기존 로컬 APK·동일 build 생성 bundle과 선택 Maven cache만 읽어 조사했다. 원문/파일을 추출·재배포·Git/npm에 포함하지 않고 후보 이름·크기·해시·제한된 UTF-8 분류만 기록한다. 256개 목록/64KiB 본문 상한 이후에도 모든 ZIP entry의 raw CRC를 유지한다. 기존 APK 19 native/3 model/5 notice 후보는 고지 적합성 증명이 아니며 MLKit 별도 약관과 완전한 resolved graph 검토가 남는다. payload PASS, licenseCompliance:NOT_EVALUATED, distributionReady:false를 분리한다. SDK·Provider·계정·요금·네트워크/업로드·CI 권한 변경 없이 기존 발행/플랫폼 차단을 유지한다.

## 2026-10-21 — Native 소비 검사 registry 준비

새 Runner의 public software metadata 누락으로 strict 검사가 실행되지 않는 문제를 수정했다. verifier는 consumer 전용 빈 cache에서 공식 npm registry를 명시해 lock을 준비한 뒤 `--offline --frozen-lockfile --ignore-scripts`로 설치한다. 준비 단계와 offline 설치를 별도로 기록하고 전체 흐름이 offline이라고 주장하지 않는다. SDK import/설치 시 제작자 Provider에 연결하거나 새 package/version을 채택하는 변경이 아니다.

`REGISTRY_METADATA_URLS`는 `scripts/verify-native-consumer.mjs`와 해당 회귀 파일의 정확한 공식 registry 문자열만 검토한다. SDK 재사용·다른 registry/path/query는 계속 차단하고 자격증명 검사는 독립 유지한다. 비용 회귀는 22개 통과했다. CLI는 원래 검토된 패키지 graph·tarball·strict 선언·hook 금지·기존 uuid override와 최소 릴리스 경과시간을 유지한다. 공백/작은따옴표/Windows 경로 직렬화도 보호한다. 과금 서비스·키·Provider·외부 배포/CI 권한은 추가하지 않았으며 보안 high 2건과 Web/RN 전체 선언 실패는 발행 차단이다.

## 2026-10-21 — 실제 브라우저 모듈 시작 동기화

private Playwright 검사에서 Next dynamic module의 실제 부착과 지도 ready를 분리한다. 로컬 build manifest에서 식별한 map-demo chunk만 loopback에서 보류하는 회귀를 추가하며 기존 외부 요청 차단을 유지한다. 명시적 navigation 상한과 기존 테스트 상한은 유지하고 ready 기본 5초·성능 gate·CI 권한은 완화하지 않는다. 단계별 진단은 민감 위치·원문·인증정보를 포함하지 않는다. SDK·예제 runtime·Provider·dependency·npm payload·외부 호스팅·요금 경로는 바뀌지 않는다. 실제 main의 새 실패와 작성 중 helper 오류를 보존하고 수정 뒤 실행을 별도로 기록한다. 기존 high 2건·공개 타입·데이터·라이선스·발행 차단은 해제하지 않는다.

## 2026-10-21 — 전체 초기화 기능 상한과 실패 진단

후속 7은 위의 기본 5초 assertion 정책을 기존 문서의 전체 10초 기능 상한으로 대체한다. navigation·실제 부착·ready·초기 100마커가 하나의 상한을 공유하며 SDK·실제 성능 gate는 바꾸지 않는다. 제한된 합성 상태/단계/경과시간 진단과 로컬 Worker 보류·실패 회귀만 추가한다. 실제 오류를 재시도·reload로 숨기지 않는다. 조사용 공식 Playwright browser는 명시적 개발 명령으로 ignored 저장소에만 준비했으며 SDK 설치/실행의 다운로드나 유료 서비스 요구로 추가하지 않았다. 기존 검증된 authenticated Xvfb·TCP 차단을 사용한다. 원문·키·개인정보·실제 지도/폰트 payload·제작자 Provider·새 CI 권한·배포/발행 경로는 추가하지 않는다. 원래 CI 지연의 근본 원인은 미확정이며 기능 상한 통과를 실제 성능/Native/릴리스 수락으로 표현하지 않는다.

## 2026-10-24 KST — 다른 컴퓨터의 Codex 인계

인계 문서와 복사용 사용자 요청문만 추가하고 설치·정상 main 소스 병합과 운영 배포/npm/Release·공개/과금 설정의 권한을 구분한다. repo 문서 자체를 새 승인으로 해석하지 않는다. 기본 fixture에는 제작자 키·DB·tile/search/routing backend·유료 계정을 요구하지 않는다. 최초 의존성 설치는 공개 npm 네트워크를 사용하며 준비된 store의 offline 검사를 최초 전체 offline 설치로 표시하지 않는다. 새 clone에는 운영자 원본·폰트·DB·자격증명·APK·QA artifacts를 복사하지 않는다.

새 전체 dependency audit는 high2/critical0/exit1이며 현재 node-forge/Zod를 보고했다. 과거 braces 결과를 최신 감사로 재사용하지 않고 현재 미보고를 수정/안전 증명으로 간주하지 않는다. 예외·suppression·override·버전/lockfile·CI 권한·배포/과금 경로를 변경하지 않았다. 인계와 clone 검사는 SDK/플랫폼/실제 데이터/라이선스의 전체 수락이 아니며 기존 발행 차단을 유지한다.

## 2026-10-24 KST — Windows 개발 설치와 UTF-8 검사

기존 lockfile의 `@img/sharp-win32-x64@0.35.5`에 한정해 실제 Apache LICENSE·LGPL/전이 고지·DLL/version 목록을 검토했다. [근거와 파일 해시](research/windows-license-review.md)를 보존하며 다른 이름/버전/표현식을 계속 거부한다. 메타데이터 수락은 바이너리 배포 승인이나 취약점 수락이 아니다. SDK 의존성·runtime·Provider·발행 workflow·lockfile을 변경하지 않았다.

Python 실행기의 UTF-8 모드는 한국어 Windows의 문서 검사 오류를 해결하며 검사 범위나 비밀정보 규칙을 완화하지 않는다. 공식 pnpm/Playwright 및 OFL Noto CJK KR 준비는 명시적인 개발 도구 준비이며 ignored 로컬 경로에만 보관한다. Noto 글꼴은 현재 Windows 세션에 로드했고 시스템 파일/registry는 변경하지 않았다. 제작자 API·키·과금 계정·기본 외부 요청을 추가하지 않았다. 새 전체 audit는 high2(node-forge/Zod)로 기존 발행 차단을 유지한다.

Windows 전용 manifest 키 정규화는 정확한 지도 모듈 1개만 선택한다. 모호한 키·위험 경로를 거부하고 기존 chunk 크기/내용·loopback 제한·시간 상한을 유지한다. 네트워크 허용 범위와 SDK 동작 변경은 없다.

감사기의 CRLF 처리는 정확한 기존 package 메타데이터 fragment에만 적용한다. 같은 URL을 scripts에 넣는 부정 검사와 실제 오류 줄 번호를 LF/CRLF 모두 확인했다. 외부 호스트/실행 endpoint·비밀정보 허용 목록은 불변이다. Windows fixture 보완은 raw ZIP 위험 이름, 실제 junction, 파일 URL preload를 검증하며 파일 링크 권한을 우회하거나 OS 보안 설정을 변경하지 않는다. 미실행 파일 링크/POSIX 프로세스 검사는 별도로 남긴다.

최종 전체/pack 정적 감사는 worktree401·index401·history blob1023/commit71, findings0이다. 5개 SDK tarball은 기존 main CI와 동일한 SHA256이며 새 native binary/폰트/자료를 포함하지 않는다. 실제 Web 소비 smoke 외부요청0/pageerror0과 정적 결과를 구분한다. 전체 dependency audit high2 및 플랫폼/데이터/발행 차단은 유지한다.

## 2026-10-24 KST — 독립 검증의 실행 환경 기록

검증 도구가 공개 runtime 식별값과 실제 pnpm 버전만 보고서에 기록한다. OS 사용자명·hostname·환경변수·설치 경로는 수집하지 않으며 버전 명령의 임의 출력도 저장하지 않는다. 시작/종료 시각은 검증 시도 구간이며 gate 통과·cleanup 성공의 대체 증거가 아니다. SDK·Provider·dependency/lockfile·네트워크/과금/CI 권한·발행 정책과 제3자 payload는 바꾸지 않는다. 실제 독립 소비 재실행은 기존 명시적 npm metadata 준비 및 loopback smoke 범위다. 기존 high2와 공개 선언 실패는 계속 릴리스 차단이다.

실제 재실행은 두 보고서 모두 win32/x64·Node24.19.0·pnpm12.14.0을 기록했고 Web 외부요청0/pageerror0이었다. 전체 check/pack의 비용·출처 감사 findings0, 5 SDK tarball hash는 기존과 동일하다. Windows 기존 skip과 Native 기기 미검증, 전체 선언 exit1을 유지한다.
