# 지도 품질 개선과 실행 기준

기준일: 2026-10-20. 목표는 지도 가독성과 기본 조작 경험을 먼저 개선하는 것이다. Standard를 깔끔한 기본 지도로 삼고, Dark/Pastel/Outdoor도 같은 데이터 계약을 사용한다. 초기 구현은 서울·울산·부산·제주로 검증하고 전국은 추가 자원 확보 후 진행한다. Google/Naver의 서비스 전체 품질이나 독점 데이터 보유 수준에 도달했다는 의미가 아니다.

## 실행 순서

| 단계 | 구현 범위 | 수락 증거 | 외부 자원 |
| --- | --- | --- | --- |
| Q0 | 고정 카메라·테마·확대·화면 행렬, 원본/폰트/코드 해시 | 240개 고유 케이스와 불완전 성능 표본 거부 테스트 | 기본 검사는 불필요 |
| Q1 | 명칭 중요도, 도로/행정/장소 위계, POI 밀도, 4종 테마 | 두 Style Spec 검증, 합성 renderer, 실제 지역 비교 | 운영자 glyph·타일 |
| Q2 | v2 도로 subclass/교량/터널/표시 수준, 철도·수로·교통, context/detail | 실제 Planetiler codec 검사, 4지역 생성·세대 전환·HTTP, 지형 수동 리뷰 | 승인 원본·JDK·디스크 |
| Q3 | 공통 이동/선택/일괄 마커, 클러스터, Web 카드/확대, Native 목록 | 취소·완료·격리 단위 검사, Web E2E, Native strict/컴파일 | 실제 기기는 후속 |
| Q4 | 버전 결합 자산 캐시, glyph gzip, 성능·복귀·정리 | HTTP 회귀, 네트워크 제한 측정, 플랫폼별 QA | Android 물리 기기·Mac/iOS |
| Q5 | 전국 생성·운영·갱신·관측 | 전국 범위/자원/갱신/지연/부하 보고 | 충분한 저장·메모리 및 운영자 인프라 |

Q1–Q4는 독립 구현 가능 부분을 병행한다. 원본 접근, 육지 마스크 또는 장비가 없으면 그 수락 항목을 `NOT_RUN/BLOCKED`로 남긴다. 검증 도구만 구현한 항목을 실제 품질 통과로 처리하지 않는다. 검색·주소·경로 정확도 고도화는 후속이며, 실시간 교통·대중교통·위성/거리 사진·3D·내비게이션은 초기 범위에 포함하지 않는다.

## 고정 비교 조건

`scripts/map-quality-cases.mjs`는 4지역 × 4테마 × z6/10/12/14/16 × 390/768/1440px, 높이 800px의 240개 케이스를 고정한다. 좌표는 공개 도시의 자체 작성 카메라 표본이며 측량 기준점이 아니다. 회전·기울기는 0이다. 원본 OSM 시점/SHA, archive generation/SHA, glyph manifest/SHA와 실행 코드 SHA를 결과에 보존한다. 임의로 카메라를 바꿔 더 좋아 보이는 결과만 고르지 않는다.

화면에서는 주요 도로 구분, 교량·터널 순서, 도시/동네/도로/POI 명칭 우선순위, 한국어 fallback, 과밀·중첩, 선택/클러스터, 출처 링크를 확인한다. 바다·섬·해안선은 승인된 육지 마스크와 실제 저확대 자료가 있어야 수락한다. 지역 상세 bbox 밖의 공백을 전국 coverage로 표현하지 않는다. 스크린샷 생성·feature count와 사람의 지도 품질 평가는 별도 결과다.

## 성능과 비용 기준

- 고정 20Mbps 다운로드, 80ms RTT 모의 조건에서 30회 cold/warm page navigation-to-idle의 nearest-rank p95를 기록한다. 목표는 cold 3초, warm 1.5초다. 29개 이하 관측은 `NOT_RUN`이다.
- 1,000개 합성 마커와 카메라 이동의 frame p95 목표는 33ms다. 호스트 Chromium software WebGL 관측을 Android/iOS 성능으로 대체하지 않는다.
- MVT gzip tile p95 목표는 300KiB다. 평균만으로 통과 처리하지 않는다. 타일 수·gzip bytes·glyph 요청과 초기/반복 요청을 구분한다.
- 불변 URL 캐시는 데이터·스타일·폰트 변경 시 새 경로를 갖는다. 범용 proxy와 제작자 계정 fallback은 없다. 모든 서버는 운영자 opt-in이고 저장·호스팅·트래픽 비용은 운영자 책임이다.

## 실행

기본 검사는 외부 키·JDK·폰트·실자료 없이 실행한다.

```sh
pnpm test:map-quality
pnpm check
pnpm test:web
pnpm pack:check
```

실제 v2 archive 4개와 검증된 glyph pack을 운영자가 준비한 후 다음 선택형 검사를 실행한다. OS별 절대 경로를 사용한다. 브라우저 설치 경로가 별도라면 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`를 해당 실행 파일로 지정한다.

```sh
pnpm build:sdk
pnpm verify:map-quality --operator-opt-in --store=/operator/tiles --glyphs=/operator/glyphs --context --performance
pnpm verify:map-frames --operator-opt-in --store=/operator/tiles --glyphs=/operator/glyphs
```

`--context`는 검증·활성화된 context archive가 있을 때만 사용한다. `--performance`가 없으면 30회 성능 수락은 실행하지 않는다. 선택형 도구는 Vite production build의 loopback 정적 소비 앱과 타일 서버를 시작하고 public dist API를 사용한다. 프레임 전용 도구는 동일한 서울 balanced z14/390px와5회1초 왕복 이동·실제1,000개 표시·최소30 delta를 고정한다. 목표33ms를 완화하지 않으며 source/화면내 범위/실제 marker IDs/완료를 모두 요구한다. 실제 npm 독립 설치 검증은 별도 `verify:packages`/`verify:native-consumer`다. 데이터·폰트·240개 이미지·JSON 결과는 `artifacts/qa/map-quality`에만 저장되며 공개 패키지에 포함하지 않는다.

현재 결과와 잔여 게이트는 [검증 기록](research/map-quality-validation.md), 계약 이유는 [ADR-010](decisions/010-map-quality-and-interactions.md)을 따른다.
