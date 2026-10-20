# 10단계 실행 결과 — 2026-10-21 KST

요청한 우선순위별 작업을 독립 commit/PR과 일반 merge로 main에 반영한다. 아래는 소스 반영과 실제 수락 상태를 분리한 보고서다. Android 물리 기기와 macOS/Xcode iOS는 이번 범위 제외이며 통과가 아니다. 전체 개발 정책은 [AGENTS](../../AGENTS.md), 단계별 구현·파일·검사·실화면·권리/보안·잔여·Git·다음의 8항목은 [진행 기록](../progress.md)을 따른다.

## 소스 반영

| 단계 | PR | 구현 commit | main merge |
| --- | --- | --- | --- |
| 01 보안·CI 격리 | [PR#18](https://github.com/kasa500000-png/KoreaMap/pull/18) | `4914fbc681fca9fd0cec3b24574b735d836494e7` | `9db22c21f68509aaa1e242bd78e969805121559e` |
| 02 Native 공개 GeoJSON 타입 | [PR#19](https://github.com/kasa500000-png/KoreaMap/pull/19) | `2196e7254126178c402c0bdeac7d3d6995983582` | `469bb3c5958b00e639c5d0f0df9c3f4c93d822d2` |
| 03 3브라우저·생명주기 | [PR#20](https://github.com/kasa500000-png/KoreaMap/pull/20) | `05da9d8808ffefef842208ba5102d6261c859cb4` | `5f5c58ff7dcd92957500f87a62929c97276f42cc` |
| 04 실제 프레임 환경 기록 | [PR#21](https://github.com/kasa500000-png/KoreaMap/pull/21) | `b6bdd4ca88fdbee1d066da357329c4df459a0b9f` | `729bf19bea53adc6aad4810bba8dd77fff5f2a8f` |
| 05 독립 Android APK | [PR#22](https://github.com/kasa500000-png/KoreaMap/pull/22) | `e200b48501fc584f7dd001cb93ee5a5f109754e2` | `df6ceefb1ba038047b35fa9a20374242d009ef17` |
| 06 POI 입력 보호 | [PR#23](https://github.com/kasa500000-png/KoreaMap/pull/23) | `6b2317b17b8306081a45ec27c02e241e4b14bee1` | `728189c1051d78e0bb18a88b5cda348c8765282a` |
| 07 한국어 검색·경로 평가 | [PR#24](https://github.com/kasa500000-png/KoreaMap/pull/24) | `119c2e198413e2f8a74e2270feeff8f1fffdecb1` | `742794345fc23985095bab49af5685338ea56a4e` |
| 08 타일 무결성 | [PR#25](https://github.com/kasa500000-png/KoreaMap/pull/25) | `ab921343fcbe8fabd342353ed302bd6412a12aea` | `cee3fd410e86f25c44507e81c797c945bdaeee39` |
| 09 발행 사전검사·0.1 기준선 | [PR#26](https://github.com/kasa500000-png/KoreaMap/pull/26) | `c2271334a62aa162e5aba29ab6366abecafe00ed` | `eee4b2c3a4fa744aa2c06243a1ffda93ba816a66` |
| 10 최종 회귀·정적 배포물 | 이 보고서의 통합 PR | 아래 조회 명령 | 아래 조회 명령 |

10단계 구현 commit은 `git log -1 --format='%H %s' --grep='^chore: prepare verified fixture deployment$'`, main merge는 `git log -1 --first-parent --format='%H %s' origin/main`으로 확인한다. 자기 commit/merge SHA를 같은 commit 본문에 미리 기록하지 않는다. 실제 PR/최종 SHA는 사용자 완료 보고와 GitHub 기록에 제공한다.

```sh
git clone --branch main https://github.com/kasa500000-png/KoreaMap.git
cd KoreaMap
pnpm install --frozen-lockfile
pnpm check
```

현재 GitHub 기본 브랜치는 `chore/project-policy`다. 설정 변경은 기존 integration HTTP403으로 불가능했고 우회하지 않았다. 그래서 clone에 `--branch main`을 명시한다. 소스는 이미 Public이었고 이번 작업에서 visibility를 바꾸지 않았다.

## 검증된 개별 결과

- 각 단계에서 `pnpm check`를 통과한 보완을 반영했다. 최종 범위는 Vitest 188개, 코드 strict 타입·경계·출처·라이선스·문서·비용 및 비밀정보 회귀, SDK·Next·Expo JS 빌드다. 외부 라이브러리의 전체 선언 검사는 아래 별도 실패 게이트다.
- 최종 Chromium E2E는 **25/25 PASS**다. 390/768/1440px, 터치, 100/1000 마커, 4종 테마, 한글, 오류 복구, 종료를 검사했다. 별도의 Chromium·Firefox·Linux WebKit 각 4개와 20회 생명주기도 통과했다. 원격 세 브라우저 CI도 통과했다. Linux WebKit은 Safari/iOS 수락이 아니다.
- 격리 Native tarball의 공개 SDK strict Bundler/NodeNext, plugin, 양 OS JS export는 통과했다. 실제 오프라인 Gradle 335 tasks, APK 83,969,186B, Hermes 번들 일치, MapLibre ELF 및 1,330개 ZIP entry 검사는 **PASS_BUILD_ONLY**다. 보강한 raw ZIP 검사로 보존 APK도 재검증했다. 연결 기기/KVM 부재로 앱 화면·OS 네트워크·바이너리 고지는 미검증이다.
- 루트에서 실제 Docker PostGIS **19/19**, Valhalla **8/8**를 재검사했다. 자체 합성 데이터와 도로망을 사용하므로 독립 한국 정답 품질 수락과는 다르다.
- 현재 컴파일된 타일 검사기로 기존 **9 archive / 2,348 tiles**를 검사해 모두 PASS와 SHA 불변을 확인했다. 타일 회귀 40개, Java v1/v2 40/85개, 78 tile/267 feature codec 검증도 통과했다. 해안선·전국 생성 수락은 남는다.
- 5개 실제 tarball은 깨끗한 SDK 재빌드 후에도 byte 동일했다. 격리 설치와 Web Bundler/core/SSR/browser는 PASS지만 Web NodeNext는 FAIL이다. Native SDK 선언 2개는 PASS지만 전체 RN 선언은 FAIL이다. 두 verifier는 **PARTIAL_PASS / exit 1**을 유지한다.
- 최초 미발행 `0.1.0`에 이후 Changeset 3개 본문을 CHANGELOG로 보존·통합했다. 버전·fixed group·발행 workflow는 불변이며 실제 pending check는 PASS다. 실제 preflight 전체는 **BLOCKED / exit 1**이다.
- Runtime 출처 SHA는 Native 1개, ETL 2개, 타일 3개를 해당 diff 검토 후 개별 갱신했다. 실제 원본·폰트·타일·APK·개인 경로는 Git/npm에 넣지 않았다.

## 남은 수락·배포 차단

| 항목 | 실제 상태 | 다음 조건 |
| --- | --- | --- |
| 의존성 보안 | audit high 2 / critical 0, exit 1 | 지원되는 공식 수정 경로와 전체 감사 통과 |
| 공개 소비 선언 | Web TS2834, 전체 RN TS2411/TS2344/TS2416 | 상위 선언/지원 그래프 수정 후 두 verifier 전체 PASS |
| 실제 지도 프레임 | 1000 마커·5회·58 간격, p95 116.6ms > 33ms, FAIL | 고정 프로토콜 성능 개선과 하드웨어별 확인 |
| 실제 공공 POI | 공식 원본 접근 503, CSV 미확보 | A 원본 exact URL/SHA/header/CRS 기준점, 실적재·지도 검사 |
| 검색·경로 정답 | 도구 회귀 14개 PASS, 실제 자료 NOT_RUN | 권리 검증된 독립 한국어 100질의·30경로 관측 |
| 해안선·전국 | 후보 metadata 조사만 수행, disk 8GiB gate 미달 | 개별 A 검토, 충분한 운영자 볼륨, 생성·복구·coverage |
| Native 실행 | APK 빌드만 PASS, 앱·OS 네트워크·고지 미검증 | 실행 환경과 플랫폼 QA; 물리 Android/iOS는 이번 범위 제외 |
| npm/GitHub Release | 발행 주체·bootstrap/OIDC·보호 환경 미확인, default branch에 수동 workflow 미등록 | 관리자 설정과 전체 릴리스 게이트 충족 |
| 외부 배포 | 대상 미지정, NOT_RUN | 호스팅 대상·권한 확인과 경로/CSP/캐시/외부 요청 검증 |

실패를 성공으로 바꾸지 않았고 `continue-on-error`, 검사 제거, 브랜치 보호 우회, 유료 runner를 도입하지 않았다. 보안·Web·Native 선언은 독립 CI job에서 실패를 유지한다. 09단계 main 원격 CI에서는 Linux/Windows/macOS 및 세 브라우저 job이 통과했고, 위 세 실패 게이트는 그대로 실패했다. 소스 병합은 운영 배포나 npm 발행이 아니다.

## 정적 데모 배포물

[10단계 배포물 검증](stage-10-web-deployment.md)에 재현 명령과 실제 결과가 있다. 7개 합성 화면만 포함하고 제작자 키·DB·타일·검색·경로 서비스로 자동 연결하지 않는다. 환경 변수 제한, 파일 경계·크기, URL·비밀정보 검사, CSP와 실제 브라우저 외부 요청 검사를 함께 적용한다. 번들 라이선스 고지 31개와 파일별 SHA를 보존한다.

현재 배포물은 origin root `/` 전용이다. GitHub Pages의 repository subpath에서 바로 작동한다고 주장하지 않는다. HTTPS·MIME·nosniff/CSP·캐시·쿼터·요금은 선택한 호스팅에서 별도 확인해야 한다. GitHub Pages GET 404는 사이트 부재 또는 조회 불가 관측이며 배포 완료가 아니다.

사용자가 선택하는 지도·검색·라우팅 서버 운영 비용과 SDK 소스 제공은 구분한다. 기본 SDK 사용량이 제작자 API 사용량을 늘리는 경로를 추가하지 않았다. 표준 GitHub runner만 사용했고 유료 클라우드/EAS, cache/artifact upload, schedule, 새 서버 계정과 과금 endpoint를 추가하지 않았다. 정적 산출물은 ignored에 보관한다. 외부 배포·npm·tag·GitHub Release·visibility 변경은 실행하지 않았다.
