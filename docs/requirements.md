# Korea Map Kit 요구사항

기준일: 2026-10-19. [아키텍처](architecture.md)와 [로드맵](roadmap.md)의 검증 가능한 요구사항이다. **현재 기능 구현은 없다.** P0는 전체 MVP 필수, P1은 MVP 이후 선택 확장, P2는 수요·측정 근거가 생긴 뒤 결정한다. 전체 MVP는 M1~M4가 모두 통과해야 한다.

## 사용자와 사용 시나리오

- Web 개발자: paid API key 없이 Next.js 또는 일반 Web에서 자신의 style/tile URL로 지도를 표시한다.
- React Native 개발자: 동일 좌표·피처·서비스 계약으로 Android/iOS 개발 빌드를 사용한다.
- 지도 제작자: OSM 시범 지역에서 타일·한글 글리프·스타일을 재생성하고 자체 서버에 설치한다.
- 서비스 운영자: 검색·경로·저장 어댑터만 선택하며 핵심 지도는 서비스 장애에도 유지한다.

## 기능 요구사항과 수락 기준

단계는 최초 완료 책임 단계다. Web에서 먼저 구현한 P0 기능도 M4에서 모바일에 해당하는 수락 기준을 다시 통과해야 한다. ADR은 설계 결정이며 실행 테스트 결과가 아니다.

| ID | 우선순위 | 단계 | 요구사항 및 수락 기준 | ADR |
| --- | --- | --- | --- | --- |
| R01 | P0 | M1 | core가 renderer/React/DB SDK를 import하지 않는다. dependency graph와 renderer 없는 소비 테스트로 확인한다. | ADR-001 |
| R02 | P0 | M1 | LngLat·Bounds·단위·오류 schema 고정. NaN·범위 밖·날짜변경선·원본 CRS 미상 입력을 거부한다. 축 순서는 metadata와 기준점으로 검증하며 숫자 범위만으로 모든 뒤집힘을 탐지한다고 보장하지 않는다. | ADR-002 |
| R03 | P0 | M1 | Expo 개발 빌드로 Android/iOS 최소 지도를 띄우는 호환성 spike. Expo Go 불가 및 플랫폼 최소 요구를 문서화한다. 한 플랫폼 미실행이면 미검증이다. | ADR-001 |
| R04 | P0 | M2 | Web 지도 mount/unmount, ready/error, resize, Next.js SSR 경계, Strict Mode cleanup을 실행 검증한다. | ADR-001 |
| R05 | P0 | M2 | 카메라 move/fit, 논리 padding, gesture/api origin, 취소, 마지막 명령 우선, changed/idle을 검증한다. | ADR-002 |
| R06 | P0 | M2 | GeoJSON 점/선/면, 1,000점 GPU layer, 안정 ID 선택·해제 및 마커 상세 접근이 작동한다. 대량 DOM marker를 기본으로 쓰지 않는다. | ADR-007 |
| R07 | P0 | M2 | style URL/JSON 교체, 기본 스타일 색 변경, 지원 안 되는 expression/schema 오류, 교체 후 overlay 복구를 검증한다. | ADR-004 |
| R08 | P0 | M3 | 한국 시범 지역 OSM PBF → Planetiler → MVT/PMTiles 배치를 고정 manifest로 재현한다. layer schema·경계·누락·타일 예산을 검사한다. | ADR-003 |
| R09 | P0 | M3 | Noto 계열 허가된 폰트로 한글/자모/영문/숫자 glyph와 sprite 1x/2x를 자체 제공하고 tofu·깨진 URL이 없는지 확인한다. | ADR-004 |
| R10 | P0 | M3 | core DB·유료 API key 없이 정적 서버+Martin으로 Web/모바일 공통 XYZ를 제공한다. 별도 PC에서 문서만으로 설치한다. | ADR-003 |
| R11 | P0 | M3 | OSM/폰트/스타일/데이터별 license manifest를 검토하고 출처 UI가 작은 화면·패널에 가려지지 않는지 확인한다. | ADR-006 |
| R12 | P0 | M1 | SearchProvider/RoutingProvider의 결과·취소·timeout·오류·capability 계약을 정의하고 합성 fixture로 검증한다. provider 없이 지도 사용 가능. | ADR-005 |
| R13 | P0 | M4 | Android/iOS에서 카메라·피처·스타일·한글·출처·lifecycle 공통 수락 시나리오를 실제 실행한다. | ADR-001 |
| R14 | P0 | M4 | 터치·시트·제스처 충돌, 접근성 탐색 대안, 위치 권한 거절 및 reduced motion을 플랫폼별로 확인한다. 자동 위치 요청은 하지 않는다. | ADR-007 |
| R15 | P0 | M4 | 문서의 성능 예산을 고정 fixture/장비로 측정한다. Web preview 수치를 Native 측정값으로 대신하지 않는다. | ADR-008 |
| R16 | P0 | M4 | 패키지 소비·exports·타입·라이선스·비밀정보·npm pack 검사를 통과한다. 실제 발행·main 병합은 별도 승인이다. | ADR-008 |
| R17 | P0 | M3 | 데이터와 스타일 immutable release, checksum 검증, 실패 시 기존본 유지 및 직전 release rollback을 실행한다. | ADR-003 |
| R18 | P1 | M5 | 자체 호스팅 Nominatim adapter의 검색·역지오코딩, 한국어 평가셋, 반환 attribution을 검증한다. 공용 서버를 기본값으로 넣지 않는다. | ADR-005 |
| R19 | P1 | M5 | 자체 호스팅 OSRM driving adapter로 GeoJSON route·m/s 단위·snap·NoRoute·429·취소를 검증한다. walking 위장은 금지한다. | ADR-005 |
| R20 | P1 | M6 | 선택 한국 공공데이터 1종을 이용허락/CRS/품질 확인 후 수집한다. PostGIS 공간 인덱스·공개 view·삭제/갱신 정책을 검증한다. | ADR-006 |
| R21 | P1 | M6 | Supabase 저장 어댑터를 core 변경 없이 추가하고 RLS 사용자 격리·서버 키 비노출·다른 저장소 교체를 검증한다. | ADR-005 |
| R22 | P1 | M6 | Web/Native PMTiles 직접 접근을 선택 기능으로 검증한다. Range/캐시 오류와 XYZ 전환 정책을 명시한다. | ADR-003 |
| R23 | P2 | M7 | Photon/Pelias 한국어 자동완성·초성·오타·다중출처 검색은 평가셋과 운영 예산 확보 후 결정한다. | ADR-005 |
| R24 | P2 | M7 | 오프라인 다운로드·보행/자전거·고급 내비게이션·terrain/MLT/스타일 GUI는 기능별 ADR과 라이선스/비용 검토 후 착수한다. | ADR-008 |

## Zero Publisher Cost 필수 요구사항

Z01~Z12는 모든 provider·데모·배포물에 적용한다. 단계는 최초 검증 책임이며 후속 P1/P2에도 예외 없이 적용한다. 현재 SDK가 없으므로 정적 검사 외 실제 설치/실행 검증은 미검증이다.

| ID | 우선순위 | 단계 | 요구사항 및 수락 기준 | ADR |
| --- | --- | --- | --- | --- |
| Z01 | P0 | M1 | 제작자 소유 키·DB·타일·백엔드·유료 계정 기본 연결 없음. import/설정 누락 상태에서 네트워크 시도 0을 검증한다. | ADR-009 |
| Z02 | P0 | M1 | 지도·검색·경로·공공데이터 provider를 운영자가 명시적으로 주입한다. 내장 endpoint 및 환경변수 자동 탐색 금지. | ADR-009 |
| Z03 | P0 | M1 | 필수 설정 누락 시 renderer 생성 전에 CONFIG_REQUIRED로 실패하고, 명시적 로컬 fixture만 허용한다. 외부 fallback 없음. | ADR-009 |
| Z04 | P0 | M4 | Git 작업 트리·index·이력·npm tarball·앱 bundle에서 secret/token/개인 endpoint/결제 설정을 검사하고 미해결 항목은 배포를 차단한다. | ADR-009 |
| Z05 | P0 | M2 | 브라우저·앱 환경변수와 source map은 공개로 취급한다. 서버 비밀 키가 bundle에 없는지 확인하며 Native에도 재검증한다. | ADR-009 |
| Z06 | P0 | M3 | 공개 데모는 허가된 로컬 fixture와 정적 자산만 사용한다. 제작자 유료 API·범용 proxy·공유 토큰·유료 fallback 없음. | ADR-009 |
| Z07 | P0 | M1 | 기본 빌드/테스트가 유료 계정·원격 DB·remote cache 없이 실행된다. 공개 의존성 설치 후 오프라인 fixture 경로를 검사한다. | ADR-009 |
| Z08 | P0 | M1 | 외부 provider opt-in 전에 계정·사용료·한도·키·데이터 권리의 책임이 설정 운영자에게 있음을 문서/예제에 알린다. | ADR-009 |
| Z09 | P0 | M1 | Actions는 무료 표준 runner만 기본 사용한다. larger/유료 cache·artifact 초과·빌드·배포 활성화는 별도 승인 및 감사 대상이다. | ADR-009 |
| Z10 | P0 | M4 | 배포 전 docs/cost-audit.md에 commit/artifact hash, 보안 검사와 모든 비용 경로, 미검증·차단 및 승인을 기록한다. | ADR-009 |
| Z11 | P0 | M4 | 패키지 설치/기본 실행/테스트의 browser worker·Native 포함 네트워크를 관측해 제작자 과금 endpoint 요청 0을 확인한다. | ADR-009 |
| Z12 | P0 | M1 | README에서 무료 SDK 코드 제공과 데이터·타일·검색·라우팅 서버 운영 비용/책임을 구분한다. | ADR-009 |

## 공통 비기능 수락 기준

| ID | 기준 | 책임 단계 |
| --- | --- | --- |
| N01 | 무료 OSS core가 유료 키·특정 계정·중앙 서버 없이 동작한다. 자체 호스팅 문서를 제공한다. | M3 |
| N02 | 정확한 버전·lockfile·CI 환경, 데이터 checksum과 빌드 manifest로 재현 가능하다. | M1~M4 |
| N03 | SDK 자체 코드 MIT 목표와 제3자 코드/데이터/폰트 라이선스를 분리한다. 미승인 데이터 publish를 차단한다. | M3~M4 |
| N04 | 위치·검색·자격 증명 원문 로그 및 기본 telemetry가 없다. 임의 HTML·서비스 URL·과대 payload를 검증한다. | M2~M6 |
| N05 | 성능은 architecture의 동일 fixture·네트워크·장비 조건으로 측정한다. 비용 가정과 관측값을 분리한다. | M3~M4 |
| N06 | 미실행은 미검증, 실패는 미완료다. upstream UX 확인은 프로젝트 QA로 대체할 수 없다. | 모든 단계 |
| N07 | main 병합·운영 배포·공개 전환·npm 실제 발행은 각각 사용자 명시적 승인 후 수행한다. | 모든 단계 |

## MVP 테스트 행렬

| 시나리오 | Web | Android | iOS | 실제 실행 단계 |
| --- | --- | --- | --- | --- |
| core contract/좌표/취소 | 단위·소비 테스트 | JS runtime·native boundary | JS runtime·native boundary | M1/M4 |
| 지도·한글·style 교체 | Chromium + Firefox + WebKit | emulator + 최소 1대 실기기 | simulator + 최소 1대 실기기 | M2~M4 |
| 마커·피처·카메라 | 포인터·키보드 | 터치·뒤로가기·회전 | 터치·safe area·회전 | M2/M4 |
| suspend/resume·해제 | tab 전환·unmount | background/foreground | background/foreground | M4 |
| 네트워크 오류·복구 | 로컬 오류 서버 | 네트워크 차단 | 네트워크 차단 | M3/M4 |
| 접근성 | 키보드/읽기 순서 | TalkBack | VoiceOver | M4 |
| memory/frame/cold start | 고정 browser/device | mid-tier 기기 | 지원 최소 OS 실기기 | M4 |

M1에서 정확한 기기·OS·브라우저와 모바일 메모리 예산을 고정한다. 확보하지 못하면 플랫폼 출시 차단 사항으로 남긴다. blank map/tofu/잘못된 attribution/좌표 축 오류가 없어야 하며, 패널 아래의 피처는 padding으로 보이게 하고 권한 거절 시에도 수동 탐색을 제공한다.

## MVP 제외 및 확장 진입 조건

전국 완전 주소 DB·실시간 교통·대중교통 환승·음성 turn-by-turn·상용 서비스와 동일 검색 품질·대규모 편집기·자체 렌더링 엔진은 MVP에 없다. P1도 선택 기능이며 모두 설치해야 SDK를 쓸 수 있는 구조를 만들지 않는다.

P1 검색은 공개/허가된 한국어 100개 질의(도로명·지번·시설·동명이소·없는 주소)로 top-5 recall·정답 없음·지연을 따로 보고한다. top-5 recall ≥ 90%는 해당 평가셋의 도입 목표이며 전국 정확도 보장이 아니다. 경로는 30개 허가된/합성 구간의 일방통행·단절·섬·모드 제한을 검사하고 실제 데이터 기준일을 보고한다.
