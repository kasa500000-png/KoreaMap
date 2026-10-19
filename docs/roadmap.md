# Korea Map Kit 로드맵

기준일: 2026-10-19. [정책](../AGENTS.md), [아키텍처](architecture.md), [요구사항](requirements.md), [진행 기록](progress.md)을 기준으로 진행한다. 초기 정책 문서의 단계 1을 이번 **M0 기술 설계**로 구체화했다. 아래 순서는 달력 일정이나 구현된 기능을 뜻하지 않는다.

## 기반과 현재 작업

- 0단계 정책 설정: main 반영 완료, 커밋 `38c36f84f1e62f0419583faa5b593a2d6a71daf8`.
- GitHub 기본 브랜치는 마지막 확인 시 `chore/project-policy`이며 설정 변경은 연동 권한으로 차단됐다. 후속 PR의 base는 명시적으로 `main`을 사용한다.
- M0: 공식 기술 조사, 도구 가용성 점검, 공개 예제 UX 관찰, 설계/ADR/요구사항 작성. [설계 검증](research/design-validation.md)과 커밋 후 완료 판정. 제품 코드와 플랫폼 통합 빌드는 미착수다.

## 단계와 완료 조건

**P0 전체 MVP = M1 + M2 + M3 + M4.** M2 완료는 Web preview다. M1의 Native spike로 모바일 호환성 위험을 초기에 발견한다. 실제 상태는 progress에 기록하며 테스트 미통과를 완료로 바꾸지 않는다.

| 단계 | 범위/우선순위 | 요구사항 | 완료 조건 | 상태 |
| --- | --- | --- | --- | --- |
| M0 | 기술 조사·설계 | 모든 요구사항의 설계 근거 | 링크·추적성·상호 일관성 검사 및 수동 리뷰, 문서 커밋 | 설계 검증 통과; 커밋은 진행 기록의 식별 명령 참조 |
| M1 | 코어·버전 잠금·모바일 spike / P0 | R01 R02 R03 R12 Z01 Z02 Z03 Z07 Z08 Z09 Z12 | exact version/lockfile, core tests, Web 최소 지도, Expo Android/iOS 최소 지도 실제 실행, 장비·메모리 예산 확정 | 진행 중: 모노레포/로컬 Web/JS export 검증, Native 실빌드·화면/예산 미완료 |
| M2 | Web SDK·React/Next 예제 / P0 | R04 R05 R06 R07 Z05 | 브라우저 카메라·피처·스타일·SSR/lifecycle 테스트; fixture 검색/경로를 실서비스로 표시하지 않음 | 미착수 |
| M3 | 한국 타일·한글·자체 호스팅 / P0 | R08 R09 R10 R11 R17 Z06 | 시범 bbox 배치·schema·글리프·라이선스·서버 smoke·rollback, 키 없는 별도 환경 재현 | 미착수 |
| M4 | 모바일 parity·성능·MVP 패키징 / P0 | R13 R14 R15 R16 Z04 Z10 Z11 | 모든 P0의 Android/iOS 수락 기준, 실화면/접근성·성능, dry-run package 소비 검증 | 미착수 |
| M5 | 검색·길찾기 adapter / P1 | R18 R19 | 자체 Nominatim/OSRM의 정규화·품질·오류/취소·출처 계약, provider 없는 회귀 | 미착수 |
| M6 | 한국 공공 레이어·저장·직접 archive / P1 | R20 R21 R22 | 데이터별 권리, PostGIS query plan, RLS 격리, Native PMTiles range/cache 검증 | 미착수 |
| M7 | 고도화 / P2 | R23 R24 | 수요·품질 평가·운영 비용·신규 ADR 확보 후 기능별 개발 | 보류 |

모든 단계에서 N01~N07을 적용한다. M5/M6는 MVP 이후 필요에 따라 개별 선택하며 선후 관계는 해당 데이터·엔진에 한정한다. 고도화 완료는 0.x preview 공개의 선행 조건이 아니다.

## 작업 크기와 중단 조건

1. M1: monorepo/core/시험 앱까지만 만든다. New Architecture/Expo 호환 실패 시 의존 조합을 재검토한다. iOS 환경 부재 시 미검증으로 남기고 독립 Web 작업만 가능하다.
2. M2: 지도 표시 → 카메라/선택 → 스타일 교체 순으로 작은 PR을 만든다. 지오코더 UI·대시보드·인증을 같이 구현하지 않는다.
3. M3: 한 지역 z0~14, layer 6개, light 스타일 1개부터 시작한다. 범위 확대는 크기/생성 시간/비용 측정 후 결정한다. 미확인 공공데이터는 제외하고 OSM 기반 MVP를 유지한다.
4. M4: 공통 계약과 플랫폼 차이를 확인한다. Native 버전·PMTiles 지원을 추정으로 통과시키지 않는다. 성능 실패 시 마커·레이어·배치 크기부터 조정한다.
5. M5: 검색 1개, driving 경로 1개 엔진만 reference로 운영한다. Photon/Pelias/Valhalla를 동시에 기본 설치하지 않는다.
6. M6/M7: 독립 패키지/데이터 release로 추가한다. PostGIS·Supabase·오프라인이 core 필수 설치로 역류하지 않게 검사한다.

## 릴리스와 승인

단계별 브랜치·PR에서 테스트 통과 후 커밋한다. 현재 브랜치는 `docs/technical-architecture`, PR base는 `main`이다. 이전 첫 작업의 main 승인은 이번 설계나 이후 단계의 병합을 승인하지 않는다.

M4 후 0.x release candidate를 만들 수 있지만 main 병합·운영 배포·공개 저장소 전환·npm 실제 발행은 각각 명시적 사용자 승인 후 수행한다. 저장소는 이미 공개 상태다. 승인 전에는 release notes, `npm pack --dry-run`, 로컬 tarball 소비 검증과 검토 가능한 PR까지 준비한다. 선택한 태그와 artifact hash에 승인을 연결한다.

## 미해결 사항

- 실제 Expo/RN/Native 호환성 및 iOS 환경: M1.
- 시범 bbox는 아키텍처의 서울 주변 제안값으로 시작한다. 원본 OSM snapshot, 실제 추출 manifest, 시험 장비 및 메모리 예산 고정: M1~M3.
- 공공데이터 원본별 권리, 폰트 산출물 고지: 각각 M6, M3.
- 배치 속도·트래픽·한국어 검색 품질: 실제 입력 확보 후 측정. 예상치를 실측으로 표기하지 않는다.
- GitHub 기본 브랜치 설정: 제품 개발 차단은 아니며 PR base를 명시해 진행 가능.

## Zero Publisher Cost 적용

[비용 감사](cost-audit.md)와 [ADR-009](decisions/009-zero-publisher-cost.md)를 M1~M7 전체에 적용한다. 기존 아키텍처 PR 위의 `docs/zero-publisher-cost` 브랜치에서 정책·정적 감사 도구를 추가한다. 제품 설치·실행 네트워크 감사가 완료되기 전에는 Zero Publisher Cost 런타임 합격이나 발행 가능으로 표시하지 않는다.

M1은 명시적 provider/설정 누락 실패/유료 계정 없는 기본 테스트, M2는 클라이언트 노출, M3는 로컬 fixture 데모, M4는 실제 npm·Web·Native 배포물과 설치/실행/테스트 요청 감사를 검증한다. P1 서비스와 공공데이터 수집도 운영자가 설정한 계정·인프라만 사용한다. SDK 이용자 수에 따라 제작자 서비스 API 사용량이 늘어나는 기본 경로는 허용하지 않는다.

## 모노레포 foundation 후속

`feat/monorepo-foundation`에서 사용자 지정 5 SDK / 2 예제 / 3 private 서비스 경계와 개발 도구를 구축한다. 실제 엔진 서비스는 아직 미구현이다. [개발 가이드](development.md), [도구 검증](research/monorepo-toolchain.md), [진행 기록](progress.md), [비용 감사](cost-audit.md)를 따른다. 아키텍처/비용 정책 PR이 미병합이라 이번 PR은 비용 정책 브랜치를 기준으로 비교한다.

Native 실기기/시뮬레이터, 수정 버전이 없는 전이 취약점, 실제 공공/OSM 데이터와 한글 glyph 검증은 남아 있다. foundation 기능 테스트와 M1/MVP 전체 완료 또는 출시 승인을 구분한다.

## 데이터 공급원 조사와 공개 차단

`feat/data-source-policy`에서 [공급원 조사](data-sources.md), [라이선스](data-licenses.md), [출처 표시](attribution.md), [데이터 원장](../data/sources.json)을 추가했다. M3/M6에 앞선 권리 검토로 A 6 / B 0 / C 8 / D 2개를 분류했으며, 실제 데이터 수집·DB·타일 생성은 완료하지 않았다.

M3는 OSM 공개 추출본으로 시작하고, M6는 개별 공공데이터 필드부터 추가한다. 전국 표준 취합의 권리 범위, VWorld·NGII·주소정보 공급 조건, TourAPI 사진의 개별 유형은 후속 확인 대상이다. API-only B 항목이 확인되면 운영자 opt-in 어댑터를 구현한다. 2027-01-17 이후에는 근거 재확인 없이 카탈로그 검사를 통과할 수 없다. 검증 결과는 [데이터 검증 기록](research/data-validation.md)을 따른다.

## Web 지도 SDK 구현

`feat/web-map-sdk`에서 M2의 Web 지도 생명주기, 공통 카메라/마커 상태, GeoJSON/경로 표시, 사용자 레이어, 이벤트·접근성 및 운영자 스타일 URL 설정을 구현했다. [Web API 가이드](../packages/web/README.md)와 [검증 기록](research/web-sdk-validation.md)을 따른다. Next 클라이언트 동적 import와 합성 데모를 제공한다.

Chromium 100/1,000 마커, 모바일 터치 에뮬레이션, 반복 종료와 오류 복구를 검사한다. MapLibre 6.14.0 전역 dispatcher worker 1개 유지, Safari/Firefox/실기기 및 Native 동등 API 검증은 남아 있다. 실제 타일·한글 glyph·온라인 검색/경로 계산·실행 중 style 교체는 이번 범위가 아니다. M2/MVP 전체 완료나 출시 승인을 의미하지 않는다.
