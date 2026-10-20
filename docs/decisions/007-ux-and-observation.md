# ADR-007 — 공개 관찰 기반 UX와 플랫폼 관습

날짜: 2026-10-19. 상태: 설계 채택, 구현 검증 전. [전체 아키텍처](../architecture.md)

## 결정

마커 선택/해제·검색 결과와 지도 선택 동기화·경로 패널·padding camera·기본 제스처를 작은 공통 행동 계약으로 제공한다. visual asset와 view는 자체 작성하고 플랫폼 관습 및 접근성을 유지한다. 위치 권한은 사용자 동작 때만 요청한다.

## 이유와 대안

상용 앱의 디자인과 비공개 동작을 복제하지 않고 공개 문서와 합법적 예제 화면으로 패턴을 도출한다. REA MCP/Ghidra MCP가 노출되지 않았고 ADB 실행 파일/권한 있는 앱 제공도 없어서 해당 분석은 수행하지 않았다. 도구 부재를 분석 완료로 표시하지 않는다.

## 결과와 제약

공개 MapLibre 예제에서 팝업/드래그/휠 및 Fly 버튼 화면 반응만 실제 확인했다. 검색/경로 계산·Native 터치는 문서 기반 설계이며 미검증이다. 카메라 이동 후 화면 변화만으로 정확 좌표 도착이나 타일 완전성을 판정하지 않는다.

## 검증과 재검토

R06 R14. M2/M4에서 키보드·TalkBack/VoiceOver·선택 피처 노출·권한 거절·시트 drag 충돌·reduced motion을 실제 시험한다. search composition 중 자동 요청 금지, 사용자 pan 후 위치 추적 중단/복귀 UX는 앱 예제로 구현한다.

## 근거

[도구·UX 조사](../research/technical-review.md), [관찰 로그](../research/ux-observations.json), [마커 공개 예제](https://maplibre.org/maplibre-gl-js/docs/examples/attach-a-popup-to-a-marker-instance/), [카메라 예제](https://maplibre.org/maplibre-gl-js/docs/examples/fly-to-a-location/).
