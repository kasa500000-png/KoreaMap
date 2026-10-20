# GPS와 이동 경로

현재 위치/구독, 정확도 표시, 실시간 경로, 거리·활성 기록 시간, 일시정지/재개/종료,
GeoJSON/GPX 교환, 다중 경로와 리플레이를 공통 코어로 제공한다.
**전경 수집만 지원**한다. 앱을 벗어나면 수집을 중단하며 자동 재개하지 않는다.
Android/iOS 실제 기기와 백그라운드 동작은 아직 미검증이며, 이번 모듈을 백그라운드 추적 서비스로 표시하면 안 된다.

## 계약과 동의

- 기존 `LocationProvider.getCurrentPosition()`은 유지한다. `LocationStreamProvider`가 `watchPosition()`을 추가한다.
- `createLocationClient(provider, scheduler)`는 최초 동의 false다. `setConsent(true)` 이후 명시적 조회/구독만 허용한다.
  동의는 인스턴스 수명 동안만 유지하며 OS 권한과 별개다. OS 권한 거절은 `PERMISSION_DENIED`다.
- `createBrowserLocationClient()`는 브라우저 Geolocation API와 visibilitychange에 연결한다. import/생성만으로 권한을 묻지 않는다.
  HTTPS 또는 신뢰 가능한 localhost와 브라우저 위치 권한이 필요하다. 첫 위치를 받은 뒤 one-shot watch를 해제한다.
- `createExpoLocationClient(expoLocation, AppState, scheduler)`는 앱이 주입한 Expo 모듈을 사용한다.
  SDK의 필수 Expo 의존성은 없다. foreground permission과 High(4) 정확도, 1초 권장 간격을 요청한다.
  OS는 간격/정확도를 보장하지 않는다. null 정확도는 추정하지 않고 오류 처리한다.
- `setConsent(false)`, `setForeground(false)`, 취소, dispose는 모든 해당 구독을 중단한다.
  이미 진행 중인 OS 권한 팝업 자체를 닫을 수는 없지만, 늦게 획득된 구독은 즉시 해제한다.
  다시 active가 되어도 앱의 재개 동작이 필요하다. 권한 팝업이 inactive를 유발하는 플랫폼에서는 허용 후 다시 시도할 수 있다.
- `watchPosition`의 timeout은 **구독 준비 기한**이다. 구독 자체는 stop/취소/오류/비활성까지 유지된다.
  `getCurrentPosition`은 최초 위치의 기한까지 포함한다. 기본 기한10초, 호출별 조정 가능.
- callbacks의 오류는 안전한 `LocationError`로 정규화한다. 임의 OS 메시지/좌표/응답을 로그하지 않는다.
  `onError`는 terminal이며, 재시도는 사용자가 결정한다. 구독의 `stop()`은 반복 호출 가능하다.

```ts
import { createTrackRecorder, tracksToFeatureCollection } from 'korea-map-core';
import { createBrowserLocationClient } from 'korea-map-web';

const gps = createBrowserLocationClient();
// 앱에서 수집 목적·보관/삭제 방법을 안내하고 사용자가 명시적으로 동의한 뒤 실행한다.
gps.setConsent(true);
const recorder = createTrackRecorder('walk', {
  monotonicMs: () => performance.now(), epochMs: () => Date.now(),
});
recorder.start();
const subscription = await gps.watchPosition({
  onLocation(fix) {
    const decision = recorder.ingest(fix);
    if (decision.accepted) {
      const snapshot = recorder.getSnapshot();
      // Web handle.api 또는 Native MapController:
      // map.addGeoJSON('walks', tracksToFeatureCollection([snapshot.track]));
    }
  },
  onError() { if (recorder.getSnapshot().state === 'recording') recorder.pause(); },
});
// 위치 수집과 기록은 별도 수명이다. pause 시 둘 다 멈춰야 한다.
subscription.stop(); recorder.pause();
// 재개 시 recorder.resume()와 새 gps.watchPosition()을 명시적으로 실행한다.
const result = recorder.stop();
// 사용자가 삭제할 때:
recorder.clear(); gps.dispose();
```

[Web 실행 예제](../examples/web/app/gps/gps-demo.tsx), [Expo 실행 예제](../examples/expo/gps-demo.tsx),
[타입 예제](../tests/types/gps.ts), [생성 API 문서](api/core.md)를 참고한다.
Web은 `pnpm dev:web`의 `/gps/`, Expo는 시작 화면의 **GPS 경로 예제**로 진입한다.
Web 기본값은 모의 GPS이며 체크박스·시작·한 걸음 버튼으로 수동 재생한다. 테스트용 좌표/시각은 자체 생성이다.

## 경로 모델과 정확성

`Track`은 version/id/segments/durationMs만 보관한다. `TrackPoint`는 `[경도, 위도]`, timestampMs,
accuracyMeters다. 파일에 시각/정확도가 없으면 null이며 값을 발명하지 않는다.
스냅샷과 입력은 복사하며 SDK가 저장소·DB·fetch·telemetry를 호출하지 않는다.

| 규칙 | 기본값/동작 |
| --- | --- |
| 수평 정확도 | 50m 초과 제외, 파싱 시 0..100,000m |
| 비정상 속도 | 15m/s 초과 제외; 보행/자전거 참고값, 차량은 운영자가 별도 설정 |
| 중복/지터 | 동일 좌표는 점 추가 안 함; 3m 미만 변화 제외 |
| 시간 | 이전 관측 시각 이하 제외; 과거30초 초과 또는 미래5초 초과 제외 |
| GPS 공백 | 마지막 유효 위치로부터30초 초과면 새 segment, 연결 거리 추가 없음 |
| 보관 상한 | 10,000점/경로, 1,000 segment/경로; 상한 도달 시 일시정지 |
| 좌표/단위 | WGS84 `[longitude, latitude]`; 미터와 밀리초 |
| 거리 | 평균 지구 반경6,371,008.8m의 Haversine 대권거리, segment 내 합산 |
| 시간 계산 | 주입한 단조 시계의 활성 기록 시간; 명시적 pause 제외, 정지/위치 대기 포함 |

속도·정확도·최소거리·공백/나이·점 상한은 `GpsFilterOptions`로 조절한다. 입력이 잘못되면 안전한 오류로 실패한다.
`ingest()`의 거절 이유는 enum이며 좌표/원문을 포함하지 않는다. 중복 좌표는 유효 기준 시각만 갱신한다.
불량 정확도·지터·속도 이상값은 거리 기준 위치로 사용하지 않는다. 일시정지 후 첫 점은 새 segment다.
`start`는 idle, `pause`는 recording, `resume`은 paused에서만 가능하며 종료한 기록은 clear 후 다시 시작한다.

거리에는 고도/지형 보정이 없으며 측량 수준 타원체 거리나 실제 도로 길이와 같지 않다.
자동 정지 감지에 의한 순수 이동시간은 아직 제공하지 않는다. 도시 협곡/실내/해안/고속 이동의 현장 정확도는 미검증이다.
위치 정확도 원은 플랫폼이 제공한 수평 추정 오차를 시각화할 뿐 실제 확률을 보장하지 않는다.
정확도 원이 날짜변경선/MapLibre Mercator 극한을 넘으면 지원 범위 오류로 실패한다.

## GeoJSON·GPX와 저장 정책

- `exportTracksGeoJSON()` / `importTracksGeoJSON()`: FeatureCollection의 Point/LineString/MultiLineString 지원.
  자체 `kmk-track-v1` properties는 시각·정확도·활성 시간·segment와 빈 경로 manifest를 보존한다.
  일반 GeoJSON의 임의 사용자 metadata는 버린다. 좌표는 2차원만 받으며 미지원 geometry는 거부한다.
- `exportTracksGPX()` / `importTracksGPX()`: GPX1.1 `trk/trkseg/trkpt`와 선택적 time 지원.
  기본/접두어 XML namespace를 확인하며 lat/lon을 공통 좌표 순서로 변환한다.
  UTC와 시간대 offset의 ISO 시각, 최대 밀리초 정밀도를 지원한다. 1970..9999년을 받는다.
  GPX route/waypoint(rte/wpt)는 미지원 오류, DTD/외부 entity/CDATA/일반 processing instruction은 거부한다.
  기본 XML entity와 숫자 entity만 해석하며 **namespace URL·외부 schema를 요청하지 않는다**.
- GPX의 name/link/extensions/고도·센서 값은 보관하지 않는다. HDOP를 미터 정확도로 바꾸지 않는다.
  GPX 왕복에서는 정확도와 원래 활성 시간이 손실되며, 가져온 시간은 segment별 마지막-첫 시각 합계다.
  시각이 없는 점이 있으면 전체 시간은 null이다. 좌표/시각/segment를 보존하는 2D 부분집합이며 전체 GPX/XSD 구현이 아니다.
- 파일 입력은 최대2,097,152 UTF-16 code unit, XML depth16/node40,000, 합계10,000점/50경로로 제한한다.
  Web 파일 선택은 별도로2MiB byte 제한이다. 불러온 자료를 자동 수정/필터링하지 않으며 비정상 좌표·시간 순서는 거부한다.
- `tracksToFeatureCollection()`은 원본 경로 배열을 지도 표시용 공통 GeoJSON으로 바꾼다. segment 사이에 선을 만들지 않는다.
- 변환 API는 문자열만 반환한다. Web 예제는 사용자가 내보내기를 눌렀을 때 Blob 다운로드를 시작한다.
  Expo 예제는 내용을 선택·복사/붙여넣기할 수 있게 제공한다. Native 파일 선택/암호화 저장/공유 UI는 앱 통합 대상이다.

사용자 경로 데이터의 권리·공개 범위는 사용자/소비 앱 정책을 따른다. SDK의 MIT가 사용자 기록에 자동 적용되지는 않는다.
장기 저장·암호화·보관 기간·백업·동기화·계정별 접근 제어·영구 삭제는 앱이 구현해야 한다.
SDK는 localStorage/AsyncStorage/Supabase/서버에 쓰지 않는다. 앱이 저장할 때는 별도 동의·정책과 저장 어댑터를 둔다.
`recorder.clear()`와 예제의 **모든 기록 삭제**는 GPS·리플레이 중단, 앱 메모리/textarea/지도 레이어·마커 참조 제거까지 수행한다.
이미 내보낸 파일·복사한 스냅샷·앱 외부 저장소의 삭제나 JS/GPU 메모리의 포렌식 수준 덮어쓰기를 보장하지 않는다.
내보내기 파일의 좌표/시각은 의도적으로 포함되므로 전송 대상은 사용자가 선택해야 한다.

## 리플레이

`replayFrameAt(track, elapsedMs)`는 순수 함수다. segment 내부의 좌표를 보간하고 경계에서는 순간 이동한다.
두 시각이 모두 있으면 시간 차이, 없으면 간선당1초를 쓴다. 날짜변경선에서는 짧은 경도 방향을 사용한다.
`createTrackReplay(track, clock, scheduler, onFrame, {speed,tickMs})`는 play/pause/stop/seek/destroy를 제공한다.
기본50ms 갱신, speed0.1..100, 실제 단조 시계 기준이라 타이머 지연이 누적 재생시간을 바꾸지 않는다.
리플레이는 GPS나 네트워크를 시작하지 않는다. seek/stop/dispose 시 이전 타이머를 제거한다.

## 개인정보와 플랫폼 경계

SDK/예제는 위치 로그를 작성하지 않으며 안전한 상태·오류 코드만 UI에 표시한다. 좌표와 원본 파일을
오류 추적 도구·analytics·공개 screenshot/CI artifact에 첨부하지 않는다. 현재 테스트/capture는 합성 좌표만 사용한다.
플랫폼 위치 API는 GPS 외 Wi-Fi/셀룰러/OS 위치결정 서비스를 사용할 수 있다. 기기 전체의 네트워크 무통신을
SDK가 보장하지는 않는다. 제작자 소유 endpoint/키·위치 업로드와는 별개이며 앱의 개인정보 안내에 포함해야 한다.
브라우저 permission/visibility 테스트를 센서·OS background 증거로 대체하지 않는다.

공식 문서·의존성·기기 준비 상태와 테스트 결과는 [GPS 검증 기록](research/gps-validation.md),
비용/배포 검사는 [비용 감사](cost-audit.md)를 따른다.
