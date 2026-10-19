# GPS·경로 검증 — 2026-10-19

대상 브랜치 `feat/gps-tracks`, 기반 `feat/korean-search` 커밋 `2c3e14994dbb5d3e3430b8724b52706bb0ece337`.
커밋 식별: `git log -1 --format='%H %s' --grep='^feat: add consent-gated GPS tracking and route exchange$'`.

## 공식 자료와 버전

- [W3C Geolocation](https://www.w3.org/TR/geolocation/) HTTP200: 권한·secure context·watch/clearWatch와 문서 활성 상태.
- [GPX1.1 명세](https://www.topografix.com/GPX/1/1/) HTTP200: namespace, trk/trkseg/trkpt·time.
- Expo 버전/최신 location 문서 페이지는 접근 오류. 대신 [공식 저장소 문서](https://raw.githubusercontent.com/expo/expo/main/docs/pages/versions/unversioned/sdk/location.mdx)와 [공식 구현](https://raw.githubusercontent.com/expo/expo/main/packages/expo-location/src/Location.ts) HTTP200 확인.
- [npm 공식 메타데이터](https://registry.npmjs.org/expo-location/latest)에서58.0.17/MIT 확인.
  설치된 expo58.0.14의 bundledNativeModules.json도 `~58.0.17`을 지정한다. 예제 앱에 exact58.0.17 고정,
  lockfile 반영. expo-task-manager는 optional이며 추가하지 않았다. SDK native는 Expo Location을 주입받고 필수 의존성으로 포함하지 않는다.
- 문서 main은 변경 가능하므로 실제 설치58.0.17의 선언/플러그인도 확인했다. High=4, foreground permission,
  watchPositionAsync의 remove 및 오류 callback을 사용한다. API 형태는 strict TypeScript로 실제 모듈과 대조한다.

## 수행한 검사

새 Vitest17개는 거리 기준값/날짜변경선·오차/시간/속도/중복/공백·pause/resume/stop·capacity·스냅샷 복사,
GeoJSON·GPX 왕복/정보 손실·불량 XML/DTD/entity/시간/좌표·리플레이 시간/타이머, 동의/취소/권한 오류,
늦은 구독 획득·Expo AppState/브라우저 bridge 해제를 검사한다. 단위 테스트는 fetch 차단 환경이다.

새 Chromium E2E2개는 production Next `/gps/`에서 다음을 확인했다.

- 동의 전 비활성화, 모의6점 실시간 표시, pause 후 새 segment, 거리/활성 시간, 파일 다운로드,
  GeoJSON/GPX 불러오기·다중 경로·리플레이·기록 삭제와 페이지 제거.
- 실제 브라우저 Geolocation API에 Playwright 합성 위치를 주입해 허용된 현재 위치·정확도와 구독 확인.
  CDP permission denied로 현재 위치/구독 `PERMISSION_DENIED`, visibility 이벤트 모의로 중단·자동 재개 없음 확인.
- 로컬 origin 밖 요청을 차단하고 외부 HTTP 시도0 확인. 직접 위성/OS 센서의 정확도 검증은 아니다.
- ignored `test-results/gps-tracks.png` 화면 캡처를 직접 확인했다. 합성 데이터이며 개인의 실제 경로가 아니다.

`expo config --type introspect --json` 실행: Android ACCESS_COARSE_LOCATION/ACCESS_FINE_LOCATION,
iOS NSLocationWhenInUseUsageDescription 확인. background location·foreground service·location UIBackgroundModes 없음.
기존 Expo 개발 권한/INTERNET은 지도·개발 앱의 선언이며 위치 업로드 기능의 추가가 아니다.
이는 생성 설정 검사이며 APK/IPA manifest·실기기 권한/센서·background 검증이 아니다.

최종 check/pack/전체 Web 회귀 및 CI 결과는 [진행 기록](../progress.md)에 확정한다.

## Android 실기기·백그라운드 차단과 재현 절차

환경 점검: ADB/emulator 실행 파일 없음, Android SDK 설치 경로 없음, /dev/bus/usb 없음.
연결 도구 목록에도 Android 기기 제어 도구가 없다. **실제 Android 기기 테스트를 실행하지 못했다.**
Expo JS export와 모의 AppState 테스트를 기기/백그라운드 통과로 보고하지 않는다. iOS도 기기/SDK 없음.

연결 가능한 권한 있는 개발 기기에서 다음을 수행한다. 기기 식별자·실제 경로·원문 로그는 Git/PR에 올리지 않는다.

1. Android SDK/JDK를 설치하고 `adb devices`에서 승인된 실제 기기를 확인한다.
   저장소 `pnpm install --frozen-lockfile`, `pnpm build:sdk`, `pnpm --filter @korea-map-kit/example-expo android`로 개발 빌드 설치.
2. 앱의 **GPS 경로 예제** 진입. 미동의/권한 거절에서 수집0, 정확/대략 권한 각각의 상태를 확인한다.
   대략 위치의 정확도가50m를 넘으면 기본 필터가 경로점을 제외하는 것이 의도된 동작이다.
3. 동의 후 실외의 알려진 거리 구간에서 현재 위치·정확도·1Hz 요청/실제 주기·배터리·거리 오차를 측정한다.
   pause 중 점수 증가0, resume 후 새 segment, stop·삭제 후 지도/기록 제거를 확인한다.
4. 홈 전환·화면 잠금·알림/권한 화면·프로세스 종료·배터리 절약을 각각 검사한다.
   이번 구현의 기대값은 **background 지속 기록이 아니라 중단**, 복귀 후 자동 재개 없음이다.
   OS가 JS AppState 전환을 지연하는 경우까지 실제 기기에서 점 증가·native subscription 제거를 확인해야 한다.
5. GPS 불능/비행기 모드·권한 취소·늦은 구독 응답에서 기한/오류와 누수 여부를 검사한다.
   정확/대략 위치, 권한 팝업 중 inactive, OS 버전별 제한을 구분한다.
6. GPX/GeoJSON 복사→가져오기·다중 경로·리플레이와 삭제를 검사한다. 이미 복사한 내용은 별도로 삭제한다.
   UIAutomator 좌표로 조작하고 실제 화면을 확인한다. 기기 로그는 필터링/비식별화한 결과 코드만 기록한다.

원하는 background 지속 기록은 별도 단계다. Android foreground service/알림·background permission,
iOS background mode/Always permission·앱 배포 정책·배터리/수명/개인정보 재검토와 실기기 검증이 먼저 필요하다.
현재 설정에서 해당 권한·서비스·자동 재시작을 켜지 않는다.

## 전체 로컬 검사와 배포물

`pnpm check`: Vitest74·독립 core1·데이터정책18·비용감사15·strict/native 타입/린트/형식·API/설계·Next/Expo JS export 통과.
`pnpm test:web`: Chromium9개 통과(0 skipped/retry), 외부 HTTP 시도0. 서로 떨어진 합성 경로2개,
중단된 segment·정확도 원·리플레이 마커를 캡처에서 직접 확인했다. 이 이미지/다운로드는 ignored이고 Git에 넣지 않는다.
`pnpm pack:check`: SDK5개 실제 tarball의 allowlist/빌드 바이트/출처·키/endpoint 검사 통과, 정적 findings0.
core SHA256 `43d7def4cee43ae93d7f3e303dad4a6416b7b91dfb7a9471297ad5947ab46468`,
web `669aa3f2ed8a31d51f265a08ebfc98c8fe58126e42c3febd453ef7bd18fc4613`,
native `b492d4f60e203f03227bf5819c86d1a9ae9795fc05a5236215f41221a46e8c01`.
패키지는 SDK 코드만 포함하고 Expo Location 구현/실제 사용자 경로/원본 GPX 파일은 포함하지 않는다.
입력란 spellcheck/autocorrect/autocomplete는 비활성화했다. Android 실센서/OS 진단 로그·기기 background는 미검증 상태다.
