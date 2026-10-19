# Zero Publisher Cost — 보안 및 비용 경로 감사

감사일: 2026-10-19 (UTC). 대상 브랜치: `docs/zero-publisher-cost`. 기준 설계 커밋: `e832012f341c41f6670ba27c423195f97ad927d1`. 정책: [AGENTS.md](../AGENTS.md), 설계: [ADR-009](decisions/009-zero-publisher-cost.md), 책임 구분: [README](../README.md).

**현재 판정: 정책·정적 감사 통과, 제품 설치/실행/테스트 네트워크는 미검증. SDK 발행·데모 운영 배포 승인이 아니다.** 현재 package.json, SDK 런타임, 실제 npm tarball, 배포된 데모, GitHub Actions workflow가 없다. 따라서 제작자 과금 endpoint 요청이 없다는 실행 결과를 만들어 보고하지 않는다.

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
