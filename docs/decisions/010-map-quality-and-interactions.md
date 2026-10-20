# ADR-010: 상세 지도와 선택형 공통 조작 계층

날짜: 2026-10-20 · 상태: 구현 중 · 연결: [품질 계획](../map-quality.md), [ADR-004](004-style-and-glyphs.md), [ADR-009](009-zero-publisher-cost.md)

## 배경

기존 9종 지형·도로 레이어와 즉시 이동 API만으로는 밀집 도심의 도로 위계, 장소 선택과 화면 카드의 공간을 일관되게 다루기 어렵다. 상용 지도와 같은 사용성을 장기 목표로 삼되, 비공개 지도 데이터·타일·디자인을 복제하거나 자체 데이터의 정확도를 검증 없이 주장할 수 없다.

## 결정

1. `design-v1`과 기존 `createThemeStyle`, `MapController` 계약은 보존한다. 명시적 `design-v2` 생성과 `createCartographyStyle`를 추가한다. v2는 안정적인 문자열 `fid`, 도로 등급·교량·터널·중요도·표시 확대 수준, 철도·수로·교통 시설을 다룬다. 없는 원본 속성을 정밀한 사실처럼 추정하지 않는다.
2. 지역 상세도는 z10–16, 선택형 context는 z0–9를 담당한다. context는 명시적으로 연결한다. 실제 육지 마스크 없이 배경 전체를 바다로 칠해 해안선이 구현됐다고 표현하지 않는다. 전국 생성의 자원 게이트를 유지한다.
3. 플랫폼 의존성이 없는 `MapInteractionController`를 core에 추가한다. 기존 동기 Web 호출과 `MapController`의 완료 시점은 바꾸지 않는다. 새 이동 API는 실제 이동 완료 뒤 resolve하며, 제스처·새 이동·호출자 취소·종료는 현 위치에서 중단한다. reduced motion과 화면별 insets를 지원한다.
4. 선택 결과는 엔진 feature 객체가 아닌 분리된 `MapSelection`이다. 거리·우선순위·키로 정렬·중복 제거하고 최대 8개를 반환한다. 선택 카드와 산책·일정 저장 정책은 소비 앱에 둔다.
5. 마커 일괄 교체와 GPU 클러스터링을 선택형으로 추가한다. 기존 앱의 표시 결과를 바꾸지 않도록 클러스터링은 기본 비활성이다. Native 접근성 목록은 가상화하고 선택 표시를 클러스터와 분리한다.
6. generation/style revision/font manifest에 결합한 불변 URL에만 장기 캐시를 허용한다. mutable alias와 다른 generation에 현재 자료를 대신 반환하지 않는다. 폰트는 제한된 gzip 캐시와 원본 검증을 함께 사용한다.

## 이유와 대안

기존 컨트롤러의 완료 시점을 바꾸면 소비 앱의 작업 순서가 깨질 수 있어 확장 인터페이스를 채택한다. v1 archive는 재생성을 강제하지 않는다. 단일 전국 상세 archive부터 시작하는 접근은 현재 디스크 예산에 맞지 않아 지역 상세와 명시적 context로 나눈다. 영구 장기 자산 보관은 운영자 호스팅 정책으로 분리하며 현재 loopback 도구는 startup current/previous 자료와 지정 glyph pack만 유지한다.

## 결과와 제약

새 기능은 minor 변경 후보다. 0.1.0 후보의 실제 버전 변경·발행은 별도 릴리스 절차를 따른다. 기본 SDK/CI는 합성 fixture만 사용하며 JDK·Python·실제 OSM·폰트 다운로드는 선택형 운영 도구로 남는다. 모든 데이터·글꼴·실지도 캡처는 ignored 저장소에 보존한다.

Web Chromium 240개 조건과 단위 테스트는 Android/iOS, 물리 터치·접근성, 측량 정확도·전국 서비스·장시간 메모리 또는 상용 지도 동등성의 증거가 아니다. 실패한 성능 기준과 실행하지 못한 플랫폼 검사는 [품질 결과](../research/map-quality-validation.md)에 별도로 남긴다.

## 검증과 재검토

R04 R05 R07 R09 R10 R13 R14 R15 R16과 Z01~Z12를 유지한다. 취소·이전 이벤트 경합·실제 projection/viewport·겹친 선택·스타일/버전 회귀를 검사한다. 새 기기·육지 마스크·전국 저장 자원이 제공되면 해당 수락 항목을 실제 실행한다. 미실행을 통과로 변경하지 않는다.

## 근거

[MapLibre Map](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/), [Style Spec](https://maplibre.org/maplibre-style-spec/), [Native Camera](https://maplibre.org/maplibre-react-native/docs/components/camera), [공식 OSM 육지 폴리곤 검토](../research/coastline-review.md). 새 외부 의존성은 추가하지 않았고 기존 exact lock을 유지한다.
