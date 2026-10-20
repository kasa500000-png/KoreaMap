# 독립 Native 소비 앱 검증

확인일: 2026-10-20. Native 릴리스 검증은 모노레포 안의 alias/소스 해석과 실제 npm
tarball 소비를 구분한다. 이 문서는 현재 후보의 독립 Expo 소비 검증 절차와 결과를 기록한다.
최종 Android/iOS 지원 판정은 [Native 검증](native-sdk-validation.md)과
[릴리스 보고서](../releases/v0.1.0.md)의 기기·바이너리 조건도 충족해야 한다.

## 재현

```sh
pnpm build:sdk
pnpm pack:check
pnpm verify:native-consumer
pnpm test:native-consumer
```

검증 스크립트는 `scripts/verify-native-consumer.mjs`, 정책 회귀 검사는
`tests/native-consumer.test.mjs`다. `artifacts/qa/native-consumer.json`에 실제 소비한
세 tarball의 이름·버전·크기·SHA256, 소스 커밋/dirty 여부와 단계별 결과를 기록한다.
설치·앱 코드·플러그인·export 실패는 종료 코드가 0이 아니고 이미 통과한 단계만 남긴다.
의존성 선언 전체 검사는 독립 probe다. 이 probe가 실패하면 별도 `FAIL`과 `PARTIAL_PASS`를
기록하며 앱 코드 검사 성공으로 덮어쓰지 않는다. 임시 소비 앱은 성공·실패 모두 삭제한다.

## 검증 범위

- 워크스페이스 밖 임시 Expo 앱에 `korea-map-core`, `korea-map-native`,
  `korea-map-styles` 실제 tarball을 설치한다. workspace/link/source alias를 금지하고
  SDK의 실제 경로가 임시 앱 내부인지, `dist/index.js`와 공개 선언만 소비하는지 검사한다.
- React 19.3.0, React Native 0.88.0, MapLibre RN 11.5.0, Expo/Dev Client 58.0.14,
  Expo Location 58.0.17을 고정한다. TypeScript 6.0.3, React 타입 19.3.0,
  GeoJSON 타입 7946.0.16을 사용한다. 설치된 전이 버전은 기존 검토 그래프와 대조한다.
- 패키지 매니저 캐시와 저장소 lock을 사용해 `--offline`으로 새 lock을 만들고
  `--offline --frozen-lockfile --ignore-scripts`로 설치한다. 라이프사이클 스크립트,
  원격 서비스, API 키, 클라우드 빌드/계정은 사용하지 않는다. 캐시가 부족하면 안전하게 실패한다.
  hardlink를 강제하여 대형 의존성 파일을 복제하지 않으며 pnpm 저장소 캐시 자체는 삭제하지 않는다.
- strict, ESNext/Bundler와 DOM 없는 ES2022 lib로 앱 코드/공개 API를 검사한다.
  공통 지도 명령, Native 컴포넌트/ref, 테마와 선택형 Expo Location 구조를 함께 컴파일한다.
  잘못된 좌표/마커/Native 설정의 음성 타입 검사와 컴포넌트/props의 any 유입 검사도 포함한다.
  앱 검사는 `skipLibCheck:true`를 명시한다. `skipLibCheck:false`로 상위 의존성 선언까지
  검사하는 별도 probe를 실행하고 실패 코드·파일을 그대로 보고한다. 전체 선언 통과를 주장하지 않는다.
- Expo config plugin 실행 이력과 Android Gradle properties의 13.6.1/OpenGL 적용,
  config의 iOS 6.31.0 선택,
  foreground 위치 권한, iOS background mode/Android background permission·location service
  비활성화 및 OTA update 비활성화를 검사한다. iOS Podfile mod는 introspection 대상이 아니므로
  실제 생성/컴파일 시 재확인해야 한다. 이는 APK/IPA manifest 검증이 아니다.
- 같은 앱에서 Android/iOS JavaScript export를 수행한다. 기본 지도는 glyph·타일 요청 없는
  자체 합성 도형이며 JS export 시 위치 수집이나 OS 권한 요청은 실행하지 않는다.

## 실행 결과와 남은 기기 검증

이번 로컬 독립 소비 검증 결과는 다음과 같다. 실제 tarball SHA와 소스 상태는 ignored
`artifacts/qa/native-consumer.json`에 기록하며 최종 재포장 이후 같은 명령을 다시 실행한다.

| 항목 | 결과 |
| --- | --- |
| 실제 core/native/styles tarball 캐시 설치 | 통과. 신규 dependency 파일 다운로드·install hook 없음 |
| strict 앱 코드/공개 API, `skipLibCheck:true` | 통과. 컴포넌트/props any 방지 및 음성 타입 검사 포함 |
| 의존성 전체 선언, `skipLibCheck:false` | **실패**. React Native 0.88.0 상위 선언 3건: TS2411/TS2344/TS2416 |
| Expo config plugin / foreground 권한 설정 | 통과. 실제 plugin introspection; 네이티브 manifest/권한 UI는 별도 |
| Android / iOS JavaScript export | 통과. APK/IPA 컴파일·설치·실화면의 증거가 아님 |
| verifier 정책 회귀 3개 / ESLint / Prettier | 통과 |

전체 선언 오류는 `AnimatedProps.d.ts`의 style index signature, `VirtualizedList.d.ts`의
React component constraint, `ReactNativeDocument.d.ts`의 textContent override다.
기존 모노레포의 `skipLibCheck:true` 검사에서는 드러나지 않았던 제약이다. 앱/API 코드 성공과
구분해 `PARTIAL_PASS`로 기록하며 해당 상위 선언을 로컬 패치하거나 검사를 통과로 위장하지 않는다.

현재 `adb devices -l`의 연결 목록은 비어 있고 `xcodebuild`/`xcrun`은 없다.
기존 Android SDK/JDK와 예전 생성 프로젝트가 있어도 현재 tarball로 만든 APK의 증거가 아니다.
이번 독립 소비 검증에서 APK/IPA 컴파일, Android 실제 기기, iOS simulator/device는 실행하지 않는다.
Expo Go를 사용하거나 성공했다고 주장하지 않는다.

실제 XYZ+허가 glyph·한글 지도 라벨, PMTiles/HTTP 대체, OS 권한·동의·센서,
제스처·회전·background 복귀·메모리·OS egress와 최종 바이너리 고지는 별도 검증이다.
`NOT_RUN`은 해당 기능의 실패가 확인됐다는 뜻도 아니며 전체 플랫폼 출시 게이트를 통과시키지도 않는다.
최종 기기 검증은 현재 후보 tarball을 다시 설치한 Android ARM64 실기기와 macOS/Xcode 기반
iOS Development Build에서 각각 수행한다. 위치·로그·바이너리는 Git/npm에 포함하지 않는다.

## 별도 현재 워크스페이스 Android 빌드 — 2026-10-20

사용 가능한 기존 생성 프로젝트와 캐시로 Android Development Build를 추가 실행했다.
이는 위의 독립 tarball 소비 프로젝트와 다른 검사다. `examples/expo/android`를 사용했으며
새 prebuild·에뮬레이터·외부 다운로드·EAS 빌드를 시작하지 않았다.

생성된 Gradle 속성의 MapLibre 13.6.1/OpenGL/locationEngine, New Architecture/Hermes,
application ID, foreground 위치 권한·background 위치 권한/서비스 없음, updates 비활성화를
현재 `app.json`/plugin 설정과 대조해 일치 확인했다. Gradle wrapper 다운로드를 피하기 위해
이미 설치된 Gradle 9.4.1 실행 파일을 직접 사용했다. JDK 21.0.12.1·기존 Android SDK·Gradle cache를
지정하고 proxy/CA 환경을 유지했다. 175초 제한과 종료 정리를 적용한 실제 작업 인수는 다음과 같다.

```text
:app:assembleDebug --offline --no-daemon --max-workers=2 --console=plain -PreactNativeArchitectures=x86_64
```

결과: **BUILD SUCCESSFUL in 37s**, 실제 경과 37.86초, exit 0.
355 actionable tasks 중 13 executed/342 up-to-date로 기존 빌드 캐시를 재사용했다.
fresh clean build나 다른 OS에서의 재현성 검증으로 표현하지 않는다.

- APK: `examples/expo/android/app/build/outputs/apk/debug/app-debug.apk`, 83,382,858 bytes.
- SHA256: `f1592806b73c2b13e635383a45f1df41129a14f5bbbe97cef91b565e60545bb2`.
  이전 APK와 바이트가 달라진 실제 packageDebug 산출물이다.
- `aapt dump badging`: `org.koreamapkit.example`, version 0.1.0, minSdk 24,
  targetSdk 36, compileSdk 37, native-code x86_64.
- 실제 APK permission 목록에서도 coarse/fine location을 확인했고 background location과
  location foreground service 권한은 없었다. OS 권한 UI·수집 동작은 실행하지 않았다.
- 증거: ignored `artifacts/native-current-workspace/probe.json`, `gradle-offline.log`,
  `apk-badging.txt`. 소스 기준 `76b379b9dd2abbb6393e90f789a78ac2fd352762`,
  **sourceDirty=true**이며 관련 SDK/예제/lock 입력 해시를 별도로 기록했다.

이 APK는 기존 워크스페이스의 debug Development Build다. Debug의 Metro 연결형 실행을
현재 JavaScript를 내장한 배포 바이너리로 간주하지 않으며 실제 실행/설치도 수행하지 않았다.
독립 tarball Android APK·ARM64 실기기·iOS·XYZ/glyph·PMTiles·OS egress·최종 binary notices는
계속 미검증이다. 현재 후보 변경이 포함된 워크스페이스의 native compile 증거만 추가한다.
