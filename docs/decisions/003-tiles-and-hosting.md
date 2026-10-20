# ADR-003 — Planetiler archive와 공통 HTTP XYZ 제공

날짜: 2026-10-19; 구현 정합성 갱신: 2026-10-20 KST. 상태: 설계 채택, private 타일 파이프라인 구현·검증 진행. [전체 아키텍처](../architecture.md)

## 결정

OSM 지역 PBF를 고정 Planetiler와 프로젝트 자체 profile로 MVT archive로 생성한다. 현재 구현은 MBTiles와 경량 HTTP XYZ 서버를 우선하며 최초 설계의 PMTiles v3/Martin 조합은 운영자 선택 대안이다. 공통 Web/Android/iOS 경로는 명시적 HTTP XYZ이며 DB가 필요 없다. 서울 소형 bbox·z0~14부터 시작하고 같은 profile로 울산·부산·제주와 전국 명령을 확장한다. 실제 전국 실행 결과는 명령 제공과 구분한다.

profile의 source-layer는 land/park/water/building/boundary/road/trail/place/poi이며 각 feature에 kind를 유지한다. road.class는 major/minor, poi.poi는 park/parking/trail/facility, 이름은 name:ko/name/name:en이다. 기존 styles design-v1과 같은 계약을 사용하며 name_ko/OpenMapTiles의 임의 schema를 자동 추정하지 않는다. 초기 profile은 OSM 도로·건물·녹지·내륙 수역·지명 등을 다루며 별도 해양/해안 polygon·철도 스타일·주소 완전성을 주장하지 않는다.

## 이유와 대안

archive는 개별 타일 업로드보다 세대 보관·검증·전환을 묶기 쉽다. 반면 직접 archive 접근은 Range/캐시/Native 래퍼 호환을 별도로 검증해야 한다. Native PMTiles의 문서상 엔진 지원은 실제 RN/OS 성공 증거가 아니다. 기존 SDK의 direct XYZ 입력으로 먼저 작은 수직 시나리오를 완성하며, Martin/PMTiles 프로토콜과 여러 tile engine을 SDK 기본 의존성으로 넣지 않는다.

## 결과와 제약

입력·profile·tool·schema·font/glyph·출력 hash, bbox/zoom과 기준일·권리를 manifest에 기록한다. release 경로는 immutable, 새 세대는 검증 후 명시적으로 선택한다. 실패하면 기존 성공본 유지, rollback은 assets 전체 세대 단위다. 실제 데이터·archive·폰트·glyph·지도 캡처는 ignored 운영자 저장소에만 두고 Git/npm에는 도구·코드·설정·문서를 둔다. OSM 공용 tile 서버를 기본 제공원이나 다운로드 원천으로 사용하지 않는다. 제작자의 공유 endpoint·key·계정도 제공하지 않는다.

## 검증과 재검토

R08 R10 R17 R22. schema·지역 경계·한글·빈 tile·크기·HTTP/별도 체크아웃 재현·실제 update/rollback은 M3, Range206·CORS·캐시·Native 직접 archive는 M6다. HTTP XYZ의 성공과 클라이언트 PMTiles 직접 접근의 성공을 구분한다. PMTiles 파일 전체 HTTP 재압축은 금지한다. 자원 부족·경계 손상·폰트 누락을 실제 실패로 보고하며 전국 실행과 플랫폼 QA를 명령·mock으로 대신하지 않는다. [실행 계획](../execution-plan.md)과 각 실제 검증 기록에서 통과 여부를 판단한다.

## 근거

[Planetiler](https://github.com/onthegomap/planetiler), [PMTiles](https://docs.protomaps.com/pmtiles/), [Martin](https://maplibre.org/martin/sources-pmtiles/), [Native PMTiles](https://maplibre.org/maplibre-native/android/examples/data/PMTiles/), [현재 스타일 schema](../../packages/styles/README.md).
