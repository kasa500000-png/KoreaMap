# Native SDK 검증 기록

확인일: 2026-10-19. 브랜치 `feat/native-sdk`. 이전 GPS/공통 API 기록에 추가되는 단계다.

## 범위와 근거

MapLibre RN 11.5.0 / Expo 58.0.14 / RN 0.88.0 / React 19.3.0,
Android Native 13.6.1 OpenGL / iOS 6.31.0, New Architecture/Hermes.
공식 문서·호환성·설치·PMTiles 제한은 [설치 가이드](../native-sdk.md)를 따른다.
설치된 wrapper 타입·plugin·Android/iOS 엔진 선언과 Expo bundledNativeModules를 대조했다.
Expo Development Build용 dev-client 58.0.14를 정확히 추가했으며 Expo Go는 사용하지 않았다.

## 자동 검사

- Native 정책·4종 테마·mock session 신규 14개 및 기존 공통 API 10개: 통과.
- 설정 없는 외부 리소스 거부, origin/TLS/URL 사용자 정보·query 차단, remote TileJSON/GeoJSON 거부,
  명시적 glyph·sprite, PMTiles opt-in과 HTTP 선택, style generation·overlay 유지·콜백 예외·종료 검사.
- core와 Native TS strict 및 설치된 MapLibre ref/component 실제 타입 검사를 유지한다.
- 전체 `pnpm check`, npm tarball 검사와 최종 staged 감사 결과는 아래 최종 결과에 기록한다.
- 네트워크가 차단된 Vitest에서 수행한다. 이 결과는 native HTTP/화면/메모리 프로파일 증거가 아니다.

## 네이티브 빌드·실행 환경

Linux x86_64, Node 24.19.0, pnpm 12.14.0, OpenJDK 21.0.12.1.
Android 공식 command-line tools 15859902를 다운로드하고 공식 페이지 SHA256
`4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583`와 일치 확인했다.
SDK는 저장소 밖에 설치했다. Android/iOS `expo prebuild --no-install` 통과;
iOS Podfile에 MapLibre post_install hook 확인. 이 단계는 APK/IPA 컴파일이 아니다.

Gradle `:app:assembleDebug -PreactNativeArchitectures=x86_64 --max-workers=2`를 로컬에서 실행한다.
최종 plugin 설정으로 Android Development Build **컴파일 통과**: 2m 3s,
335 tasks(303 executed/32 up-to-date). 이전 초기 빌드도 6m 54s에 통과했다.
APK: `artifacts/native/korea-map-kit-debug-x86_64.apk` (ignored, x86_64 전용 debug).
SHA256: `9af92516d50db13ec52b87640e8834216e99c8ed5c46412400ee952e3a827673`.
`aapt dump badging`: package org.koreamapkit.example, minSdk 24, targetSdk 36, compileSdk 37.
ARM64 실기기 바이너리 빌드나 iOS 컴파일을 이 결과로 대신하지 않는다.
최종 Android gradle.properties의 nativeVersion 13.6.1/OpenGL 및 iOS Podfile의 6.31.0을 확인했다.
Expo launcher 설정을 반영한 후 재생성·재빌드했다. generated 프로젝트는 저장소에서 제외한다.
ADB 최초 연결 물리 기기 0개. `/dev/kvm`·USB 기기와 xcodebuild 없음.
Android API 35 x86_64 소프트웨어 에뮬레이터를 추가로 준비했다.
macOS/Xcode/서명 환경 부재로 iOS Development Build·시뮬레이터·실기기 검증은 **미검증**.
EAS/유료 빌드/원격 배포를 실행하지 않았다.

## 기기 QA 합격 조건

| 항목 | 절차 | 현재 판정 |
| --- | --- | --- |
| 실제 Android 기기 | USB Development Build 설치, OS/기종/APK hash 기록 | 연결 기기 없음·미검증 |
| iOS Development Build | macOS/Xcode pod 설치·컴파일·시뮬레이터/기기 설치 | 환경 없음·미검증 |
| 지도·마커·경로 | 첫 ready, 2개 마커 선택/카드 닫기, polygon/합성 경로 | 단위/구현 확인; 실화면 별도 |
| 터치/스크롤 | 지도 스위치 on에서 pan/pinch/rotate, off에서 부모 스크롤 | 기기 미검증 |
| 회전 | portrait/landscape 전환, 지도 크기·카메라·출처·카드 확인 | 기기 미검증 |
| 백그라운드 복귀 | 홈→앱 10회, crash·검은 화면·중복 이벤트 없음 | 기기 미검증 |
| 위치 권한 | 동의 전 미요청, 거절/허용/설정 취소, background 중단 | 모의 GPS 통과; OS 미검증 |
| 메모리 정리 | 지도/GPS 화면 20회 전환, listener·watch 해제, native heap/GPU 추이 | mock 해제 검사; native profiler 미검증 |
| 테마 | 4종 5회 반복, 카메라·overlay·출처 유지 | Style Spec/mock 통과; 기기 미검증 |
| 한글 glyph | 운영자 fontStack의 실제 PBF, name:ko 우선, 누락·줄바꿈 확인 | 설정/표현식 통과; glyph 화면 미검증 |
| PMTiles Android/iOS | 동일 허가 archive를 RN inline source로 load, Range 206·pan/zoom 확인 | 엔진 문서만 확인; 실제 호환 미검증 |
| HTTP 대체 | 명시적 XYZ로 remount, 동일 피처·출처 표시, 요청 host 확인 | source 선택/정책 단위 통과; 기기 HTTP 미검증 |
| Zero Publisher Cost | 네트워크 capture에서 기본 지도의 제작자 endpoint 요청 0 | 정적/mock; OS 전체 네트워크 미검증 |

UI 자동화는 `adb shell uiautomator dump`의 node bounds로만 탭 위치를 얻는다.
화면 캡처·logcat·profiling은 ignored `artifacts/native/`에 두고 실제 위치·토큰을 제거한다.
현재 저장소 정책에 따라 Native 스크린샷·지도/font payload를 Git/npm에 추가하지 않는다.
실화면 결과를 Web 스크린샷이나 Expo JS export로 대체하지 않는다.

## 라이선스·제한

SDK/예제/합성 데이터 MIT. MapLibre RN·Expo MIT, Native BSD-2-Clause, Style Spec ISC 등
상위 라이선스는 별개다. 한글 폰트·glyph·실제 지도·PMTiles payload는 포함하지 않는다.
`pnpm audit`는 기존 node-forge/braces **high 2**, exit 1. 신규 dev-client 추가 후에도 같은 두 항목이며
출시 차단 상태를 유지한다. 상위 native API deprecation은 추후 메이저 업그레이드 시 재검토한다.
origin 정책은 입력 검사로 제한되고 native redirect를 가로막지 않는다. 운영자 direct response
조건·네트워크 감사 없이 외부 provider의 안전성/비용 검증 완료를 주장하지 않는다.
M4 전체 완료·공개 출시·main 병합·npm 발행 승인으로 처리하지 않는다.

## 최종 자동 결과

`pnpm check`: Vitest **95개/12파일**, 독립 core 테스트1, 데이터 정책18,
비용/보안 회귀16, strict 타입·Native ref 타입·ESLint/Prettier·문서/API 검사,
Next production build, Android/iOS **JS export** 통과.
`pnpm pack:check`: SDK5개 실제 tarball 출처·민감정보·비용 경로 검사 통과.
작업 트리/index/도달 가능한 Git history 정적 감사 findings0. Native OS 전체 egress 증거는 아니다.
추가 카메라 snapshot/오래된 region 이벤트 방어 이후 최종 재검사 결과를 진행 문서에 남긴다.

초기 검사에서 발견한 사항도 수정했다: Expo 58의 `--offline`/`--localhost` 동시 옵션 거부는
`EXPO_OFFLINE=1` 환경 + `--localhost`로 해결해 Metro localhost:8081 시작을 확인했다.
수동 native 생성 명령은 `generate:native`로 이름을 정해 `build` lifecycle의 자동 prebuild를 피한다.
비용 검사에 공식 Android SDK 문서 host만 검토 추가했으며 runtime endpoint 허용으로 확대하지 않는 회귀 테스트를 추가했다.

## Android 에뮬레이터 실행 시도

가속 장치 `/dev/kvm` 없이 API35 default x86_64 / emulator 37.2.12를
`-accel off -gpu swiftshader -no-window -no-snapshot`으로 실행했다.
기본 userdata 요구량 때문에 파티션을 축소해 부팅을 재시도했다. ADB transport는 device가 되었으나
`sys.boot_completed`는 완료되지 않았고 OS가 최초 dex 검증/시스템 서비스 시작 중이었다.
APK 설치 첫 시도는 `cmd: Can't find service: package`, 다음 시도는 45초 timeout(exit124)이었다.
boot 스크린샷은 검은 화면으로 직접 확인했으며 앱/지도 화면 성공으로 취급하지 않는다.
로그·APK·캡처는 ignored `artifacts/native/`에만 보관한다. 실제 Android 기기 미연결,
iOS 환경 부재와 함께 실화면 QA 차단으로 기록한다. PMTiles와 HTTP fallback의 native 렌더링을
단위 검사나 문서상 엔진 지원으로 대체하지 않는다.
