# ADR-003 — Planetiler·PMTiles와 공통 XYZ 제공

날짜: 2026-10-19. 상태: 설계 채택, 구현 검증 전. [전체 아키텍처](../architecture.md)

## 결정

OSM 지역 PBF를 고정 Planetiler profile로 MVT/PMTiles v3로 생성한다. 공통 MVP는 정적 assets 서버와 Martin의 TileJSON/XYZ 제공이며 PostGIS가 필요 없다. 한 지역 z0~14부터 시작한다. Web/Native 직접 PMTiles 접근은 P1 선택 최적화다.

## 이유와 대안

개별 타일 수백만 개 업로드보다 archive 배포가 관리하기 쉽다. 반면 archive는 제자리 수정이 어렵고 Range/Native cache가 서로 다르다. Native PMTiles 미지원이라는 전제는 쓰지 않는다. 현재 공식 지원이 있지만 래퍼 조합과 운영 동작 검증이 별개라 공통 HTTP 타일 경로를 먼저 제공한다.

## 결과와 제약

입력·profile·tool·schema·font hash와 bbox/zoom을 manifest에 기록한다. release 경로는 immutable, 실패하면 기존본 유지, rollback은 assets 전체 단위다. OSM 공용 tile 서버를 기본 제공원이나 offline 다운로드 원천으로 쓰지 않는다.

## 검증과 재검토

R08 R10 R17 R22. schema·경계·한글·빈 tile·크기·서버 재현·rollback은 M3, Range 206/CORS/캐시·Native 직접 접근은 M6. PMTiles 파일 전체 HTTP 재압축은 금지한다. direct-only 전환은 양 플랫폼 실측과 비용 개선 근거가 있을 때 재검토한다.

## 근거

[Planetiler](https://github.com/onthegomap/planetiler), [PMTiles](https://docs.protomaps.com/pmtiles/), [Martin](https://maplibre.org/martin/sources-pmtiles/), [Native PMTiles](https://maplibre.org/maplibre-native/android/examples/data/PMTiles/).
