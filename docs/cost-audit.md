# Zero Publisher Cost — 보안 및 비용 경로 감사

현재 상태는 마지막 「모노레포 foundation 감사」를 따른다. 아래 1~8절은 SDK 구현 전 정책 단계의 증거와 출시 절차다. 현재 일부 코드/실행 증거가 추가됐지만 Native 실빌드와 보안 미해결 2건으로 제품 출시는 차단된다.

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
