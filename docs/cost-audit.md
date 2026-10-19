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
