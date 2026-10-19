# ADR-002 — 좌표·데이터·이벤트 계약

날짜: 2026-10-19. 상태: 설계 채택, 구현 검증 전. [전체 아키텍처](../architecture.md)

## 결정

외부 API와 GeoJSON은 WGS84 [longitude, latitude], Bounds는 [west, south, east, north]다. meters/seconds, 카메라 durationMs, 논리 padding을 사용한다. 날짜변경선 bbox는 MVP에서 명시적으로 미지원이다. 한국 투영좌표는 ingestion에서 변환하며 core에 EPSG:5179/5186 좌표를 그대로 넘기지 않는다.

## 이유와 대안

플랫폼별 SDK 객체를 공통 타입으로 재수출하면 버전/좌표 순서/직렬화가 결합된다. 모든 GIS CRS를 runtime에서 자동 추정하는 API도 데이터 오류를 숨긴다. 안정적인 작은 계약과 검증 함수를 선택한다.

## 결과와 제약

Address는 도로명·지번을 구분하고 모르는 필드는 생략한다. Place는 namespaced ID와 provenance, 서비스 결과는 attribution을 갖는다. 외부 JSON 검증이 필수다. 카메라 변경은 coalescing하고 idle 최종값을 전달하며 origin을 구분한다. 새 명령은 이전 명령을 취소한다.

## 검증과 재검토

R02 R05. 축/단위 오류·NaN·경계·null·CRS 미상·잘못된 payload, stale camera response를 계약 테스트한다. 좌표 숫자만으로 모든 축 뒤집힘을 탐지할 수 없으므로 source CRS/axis metadata와 알려진 기준점을 함께 검증한다.

## 근거

[GeoJSON RFC 7946](https://www.rfc-editor.org/rfc/rfc7946), [ST_Transform](https://postgis.net/docs/ST_Transform.html), [ST_DWithin](https://postgis.net/docs/ST_DWithin.html).
