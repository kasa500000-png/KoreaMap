# 공공 POI 파이프라인 검증 기록

확인일 2026-10-19. 로컬 Linux Docker와 Node24에서 실시한다. 공개 공공데이터의 실수집 성공과 합성 데이터 시스템 테스트를 분리한다.

## 공식 근거와 버전

| 항목 | 선택 / 근거 / 관찰 |
| --- | --- |
| pg / @types/pg | 8.23.1 / 8.23.1 exact, MIT. npm 공식 메타데이터(2026-10-19), Node >=16 조건과 Node24 확인 |
| csv-parse | 7.0.3 exact, MIT. 공식 npm metadata, sync parser/컬럼 수/행 크기 옵션 확인 |
| Docker PostGIS | `18-3.6@sha256:ea49d706470cfe1215c4f1e074fcab66d5af52f80adaf90d5a9beace71cd5ce8`. 실제 pull 및 로컬 실행. PostGIS 3.6.4 / PROJ 9.8.1, PROJ 네트워크 비활성 |
| PostgreSQL major | 18. 공식 이미지의 2026-10 Debian trixie/PostGIS 3.6 전환, PG18 volume 경로 변경 확인. 기존 3.5/PG17 DB의 자동 업그레이드 없음 |
| Supabase | PostGIS 공식 문서/changelog 확인만. 실제 계정 접근·배포·요금 발생 없음 |
| 원천 데이터 | 용산 3077854 / 동물병원 15045050 / 산책로 15088391 상세 페이지 재접근 실패. 재시도에서 용산·LOCALDATA 원본 링크 HTTP 503. 원본 파일과 실제 행 미취득 |

공식 문서:

- [PostGIS Docker README](https://github.com/postgis/docker-postgis), [ST_Transform](https://postgis.net/docs/ST_Transform.html), [ST_DWithin](https://postgis.net/docs/ST_DWithin.html)
- [node-postgres 매개변수 쿼리 문서 원본](https://github.com/brianc/node-postgres/blob/master/docs/pages/features/queries.mdx): 공식 웹 문서 경로는 403, 공식 저장소 raw 문서는 200으로 확인
- [CSV parse 옵션](https://csv.js.org/parse/options/), [pg registry](https://registry.npmjs.org/pg/8.23.1), [csv-parse registry](https://registry.npmjs.org/csv-parse/7.0.3)
- [Supabase PostGIS](https://supabase.com/docs/guides/database/extensions/postgis), [changelog](https://supabase.com/changelog)

## 실제 DB 검사

`pnpm test:geo`는 임시 DB를 만들고 테스트 실패도 exit code로 전달한다. Docker 부재를 skip으로 바꾸지 않는다. 최초 실행에서 하위 11개 검사 및 상위 묶음(총 12개)이 통과했다:

1. 마이그레이션 2회, RLS/공간 인덱스 생성.
2. 자체 합성 7종 적재와 동일 파일 재실행의 ID 중복 방지.
3. 미터 반경, bbox, category, null 위치와 라이선스/기준시각 보존.
4. reader 쓰기/run-log 읽기 거부, writer DELETE/DDL 거부, 무권한 역할 schema 접근 거부.
5. 세 번째 행의 DB 제약 오류를 주입해 앞선 갱신도 전부 롤백. 실패 로그의 오류 코드/0 written 확인.
6. running 잔존 로그 복구→interrupted, 재실행→success, 오래된 파일의 갱신 0건.
7. 같은 source 동시 lock 거부, 검증을 우회한 입력 객체 거부.
8. EPSG:5174 투영 원점 `[200000,500000]`을 약 `[127.0007835,38.0027461]`로 변환. 허용 오차 0.00001°. 실제 동물병원 위치 기준점을 검증한 것은 아니다.
9. 날짜변경선 양쪽 POI bbox 포함, 15m 근접 후보 감지와 ID 분리 유지.
10. EXPLAIN에서 두 GiST 인덱스 사용 가능 확인. 작은 fixture에서 seqscan을 비활성화한 검사이므로 실데이터 성능 벤치마크가 아니다.
11. SDK → 명시적 loopback HTTP → read-only PostGIS로 세 API 실행. origin/잘못된 JSON 거부, no-store 확인. 운영자 외부 endpoint 호출 없음.

모든 DB 테스트 자료는 자체 합성이다. 진짜 공공데이터 배포본/스크린샷/폰트/키는 추가하지 않았다. 단위 검사는 권리 등급/기한/CRS/키 없는 설정, CSV BOM·인용부호·중복·해시·누락·잘못된 좌표·개인 필드 제거, 다운로드 오류/해시 거부, SDK 기한·취소·출처 타입을 검사한다. HTTP 다운로드 성공 경로는 mock 응답 테스트이며 공식 서버 성공으로 보고하지 않는다.

## QA 범위와 제한

이번 기능은 headless 데이터 서비스/공통 API다. 실제 DB/HTTP 동작은 검증했으며 신규 지도 화면은 만들지 않았다. 기존 지도 Web 렌더러는 변경하지 않았다. Android/iOS 실기기 화면, 실제 Supabase, 대량 공공파일의 품질/성능, macOS/Windows Docker는 미검증이다. SDK fixture 조회가 실제 전국 POI 서비스라는 주장을 하지 않는다.

최종 전체 검사·패키지/보안·staged 결과와 커밋/CI는 [진행 기록](../progress.md), [비용 감사](../cost-audit.md) 및 PR checks에 기록한다. 실자료 접근이 복구되더라도 원장 대응·헤더·좌표 기준점 검증 없이 “통합 완료”로 판정하지 않는다.

### 시작 준비 상태 회귀 수정

재실행 중 DB 초기 연결이 종료되는 실패를 발견했다. 이미지 초기화 중 임시 Unix socket 서버를 ready로 판정하지 않도록 healthcheck를 명시적 TCP `pg_isready -h 127.0.0.1`로 수정했다. 수정 후 새 임시 volume에서 전체 12개가 다시 통과했다. 실패를 retry/skip으로 숨기지 않았다. 실제 개발용 `geo:local start → geo:migrate → geo:fixture → geo:local stop`도 실행해 합성 7개 upsert를 확인했다.

### 도구 라이선스

pg/csv-parse는 MIT, PostgreSQL은 자체 PostgreSQL License, PostGIS는 [GPL v2 본문](https://github.com/postgis/postgis/blob/master/COPYING)을 제공한다. [PostgreSQL 고지](https://github.com/postgres/postgres/blob/master/COPYRIGHT)도 확인했다. 이들은 사용자 인프라의 별도 DB 프로세스/이미지이며 SDK npm에 DB 실행파일·이미지·공공데이터를 포함하지 않는다. PostGIS/이미지 구성요소를 SDK MIT로 재허가하지 않으며 이미지 재배포 시 해당 구성요소의 조건이 별도로 적용된다.
