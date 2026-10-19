# Korea Map Kit Public API (0.x preview)

확인일: 2026-10-19. core는 ES2022만 사용하며 외부 패키지, DOM, React Native, MapLibre UI, 백엔드에 의존하지 않는다. Web은 `MapHandle.api`, React Native는 `MapView`의 ref로 동일한 `MapController`를 제공한다. 기존 Web 메서드와 `LngLat`, `CameraState`, `MapFeatureCollection`, `SearchProvider`는 유지한다.

[자동 생성 API 명세](api/core.md)는 실제 배포용 TypeScript 선언에서 생성한다. `pnpm docs:api`로 재생성하고 `pnpm check`가 선언과 문서의 일치를 검사한다. TypeDoc에 준하는 목적의 Markdown 선언 참조와 이 사용·동작 문서를 함께 제공한다. 타입별 검색·상호 링크 UI는 아직 없다.

## 데이터 계약

| 타입 | 규칙 |
| --- | --- |
| Coordinate | WGS84 `[longitude, latitude]`, 십진 도, readonly 길이 2 튜플. 지리 범위 ±180/±90; 지도 렌더링은 위도 ±85.051129 |
| MapCamera | center, zoom 0~22, bearing -360~360도, pitch 0~60도. 전 항목 필수 |
| MapBounds | `{ west, south, east, north }`; south ≤ north. west > east는 날짜변경선 횡단. 화면 전체 세계는 west=-180/east=180 |
| MapMarker | id, coordinate, label 필수; description 선택. id 중복 추가는 교체. 최대 10,000개 |
| MapStyle | document(Style Spec JSON), attribution(빈 문자열 불가). `defineMapStyle()`이 복사·JSON 구조 검사, 각 어댑터가 Style Spec 검사 |
| MapLayer | id, type, definition. `defineMapLayer()`로 생성. 공통 JSON 레이어이며 WebGL callback 레이어는 Web 전용 |
| MapRoute | id, 좌표 2개 이상; 선택 거리 meters/소요시간 seconds, 유한한 0 이상 값. 경로 계산을 호출하지 않음 |
| Place | id, label, coordinate, categories, provenance(sourceId/datasetVersion) |
| Feature / FeatureCollection | GeoJSON의 Point/LineString/Polygon 부분집합. scalar properties, string id, 최대 10,000 features, 닫힌 polygon ring. altitude/Multi*/GeometryCollection/null geometry/nested properties는 MVP에서 제외 |
| MapEvent | type으로 구분하는 ready/idle/destroyed/camera/click/select/error. 엔진·DOM 이벤트 전달 안 함 |
| LocationError | PERMISSION_DENIED / UNAVAILABLE / ABORTED / TIMEOUT. 위치 권한 UX는 플랫폼 어댑터 책임 |

숫자 두 개가 모두 유효 범위 안에 있으면 순서를 런타임이나 튜플 타입만으로 판별할 수 없다. `[37, 127]`은 위도 범위를 벗어나 거부하지만 `[37, 60]`의 사용 의도까지 자동 판별하지 않는다. 입출력 순서는 항상 경도, 위도다. 좌표·도형은 복사하여 호출자의 후속 변경을 격리한다. core 검증은 순수 함수이며 네트워크/환경변수 조회를 하지 않는다.

## 컨트롤러 동작

모든 공통 제어/조회는 Promise를 반환한다. 잘못된 입력도 Promise rejection이다. `onEvent()`와 `destroy()`는 동기식이고, onEvent는 구독 해제 함수를 반환한다. map 준비 전에는 `UNAVAILABLE/MAP_NOT_READY`, 종료 후에는 `UNAVAILABLE/MAP_DESTROYED`로 실패한다. Web은 `await handle.ready`, Native는 ready 이벤트를 기다린다. ready 이벤트는 스타일 교체 때도 발생한다.

| API | 의미 |
| --- | --- |
| setCenter / setZoom / setCamera | 애니메이션 없이 즉시 카메라 명령. 완료는 명령 수락/bridge 완료이며 GPU 프레임 완료가 아님 |
| fitBounds | 날짜변경선 지원, padding 0~1,000 CSS px / Native logical points. bearing/pitch 0으로 맞춤 |
| setStyle | 명시적 inline document 적용 후 style-ready까지 기다림. 마커/선택/공통 GeoJSON·경로 유지. 동시 스타일 변경/로딩 중 지도 명령은 거부 |
| addMarker / removeMarker | 같은 ID는 교체, 없는 ID 제거는 no-op |
| addGeoJSON / removeGeoJSON | 같은 ID는 교체, 없는 ID 제거는 no-op. 영문·숫자·밑줄·하이픈 1~64자; `kmk-` 예약 |
| showRoute | `routeToGeoJSON()` 후 같은 GeoJSON ID 공간에 표시. 기존 동일 ID overlay 교체 |
| getVisibleBounds | 어댑터에서 현재 화면 경계를 읽고 world copy를 정규화. 로딩/종료 후 캐시된 경계를 반환하지 않음 |
| onEvent / destroy | 사용자 콜백 예외 격리, 종료 시 pending 작업 취소·구독 정리. destroy는 멱등 |

Web의 기존 `addLayer`로 넣은 임의 레이어는 style 교체 시 제거된다. 유지할 JSON 레이어는 새 style.document.layers에 포함한다. 등록 이미지와 공통 overlay는 Web에서 복원한다. Native overlay는 선언형 children으로 유지하며 실제 style 교체 후 렌더링은 기기 QA가 필요하다. Native ref.destroy는 SDK 내부 지도 뷰를 제거한다; 다시 시작하려면 부모에서 MapView를 remount한다.

## 오류, 취소, 제한 시간

`KitError`의 code는 INVALID_ARGUMENT / UNSUPPORTED / UNAVAILABLE / ABORTED / TIMEOUT / PERMISSION_DENIED / NETWORK_ERROR / NOT_FOUND다. detail은 기계적으로 구분 가능한 안전한 식별자다. `normalizeError()`는 알려지지 않은 예외를 `UNAVAILABLE/OPERATION_FAILED`로 변환해 원본 응답·URL·토큰을 복사하지 않는다. 운영자가 직접 만든 KitError.detail에는 비밀을 넣지 않아야 한다.

`OperationOptions`는 선택 signal과 timeoutMs를 받는다. 기본 제한 10,000ms, 허용 범위 1~2,147,483,647ms. core는 타이머를 직접 참조하지 않고 `Scheduler`를 주입받는다. `createCancellationSource()`의 signal은 DOM AbortSignal과 다른 portable 인터페이스다. 취소/timeout은 기다림을 끝내고 adapter signal을 취소하지만 이미 수행한 명령·DB 작업의 rollback을 보장하지 않는다. 재시도/과금 요청은 자동으로 발생하지 않는다.

컨트롤러는 호출마다 옵션을 강제한다. Provider 인터페이스는 계약이므로 임의의 외부 구현이 옵션을 무시할 수 있다. 호출자도 `runOperation()`을 사용하고, Provider는 전달된 signal을 실제 transport의 AbortController 등으로 연결해야 한다. 무응답 구현을 강제 종료하거나 원격 요청 비용을 취소할 수 있다는 의미가 아니다. setStyle 진행 중 취소/timeout은 반쯤 적용된 지도를 남기지 않도록 해당 지도 인스턴스를 종료한다. 새 인스턴스로 복구한다. 초기 지도 로드 제한은 두 어댑터에서 기본 15초다.

```ts
import { createCancellationSource, runOperation, type Scheduler, type SearchProvider } from '@korea-map-kit/core';

const scheduler: Scheduler = {
  schedule(callback, delayMs) {
    const timer = setTimeout(callback, delayMs); // 플랫폼/앱 계층
    return () => clearTimeout(timer);
  },
};
const request = createCancellationSource();
async function search(provider: SearchProvider) {
  return runOperation(
    ({ signal }) => provider.search({ text: '공원', language: 'ko', limit: 10 }, { signal }),
    { signal: request.signal, timeoutMs: 3000 },
    scheduler,
  );
}
// 화면 이탈 시 request.cancel(). 외부 AbortSignal 연결은 아래처럼 명시적으로 한다.
const browserAbort = new AbortController();
const forwardAbort = () => request.cancel();
browserAbort.signal.addEventListener('abort', forwardAbort, { once: true });
// 등록 이전에 취소된 신호도 처리한다.
if (browserAbort.signal.aborted) request.cancel();
// 구독 수명 종료 시 browserAbort.signal.removeEventListener('abort', forwardAbort).
```

## 확장 인터페이스와 비용 경계

| 인터페이스 | 역할 |
| --- | --- |
| SearchProvider | search(query, options), 기존 capabilities 유지. reverse 기능 호출은 아래 별도 인터페이스 |
| GeocodingProvider | geocode(query, options), reverse(coordinate, options) |
| RoutingProvider | route({ waypoints, mode: walking/cycling/driving }, options), 복수 route 반환 가능 |
| LocationProvider | getCurrentPosition(options), 정확도 meters와 UTC epoch timestampMs. import 시 권한 요청 없음 |
| PlaceRepository | get/put/remove. get의 미존재 값은 null; 인가·영속성은 구현 책임 |
| TileProvider | id/attribution/costResponsibility='operator', getStyle(options). SDK가 자동 조회·선택하지 않음 |

어댑터 인스턴스는 사용자가 생성·주입한다. core는 fetch, Supabase, DB schema, 특정 HTTP transport, 계정 정보를 갖지 않는다. TileProvider 반환값을 setStyle에 넘겨도 처음 mount 때 지정한 Web allowedOrigins는 확대되지 않는다. 외부 리소스 사용에는 운영자 URL·허용 origin·비용 동의를 포함한 기존 WebMapConfig가 필요하다. Native는 origin별 요청 차단을 아직 구현하지 않아 외부 source/glyph/sprite 및 symbol 스타일을 `UNSUPPORTED`로 거부한다. 라이브 검색·지오코딩·경로·GPS·DB 구현을 이번 계약 추가만으로 완료했다고 보지 않는다.

## SDK 사용

Web (Next.js에서는 기존처럼 클라이언트 컴포넌트 안에서 실행):

```ts
import { createMap } from '@korea-map-kit/web';
import { defineMapStyle, defineMapLayer, type MapController } from '@korea-map-kit/core';

const handle = await createMap({ container, workerUrl: '/vendor/maplibre/maplibre-gl-worker.mjs', config: { mode: 'local-fixture', fixtureId: 'synthetic-v1' } });
await handle.ready;
const map: MapController = handle.api;
await map.setCenter([126.978, 37.5665]);
await map.setZoom(14);
await map.addMarker({ id: 'one', coordinate: [126.978, 37.5665], label: '직접 만든 예제' });
await map.showRoute({ id: 'walk', coordinates: [[126.97, 37.563], [126.978, 37.5665]] });
const background = defineMapLayer({ id: 'own-background', type: 'background', paint: { 'background-color': '#eef5ef' } });
await map.setStyle(defineMapStyle({ version: 8, sources: {}, layers: [background.definition] }, '자체 데이터 · MIT'));
const bounds = await map.getVisibleBounds();
const unsubscribe = map.onEvent((event) => { if (event.type === 'select') console.log(event.marker?.id); });
// 컴포넌트 cleanup: unsubscribe(); map.destroy();
```

Native는 `const map = useRef<MapController>(null)`과 `<MapView ref={map} config={...} onEvent={...} />`를 사용한다. ready 이후 `map.current`로 위와 동일한 함수를 호출한다. null ref와 unmount를 처리해야 한다. React 19 ref prop을 사용한다.

실행 예제: [Web /api](../examples/web/app/api/api-demo.tsx), [Expo App](../examples/expo/App.tsx). [컴파일 타입 예제](../tests/types/public-api.ts)는 잘못된 좌표/카메라/스타일/GeoJSON/취소 타입에 `@ts-expect-error`를 적용해 허용 범위가 의도치 않게 넓어지는 것을 막는다.

## Web·Android·iOS 기능 동등성

Native의 '구현'은 실제 화면 합격이 아니다. Android/iOS는 동일 RN wrapper를 사용하며 양쪽 JS export 및 타입 검사와 mock bridge 테스트만 수행했다.

| 기능 | Web | Android | iOS |
| --- | --- | --- | --- |
| 공통 타입/Controller/Provider 계약 | 구현·타입 검사 | 동일 계약·타입 검사 | 동일 계약·타입 검사 |
| setCenter/setZoom/setCamera/fitBounds | 실제 Chromium 검증 | bridge 구현·mock 검증; 기기 미검증 | bridge 구현·mock 검증; 기기 미검증 |
| add/removeMarker, GeoJSON, showRoute | 실제 렌더링 검증 | 선언형 Source/Layer 구현; 기기 미검증 | 선언형 Source/Layer 구현; 기기 미검증 |
| getVisibleBounds/날짜변경선 | 렌더러 경계 + 순수 함수/브리지 테스트 | bridge 구현·mock 검증 | bridge 구현·mock 검증 |
| setStyle 및 overlay 유지 | 실제 반복 교체 검증 | 로컬 도형 스타일만 구현; 렌더링 미검증 | 로컬 도형 스타일만 구현; 렌더링 미검증 |
| 외부 tiles/glyph/sprite | 초기 허용 origin 정책 아래 사용 가능 | 미지원, 명시적 거부 | 미지원, 명시적 거부 |
| MapEvent | 실제 카메라·선택·종료 연결 | event props 연결, 화면 미검증 | event props 연결, 화면 미검증 |
| 선택 UI/접근성 | 키보드 selector/팝업 검증 | 터치 선택·Text 표시 구현; 접근성 QA 미검증 | 터치 선택·Text 표시 구현; 접근성 QA 미검증 |
| 취소/timeout/종료 | core 단위 + 실제 pre-cancel/종료 | core·mock bridge 통과, 기기 lifecycle 미검증 | core·mock bridge 통과, 기기 lifecycle 미검증 |
| 검색/지오코딩/경로 계산/GPS/DB | 계약과 로컬 fixture 검색만 제공 | 동일; 실제 서비스 미구현 | 동일; 실제 서비스 미구현 |

## SemVer와 근거

공통 계약은 `@korea-map-kit/core`가 소유하며 다섯 SDK 패키지는 기존 Changesets fixed group을 유지한다. 현재 0.1.0 manifest는 아직 발행하지 않았고 이번 Changeset은 minor다. 기존 메서드/이름을 제거하지 않았지만 KitErrorCode union 확장은 exhaustive switch 사용자의 소스 수정이 필요할 수 있어 0.x minor 릴리스 노트에 명시한다. 안정 1.x 이후 호환성을 깨는 의미·형태·반환값 변경은 major, 호환 API 추가는 minor, 버그 수정은 patch로 관리한다. 0.x에서도 파괴적 변경은 최소 minor와 마이그레이션 설명을 요구한다. 자동 publish는 없다.

엔진 버전과 전이 의존성 그래프 변경은 없다. Native는 RN 11.5.0이 이미 정확히 사용하는 Style Spec 26.2.1을 직접 의존성으로 명시해 해당 스키마로 JSON을 검증한다(ISC). Web/styles는 26.4.4를 유지한다. Native TypeScript는 상위 패키지의 extensionless 타입 참조를 올바르게 해석하도록 ESNext/Bundler를 사용하며, `check:native-types`가 component/ref/method의 any 유입을 차단한다. GL JS 6.14.0, RN 11.5.0, 두 Style Spec, TypeScript 6.0.3의 설치 선언과 아래 공식 문서를 2026-10-19에 대조했다. 공식 페이지가 미래 버전으로 바뀔 수 있으므로 lockfile/타입 검사 결과를 함께 본다.

- [MapLibre GL JS Map](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/): setStyle, fitBounds, getBounds.
- [MapLibre React Native Camera](https://maplibre.org/maplibre-react-native/docs/components/camera): setStop, bounds 순서, duration.
- [MapLibre React Native Map](https://maplibre.org/maplibre-react-native/docs/components/map): getBounds, onDidFinishLoadingStyle, region/press 이벤트.
- [MapLibre Style Spec](https://maplibre.org/maplibre-style-spec/): JSON layer/source 의미.
- [RN 11.5.0 공식 npm metadata](https://registry.npmjs.org/@maplibre/maplibre-react-native/11.5.0): Style Spec 26.2.1 정확 의존성 확인.
- [Style Spec 26.2.1 metadata](https://registry.npmjs.org/@maplibre/maplibre-gl-style-spec/26.2.1): ISC 라이선스 및 버전 확인.

Native 재현: 기존 개발 가이드에 따라 `pnpm --filter @korea-map-kit/example-expo android` 또는 macOS에서 `ios` 실행 후 ready, marker 선택, route, bounds, style 교체, 취소/종료, 회전·백그라운드 복귀를 확인한다. 실제 native toolchain/device와 glyph provider가 필요한 검증은 아직 완료되지 않았다.
## 공공 POI 조회 확장

`PublicPlace`는 기존 `Place`와 별개로 출처·라이선스·주소·카테고리·nullable 위치를 보존한다.
`createPlacesClient()`의 nearby/bounds/category 조회와 `PlacesProvider`는 core의 순수 계약이며
Web/React Native가 동일하게 사용한다. 기존 `PlaceRepository` 쓰기 인터페이스는 변경하지 않는다.
PostGIS/HTTP/합성 어댑터와 사용 예제는 [공공데이터 가이드](public-data-etl.md)에 있다.

| 기능 | Web | React Native | 실제 검증 |
| --- | --- | --- | --- |
| 3종 POI 조회 / 타입 / 기한·취소 | 공통 core | 공통 core | Node 단위·독립 core·실제 로컬 DB/HTTP 통과 |
| 합성/운영자 transport Provider | 동일 구현 | 동일 구현 | 단위 및 로컬 HTTP 통합 |
| 조회 결과 지도·카드 연결 | 위치 확인 후 변환 | 위치 확인 후 변환 | 이번 단계의 신규 UI/Native 실화면 미검증 |
