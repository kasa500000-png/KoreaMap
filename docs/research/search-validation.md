# 한국 POI 검색 검증 — 2026-10-19

대상: `feat/korean-search`, 기준 커밋 `2c1ed9690fdba647eada8b21f07c8c056973a2dd` 위의 변경.
코드 커밋 식별: `git log -1 --format='%H %s' --grep='^feat: add Korean PostGIS place and address search$'`.
Linux/Node24.19.0/pnpm12.14.0, 기존 exact lockfile. PostgreSQL18/PostGIS3.6.4 Docker·Chromium을 사용한다.

## 실제 DB와 단위 검증

`pnpm test:geo`는 기존 ETL 테스트 후 검색 테스트를 같은 임시 Docker DB에서 순차 실행하고 DB를 제거한다.
검색 테스트는 스스로 작성한 서울·울산·제주 7건을 추가한다. 기존 ETL fixture도 공존하며 실공공데이터가 아니다.

- 3도시 이름·주소, 띄어쓰기와 NFC/NFD, 각 도시의 한글 오타를 실제 pg_trgm으로 검사.
- 영역·날짜변경선 bounds, radius, category, 미터 거리 정렬, offset 페이지 중복 방지, null location, provenance.
- 반복 migration과 갱신 후 저장 생성 열 정규화, GIN/접두어 인덱스 사용 가능성 EXPLAIN.
  소형 fixture에서는 seqscan이 합리적이므로 이 검사만 enable_seqscan=off로 인덱스 경로를 확인한다.
  실제 전국 자료의 자연 query plan/속도 검증을 대신하지 않는다.
- ACCESS EXCLUSIVE 잠금으로 실제 응답 지연을 만든다. 40ms SDK timeout과 명시 취소가 500ms 이내 반환하고
  이후 pool 조회가 복구되는지 검사한다. SQL statement1.5초/lock0.5초와 별도의 제한이다.
- SDK → loopback HTTP → reader DB 경로에서 10회 검색, no-store/Origin 거부와 각 응답2초 미만 검사.
  첫 실행 소형 표본: p50 5.49ms, p95(10회 중 최대)23.61ms. 운영 SLA·전국 성능 기준이 아니다.
- 단위 5개는 검증/빈 입력 무요청·취소/타이머 해제·잘못된 응답·선택 카메라/위치 없음 거부를 확인한다.
  TypeScript 음성 예제는 GeocodingProvider와 POI provider를 혼동하지 못하게 한다.
  core 독립 테스트는 node_modules/MapLibre/브라우저 없이 검색 계약을 실행한다.

## Web 화면과 네트워크

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium pnpm test:web`로 production Next `/search/`를 검사한다.
IME·자동완성, 서울/울산/제주 선택과 중심·마커, 띄어쓰기/오타/주소,
영역/거리/카테고리, 더 보기, 주변 POI 주소, 빈 결과, 페이지 이동 후 오류를 검증한다.
모든 요청을 local origin으로 제한하고 외부 요청 시도 0을 검사한다.
화면은 ignored `test-results/korean-search.png`에 캡처한다. 상세 최종 결과는 아래 확정 기록을 따른다.

## 한계와 후속

실제 전국 주소·POI 원본/정확도·수십만 행/동시 사용자 부하·검색 품질 지표는 미검증이다.
POI 역조회는 정확한 주소 geocoder가 아니며 외부 API 연동도 구현/검증하지 않았다.
Android/iOS 실제 검색 UI·카메라/네트워크, Safari/Firefox는 미검증이다. Expo JS export는 Native 앱 빌드가 아니다.
기존 high2 취약점·공유 MapLibre worker·원천 HTTP503 제한을 유지한다.
자동완성은 공개 Nominatim을 호출하지 않으며 새 제3자 데이터·secret·제작자 endpoint를 추가하지 않았다.

최종 검사 결과·화면 확인·tarball/staged 및 원격 CI 결과는 [진행 기록](../progress.md)과 PR checks에 기록한다.

## 최종 로컬 결과

전체 `check` 통과: Vitest57, 독립 core1, 데이터정책17, 비용감사14, strict/native 타입·lint·format·API/설계,
Next production과 Expo Android/iOS JS export. 실제 Docker `test:geo`19개, Chromium E2E7개 통과(0 skipped/retry).
검색 캡처 직접 확인: 한글 결과·주소·출처·필터·중심 좌표·마커 표시 정상. 실제 지형 없이 자체 fixture임을 화면에서 고지한다.
실제 CLI migration/서버 조회·no-store·정상 종료 smoke도 통과했다. pnpm 내장 search와 충돌하지 않는 명령 이름을 사용한다.
`pack:check` SDK5개 통과, core SHA256 `74716892459aab2ecf65465b1ce1ebacc99e3219c28faed96237ed467d7ef9db`,
data-adapters `5cbb894644be478ead1b349345ee7b1be325cc26a7c9d2449d6a1bec72ed6b24`.
검토한 runtime 소스 12개 해시와 실제 tarball/배포 JS를 감사했고 정적 findings0·브라우저 외부 요청0이다.
