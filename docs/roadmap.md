# Korea Map Kit 로드맵

기준일: 2026-10-20 KST. [정책](../AGENTS.md), [아키텍처](architecture.md), [요구사항](requirements.md), [진행 기록](progress.md)을 기준으로 진행한다. 아래 M 단계는 최초 설계의 책임 구분이며 첨부 개발 로드맵 STEP 00~14와 일대일 번호가 아니다. 남은 실제 작업 순서와 완료 기준은 [실행 계획](execution-plan.md) A~G를 따른다.

## 기반과 현재 작업

- 03단계의 [브라우저/생명주기 QA](research/stage-03-browser-lifecycle.md)는 기존 Chromium25와 세 Linux 브라우저12 검사를 분리하고 실제PNG/20회 정리·표준 CI matrix를 추가한다. Safari/iOS·전체 메모리·장기 운영 수락과 구분한다.

- 현재 후속 작업은 사용자 요청에 따라 [우선순위별 10단계](ten-stage-plan.md)로 실행한다. 각 단계의 독립 commit/PR/main 반영과 지정 대상 배포를 준비하며, 실제 Android 기기·macOS/iOS는 제외 범위다. 기존 보안·타입·성능 게이트를 유지하고 완료·부분 성공·외부 차단을 구분한다.
- 01단계는 [PR18](https://github.com/kasa500000-png/KoreaMap/pull/18)로 CI 소비 게이트를 격리했으며 보안 high2는 미해결이다. 02단계의 [Native 공개 GeoJSON 선언](research/stage-02-public-types.md)은 SDK strict Bundler/NodeNext 검사를 개선하고 전체 RN/Web 상위 선언 실패는 유지한다.

- 2026-10-20 사용자가 다른 컴퓨터에서 clone할 수 있도록 현재 작업의 병합을 명시적으로 요청했다. [PR15](https://github.com/kasa500000-png/KoreaMap/pull/15)는 `8d068bf6935b0290001695071db66d3e754c81b3`, [PR16](https://github.com/kasa500000-png/KoreaMap/pull/16)은 `49e8aac64d7b7f2de3236cfaaff2373da602999e`로 각각 main에 병합했다. 이는 미완료 preview 소스 통합이며 보안·타입·성능·Native 수락 완료가 아니다. 현재 clone 방법과 새 설치 검사는 [clone 검증 기록](research/clone-validation.md)을 따른다.
- 저장소는 Public이고 SDK 전체 소스는 `main`에 있다. 기본 브랜치 `chore/project-policy`를 main으로 변경하는 요청은 GitHub 권한 부족 HTTP403으로 거부됐다. 따라서 `git clone --branch main https://github.com/kasa500000-png/KoreaMap.git`을 사용한다. 기본 브랜치 변경은 미반영이며 GitHub 관리 설정에서 별도로 처리할 수 있다. npm 발행·GitHub Release·운영 배포는 수행하지 않았다.

- 사용자가 승인한 후속1단계는 `fix/security-and-public-types`에서 [보안·공개 타입 검증](research/security-types-validation.md)을 수행했다. 공식 수정 버전이 없어 high2·상위 선언 오류는 BLOCKED다. 부분 통과가 exit0으로 전달되던 자동화 결함은 수정했다. 후속2단계는 별도 브랜치/커밋/PR에서 성능 병목을 개선한다. 병합 승인이 있어도 실패 검사를 우회하지 않으며 npm/Release/배포는 이번 승인 범위가 아니다.

- 후속2단계 `perf/map-interactions`에서 불필요한 Web query·탐색·DOM/React 작업을 줄이고 opt-in profile을 추가했다. [검증](research/map-performance-validation.md)은 실제100명령의 query100→0·Web25회귀 통과와 서울 fixed frame54표본/p95116.7ms 실패를 구분한다. 기본 지도 세부 정보·마커 수·프로토콜·33ms 목표는 유지한다. 1단계PR15 위의 별도 단계이며 보안/공개 타입 CI와 frame 수락은 계속 차단이다.

- 지도 가독성과 조작 경험을 `feat/map-quality`에서 구현했다. [Q0–Q5 품질 계획](map-quality.md)과 [ADR-010](decisions/010-map-quality-and-interactions.md)은 기존 M1–M7을 대체하지 않는 구체 실행 범위다. `design-v1`·기존 API를 보존하고 새 `design-v2`/cartography/interaction을 선택형으로 추가했다. [최종 검증](research/map-quality-validation.md)은 도시 보존 수정 후240화면·단일 호스트 로딩 목표 통과, 1,000마커 frame 목표 실패를 구분한다. Q4 성능 수락과 실제 기기·육지 마스크·전국 생성·보안 게이트는 남는다.

- 최초 릴리스 후보 시작점 `76b379b9dd2abbb6393e90f789a78ac2fd352762`와 `feat/korean-map-completion`·`feat/map-quality`·후속 1/2단계의 누적 소스는 현재 main의 조상이다. 기존 stacked PR을 자동 정리하지 않았으며, 현재 상태는 최신 진행 기록으로 판단한다. Web/Android/iOS와 SDK 5종 목표를 유지하며 Web Alpha는 중간 검증 단계다.

## 단계와 완료 조건

**P0 전체 MVP = M1 + M2 + M3 + M4.** 현재 Web/공통 계약 및 선택형 서비스 구현이 존재하지만 모든 플랫폼·실지도·보안 검증을 통과한 것은 아니다. 아래 표는 `76b379b`까지의 증거와 새 구현 착수 상태를 구분한다. 새 실행 결과는 [진행 기록](progress.md)에 연결한다. 서울 archive·glyph 및 현재 Native/실자료 검증 상태는 [실행 계획](execution-plan.md)과 [타일 가이드](tiles.md)에 구분한다.

| 단계 | 범위/우선순위 | 요구사항 | 완료 조건 | 상태 |
| --- | --- | --- | --- | --- |
| M0 | 기술 조사·설계 | 모든 요구사항의 설계 근거 | 링크·추적성·상호 일관성 검사 및 수동 리뷰 | 설계/ADR 존재; 현재 구현과 문서 정합성 갱신 진행 |
| M1 | 코어·버전 잠금·모바일 spike / P0 | R01 R02 R03 R12 Z01 Z02 Z03 Z07 Z08 Z09 Z12 | exact version/lockfile, 독립 core tests, Expo Android/iOS 최소 지도 실제 실행, 장비·메모리 예산 확정 | core/모노레포/JS export 및 이전 Android x86_64 APK·제한적 emulator 성공; iOS·실기기/예산 미완료 |
| M2 | Web SDK·React/Next 예제 / P0 | R04 R05 R06 R07 Z05 | 브라우저 카메라·피처·스타일·SSR/lifecycle 테스트; fixture를 실서비스로 표시하지 않음 | 구현·Chromium 19개 QA와 실제 타일 9화면·경로 통합 2화면 통과; Firefox/WebKit·물리 모바일 잔여 |
| M3 | 한국 타일·한글·자체 호스팅 / P0 | R08 R09 R10 R11 R17 Z06 | 시범 bbox/profile/schema·glyph·라이선스·XYZ smoke·실패 복구/rollback, 별도 환경 재현 | private Planetiler/MBTiles/XYZ 구현, 4지역 archive·BMP256 glyph·Chromium 실제 9화면·서울 activate/rollback 통과; 전국 디스크 차단, Native/다른 브라우저/전체 성능 미검증 |
| M4 | 모바일 parity·성능·MVP 패키징 / P0 | R13 R14 R15 R16 Z04 Z10 Z11 | Android/iOS 공통 수락 기준·실화면/접근성·성능·독립 패키지 소비·비용 감사 | bridge/5종 pack/Web 소비 검증; 새 Native 격리 설치·앱 코드/plugin/JS export 부분 성공, 상위 RN 선언 실패·실기기/iOS/glyph/OS egress 미검증·high 2 차단 |
| M5 | 검색·길찾기 adapter / P1 | R18 R19 | 자체 PostGIS POI·Valhalla 3모드의 정규화·품질·오류/취소·출처, provider 없는 회귀 | 구현·합성 DB/Valhalla 및 실제 한국 4경로→서울 지도 2화면·6오류 통과; 실제 POI/전국 주소·규모 품질 미완료 |
| M6 | 한국 공공 레이어·저장·직접 archive / P1 | R20 R21 R22 | 데이터별 권리·실파일·PostGIS query plan·선택 저장 격리·Native PMTiles range/cache | A CSV 3개 profile·합성 ETL/실파일 재검증 도구 구현; 공식 접근 HTTP503으로 원본 미확보, Supabase·Native PMTiles 직접 접근 미검증 |
| M7 | 고도화 / P2 | R23 R24 | 수요·품질 평가·운영 비용·기능별 근거 | offline/background 지속 GPS/고급 주소 검색·내비게이션 등 보류 |

모든 단계에서 N01~N07과 Zero Publisher Cost를 적용한다. 현재 한국 POI/Valhalla 확장이 존재해도 core나 기본 설치에 서비스가 필수가 되지 않는다. 고도화 완료는 0.x preview의 선행 조건이 아니지만 전체 플랫폼 목표의 필수 검증을 preview 표현으로 대체하지 않는다.

## 실행 순서와 중단 조건

1. A: 오래된 구현 전 문구·엔진 선택·schema·검증 범위를 정리한다. 과거 검증 로그는 당시 증거로 보존한다.
2. B/C: 보안 의존성 해결과 서울 한 지역 실제 OSM→Planetiler→HTTP XYZ·한글을 병행한다. 지원되는 안전한 수정 경로가 없으면 high 차단을 유지한다.
3. C 후 D/E/F: 울산·부산·제주/갱신·rollback, 실제 허가 POI 1종의 DB·검색·지도, 독립 Native 소비와 기기 QA를 진행한다. 실파일·환경이 없으면 해당 행은 미검증이다.
4. G: stacked PR 로컬 통합 예행과 최종 5종 소비·라이선스·보안·비용·실화면 회귀 결과를 정확한 SHA에 연결한다. 실제 전국 생성/기기 성능을 명령 제공·mock으로 대신하지 않는다.

## 릴리스와 승인

가능한 작업을 검토 가능한 브랜치·커밋으로 준비한다. 현재 저장소가 Public이므로 push/PR도 공개 업로드다. 이번 명시적 요청은 현재 preview 소스의 main 통합과 clone 문서 반영을 승인했으며, 실패 검사를 통과 처리하거나 npm/Release/운영 배포를 승인한 것은 아니다.

main 통합·기본 브랜치 정렬·공개 업로드·npm 발행·GitHub tag/Release·운영 배포는 각각 해당 구체적 결과의 명시적 승인 후 수행한다. 승인 전에 최종 tree·검증·tarball SHA/SRI·릴리스 노트와 외부 작업 절차를 준비한다. [릴리스 절차](releases/process.md)와 [후보 보고서](releases/v0.1.0.md)를 따른다.

## Zero Publisher Cost 적용

[ADR-009](decisions/009-zero-publisher-cost.md)와 [비용 감사](cost-audit.md)는 M1~M7 전체에 적용한다. 실제 타일·원천파일·폰트는 ignored 운영자 저장소에만 두고 기본 데모는 합성 fixture를 유지한다. SDK 설치·import·기본 테스트가 제작자 계정/유료 endpoint를 사용하지 않는지 실제 관측한다. 정적 검사·Web 요청0은 Native OS 전체 네트워크나 계정 청구 상태의 증거가 아니다.

## 이전 단계별 구현 기록

아래 절은 각 구현 당시의 범위·브랜치·제한을 남긴 이력이다. 현재 상태는 위 표와 최신 진행/검증 기록으로 판단한다.

## 모노레포 foundation 후속

`feat/monorepo-foundation`에서 사용자 지정 5 SDK / 2 예제 / 3 private 서비스 경계와 개발 도구를 구축한다. 실제 엔진 서비스는 아직 미구현이다. [개발 가이드](development.md), [도구 검증](research/monorepo-toolchain.md), [진행 기록](progress.md), [비용 감사](cost-audit.md)를 따른다. 아키텍처/비용 정책 PR이 미병합이라 이번 PR은 비용 정책 브랜치를 기준으로 비교한다.

Native 실기기/시뮬레이터, 수정 버전이 없는 전이 취약점, 실제 공공/OSM 데이터와 한글 glyph 검증은 남아 있다. foundation 기능 테스트와 M1/MVP 전체 완료 또는 출시 승인을 구분한다.

## 데이터 공급원 조사와 공개 차단

`feat/data-source-policy`에서 [공급원 조사](data-sources.md), [라이선스](data-licenses.md), [출처 표시](attribution.md), [데이터 원장](../data/sources.json)을 추가했다. M3/M6에 앞선 권리 검토로 A 6 / B 0 / C 8 / D 2개를 분류했으며, 실제 데이터 수집·DB·타일 생성은 완료하지 않았다.

M3는 OSM 공개 추출본으로 시작하고, M6는 개별 공공데이터 필드부터 추가한다. 전국 표준 취합의 권리 범위, VWorld·NGII·주소정보 공급 조건, TourAPI 사진의 개별 유형은 후속 확인 대상이다. API-only B 항목이 확인되면 운영자 opt-in 어댑터를 구현한다. 2027-01-17 이후에는 근거 재확인 없이 카탈로그 검사를 통과할 수 없다. 검증 결과는 [데이터 검증 기록](research/data-validation.md)을 따른다.

## Web 지도 SDK 구현

`feat/web-map-sdk`에서 M2의 Web 지도 생명주기, 공통 카메라/마커 상태, GeoJSON/경로 표시, 사용자 레이어, 이벤트·접근성 및 운영자 스타일 URL 설정을 구현했다. [Web API 가이드](../packages/web/README.md)와 [검증 기록](research/web-sdk-validation.md)을 따른다. Next 클라이언트 동적 import와 합성 데모를 제공한다.

Chromium 100/1,000 마커, 모바일 터치 에뮬레이션, 반복 종료와 오류 복구를 검사한다. MapLibre 6.14.0 전역 dispatcher worker 1개 유지, Safari/Firefox/실기기 및 Native 동등 API 검증은 남아 있다. 실제 타일·한글 glyph·온라인 검색/경로 계산·실행 중 style 교체는 이번 범위가 아니다. M2/MVP 전체 완료나 출시 승인을 의미하지 않는다.

## 독립 지도 디자인 시스템

`feat/map-design-system`에서 Standard/Dark/Pastel/Outdoor 토큰·스타일 생성기, 한국어 fallback, 원본 POI 기호, cmap/글리프 coverage 도구와 `/themes/` 비교 예제를 추가했다. M2의 스타일 커스터마이징과 M3의 스키마/폰트 준비 작업이다. [비교 문서](design-system.md), [폰트 정책](font-icon-licenses.md), [검증 기록](research/design-system-validation.md)을 따른다.

Web 로컬 합성 데이터와 설치된 Noto CJK를 검증한다. Native 라벨은 명시적 glyph URL을 요구하며 Android/iOS 실화면은 미검증이다. 실제 vector tile 스키마 변환·글리프 pack 생성/배포·복잡한 도심/색각 QA와 전체 플랫폼 동등성은 후속이며 M2/M3/MVP 전체 완료 판정이 아니다.

## 공통 Public API

`feat/shared-public-api`에서 M4의 공통 `MapController`, 지리·스타일·GeoJSON·오류·취소·Provider 계약과 Web/Native bridge를 구현했다. [계약·기능 동등성](public-api.md), [생성 API 문서](api/core.md), [검증 기록](research/public-api-validation.md)을 따른다. 당시 Web API를 보존하고 minor Changeset으로 계약·오류 code 확장을 기록했다. 미발행 초기 Changeset들은 이후 0.1.0 baseline CHANGELOG로 통합됐으며 현재 버전을 자동으로 0.2.0으로 올리지 않는다.

Web은 실제 스타일 교체·overlay 유지까지 검증한다. Native 카메라/마커/도형/경로/ref는 구현했지만 실제 기기와 native renderer 수명 검증은 M4 잔여 작업이다. 당시 Native 외부 스타일은 미지원이었다. 아래 Native 확장에서 명시적 운영자 리소스 입력 검사를 추가하며 실제 기기 요청 감사는 계속 출시 조건으로 남긴다. 검색/GPS/DB/실제 routing 엔진은 인터페이스 구현과 별개이며 M5/M6에서 선택적으로 연결한다.
## 공공 POI ETL / M6 일부 구현

`feat/public-poi-etl`에서 세 A CSV 프로파일의 명시적 다운로드/검증, PostGIS 좌표 변환·upsert·복구·로그,
로컬 Docker, read-only 조회 서비스와 공통 세 POI API를 구현했다. [실행 가이드](public-data-etl.md),
[검증 기록](research/poi-etl-validation.md)을 따른다. 실제 DB는 자체 합성 자료로 검증했다.
공공 원문/파일은 HTTP 503으로 접근되지 않았으며 실제 적재·정확도는 미검증이다.
도시공원·화장실 등 추가 승인, TourAPI 좌표/키, XLSX, Native 화면, 대량 갱신·운영 인증은 후속이다.
M6 전체 완료 또는 전국 POI 서비스/공개 발행 준비 완료 판정은 아니다.

## 자체 PostGIS 한국 POI 검색 / M5 일부 구현

`feat/korean-search`에서 SearchProvider 호환 검색·POI 주소·공간/카테고리·자동완성·페이지·취소·출처,
검색 선택 카메라 이동과 근처 POI 주소 역조회, pg_trgm 인덱스·로컬 서버를 구현했다.
[검색 가이드](search.md), [검증 기록](research/search-validation.md)을 따른다.
현재 M5의 첫 검색 엔진은 이미 운영하는 PostGIS POI다. Nominatim 설치를 선행 요구하지 않는다.
전국 주소 지오코더·길찾기 엔진·실제 전국 데이터 품질/규모 성능·Native UI/기기 QA는 후속이며 M5 전체 완료가 아니다.

## 공통 GPS·경로 기록

`feat/gps-tracks`에서 동의 기반 foreground LocationClient·Web/주입형 Expo 어댑터,
순수 경로 기록/필터·거리/활성 시간·GeoJSON/GPX·다중 표시·리플레이와 두 플랫폼 예제를 구현한다.
[가이드](gps-tracks.md), [검증/기기 절차](research/gps-validation.md)를 따른다.
Android 기기/ADB/SDK 부재로 실센서와 OS background 검증은 미완료이며 M4 전체 완료로 처리하지 않는다.
background 지속 수집은 별도 설계/기기 QA 후 결정한다. 장기 저장·암호화·동기화·삭제 정책은 소비 앱에 둔다.

## 선택형 자체 라우팅 — P1 확장

`feat/self-hosted-routing`에서 Valhalla 3.9.1 단일 graph의 walking/cycling/driving과
주입형 Provider, 스냅/거리 제한·오류/취소, 지역별 전체 rebuild·검증 후 선택·롤백, 독립 loopback gateway를 추가했다.
기본 지도와 SDK 빌드는 라우팅 서비스 없이 유지한다. 한국 공개 PBF와 자체 합성 graph를 각각 검증한다.
[가이드](routing.md), [결과](research/routing-validation.md).

전국 통행 품질·안전·부하/SLA·경계 clipping/변경분 갱신·실시간 교통·내비게이션·Native 기기 화면은 미완료다.
이번 구현으로 M5 전체 또는 공개 제품 출시 완료를 표시하지 않는다.

## React Native SDK / M4 확장

`feat/native-sdk`에서 명시적 운영자 XYZ/glyph/sprite와 실험 PMTiles/HTTP 대체 경로,
4종 테마 예제·선택 카드·제스처 설정·스타일 세대/정리 처리를 추가한다.
Expo Development Build 설정과 엔진 버전을 고정한다. [설치 가이드](native-sdk.md),
[검증 기록](research/native-sdk-validation.md)을 따른다.

PMTiles RN 런타임, 한글 glyph, 물리 기기·iOS·장시간 메모리/OS lifecycle QA는 검증 결과에 따라
별도로 판정한다. 단위 검사·JS export·prebuild를 Native 렌더링 성공으로 취급하지 않는다.
전체 플랫폼 M4 또는 공개 출시 완료를 선언하지 않는다.

## 두 소비 앱으로 SDK 통합 검증

`feat/scenario-apps`에서 Web/Expo 산책 지도와 여행 일정 지도를 추가한다.
공통 MapController를 사용하는 private 예제 세션에 가짜 검색·기록·일정·저장 정책을 두며
SDK에는 bounds 유틸리티와 Web 출처 컨트롤 수정만 추가한다.
[가이드](example-apps.md), [검증 기록](research/example-apps-validation.md).
합성 UX 검증이며 실데이터 길찾기·실GPS·전국 검색·iOS/물리 기기 또는 공개 출시 완료가 아니다.

Web E2E12와 Linux/Windows/macOS CI가 통과했다. Android API35 개발 APK에서 두 지도·산책 저장/복원/재생·여행 날짜/연결선·테마 전환을 실제 확인했다. 초기 ANR/소프트웨어 실행 지연과 전체 모바일 QA·물리 기기/iOS 미검증은 후속 검증 기록에 유지한다.


## 전체 품질 감사 및 개선

`feat/quality-audit`의 [QA 보고서](qa-report.md)를 최신 품질 판정으로 사용한다.
Web 동일값 갱신, 독립 공개 GeoJSON 타입, 전체 workspace 오프라인 링크/라이선스 검사를 수정했다.
390/768/1440px Web 회귀, 실제 PostGIS/Valhalla, 독립 tarball 소비 앱 및 SDK 재현성 검증을 보강했다.
통과한 개별 항목만 완료다. high2 공식 패치, Web NodeNext 외부 선언, Android 실기기/iOS,
실제 provider 부하·장기 메모리/OS 네트워크 검증은 다음 작업이며 M4/M5/M6 전체 및 출시 완료로 처리하지 않는다.

## v0.1.0 공개 게이트 — 2026-10-19

영문/국문·커뮤니티·설치·운영 문서, 5개 비스코프 후보 패키지 이름, 초기 CHANGELOG와 승인 제한 발행 자동화를 로컬 후보로 준비했다. 기능/패키지/실화면 검증은 보고서의 실제 실행 범위에서 통과했으나 공개 발행은 차단 상태다. 상세 구현 파일, 테스트, 실화면, 보안/라이선스, 차단 사항과 다음 단계는 [후보 보고서](releases/v0.1.0.md)를 따른다. 현재 high 취약점과 Native/registry 미검증은 공개 차단으로 유지한다. 브랜치 `release/v0.1.0-preparation`; 커밋은 `git log -1 --format=%H release/v0.1.0-preparation`로 식별한다. 제작자 provider를 추가하지 않았고 공개 npm 메타데이터 조회/의존성 설치만 수행한다. 원격 공개 업로드·배포·npm 발행·GitHub Release는 승인 전 실행하지 않는다.


10단계 실행의04는 [실제 프레임 환경 기록](research/stage-04-rendering.md)을 보강한다. 1000마커 p95 33ms 수락은 계속 FAIL이며 임시 설정은 채택하지 않았다.


10단계05 [독립 APK](research/stage-05-android-consumer.md)는 실제offline build와Hermes/ELF/rawZIP확인까지PASS_BUILD_ONLY다. KVM/연결기기부재로앱실행은NOT_RUN, 전체RN선언은여전히FAIL이다.


10단계 06: [공공 POI 파일 입력 보호](research/stage-06-poi-ingestion.md). 원본CSV exact URL·SHA·header·독립 좌표기준점 확보가 필요하다. A등급만으로 원본통합 성공을 주장하지 않는다.


10단계 07: [한국어 검색·라우팅 품질 평가](research/stage-07-service-quality.md). 허가된 실제 정답·관측자료가 없어 검색·경로 정확도 수락은 NOT_RUN이다.


10단계 08: [타일 CRC·MVT 무결성](research/stage-08-tile-integrity.md). 해안선은 공식메타데이터 후보만 조사했으며A수집승인/통합하지 않았다. 전국8GiBgate·기존성공세대보존은 유지한다.


10단계 09: [릴리스 운영 조건 사전검사](research/stage-09-release-preflight.md). 미발행0.1.0기준선은CHANGELOG로정리했고, high2·Web/RN선언·npm발행주체·GitHub기본브랜치/환경보호가 남는다. npmworkflow는현재defaultbranch에없어미등록이다.
