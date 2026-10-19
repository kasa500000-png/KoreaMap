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
| M1 | 코어·버전 잠금·모바일 spike / P0 | R01 R02 R03 R12 | exact version/lockfile, core tests, Web 최소 지도, Expo Android/iOS 최소 지도 실제 실행, 장비·메모리 예산 확정 | 미착수 |
| M2 | Web SDK·React/Next 예제 / P0 | R04 R05 R06 R07 | 브라우저 카메라·피처·스타일·SSR/lifecycle 테스트; fixture 검색/경로를 실서비스로 표시하지 않음 | 미착수 |
| M3 | 한국 타일·한글·자체 호스팅 / P0 | R08 R09 R10 R11 R17 | 시범 bbox 배치·schema·글리프·라이선스·서버 smoke·rollback, 키 없는 별도 환경 재현 | 미착수 |
| M4 | 모바일 parity·성능·MVP 패키징 / P0 | R13 R14 R15 R16 | 모든 P0의 Android/iOS 수락 기준, 실화면/접근성·성능, dry-run package 소비 검증 | 미착수 |
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
