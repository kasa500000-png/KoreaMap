# 기술·데이터·UX 조사

확인일: 2026-10-19 (UTC). 공식 문서·배포 레지스트리·프로젝트 릴리스를 우선했다. **문서에서 확인한 기능, 설계로 선택한 방침, 실제 실행 관찰을 구분한다.** 원문 전체/타일/폰트/앱 바이너리를 저장소에 복제하지 않았다. [전체 설계](../architecture.md), [요구사항](../requirements.md), [ADR](../decisions/001-renderers-and-platforms.md).

## 1. 런타임과 버전 조사

아래는 최초 호환성 시험에 사용할 정확한 후보 버전이다. latest 문서의 기능과 특정 패키지의 기능을 혼동하지 않기 위해 실제 npm metadata와 Expo 배포물의 `bundledNativeModules.json`, MapLibre RN podspec/Gradle 설정도 확인했다. **설치·lockfile·통합 빌드·보안 audit는 아직 수행하지 않았다.** M1 실행 실패 시 공식 근거와 함께 후보를 수정한다. 광범위한 peer 범위만으로 호환 통과를 선언하지 않는다.

| 구성 | 시험 후보 고정값 | 근거/관찰 | 검증 상태 |
| --- | --- | --- | --- |
| Node.js | 24.19.0 | 공식 배포 인덱스에서 LTS 확인, 현재 작업 환경과 일치 | 버전 실행 확인, 앱 테스트 전 |
| pnpm | 12.14.0 | npm latest 관찰 | 설치 전 |
| TypeScript | 7.0.2 | npm latest 관찰 | SDK/Expo 빌드 전 |
| MapLibre GL JS | 6.15.0 | npm latest, 공식 Web 예제도 이 버전을 참조 | upstream 예제 관찰만 |
| MapLibre React Native | 11.5.0 | peer: RN ≥0.80, React ≥19.1, Expo ≥54 | native 빌드 전 |
| Expo | 58.0.14 | npm latest와 공식 SDK 조합 표 | native 빌드 전 |
| React Native | 0.88.0 | Expo 58.0.14 배포 manifest의 exact 값 | native 빌드 전 |
| React / React DOM | 19.3.0 | Expo manifest의 exact 값, registry 존재 확인; latest 19.3.1 대신 Expo 기준 | 설치 전 |
| expo-dev-client | 58.0.14 | Expo manifest는 ~58.0.14; 첫 시험은 exact로 시작 | 설치 전 |
| Next.js | 16.4.2 | npm latest, React 19 범위 peer | SSR/소비 앱 테스트 전 |
| PMTiles JS | 4.5.0 | npm latest, Web 직접 접근 후보 | 직접 타일 접근 테스트 전 |
| Native Android / iOS | 13.6.1 / 6.31.0 | RN 11.5.0 배포 Gradle/podspec과 공식 시작 문서 일치 | 각 빌드 전 |

npm 조회 결과와 출처 URL은 [dependency-snapshot.json](dependency-snapshot.json)에 보존했다. 조회된 latest와 채택한 Expo React 값은 다르므로 snapshot을 그대로 설치 manifest로 사용하지 않는다. Node 근거: [공식 배포 인덱스](https://nodejs.org/dist/index.json). 핵심 버전 출처: [GL JS](https://registry.npmjs.org/maplibre-gl), [RN 래퍼](https://registry.npmjs.org/@maplibre/maplibre-react-native), [Expo](https://registry.npmjs.org/expo), [Next](https://registry.npmjs.org/next).

Expo SDK 58의 공식 조합은 RN 0.88/React 19.3.0, Android 7+, iOS 16.4+, Xcode 26.4+로 안내된다. 첫 지원 하한은 이 조합을 기준으로 검증한다. MapLibre 시작 문서는 Android API ≥23을 적지만 RN 11.5.0 Gradle 기본 minSdk는 24였다. 따라서 실제 artifact와 Expo 요구의 높은 쪽을 적용한다. compileSdk/targetSdk는 Expo 생성 프로젝트를 기준으로 검토하며 래퍼 기본값을 수동 복사하지 않는다. EAS를 필수로 하지 않아도 iOS 로컬 검증에는 macOS/Xcode가 필요하다.

M1에서 고정해야 할 나머지 항목: JDK 배포판/patch, Android SDK/NDK/Gradle, Xcode/CocoaPods, 테스트 도구와 @types 패키지, CI image digest. 지금 임의의 exact 값을 만들어 잠금 완료로 표시하지 않는다.

## 2. 타일·DB·검색·경로 비교

| 기술 | 조사 결과 | 선택과 제약 |
| --- | --- | --- |
| MapLibre GL JS | WebGL 기반 지도, style 명세·카메라·피처·worker | Web renderer; Next SSR에서 DOM 없이 import/초기화하지 않도록 경계 필요 |
| MapLibre Native | Android/iOS native renderer, RN 래퍼와 version 축이 다름 | 모바일 renderer; WebView를 공통 구현으로 채택하지 않음 |
| Planetiler 0.10.2 | PBF 등에서 vector tiles 생성, Java 21+ 또는 컨테이너 | M3 지역별 배치; core runtime에 JVM 불필요 |
| PMTiles v3 | Range 읽기용 archive, in-place 업데이트 불가 | immutable 배포 및 rollback; 모든 직접 접근의 offline/cache 동작을 보장하지 않음 |
| Martin 1.16.1 | PMTiles 및 PostGIS 등에서 tile service 제공 | M3 공통 XYZ, DB 없이 archive만 서비스 가능 |
| PostGIS | 공간 인덱스·좌표 변환·거리·MVT 생성 | P1 ingestion/동적 레이어; 버전/PG 조합은 M6 도입 시 공식 지원표로 고정 |
| Nominatim 5.3.3 | OSM search/reverse/lookup | P1 자체 호스팅 첫 reference; 공용 API 사용을 기본 제공하지 않음 |
| Photon 1.3.0 | 자동완성·위치 bias·오타·다국어; Java 21+, OpenSearch 3.x | 한국어 품질 실측 후 P2; 오래된 Elasticsearch 설명을 현재 구성으로 쓰지 않음 |
| Pelias | 다중 출처 import와 검색의 여러 서비스 | P2; 단일 서버 geocoder보다 운영 범위가 큼 |
| OSRM 26.10.0 | 사전 처리 graph와 profile 기반 경로 API | P1 driving 1개 reference; 선택 버전 응답의 계약 테스트 필수 |
| Valhalla 3.9.1 | 여러 모드와 costing, 경로 graph 처리 | 추가 이동 모드 수요 후 검토, OSRM과 동시 필수 설치하지 않음 |
| GraphHopper 11.1 | Java 경로 엔진과 custom model | 대안; hosted 상품의 기능·키 요구는 OSS와 별도 |

버전은 확인한 공식 release 값이며 운영 설치를 뜻하지 않는다. P1/P2 엔진은 도입 시 다시 확인한다. OSRM 공개 API 문서의 URL은 v5.24.0을 포함한다. 이를 현재 서버 버전으로 오인하지 않고 26.10.0 통합 때 response/오류/profile compatibility를 확인한다.

릴리스 근거: [Planetiler 0.10.2](https://github.com/onthegomap/planetiler/releases/tag/v0.10.2), [Martin 1.16.1](https://github.com/maplibre/martin/releases/tag/martin-v1.16.1), [Nominatim 5.3.3](https://github.com/osm-search/Nominatim/releases/tag/v5.3.3), [Photon 1.3.0](https://github.com/komoot/photon/releases/tag/1.3.0), [OSRM 26.10.0](https://github.com/Project-OSRM/osrm-backend/releases/tag/v26.10.0), [Valhalla 3.9.1](https://github.com/valhalla/valhalla/releases/tag/3.9.1), [GraphHopper 11.1](https://github.com/graphhopper/graphhopper/releases/tag/11.1). GitHub 커넥터의 공식 release API로 확인했다.

Native PMTiles는 공식 Android 문서에 지원 시작 버전과 절대 URL 규칙이 있으며 offline pack/cache 제약도 안내한다. iOS 지원은 공식 2025년 1월 newsletter에 6.10.0과 함께 기록돼 있다. 따라서 “Native에서 PMTiles 미지원”이라고 설계하지 않는다. 최신 래퍼 조합에서 cache/offline를 실행 검증하지 않았으므로 공통 MVP는 XYZ 경로다.

## 3. 데이터와 라이선스 조사

| 자산/기술 | 확인된 정보 | 도입 판단 |
| --- | --- | --- |
| 자체 SDK 코드 | 최종 MIT 목표 | 제3자 라이선스를 덮어쓰지 않는 LICENSE/NOTICE 분리 필요 |
| GL JS / PMTiles JS | npm metadata BSD-3-Clause | 고지 보존, 최종 tarball 의존 포함 SBOM 검토 |
| MapLibre RN / Expo / React / Next | npm metadata MIT | Native 전이 의존은 별도 검토 |
| Planetiler | 공식 repository Apache-2.0 | 도구 NOTICE 및 profile 출처 별도 |
| Nominatim | 공식 COPYING GPL v3 계열 | 별도 서버; 재배포 시 GPL 의무 검토 |
| Photon | 공식 README Apache-2.0 | OpenSearch/JVM/데이터 의무 별도 |
| OSRM | 공식 LICENSE.TXT BSD 조건 | 코드와 OSM graph의 조건 별도 |
| Noto Sans CJK | Sans/LICENSE의 OFL 1.1 | 폰트·변형·glyph 고지 보존; MIT 표기 금지 |
| OSM | ODbL, contributor attribution | snapshot/파생 DB·타일 형태별 의무 검토 |
| 한국 공공데이터 | 개별 자료/약관/제3자 권리 확인 필요 | 아래 후보는 승인 완료 데이터가 아님 |

이 표는 전체 법적 적합성 확인서가 아니다. Martin/Native/PostGIS/Valhalla/GraphHopper/Pelias 및 모든 전이 의존은 실제 배포 버전의 LICENSE/NOTICE를 release BOM으로 재검토한다. GitHub 커넥터의 범용 fetch는 `/license` API를 지원하지 않아 이 경로로는 확인하지 못했다. 확인한 원문/metadata와 미확인 항목을 분리했다.

한국 데이터 후보:

- [전국공공시설개방정보표준데이터](https://www.data.go.kr/data/15013117/standard.do): 관리기관, 도로명/지번주소, 위도·경도 등의 필드와 갱신 안내를 확인했다. 개별 기관별 제공 시점이 다를 수 있다. 원본 파일/사진의 개별 이용조건 확인 전 배포하지 않는다.
- [한국관광공사 국문 관광정보 서비스](https://www.data.go.kr/data/15101578/openapi.do): 공식 관광정보 API 목록과 설명을 확인했다. 도구에서 이용허락 필드가 확인되지 않았고 직접 HTTP 조회는 503이었다. 사진·대량 저장·재배포까지 허가됐다고 추정하지 않는다.
- [주소정보누리집](https://www.juso.go.kr/): 한국 주소 보강의 후속 조사 후보이며 이번 단계의 이용약관·원본 라이선스 검토는 미완료다. geocoding 서버의 데이터로 즉시 import하지 않는다.
- [KOGL 유형 안내](https://www.kogl.or.kr/info/license.do): 현재 0유형·1~4유형 및 별도 AI유형 등이 안내된다. 0/1을 우선 검토하되 AI 학습 목적 조건을 일반 지도 재배포 허가로 쓰지 않는다. web 도구 open 실패 후 일반 HTTPS로 공식 페이지를 확인했다.

OSM 데이터 이용허락과 공용 서버 운영 정책은 별개다. 공용 tile 서버는 대량 수집/오프라인 다운로드의 원천으로 삼지 않는다. 공용 Nominatim 정책은 앱 전체 요청량 제약, 명시적 선택·식별·출처와 자동완성 금지를 포함한다. SDK에는 이 endpoint를 기본값이나 자동 fallback으로 넣지 않는다. 자체 인프라의 저장·전송 비용을 무료라고 광고하지 않는다.

## 4. REA·ADB·Ghidra와 브라우저 가용성

| 도구/대상 | 실제 점검 | 결과/대체 |
| --- | --- | --- |
| REA MCP | 현재 callable tool 이름·설명에서 REA 관련 도구 검색 | 노출 없음; 앱 역분석 미실행 |
| Ghidra MCP | 동일 도구 목록 검색 | 노출 없음 |
| Ghidra CLI | `command -v ghidra`, `command -v analyzeHeadless`, 일반 설치 디렉터리 확인 | 발견 못함; 실행·디컴파일 미실행 |
| ADB | `command -v adb`, 알려진 설치 위치 확인 | 발견 못함; 기기 연결/앱 UI 미검증 |
| 분석 권한이 있는 앱 | 사용자가 제공한 APK/앱·기기 접근 범위 확인 | 지정/제공 없음; 상용 앱 설치·추출하지 않음 |
| Chromium/Playwright | `/usr/bin/chromium`, Python playwright 확인 후 실행 | 사용 가능, 공식 공개 Web 예제 관찰 |

이 결과는 현재 세션에서 사용할 수 있는 도구 범위다. 시스템의 모든 경로에 도구가 절대로 없다는 주장은 아니다. 보호 조치 우회, 인증 무시, APK/비공개 DB/타일/API 키 추출을 수행하지 않았다. 향후 허가된 앱을 제공받으면 대상·버전·허용 범위를 먼저 기록하고 UI 관찰부터 진행한다. UX 조사에 바이너리 역분석이 필수인 것은 아니다.

## 5. 지도 UX 분석

| 패턴 | 근거 수준과 관찰 | Korea Map Kit 적용 |
| --- | --- | --- |
| 마커 | 공식 공개 예제에서 클릭 시 popup, 닫기 버튼 후 제거를 실제 확인 | selectedFeatureId 공유, 상세 panel/popup은 플랫폼별; 다수 피처는 GPU layer |
| 검색 | Nominatim/Photon 문서의 검색·bias·역지오코딩 기능; 실서비스 검색 UX는 미실행 | 입력/로딩/빈 결과/실패/선택 상태, IME composition 처리, 결과 리스트와 피처 선택 동기화 |
| 경로 | OSRM/Valhalla API 문서 기반; 실제 경로 화면·계산 미검증 | 출발/도착·교환·mode·요약 거리/시간·오류·route fitBounds; 서비스 미설정 시 계산 UI 비활성 |
| 카메라 | 공식 Fly 버튼 클릭 후 canvas 변화 확인; 원문은 random destination | 선택/경로 범위로 이동, 패널 padding, 사용자 제스처 우선; reduced motion이면 애니메이션 최소화 |
| 제스처 | 공개 마커 예제의 drag에서 marker screen 위치 변화, wheel 후 canvas 변화 확인 | pan/pinch/회전은 플랫폼 기본 동작, 시트 drag 영역 분리; Native multi-touch는 후속 검증 |

공개 예제에서 관찰한 화면 표현을 제품 디자인 에셋으로 복사하지 않는다. 검색 결과의 accessibility label, 터치 표적 크기(Web 약 44 CSS px/RN 약 48dp 목표), 포커스 복귀, 긴 한국어 시설명 줄바꿈, 출처 영역과 bottom sheet 충돌은 프로젝트 QA 항목이다. 이는 설계 제안이며 현재 화면 테스트 결과가 아니다.

### 실제 관찰 절차와 한계

2026-10-19, Playwright + 시스템 Chromium headless/SwiftShader, viewport 1100×720으로 아래 공개 페이지를 소수 회 열었다. 대량 타일 수집이나 데이터 API 호출을 하지 않았다.

1. [마커 실행 예제](https://maplibre.org/maplibre-gl-js/docs/examples/attach-a-popup-to-a-marker-instance.html)에서 marker 클릭 → popup 확인 → 닫기 → drag → wheel.
2. [카메라 실행 예제](https://maplibre.org/maplibre-gl-js/docs/examples/fly-to-a-location.html)에서 Fly 클릭 전후 canvas 비교.
3. 마커 popup 및 Fly 이후 스크린샷을 열어 시각적으로 확인했다. 마커는 지도 위 popup이 보였다. Fly의 최종 화면은 단색 수역이어서 상세 지형/정확 좌표 도착까지 합격 판정하지 않았다. 공개 소스의 목적지는 무작위다.

결과: popup 열림/닫힘, marker CSS transform 변화, wheel/Fly canvas 변화 확인; 관찰 중 pageerror 0. 최초 자동화는 module scope의 maplibregl에 접근해 ReferenceError가 발생했다. 페이지를 변경하지 않는 DOM/스크린샷 기반 절차로 수정한 뒤 관찰을 완료했다. 이 실패를 SDK 버그로 기록하지 않는다.

[관찰 로그와 screenshot hash](ux-observations.json)를 커밋한다. screenshot 원본은 `/workspace/scratch/koreamap-architecture/`에만 보존하며 저장소에 외부 지도 이미지/에셋을 배포하지 않는다. 파일 경로는 세션 종료 후 유효하지 않을 수 있다. 로그와 공식 URL로 관찰 범위를 식별할 수 있지만, screenshot hash만으로 이미지를 복원할 수는 없다. 한국 지도·Native 앱·성능·search/route end-to-end는 미검증이다.

## 6. 공식 근거 목록

아래 URL은 조사일에 확인한 근거다. 조사 중 접근 실패나 내용 미확인인 것은 앞 절에서 별도 표기했다. dynamic latest 문서는 시간이 지나면 달라지므로 실제 구현 때 고정 버전의 문서와 변경 내역을 다시 확인한다.

| 분야 | 공식 근거 | 설계에 사용한 사실 |
| --- | --- | --- |
| Web | [GL JS](https://maplibre.org/maplibre-gl-js/docs/) | 렌더링 API, worker/CSS, 카메라/피처 |
| Native | [Native book](https://maplibre.org/maplibre-native/docs/book/) | native renderer의 플랫폼 구분 |
| RN | [시작](https://maplibre.org/maplibre-react-native/docs/setup/getting-started/), [Expo](https://maplibre.org/maplibre-react-native/docs/setup/expo/) | 래퍼 Native 버전, New Architecture, 개발 빌드 |
| Expo | [SDK reference](https://docs.expo.dev/versions/latest/) | SDK/RN/React/최소 OS 조합 |
| 타일 생성 | [Planetiler README](https://github.com/onthegomap/planetiler/tree/v0.10.2) | profile과 Java 21+ 요구 |
| Archive | [PMTiles 개념](https://docs.protomaps.com/pmtiles/), [Web 연결](https://docs.protomaps.com/pmtiles/maplibre), [호스팅](https://docs.protomaps.com/pmtiles/cloud-storage) | Range/read-only archive 및 protocol |
| Native archive | [Android](https://maplibre.org/maplibre-native/android/examples/data/PMTiles/), [공식 iOS 지원 소식](https://maplibre.org/news/2025-02-03-maplibre-newsletter-january-2025/) | 지원 존재와 URL/cache 제약 |
| 타일 제공 | [Martin sources](https://maplibre.org/martin/sources-pmtiles/) | 파일/HTTP archive 제공 |
| 공간 DB | [PostGIS](https://postgis.net/documentation/), [변환](https://postgis.net/docs/ST_Transform.html), [거리](https://postgis.net/docs/ST_DWithin.html), [MVT](https://postgis.net/docs/ST_AsMVT.html) | CRS·거리 단위·공간 함수 |
| 스타일 | [Style spec](https://maplibre.org/maplibre-style-spec/), [Glyph](https://maplibre.org/maplibre-style-spec/glyphs/) | glyph 범위와 Web/Native 기능 차이 |
| 글꼴 | [Noto Sans OFL](https://github.com/notofonts/noto-cjk/blob/main/Sans/LICENSE) | 글꼴 라이선스 분리 |
| 데이터 | [OSM copyright](https://www.openstreetmap.org/copyright), [타일 정책](https://operations.osmfoundation.org/policies/tiles/) | 데이터/서비스 이용 조건 분리 |
| 검색 | [Nominatim](https://nominatim.org/release-docs/latest/api/Overview/), [공용 정책](https://operations.osmfoundation.org/policies/nominatim/), [Photon](https://github.com/komoot/photon/tree/1.3.0), [Pelias](https://github.com/pelias/documentation) | 각 검색 기능과 운영 경계 |
| 경로 | [OSRM API](https://project-osrm.org/docs/v5.24.0/api/), [Valhalla](https://valhalla.github.io/valhalla/), [GraphHopper](https://github.com/graphhopper/graphhopper) | profile/경로 API 대안 |
| 선택 저장 | [Supabase changelog](https://supabase.com/changelog.md), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) | 선택 어댑터의 권한 경계 |

Supabase changelog는 web 도구가 Markdown content-type을 처리하지 못해 HTTPS로 읽었다. DB/서비스 구현은 하지 않았으며 실제 도입 시 해당 날짜의 breaking change와 RLS/GRANT 규칙을 재검토한다. 이번 연구 때문에 Supabase 계정·서비스를 만들 필요는 없다.
