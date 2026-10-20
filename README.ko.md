# Korea Map Kit

[English](README.md) · [빠른 설치](docs/quickstart.md) · [공통 API](docs/public-api.md) · [실행 계획](docs/execution-plan.md) · [릴리스 후보 보고서](docs/releases/v0.1.0.md)

MapLibre 기반 MIT TypeScript 지도 SDK입니다. Web과 React Native가 공통 모델/API를 사용하며 좌표는 WGS84 `[경도, 위도]` 순서입니다.

**소스 프리뷰는 `main`에 통합됐습니다. v0.1.0은 미발행이며 릴리스는 차단 상태입니다.** 소스 통합은 운영 배포·npm 발행·태그·GitHub Release 승인이 아닙니다. 기본 브랜치는 여전히 `chore/project-policy`이므로 아래처럼 `main`을 명시해 clone하세요.

## 패키지와 지원 상태

| 후보 이름                 | 역할                                    | 검증 범위                         |
| ------------------------- | --------------------------------------- | --------------------------------- |
| `korea-map-core`          | 공통 타입, Provider, GPS 경로 순수 함수 | 외부 의존성 없이 독립 테스트      |
| `korea-map-web`           | MapLibre Web 지도, 마커, 팝업, 레이어   | Chromium / Next.js                |
| `korea-map-styles`        | Standard / Dark / Pastel / Outdoor      | 합성 데이터 Web 화면              |
| `korea-map-native`        | React Native 지도, 위치 포트            | 실험적; Android 실기기·iOS 미검증 |
| `korea-map-data-adapters` | 선택형 POI·검색·라우팅 클라이언트       | 로컬 합성 통합 테스트             |

이름은 레지스트리에서 미등록을 확인한 후보이며 예약·소유권을 의미하지 않습니다. ESM 전용입니다. Web TypeScript는 `moduleResolution: "Bundler"`를 사용합니다. Web NodeNext strict는 상위 의존성 TS2834 제약이 있고 core NodeNext 독립 검사는 통과한 범위입니다.

## 외부 키 없이 실행

Node **24.19.0**, pnpm **12.14.0**을 준비합니다. 저장소 검사에는 Python **3.12+**도 필요합니다.

```sh
git clone --branch main https://github.com/kasa500000-png/KoreaMap.git
cd KoreaMap
pnpm install --frozen-lockfile
pnpm dev:web
```

`http://localhost:3000`을 엽니다. `/themes/`, `/api/`, `/walk/`, `/trip/`에서 테마, 공통 API, 산책/여행 예제를 실행합니다. 기본 데이터는 직접 만든 합성 데이터이며 실제 한국 기본지도가 아닙니다. 유료 API 가입은 필요 없습니다. 최초 의존성 설치에는 npm 네트워크가 필요합니다.

`pnpm dev:web`이 SDK 빌드와 로컬 MapLibre worker 준비를 수행합니다. 운영자 타일·원본·glyph/폰트·DB·QA 결과는 ignored 자료이므로 clone되지 않습니다. 실제 지도는 [타일 가이드](docs/tiles.md)에 따라 별도로 연결합니다. npm에는 아직 발행하지 않았습니다. [빠른 설치](docs/quickstart.md)의 로컬 tarball 방법을 사용하세요. [Next.js·마커·경로](docs/web-guide.md), [Expo](docs/native-sdk.md), [공공데이터](docs/providers.md)·[한국 타일 생성/XYZ](docs/tiles.md), [오류 해결](docs/troubleshooting.md)을 참고하세요.

## 비용과 라이선스

SDK 소스 배포는 MIT 무료 오픈소스입니다. 지도 데이터·타일·검색·라우팅·DB·트래픽 운영비는 별개이며, 이용자가 선택한 인프라와 Provider 운영자가 부담합니다. 제작자 API 키·서버·유료 계정으로 자동 연결하지 않습니다. 필수 설정이 없으면 안전하게 실패하거나 명시적으로 선택한 합성 fixture를 사용합니다.

브라우저·모바일 설정은 공개될 수 있습니다. 비밀 키는 이용자 서버에서 관리하세요. OSM·공공데이터·폰트·아이콘에는 각각의 사용 조건이 적용됩니다. [데이터 라이선스](DATA_LICENSES.md), [출처 표시](docs/attribution.md), [제3자 고지](THIRD_PARTY_NOTICES.md)를 준수해야 합니다.

## 검증과 참여

데모 실행과 별도로 `pnpm check`, `pnpm pack:check`, `pnpm test:web` 등으로 검증합니다. `pnpm audit:dependencies`, `pnpm verify:packages`, `pnpm verify:native-consumer`는 알려진 보안·상위 선언 오류 때문에 현재 nonzero exit하며 부분 성공을 릴리스 통과로 처리하지 않습니다. `pnpm release:prepare`는 로컬 후보 자료만 생성합니다. 표준 Linux/Windows/macOS CI는 main push와 PR에서 실행되며 자동 발행·배포는 하지 않습니다.

[실행 계획](docs/execution-plan.md)의 범위에서 서울·울산·부산·제주 실제 OSM 타일·한글 glyph·Chromium 9화면, 세대 rollback과 실제 Valhalla 4경로의 서울 지도 표시를 검증했습니다. 명령·범위는 [타일 가이드](docs/tiles.md)를 따릅니다. 실제 공공 POI 적재는 원본 파일 미확보로 차단됐습니다. 독립 Native 설치·plugin·JS export는 통과했으나 상위 RN 선언 전체 검사가 실패해 `PARTIAL_PASS`입니다. Web·Android·iOS와 5개 패키지 목표를 유지하며 Web Alpha는 중간 검증 단계입니다. 보안 high 2건, Web NodeNext/RN 상위 선언 오류, 호스트 Chromium/SwiftShader 프레임 p95 **116.7ms(목표 33ms)**, 실제 npm 발행 권한/설치, Android 실기기, iOS, Native PMTiles·한글 glyph 검증이 남아 있습니다. 소스 프리뷰 통합으로 이 릴리스 게이트를 닫지 않습니다. [최종 후보 보고서](docs/releases/v0.1.0.md)의 통과 항목만 완료로 취급합니다.

[기여 방법](CONTRIBUTING.md) · [행동 강령](CODE_OF_CONDUCT.md) · [보안 신고](SECURITY.md) · [변경 이력](CHANGELOG.md) · [MIT](LICENSE)

## 지도 가독성과 조작 개선

기존 API를 유지하는 선택형 공통 카메라·선택 확장, 상세 `design-v2` 타일 형식과 4종 cartography 테마를 추가합니다. [품질 계획과 실행](docs/map-quality.md), [실제 검증 범위](docs/research/map-quality-validation.md)를 확인하세요. 실제 Android/iOS·전국 정확도·상용 지도 동등성은 별도 수락 항목입니다.
