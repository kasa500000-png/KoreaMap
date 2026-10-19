# ADR-005 — 검색·경로·저장 서비스 주입

날짜: 2026-10-19. 상태: 설계 채택, 구현 검증 전. [전체 아키텍처](../architecture.md)

## 결정

core는 SearchProvider/RoutingProvider 계약만 제공하고 MVP는 합성 fixture와 미설정 상태를 검증한다. P1 reference는 자체 Nominatim(검색/역지오코딩), 자체 OSRM(driving) 각 하나다. Supabase는 P1 저장 어댑터이며 auth/DB가 core에 들어오지 않는다. Photon/Pelias 및 추가 모드는 별도 품질·비용 판단 후다.

## 이유와 대안

검색·경로를 지도 렌더링과 한 서버로 결합하면 무료 SDK에도 특정 인프라가 필요해진다. 공용 Nominatim과 routing demo를 무료 production backend로 간주하는 접근도 정책·용량 제약에 맞지 않는다. 소비자가 endpoint와 자격 증명 정책을 지정한다.

## 결과와 제약

capability, AbortSignal/timeout, requestId, attribution, 단위·geometry 정규화를 공유한다. 미지원 profile은 실패해야 하며 다른 이동 모드로 바꾸지 않는다. 한국어 자동완성/도로명 품질은 엔진 이름만으로 보장하지 않는다. Nominatim public API 자동완성은 금지다.

## 검증과 재검토

R12 R18 R19 R21 R23. 취소·stale response·429·NoRoute·빈 검색·잘못된 JSON·키 비노출을 검사한다. Supabase 저장에는 RLS 사용자 격리가 필요하다. 검색 평가셋과 운영 자원 근거가 확보될 때 Photon/Pelias 도입을 검토한다.

## 근거

[Nominatim API](https://nominatim.org/release-docs/latest/api/Overview/), [공용 서비스 정책](https://operations.osmfoundation.org/policies/nominatim/), [OSRM](https://project-osrm.org/docs/v5.24.0/api/), [Photon](https://github.com/komoot/photon), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
