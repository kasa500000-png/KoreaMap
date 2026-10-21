# 권고 후속 작업 — 실제 공공 POI 원본 재탐색

확인일: 2026-10-21 UTC/KST. 기준 소스는 `ce8e8e1ad797f9a0780d6bc5e782b66505c7ab23`이다. **실제 원본 CSV·헤더·독립 좌표 기준점은 여전히 미확보이며 실제 ETL·PostGIS·SDK 검색은 미실행이다.** 합성 보호 테스트 성공을 실제 공공데이터 적재 성공으로 바꾸지 않는다.

## 1. 구현 완료 기능

기존 private `verify-real-poi.mjs probe`의 기본 요청은 승인된 공식 상세 페이지마다 1회로 유지한다. 명시적인 `probe --retry-once`만 URL마다 최대 2회, 세 자료 합계 최대 6회를 허용한다. import·SDK 설치·일반 테스트는 원격 요청하지 않는다. 새 Provider·키·공유 서버·주기적 수집은 추가하지 않는다.

HTTP 429/502/503/504에만 한 번 재시도한다. `Retry-After`의 정수 초 및 정확한 GMT HTTP-date를 반영하되 5초 상한을 넘거나 값이 잘못되면 재시도하지 않는다. 헤더가 없거나 과거 시각인 경우에도 최소 1초 간격을 둔다. HTTP 401/403·redirect·그 밖의 상태·network 오류·25초 요청/본문 정리 timeout은 재시도하지 않는다. 응답 스트림의 `cancel()`이 끝나지 않아도 같은 deadline/외부 취소 signal로 대기를 종료하고 timer를 해제한다. 요청 중·본문 정리 중·backoff 중 취소하면 다음 요청을 보내지 않는다. 가장 긴 재시도 대기 간격도 5초다.

공식 URL은 원장 admission 이후 세 기존 자료의 정확한 상세 주소와 다시 대조한다. `redirect:'error'`, `credentials:'omit'`를 유지하고 응답 본문을 읽거나 저장하지 않는다. 로그는 상태·시각·고정 MIME enum/`UNKNOWN`·횟수·안전한 재시도 사유만 포함한다. 원시 `Content-Type`/`Retry-After`·오류 본문·키·연락처·시설 좌표를 출력하지 않는다. 상세 페이지 HTTP 200도 `page-only-not-original-csv`이며 원본 취득 성공으로 표시하지 않는다. HTTP 200 이후 본문 정리가 timeout/취소되면 성공으로 종료하지 않는다.

## 2. 생성·수정 파일

- `scripts/verify-real-poi.mjs`
- `tests/real-poi.test.mjs`
- `docs/research/recommended-poi-acquisition.md`

원장 등급·권리·CRS·Provider·ETL/조회 SQL·의존성·root tasks는 변경하지 않는다. 원본 payload와 실행 로그는 ignored `artifacts/real-poi/`에만 둔다.

## 3. 실행한 검사와 실제 접근 결과

Node 보호 회귀는 기존 3개와 신규 11개를 합쳐 **14/14 PASS**다. 기본 1요청, 명시적 최대 2요청, seconds/HTTP-date/invalid/over-budget `Retry-After`, 비재시도 상태·redirect·timeout, 실제 기본 backoff 함수의 취소, 실제 `ReadableStream`의 끝나지 않는 cancel에 대한 timeout/외부 취소 및 cancel의 throw/reject 실패, body 미소비, 민감 오류/임의 MIME 헤더 원문 미출력을 검사한다. cleanup 자체가 실패하면 `body-cleanup-failed`로 반환하고 재시도하지 않으며 HTTP 200도 성공 처리하지 않는다. 이는 모의 네트워크 보호 검사이며 실제 스트림 테스트도 공공 레코드를 사용하지 않는다. `pnpm build:sdk`, scoped ESLint·Prettier, 문서 91개/상대 링크 486개, `git diff --check` PASS다. SDK·서비스 배포 타입은 변경하지 않는다. 최초 ESLint는 Node globals 표기를 지적해 수정했고, Python 자식 프로세스가 pnpm 11을 선택한 별도 실행 실패 뒤 고정 pnpm 12.14.0 CLI를 직접 지정해 성공을 확인했다. 독립 리뷰에서 발견한 무한 cancel 대기, cancel 실패의 성공 처리, MIME 원문 노출도 통합 전에 수정하고 회귀를 추가했다.

2026-10-21 **07:11:09–07:11:31 UTC / 16:11:09–16:11:31 KST**, inherited proxy와 TLS 검증을 유지한 executor에서 아래 공식 URL 10개를 GET으로 확인했다. 전부 **HTTP 503 / text/plain / Retry-After 없음**이었다. 키·쿠키·로그인·redirect 추적 없이 응답 본문을 보관하지 않았다.

| 공식 원본 탐색 표면 | 확인한 주소 |
| --- | --- |
| 용산 주차장 상세 | <https://www.data.go.kr/data/3077854/fileData.do> |
| 북구 산책로 상세 | <https://www.data.go.kr/data/15088391/fileData.do> |
| 동물병원 상세 | <https://www.data.go.kr/data/15045050/fileData.do> |
| 동물병원 안내 | <https://file.localdata.go.kr/file/animal_hospitals/info> |
| 용산 공개 카탈로그 | <https://www.data.go.kr/catalog/3077854/fileData.json> |
| 북구 공개 카탈로그 | <https://www.data.go.kr/catalog/15088391/fileData.json> |
| 동물병원 공개 카탈로그 | <https://www.data.go.kr/catalog/15045050/fileData.json> |
| LOCALDATA 다운로드 안내 | <https://www.localdata.go.kr/devcenter/dataDown.do?menuNo=20001> |
| 용산 상세 페이지에 링크된 DCAT | <https://www.data.go.kr/biz/dcat/metadata/3077854.do> |
| 북구 상세 페이지에 링크된 DCAT | <https://www.data.go.kr/biz/dcat/metadata/15088391.do> |

공개 검색/열람 커넥터에서는 세 상세 페이지와 schema.org 카탈로그의 metadata를 읽을 수 있었다. 자료명·이용허락범위 제한 없음·CSV·제공기관·용산 WGS84/동물병원 EPSG:5174를 재확인했다. 카탈로그에는 직접 CSV 주소인 `contentUrl`이 없고 다운로드 버튼은 이 도구에서 실행 가능한 링크로 제공되지 않았다. DCAT는 XML 형식 미지원, 동물병원 안내는 접근 실패였다. **executor의 503을 모든 환경에서의 포털 장애로 일반화하지 않는다.**

공식 [LOCALDATA 전환 이용 매뉴얼](https://www.localdata.go.kr/images/egovframework/portal/manual_260106.pdf)도 검색 결과에서 발견했다. 전국/지역별 CSV 다운로드 안내가 있지만 해당 PDF 원문은 열람 도구에서 timeout이어서 실제 버튼 대상 주소를 추출하지 못했다. 비공식 게시물의 추정 download endpoint·Referer 요구를 공식 다운로드 링크로 인정하지 않고 요청하지 않았다. 주소 추측·헤더 위장·proxy 변경·보호 우회·제3자 mirror는 수행하지 않았다.

07:17:56 UTC / 16:17:56 KST에 실제 `node --use-env-proxy scripts/verify-real-poi.mjs probe --retry-once`를 실행했다. 세 상세 페이지를 각각 1초 간격으로 최대 2회, 총 **6회** 요청했고 전부 **HTTP 503**이었다. `retry-limit-reached`로 멈추고 **종료 코드 1**을 반환했다. 이는 의도된 접근 실패 관측이며 원본 취득·테스트 통과가 아니다.

실행 메타데이터는 ignored `artifacts/real-poi/recommended-official-access.json`, `recommended-executions.json`, `recommended-retry-probe.log`, `portal-probe.json`에서 확인한다. 실패한 pnpm 선택 로그도 보존한다. 실제 CLI 재시도 결과는 원본 취득 결과와 별도로 기록한다.

## 4. 실화면 QA

지도 화면·실제 시설 마커·공공 POI 검색 화면은 **미실행**이다. HTML metadata 열람이나 headless 도구 회귀를 지도 실화면 QA로 표시하지 않는다. Android/iOS 결과도 이번 범위에 없다.

## 5. 라이선스·보안·비용

기존 A 프로파일 `yongsan-parking`, `bukgu-walking`, `mois-animal-hospitals`만 조사했다. 상업 이용·저장·가공·재배포 허가의 개별 파일 범위를 유지하고 사진·폰트·다른 업종으로 확대하지 않는다. 공공데이터의 이용허락을 SDK MIT로 바꾸지 않는다. 새 호스트를 승인하거나 원장 C/D를 승격하지 않았다.

제3자 레코드·원본·연락처·주소·좌표·개인정보·API 키는 Git/npm에 추가하지 않았다. 검색 결과에 나타난 session ID가 있는 게시판 URL도 수집 근거·문서 링크로 저장하지 않았다. 요청은 운영자 명시 명령으로만 발생하며 제작자 서비스·DB·유료 계정에 연결하지 않는다. 기본 SDK 빌드·테스트에는 이번 probe나 외부 서비스가 필요 없다.

## 6. 남은 작업·차단 요인

원본 직접 CSV 주소/바이트·SHA-256·exact header·기준일·좌표 제공 자료의 독립 시설 기준점을 실제로 확보해야 한다. 현재는 CSV 다운로드 자체를 시도할 확인된 URL이 없어 원본 요청 실패로도 표현하지 않는다. 산책로의 위치는 계속 null이며 설명의 주소로 좌표·경로를 추정하지 않는다.

기존 [원본 검증 절차](real-poi-validation.md)에 따라 실제 파일의 `validate`와 전용·빈 로컬 PostGIS `smoke`를 실행해야 한다. 자료 없는 DB 구동이나 합성 파일 적재는 이번 차단 요인을 해소하지 않는다. API 활용신청·공유 키·공개 Nominatim·미확인 media를 대체 수집 수단으로 도입하지 않는다.

```sh
pnpm build:sdk
node --test tests/real-poi.test.mjs
node --use-env-proxy scripts/verify-real-poi.mjs probe
node --use-env-proxy scripts/verify-real-poi.mjs probe --retry-once
```

두 probe 명령은 상세 페이지 metadata 접근만 검사한다. 어느 상세 페이지라도 HTTP 200이 아니면 종료 코드 1이며, 원본 파일 성공을 판정하는 명령이 아니다. 재시도 상한은 접근 제한·호출 정책을 무효화하지 않는다.

## 7. Git 브랜치·커밋

브랜치 `research/recommended-poi-acquisition`, 기준 `ce8e8e1ad797f9a0780d6bc5e782b66505c7ab23`이다. 작업자는 stage·commit·push·원격 변경을 하지 않았다. 전체 통합 검사·출처 hash 검토·커밋/PR은 루트 담당자가 별도로 처리한다.

## 8. 다음 단계 진행 가능 여부

보호 도구의 통합 검토는 가능하다. **실제 공공 POI ETL·DB·SDK 검색 수락은 BLOCKED / NOT_RUN**이다. 원본 및 독립 기준점 확보 전에는 실제 자료 통합 완료·전국 검색 품질 검증 완료로 표시하지 않는다.
