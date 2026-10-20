# ADR-006 — 데이터 권리와 선택 PostGIS

날짜: 2026-10-19. 상태: 설계 채택, 구현 검증 전. [전체 아키텍처](../architecture.md)

## 결정

SDK 자체 코드 MIT 목표와 OSM ODbL·공공데이터·폰트·서버 소프트웨어 의무를 분리한다. 허가된 출처만 manifest와 함께 배포한다. PostGIS는 P1 정제·공간질의·동적 레이어가 필요할 때 도입하며 최초 basemap 빌드에는 필수로 두지 않는다.

## 이유와 대안

공공데이터포털 등록이나 무료 API라는 사실만으로 가공·재배포 권리를 확정할 수 없다. 포털/API/사진/원본 파일 권리를 각각 확인한다. 모든 데이터를 하나의 DB에 합치면 provenance·업데이트·ODbL 결합 판단이 어려워져 provider별 원본과 정규화 산출물을 분리한다.

## 결과와 제약

KOGL 0/1유형 및 별도 허가를 우선 검토하고 범용 배포에 맞지 않는 비상업·변경금지는 기본 데이터에서 제외한다. OSM 결합 형태에 따른 파생 DB 의무는 실제 작업별 검토 대상이다. 공개 view allowlist, GiST, 올바른 거리 단위, 원본 CRS와 변환 검증을 사용한다.

## 검증과 재검토

R11 R20. 배포 전 권리자·license·가공/재배포·기준일·checksum·출처 UI를 확인한다. 권리 미상은 publish 차단이다. PostGIS 반경 query plan/limit, 개인정보 필드 제외, 업데이트/삭제를 검증한다. 현재 한국 공공데이터 원본별 배포 승인 목록은 없다.

## 근거

[OSM 저작권](https://www.openstreetmap.org/copyright), [KOGL 유형](https://www.kogl.or.kr/info/license.do), [공공시설 후보](https://www.data.go.kr/data/15013117/standard.do), [PostGIS 문서](https://postgis.net/documentation/).
