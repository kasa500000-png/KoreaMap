# 선택형 라우팅 검증 — 2026-10-19

## 확인한 엔진·실자료

Linux x86_64, Node 24.19.0, pnpm 12.14.0, Docker 28.4.0, Chromium.
Valhalla 3.9.1 공식 base 이미지의 `valhalla_service --version`과 digest를 실제 확인했다.
버전/공식 API/라이선스 URL은 [가이드](../routing.md)에 기록했다. npm 외부 의존성 추가는 없다.

Geofabrik 한국 **공개** PBF를 A 원장의 권한 범위에서 내려받아 admin DB와 전체 graph를 오프라인 빌드했다.

| 항목 | 기록 |
| --- | --- |
| 원본 | <https://download.geofabrik.de/asia/south-korea-latest.osm.pbf> |
| 원장/라이선스 | `osm-geofabrik-kr` / ODbL-1.0, 별도 MIT 재허가 없음 |
| 원본 OSM 기준 시각 | 2026-10-18T20:25:06Z; 다운로드 시각과 구분 |
| 크기 | 289,590,631 bytes |
| SHA-256 | `57e3ffd07e104d5b9ec511ac2b11cf784936b8982f0b4f30e6f5324928fc9f5e` |
| 검증된 graph 세대 | `v-1792407955980-cd813986`, builtAt 2026-10-19T11:09:05.441Z |
| 저장 | ignored `artifacts/routing/`; PBF/graph/admin DB/환경설정은 Git/npm에 포함하지 않음 |

기본 이미지의 Docker UID와 private bind 디렉터리 권한을 맞추고, 플랫폼에서 포트가 게시되지 않았던
internal bridge를 로컬 bridge+loopback 게시로 수정했다. 실패 build는 active로 선택하지 않았다.
실제 한국 graph의 새 세대 빌드·세 모드 smoke·선택·start·Node gateway 기동까지 실행했다.
bridge를 OS 수준 인터넷 차단망이라고 표시하지 않는다. build는 `network none`이다.

## 실제 한국 도로 질의

재현: 로컬 graph 준비/start 후
`node --env-file=artifacts/routing/korea/.env --test tests/routing-korea.test.mjs`.
별도 실행한 테스트이며 기본 CI는 276MiB 원본을 다운로드하지 않는다.
**5 tests 통과, skip/retry 없음.** 아래는 공개 도로 표본이며 실제 사용자 위치/이동 기록이 아니다.

서울 시청 부근→세종대로 북측 표본 입력 `[126.977,37.5663]` → `[126.9769,37.573]`:

| 모드 | 거리(m) | 예상 시간(s) | geometry 좌표 수 | 해당 최종 실행 관찰 시간(ms) |
| --- | ---: | ---: | ---: | ---: |
| driving | 1578.189 | 114.260 | 46 | 27.5 |
| walking | 762.720 | 557.391 | 40 | 6.5 |
| cycling | 1253.431 | 303.486 | 59 | 8.3 |

캐시가 이미 사용된 단일 local 요청 관찰치이며 p95·부하·전국 성능 보장이 아니다.
위치 스냅은 입력과 정확히 같지 않을 수 있다. 실제 도로에 접근/통행할 수 있다는 현장 검증은 아니다.
`[126.9772,37.57]` 경유지 순서도 확인했다.
울릉→독도 표본은 세 모드 모두 `NOT_FOUND`로 실패했다. 이 표본은 no-route/no-segment 결과이며
양 끝이 모두 유효 도로에 매칭되었다거나 섬 전체가 영구적으로 접근 불가능하다는 증거가 아니다.
서울→독도는 설정한 200km 거리 상한에 걸려 `INVALID_ARGUMENT / ROUTING_DISTANCE_LIMIT`를 반환한다.
실제 조사에서 이 오류를 발견해 일반 엔진 오류와 구분하고 단위 회귀 검사를 추가했다.

## 결정적인 합성 그래프/서비스 회귀

`pnpm test:routing`은 **실제 Valhalla 엔진**으로 자체 제작 PBF를 전처리한다.
외부 OSM 내용을 복사하지 않은 9개 node/6개 way: 굽은 residential, one-way,
footway/bicycle 금지, cycleway, 단절된 섬/끊긴 도로 조각을 사용한다. fixture에 MIT를 적용한다.
SDK의 mock만 검사한 결과로 표현하지 않는다. graph 파일은 임시 ignored 저장소에서 만들고 제거한다.

- 세 모드 geometry·거리/예상 시간·GeoJSON. 차량 576m의 꺾인 길, 보행 전용 418m, 자전거 576m.
- 순서 있는 경유지·일방통행의 역방향 우회. 모드별 비허용 edge 대신 다른 경로 선택.
- 세 모드의 단절된 섬·미연결 도로·coverage 밖 위치: `NOT_FOUND`, 직선 결과 없음.
- 실제 HTTP 지연 timeout, pre-cancel, private gateway JSON/Origin/Host/메서드/크기/오류 응답.
- 잘못된/없는 입력 허가·해시, 미검증/다른 image 세대 선택 차단, active 유지와 명시적 rollback 선택.

엔진/HTTP 7개와 운영 정책 1개를 실행한다. core/adapter 단위 검사 7개는 malformed/빈/비유한 응답,
잘못된 좌표·모드·개수, 누락된 경유점, 먼 스냅, 원문 비노출, 취소·시간 제한·데이터 복사를 포함한다.
**실제 OSM에 없는 도로/폐쇄를 정답지와 대조하는 품질 시험은 미검증**이다. 합성 단절 사례와 구분한다.

## 실화면과 네트워크

Next production `/routing/`를 실제 Chromium에서 실행했다. 공급자 미설정이어도 canvas가 유지되며,
세 모드·경유지·오류 시 이전 선 제거·거리/예상 시간·GeoJSON·출처를 검사했다.
자체 fixture 카메라 범위에 배경 도로 타일은 없어서 단색 배경에 경로선/마커가 보인다.
캡처 `test-results/routing.png`는 직접 확인했고 Git에는 넣지 않았다.
전체 Web E2E 10개는 외부 HTTP를 차단하고 **외부 시도 0건**을 확인한다.
이는 실제 한국 배경 타일/경로의 실화면·Native 통합·OS 전체 무네트워크 증명이 아니다.

## 보안·한계

정적 비용/보안 검사, 데이터 원장/공개 차단, 실제 SDK tarball 검사는 최종 진행 기록을 따른다.
`pnpm audit`는 기존 high2(node-forge GHSA-86w9-cpqp-85rv, braces GHSA-vfj7-8cjw-p6xm)를 다시 보고해
**종료 코드 1**이었다. 이번 변경의 새로운 npm 외부 의존성은 없으며 출시 차단을 유지한다.
Docker image 전체 SBOM/CVE 감사·대규모 부하·장애 복구의 운영 환경 검증은 별도다.
macOS/Windows Docker 실실행, Android/iOS 기기 HTTP/지도, Safari/Firefox, 실제 도로 안전·통행 현장 확인은 **미검증**이다.
기본 스크립트는 region별 전체 rebuild이며 증분 반영·경계 clipping·무중단 전환을 자동 제공하지 않는다.
실시간 교통·보행/자전거 안전·최적성·전국 OSM 완전성을 주장하지 않는다.
