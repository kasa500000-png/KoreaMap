# React Native SDK 설치·운영

확인일: 2026-10-19. Expo **Development Build** 전용이다. Expo Go는 MapLibre 네이티브 모듈을 포함하지 않는다.

## 고정 호환성

| 구성 | 고정 버전 / 선택 |
| --- | --- |
| Expo / expo-dev-client / expo-location | 58.0.14 / 58.0.14 / 58.0.17 |
| React / React Native | 19.3.0 / 0.88.0 |
| MapLibre React Native | 11.5.0 |
| MapLibre Android / iOS | 13.6.1 OpenGL / 6.31.0 |
| Native Style Spec | 26.2.1 (wrapper와 일치) |
| 아키텍처 | New Architecture: Fabric + TurboModules, Hermes |

Expo의 설치된 `bundledNativeModules.json`과 공식 npm metadata를 대조했다.
MapLibre RN v11은 새 아키텍처만 지원하고 RN >= 0.80을 요구한다.
엔진 버전은 `examples/expo/app.json`의 config plugin에도 정확히 고정했다.
Android SDK/Gradle 요구값은 생성 프로젝트와 RN의 `gradle/libs.versions.toml`을 따른다.
이번 생성값은 compile SDK 37, build tools 37.0.0, NDK 27.1.12297006, Gradle 9.4.1이다.

공식 근거:

- [MapLibre 설치·요구사항](https://maplibre.org/maplibre-react-native/docs/setup/getting-started)
- [Expo config plugin](https://maplibre.org/maplibre-react-native/docs/setup/expo)
- [Expo 로컬 Development Build](https://docs.expo.dev/develop/development-builds/create-a-build/)
- [Expo Dev Client](https://docs.expo.dev/versions/v58.0.0/sdk/dev-client/)
- [Expo 58.0.14 metadata](https://registry.npmjs.org/expo/58.0.14)
- [Android SDK 도구](https://developer.android.com/studio)

## 로컬 실행

Node/pnpm은 루트 `package.json`의 버전을 사용한다. Android는 Android Studio/SDK/JDK,
iOS는 macOS/Xcode/CocoaPods와 해당 기기 서명이 필요하다. Windows는 Android만 지원한다.
클라우드 빌드·EAS 로그인·유료 API 키는 필요하지 않다.

```sh
pnpm install --frozen-lockfile
pnpm build:sdk
pnpm --filter @korea-map-kit/example-expo generate:native
pnpm --filter @korea-map-kit/example-expo android
# macOS에서:
pnpm --filter @korea-map-kit/example-expo ios
# 이미 개발 앱이 설치됐다면:
pnpm dev:expo
```

앱에 `@maplibre/maplibre-react-native` config plugin을 반드시 등록하고 네이티브 의존성을
바꾼 뒤 다시 빌드한다. iOS Podfile의 `$MLRN.post_install(installer)`도 확인한다.
생성된 android/ios, 인증서, 서명 키, APK/IPA는 Git/npm에 포함하지 않는다.
USB Android는 `adb reverse tcp:8081 tcp:8081` 후 로컬 Metro에 연결할 수 있다.
개발 launcher는 사용자 선택으로 로컬 프로젝트를 연다. OTA 업데이트는 비활성화되어 있다.
`pnpm build`의 Expo export는 JS 번들 검사이며 APK/IPA 컴파일이 아니다.

## 지도와 공통 API

```tsx
import { useRef } from 'react';
import { MapView, type MapController } from 'korea-map-native';

function MapScreen() {
  const map = useRef<MapController>(null);
  return <MapView ref={map}
    config={{ mode: 'local-fixture', fixtureId: 'synthetic-v1' }}
    onEvent={(event) => {
      if (event.type === 'ready') {
        void map.current?.setCenter([126.978, 37.5665]);
      }
    }} />;
}
```

부모에 실제 높이 또는 `flex: 1`을 준다. 좌표는 `[longitude, latitude]`다.
ready 이후 `setZoom`, `setCamera`, `fitBounds`, `addMarker`, `removeMarker`,
`addGeoJSON`, `removeGeoJSON`, `showRoute`, `getVisibleBounds`, `setStyle`를 호출한다.
Promise 오류는 앱에서 처리한다. `onEvent`는 ready/idle/camera/click/select/error/destroyed를 전달한다.
마커 선택은 도형 탭과 접근 가능한 장소 버튼 모두 지원하며 선택 카드에는 닫기 버튼이 있다.
마커·GeoJSON·경로는 스타일 교체 후 유지된다. 경로는 입력 좌표의 표시이며 길찾기 계산이 아니다.

config는 mount 시 고정한다. provider 정책 변경·치명적 로딩 실패 복구는 부모의 React `key`로
MapView를 remount한다. `destroy()` 또는 unmount는 리스너·타이머·overlay와 네이티브 뷰를 해제한다.
스타일 세대 번호로 오래된 성공/실패 콜백을 무시한다. 스타일 로딩 취소/timeout은 세션을 종료한다.
지도 카메라·overlay 상태는 React 컴포넌트 밖의 테스트 가능한 session에 둔다.
스타일 교체 시 네이티브 뷰를 새로 생성하므로 짧은 재로딩이 있을 수 있다.

`gesturesEnabled={false}`로 스크롤 부모에게 제스처를 넘길 수 있다. 예제의 스위치가 부모
ScrollView와 지도 제스처를 함께 전환한다. Android texture view와 flex 레이아웃을 사용한다.
자동 제스처 경쟁 해결이나 회전/백그라운드 복귀 검증 완료를 의미하지 않는다.
앱 전환은 Native 라이브러리의 OS 생명주기 처리에 맡긴다. 앱 화면을 unmount하면 지도도 해제된다.

## 4종 테마·한글·레이어

`korea-map-styles`의 `createThemeStyle`로 standard/dark/pastel/outdoor를 생성하고
`defineMapStyle(document, attribution)` 후 `map.current.setStyle(...)`로 적용한다.
`overrides`로 색상·도로 폭을 변경한다. 임의 레이어는 유효한 Style Spec의 sources/layers에
추가하고 전체 style을 교체한다. `kmk-`는 SDK 마커·overlay 예약 prefix다.
커스텀 레이어를 유지하려면 다음 스타일에도 포함해야 한다.

```ts
import { defineMapStyle } from 'korea-map-core';
import { createThemeStyle } from 'korea-map-styles';
import { createNativeVectorSource } from 'korea-map-native';

// 모두 운영자 입력. example.invalid는 실행 가능한 기본 서버가 아니다.
const origin = 'https://tiles.example.invalid';
const source = createNativeVectorSource({
  tiles: [`${origin}/{z}/{x}/{y}.pbf`],
  attribution: '운영자 데이터 라이선스·출처',
});
const document = createThemeStyle({
  theme: 'outdoor', target: 'native',
  data: { mode: 'operator', source, attribution: '운영자 데이터 라이선스·출처',
    sourceLayers: { road: 'roads', place: 'places', park: 'parks' } },
  typography: { mode: 'glyphs', fontStack: ['Noto Sans CJK KR'],
    url: `${origin}/fonts/{fontstack}/{range}.pbf` },
});
const config = { mode: 'operator' as const,
  style: defineMapStyle(document, '운영자 데이터 라이선스·출처'),
  resources: { allowedOrigins: [origin] } };
```

source-layer 이름과 `kind` 필드는 [디자인 시스템](design-system.md)의 스키마에 맞게 공급한다.
라벨은 `name:ko` → `name` → `name:en` 순서다. Native에는 Web 로컬 폰트 fallback이 없다.
한글 fontStack·glyph URL이 필요하다. `auditGlyphCoverage`로 실제 사용 문자 집합을 검사한 뒤
각 기기에서 누락 글리프·줄바꿈·충돌을 확인한다. 예제 기본 테마는 glyph 요청이 없는 도형 모드이며,
장소 버튼의 RN Text 한글 표시를 지도 glyph 렌더링 검증으로 간주하지 않는다.
폰트/PBF/sprite payload는 SDK에서 제공하지 않는다. 운영자가 폰트·아이콘 재배포 권리와
출처를 확인해야 한다. 스타일과 무관한 고정 출처 영역 및 MapLibre attribution 컨트롤을 유지한다.

## 리소스와 PMTiles

기본값은 inline 합성 GeoJSON만 사용한다. operator 모드는 명시한 origin의 직접 XYZ 타일,
glyph, sprite만 허용한다. remote style JSON, TileJSON, remote GeoJSON 자동 탐색은 거부한다.
HTTPS 또는 loopback HTTP만 가능하고 URL 사용자 정보·query·fragment는 허용하지 않는다.
클라이언트 URL에 Secret을 넣지 않는다. origin 정책은 **입력 검사**이며 네이티브 HTTP redirect의
목적지를 차단하는 방화벽이 아니다. 운영자 서버는 외부 redirect 없이 직접 응답해야 한다.
비신뢰 provider의 실제 요청 통제는 앱별 native interceptor/네트워크 계층에서 추가 검증해야 한다.
설정한 서비스의 운영비·전송량·라이선스 책임은 운영자에게 있다.

[Android PMTiles 공식 문서](https://github.com/maplibre/maplibre-native/blob/main/platform/android/docs/data/PMTiles.md)는
11.7.0부터, [iOS 공식 문서](https://github.com/maplibre/maplibre-native/blob/main/platform/ios/MapLibre.docc/PMTiles.md)는
6.10.0부터 `pmtiles://https://tiles.example.invalid/archive.pmtiles`와 파일 source를 지원한다고 명시한다.
선택한 엔진은 해당 범위지만 RN wrapper의 실기기 검증과 같은 뜻은 아니다. PMTiles offline pack/cache는
공식 문서상 지원하지 않는다. Web `addProtocol`을 Native에 등록하지 않는다.

`createNativeVectorSource({ tiles, attribution, pmtilesUrl, transport: 'experimental-pmtiles' })`와
`resources.experimentalPMTiles: true`를 **둘 다** 지정해야 실험 source를 허용한다.
기본 transport는 `http`다. 로딩 실패 후 `transport: 'http'`로 새 config를 만들고 MapView를
remount하면 운영자가 준 일반 XYZ 타일을 사용한다. 다른 서버로 자동 연결하거나 직선/빈 지도를
성공한 타일로 보고하지 않는다. 앱 파일 PMTiles는 이번 SDK 경로에서 미지원이다.
PMTiles QA에는 소유/이용허락을 확인한 archive, HTTP Range 206/Content-Range, 동일 내용의
XYZ fallback, 각 OS의 pan/zoom/테마 전환·재시작과 네트워크 기록이 필요하다.

## GPS와 공개 전 검사

`createExpoLocationClient(expoLocation, AppState, scheduler)`는 선택형 모듈 주입을 사용한다.
동의/foreground 권한 이후만 수집하며 백그라운드에서는 중단하고 자동 재개하지 않는다.
기본 외부 전송·저장은 없다. 정확도·경로·삭제·내보내기는 [GPS 가이드](gps-tracks.md)를 따른다.
[검증 기록과 남은 기기 QA](research/native-sdk-validation.md)를 확인한 뒤 배포한다.
