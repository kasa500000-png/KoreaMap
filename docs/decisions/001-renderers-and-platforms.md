# ADR-001 — 렌더러와 플랫폼 분리

날짜: 2026-10-19. 상태: 설계 채택, 구현 검증 전. [전체 아키텍처](../architecture.md)

## 결정

Web은 MapLibre GL JS, 모바일은 MapLibre Native를 사용하는 MapLibre React Native로 구현한다. core는 renderer/React/backend 의존성이 없는 TypeScript 계약이다. React/Next.js와 Expo는 별도 바인딩·예제다. Expo Go 대신 config plugin 및 development build를 사용하고 v11 New Architecture를 전제로 한다.

## 이유와 대안

WebView 안에 Web 지도를 넣으면 초기 코드 공유는 쉽지만 native 제스처·접근성·메모리·오프라인 API의 경계가 나빠진다. 별도 Android/iOS SDK를 처음부터 직접 작성하면 유지보수 비용이 커진다. 따라서 데이터/명령을 공유하고 view 구현은 분리한다.

## 결과와 제약

공통 API는 교집합이며 모든 MapLibre 기능의 parity를 보장하지 않는다. provider·style capability로 미지원 기능을 명시한다. 버전 후보는 조사표에 고정하되 실제 Expo/RN/Native 빌드 통과 전 지원 확정으로 표시하지 않는다. Native 버전 override는 두 플랫폼 회귀가 필요하다.

## 검증과 재검토

R01 R03 R04 R13. M1에서 Expo Android/iOS 최소 지도, M2 SSR/cleanup, M4 native lifecycle·카메라·스타일을 실행한다. bridge/API 제약으로 core 계약 구현이 불가능하면 재검토한다.

## 근거

[MapLibre RN 시작](https://maplibre.org/maplibre-react-native/docs/setup/getting-started/), [Expo 설정](https://maplibre.org/maplibre-react-native/docs/setup/expo/), [공식 Expo 조합](https://docs.expo.dev/versions/latest/).
