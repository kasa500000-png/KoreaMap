# 산책·여행 예제 앱

확인일: 2026-10-19. 두 앱은 공개 SDK의 사용 예이며 실제 생활 지도 서비스가 아니다.
표시한 사용자·공원·동물병원·미용실·여행 장소·GPS·방문 순서는 모두 이 프로젝트가 작성한 합성 자료다.
실제 사용자 위치나 기존 비공개 앱의 코드/데이터는 사용하지 않는다. 지도 glyph 없는 합성 도형 테마다.

## 실행과 기능

```sh
pnpm install --frozen-lockfile
pnpm dev:web
# http://127.0.0.1:3000/walk/ 또는 /trip/
pnpm dev:expo
# Development Build가 없거나 native 의존성이 바뀌었다면:
pnpm --filter @korea-map-kit/example-expo android
# macOS/Xcode에서는 ios 명령
```

[Native 설치](native-sdk.md)에 따라 Expo Development Build를 사용한다. Expo Go를 사용하지 않는다.
Expo 상단에서 **산책 앱 / 여행 앱**을 선택한다. **SDK API / GPS 도구**는 이전의 별도 검증 화면이다.
새 두 앱은 실제 GPS를 호출하지 않으며 현재 위치 버튼도 **모의 현재 위치**라고 표시한다.
OS 센서를 사용하는 앱은 별도 동의/권한을 구현해야 하며 [GPS 가이드](gps-tracks.md)를 따른다.

| 앱 | 기능 | 직접 확인할 흐름 |
| --- | --- | --- |
| 몽실 산책 지도 | 모의 현재 위치, 1초 간격 실시간 경로, 시작/일시정지/재개/종료, 로컬 저장, 3종 시설 마커·카드, Pastel/Outdoor, 경로 다시 보기 | 시작 → 4점 이상 → 일시정지 → 테마 → 재개 → 종료 → 저장 → 앱 다시 열기 → 다시 보기 |
| 차곡 여행 지도 | 한글·띄어쓰기 검색, 빈 결과, 장소 저장·삭제, 1~3일차 핀/방문 순서, 연결선, 장소 카드, 선택/일정 카메라, Standard | 공원 검색·저장 → 박물관 저장 → 2일차 저장 → 1일차 복귀 → 새로고침 → 카드·삭제 |

방문 순서 연결선은 경유점 시각화이며 실제 도로 길찾기나 보행 안전·거리/예상시간이 아니다.
실제 도로 경로가 필요하면 소비 앱에서 [RoutingProvider](routing.md)를 별도 설정한다.
외부 provider, API 키, DB 또는 제작자 서버는 두 앱의 실행 조건이 아니다.

## 동일 API와 앱 경계

`examples/scenarios`는 **private workspace**다. `createScenarioSession`이 Web의 `handle.api`와
Native의 `MapView` ref로 받은 동일한 `MapController`를 사용한다. 테스트도 같은 core controller에
mock port를 연결해 실행한다. React/DOM/Native 엔진, 저장소는 주입 경계 밖에 둔다.

| 역할 | 위치 / API |
| --- | --- |
| 공통 지도 명령 | core MapController: setCenter, setZoom, fitBounds, setStyle, add/removeMarker, add/removeGeoJSON, showRoute, onEvent |
| 좌표·기록·재생 | core boundsFromCoordinates, createTrackRecorder, tracksToFeatureCollection, createTrackReplay |
| 검색 계약 | core SearchProvider + 예제의 6개 가상 POI 구현 |
| 산책/여행 분기, 날짜/저장 정책, 가짜 사용자 자료 | examples/scenarios/src/index.ts |
| Web UI·저장 | examples/web/app/scenarios, localStorage |
| Mobile UI·저장 | examples/expo/scenario-screen.tsx, AsyncStorage |

SDK → examples 의존성은 기존 경계 검사로 금지한다. 새 private 예제 소스도 출처 해시 검사에 포함한다.
데이터·UI·저장 코드가 core/native/web 패키지의 분기로 이동하지 않는다.

## 저장·개인정보·비용

`kmk-synthetic-scenarios-v1` 키에 명시적 저장만 수행한다. Web은 해당 origin의 localStorage,
Native는 앱의 AsyncStorage다. AsyncStorage는 암호화 저장소가 아니므로 실제 개인정보용 저장 설계로
그대로 복사하지 않는다. 최대 120점/산책, 최근 5개 산책, 3일×6장소로 용량을 제한한다.
복원 시 버전·크기·형식·가짜 장소 ID·합성 좌표를 검사한다. 손상 시 자동 덮어쓰기 대신 초기화를 안내한다.
저장 오류는 기존 상태를 보존한다. **모든 데모 저장 자료 삭제**는 두 예제의 지정 키만 삭제한다.
앱을 떠나거나 background로 이동하면 기록·재생을 멈추며 자동 재개하지 않는다.

새 외부 의존성은 예제 전용 `@react-native-async-storage/async-storage` **2.2.0**, MIT다.
설치된 Expo 58.0.14 `bundledNativeModules.json`,
[공식 Expo 안내](https://docs.expo.dev/versions/v58.0.0/sdk/async-storage/),
[공식 metadata](https://registry.npmjs.org/@react-native-async-storage/async-storage/2.2.0)를 대조해 고정했다.
원래 AsyncStorage 설치 문서 주소는 확인 시 404였으므로 읽었다고 주장하지 않는다.
네이티브 모듈 추가 후 개발 APK를 다시 빌드한다. SDK 패키지에는 이 저장소 의존성을 추가하지 않는다.

## 공통 SDK 개선

1. 여러 장소/경로를 동일하게 맞추기 위해 `boundsFromCoordinates`를 core에 추가했다.
   경도 최소 구간과 날짜변경선을 처리하고 빈/sparse/잘못된 좌표를 거부한다. 단일 좌표는 점 bounds를
   반환하므로 예제는 setCenter/setZoom을 사용한다. 입력을 변경하지 않으며 10,000점 제한, O(n log n)이다.
2. Web setStyle 후 별도 출처 영역과 기본 컨트롤이 겹치던 문제를 하나의 항상 표시되는
   AttributionControl 갱신으로 수정했다. 출처를 숨기는 CSS로 해결하지 않는다.
3. 예제 CSS를 앱 제어부에만 적용해 MapLibre 줌 버튼을 깨뜨리지 않도록 했다.
   모바일 검색 버튼 줄바꿈, 폐기된 replay 객체에 재접근하던 정리 오류도 수정했다.

향후 SDK 개선 후보는 많은 마커의 일괄 갱신 API, native 스타일 교체 중 렌더링 비용 계측,
실기기 제스처·background·메모리 프로파일이다. 이번 예제를 이유로 앱의 저장/일정 모델을 SDK에 추가하지 않는다.

실행 결과와 플랫폼별 한계: [검증 기록](research/example-apps-validation.md).
