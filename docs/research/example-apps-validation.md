# 두 예제 앱 검증

확인일: 2026-10-19. `feat/scenario-apps`, 기준 `feat/native-sdk`.
[기능/설치/경계](../example-apps.md)를 따른다. 테스트와 캡처는 가짜 사용자·합성 좌표만 사용한다.

## 단위·경계

두 앱의 같은 session 구현에 실제 core MapController + mock port를 주입한다.
산책 타이머/일시정지/재개·구간·저장/재로딩/재생/정리, 날짜별 여행 저장/중복 방지·검색/빈 결과·카메라,
저장 손상/쓰기 실패·초기화와 좌표 bounds의 날짜변경선/단일점/빈 입력을 검사한다.
SDK 의존성 경계, 새 private 예제 소스의 provenance 누락 차단과 tarball 제외도 검사한다.

## Web 실제 실행

Playwright + Chromium + 실제 MapLibre, 외부 HTTP 차단. `/walk/`, `/trip/`에서
시작 → 4점 → 정지 → 테마 → 재개 → 종료 → 저장 → reload → 재생과
띄어쓰기 검색 → 방문 장소 저장 → 날짜 전환 → reload → 카드 → 삭제를 실행한다.
두 시나리오 신규 E2E가 최초 실행에서 통과했다(19.2초).
390×844 모바일 뷰포트, 4회 앱 전환, canvas·가로 overflow·실제 GPS 미호출·초기 준비 8초 이내를 검사한다.
데스크톱 산책 및 모바일 여행 캡처를 직접 확인해 다음을 수정했다.

- 예제 버튼 CSS가 MapLibre 컨트롤까지 바꾸는 문제: sidebar로 스타일 범위 제한.
- 모바일 검색 버튼 줄바꿈: 폭 축소 방지 및 nowrap.
- Web setStyle의 이중 출처·겹침: 항상 보이는 단일 AttributionControl로 교체.
- 저장 산책 replay 시 이전 빈 recorder 통계가 보이는 문제: 표시 중인 경로 통계 반영.

최종 전체 Web 회귀, 준비 시간과 수정 후 화면 확인 결과는 아래 최종 결과에 기록한다.
스크린샷은 `test-results/scenario-*.png`에만 두고 Git/npm에 넣지 않는다.

## Android / iOS

Expo 58.0.14 / RN 0.88.0 / React 19.3.0 / MapLibre RN 11.5.0,
Native Android 13.6.1 / iOS 6.31.0, New Architecture/Hermes를 유지한다.
예제에 Expo 공식 호환표의 AsyncStorage 2.2.0을 추가했다.
Android build-tools37.0.0 / compileSdk37 / targetSdk36 / minSdk24 / NDK27.1.12297006,
Gradle9.4.1, x86_64 Development Build를 로컬 빌드한다. iOS는 Linux/Xcode 부재로
Development Build·실화면 미검증이다. Expo Go는 사용하지 않는다.

이번 Android API35 소프트웨어 에뮬레이터는 229854ms에 OS 부팅을 완료했다.
첫 빌드는 설치된 JRE에 javac가 없어 실패했다. 공식 Adoptium API의 Temurin JDK21.0.12.1+1
아카이브를 SHA256 대조 후 저장소 밖에 설치했다. 새 JDK에는 환경 proxy CA trust가 없어
두 번째 빌드가 PKIX 오류로 실패했으며 기존 시스템 Java truststore를 명시하여 TLS 검증을 유지했다.
이후 APK·설치·UI 결과를 최종 결과에 구분해 기록한다. 실제 Android 기기는 연결되어 있지 않다.

## 성능·보안 범위

기록은 최대 120점/1Hz, 재생은 4Hz 및 진행 중 render의 중간 프레임 생략으로 제한한다.
장소 검색은 6개 가상 POI이며 전국 검색 부하 검증이 아니다. 브라우저 준비 시간은 해당 CI/호스트의
관측값이며 Android/iOS FPS·GPU/heap·배터리 성능을 증명하지 않는다.
UI 미표시/백그라운드 전환 때 구독·타이머·replay를 정리하고 자동 재개하지 않는다.
저장은 앱 전용 key의 합성 자료만, 외부 전송 없음. OS 전체 native 네트워크 audit와 물리 기기 센서 검증은 별도다.

## 최종 로컬 결과

- `pnpm check`: 통과. Vitest 99개/13파일, 독립 core 1개, 데이터 정책 19개, 비용 감사 회귀 16개,
  strict/Native 타입, lint/format, API·설계 문서, Next production build, Expo Android/iOS JS export.
- `pnpm pack:check`: 실제 SDK tarball 5개 통과. private 예제와 AsyncStorage를 SDK 배포물에 넣지 않는다.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium pnpm test:web`: 12개 전부 통과(57.6초),
  retry/skip 없음. 신규 두 앱과 기존 100/1000 마커·터치·GPS 권한·검색·라우팅·4종 테마 회귀 포함.
  모바일 Web 4회 준비 시간 1158/915/918/945ms, 새 시나리오 외부 HTTP 시도 0.
- 출처 컨트롤 통합 뒤 기존 exact-text assertion을 단일 컨트롤의 가시성/출처 포함 검사로 수정했다.
  별도 실행에서는 Chromium 경로 환경변수를 빠뜨려 launch 실패했고, 설치된 Chromium 경로를 명시해
  전체를 재실행했다. 실패를 통과로 세지 않았다.
- 수정 후 산책 데스크톱·여행 모바일 캡처를 직접 확인했다. 지도 컨트롤, 검색 버튼, 출처 줄바꿈,
  저장 경로 통계, 장소 카드와 모바일 가로 overflow 없음이 확인되었다.
- Android x86_64 Development Build: **Gradle BUILD SUCCESSFUL**(3m32s, 355 tasks), APK 설치 **Success**.
  APK SHA256 `251860402b8c7eab2198e9f26534f005aa042626d526606fd0bd558c079f9d17`.
  로컬 산출물 `artifacts/scenarios/app-debug.apk`는 Git/npm 제외다.
- 기동 시 System UI ANR와 앱의 `failed to complete startup` ANR가 관찰되었다. CPU pressure
  avg10 약 68.71%, KVM 없는 소프트웨어 에뮬레이터다. 해상도를 540×960으로 줄이고 OS animation을
  끈 초기 재시도에서는 앱 UI를 확인하지 못했다. 이후 사전 컴파일·개발 메뉴 닫기 뒤 실행된
  **최종 Android 결과는 아래 후속 검사 기록**을 따른다. 초기 ANR의 원인을 에뮬레이터만으로 확정하지 않는다.
- 실제 Android 기기 및 iOS Development Build/실화면은 환경 부재로 미검증이다.
- npm audit: high 2(node-forge/braces), exit 1. 기존 출시 차단 항목을 유지한다.
  worktree/index/history/tarball 정적 검사는 findings 0이나 Native OS 전체 egress를 증명하지 않는다.

Android 재현: Native 가이드의 development build를 설치하고 `pnpm dev:expo`를 실행한다.
ADB reverse `tcp:8081 tcp:8081` 후 개발 클라이언트를 로컬 Metro에 연결하고 상단 산책 앱/여행 앱에서
이 문서의 Web과 동일한 흐름을 실행한다. UI 계층과 logcat, 캡처는 ignored artifacts에 저장한다.
남은 QA는 가속 에뮬레이터/실기기에서 먼저 수행하며, iOS는 macOS/Xcode 환경에서 별도로 수행한다.

### 후속 Android 실행 및 CI 확인

위 ANR 재현 뒤 OS 패키지 관리자의 `cmd package compile -m speed -f org.koreamapkit.example`가
성공했다. 이 사전 컴파일과 낮춘 해상도로 재시도했으며 ANR timeout을 해제하거나 앱 코드를 우회하지 않았다.
개발 클라이언트의 첫 실행 안내를 닫은 뒤 Metro bundle(828 modules)과 React Fabric 실행,
**산책 지도의 준비 완료·실제 MapLibre 도형·3개 시설 마커·한글 UI·항상 보이는 출처**를 확인했다.
따라서 위의 '앱 화면까지 미도달'은 초기 시도의 결과이며 최종적으로 지도 표시까지는 실행되었다.
UI 계층의 버튼 bounds로 조작하고 캡처를 직접 확인했다. 소프트웨어 환경의 긴 첫 실행과 ANR는
여전히 성능 합격 근거가 아니며 물리 기기/가속 환경 검증이 필요하다.

구현 커밋 `30792ba4ee1a311b498c84efd4f790890e6a7ecb`의
[GitHub Actions](https://github.com/kasa500000-png/KoreaMap/actions/runs/39251573849)는
Linux·Windows·macOS 모두 success다. Linux의 Web12와 기존 실제 PostGIS/Valhalla 회귀도 포함한다.
연결된 GitHub 커넥터로 [Draft PR #13](https://github.com/kasa500000-png/KoreaMap/pull/13)을 생성했다.


| Android 실제 확인 | 결과 |
| --- | --- |
| 지도·UI | 산책 Pastel/Outdoor, 여행 Standard, 자체 도형·시설 마커·한글 UI·출처 표시 직접 캡처 확인 |
| 산책 | 시작 후 recording 2점, 종료 5점/8.8m, 명시적 저장 1개, 여행 앱 왕복 후 저장 1개 복원, Outdoor에서 5점/8.8m 경로 다시 보기 완료 |
| 여행 | 가상 장소 검색 목록, 1일차 2곳 저장, 2일차 0곳, 1일차 복귀 후 핀 2개·방문 연결선·카메라 확인 |
| 터치/스크롤 | UI 계층에서 찾은 버튼 tap, 지도 조작 꺼짐 상태의 바깥 ScrollView 이동, 앱 메뉴 전환 확인 |
| 남은 범위 | 실제 기기/iOS, 센서·한글 glyph, 지도 제스처 켜짐/회전/OS background·프로세스 종료, 전체 입력/카드 분기·장시간 성능·네트워크 감사 미검증 |

`walk-ready.png`, `walk-saved.png`, `trip-controls.png`, `trip-route.png`, `walk-outdoor.png`, `walk-replay-finished.png`와
대응 UI XML은 `artifacts/scenarios/`에서 직접 확인했다. APK·로그·이미지를 Git에 추가하지 않았다.
사전 컴파일은 이 로컬 QA 기기에만 적용했으며 SDK/예제의 실행 전제나 설치 hook으로 만들지 않았다.
초기 ANR와 긴 bridge/UI 지연이 있었으므로 Android 실행을 정상 기기 FPS·배터리 성능의 증거로 사용하지 않는다.
