# 실제 공공 POI 원본 검증 — 2026-10-20

2026-10-25 추가: **북구 산책로 원본 CSV 7행의 파일 검증은 통과**했다. [실제 취득·행 수 검증](bukgu-original-validation.md)을 참고한다. PostGIS 적재·SDK 검색과 나머지 두 자료는 여전히 미검증이다. 아래 10-20 접근 실패는 과거 관측이다.

## 공식 접근 결과

2026-10-20(KST) 키·쿠키·로그인·redirect 추적 없이 확인했다. 응답 본문, 시설 레코드, 연락처 또는 개인정보를 결과에 보관하지 않았다.

| 정확한 원장 자료 | 확인한 공식 URL | 관찰 |
| --- | --- | --- |
| `yongsan-parking` | <https://www.data.go.kr/data/3077854/fileData.do> | HTTP 503 |
| `bukgu-walking` | <https://www.data.go.kr/data/15088391/fileData.do> | HTTP 503 |
| `mois-animal-hospitals` | <https://www.data.go.kr/data/15045050/fileData.do> | HTTP 503 |
| 동물병원 원본 안내 | <https://file.localdata.go.kr/file/animal_hospitals/info> | HTTP 503; CSV 파일 자체가 아닌 안내 주소 |
| 용산 공개 카탈로그 | <https://www.data.go.kr/catalog/3077854/fileData.json> | HTTP 503 |
| 북구 공개 카탈로그 | <https://www.data.go.kr/catalog/15088391/fileData.json> | HTTP 503 |
| 동물병원 공개 카탈로그 | <https://www.data.go.kr/catalog/15045050/fileData.json> | HTTP 503 |
| LOCALDATA 공개 다운로드 안내 | <https://www.localdata.go.kr/devcenter/dataDown.do?menuNo=20001> | HTTP 503 |

공개 검색에서도 위 자료에 대응하는 검증 가능한 정확한 CSV/ZIP 다운로드 URL을 확보하지 못했다. **상세·안내 페이지의 503과 실제 CSV 다운로드 실패는 같은 결과가 아니다.** 현재는 원본 파일 URL이 미확보되어 실제 CSV 요청·헤더 확인·좌표 기준점 확인을 수행하지 못한 상태다. 추측한 ZIP 경로, 제3자 미러 또는 다른 기관 자료로 대체하지 않았다.

안전한 접근 메타데이터는 ignored `artifacts/real-poi/official-access.json`, `original-discovery.json`, `public-search.json`에 있다. 이 파일들은 Git/npm에 포함하지 않는다. 새 검증기의 `probe`는 원장의 정확한 세 공식 상세 페이지를 다시 확인하며 `portal-probe.json`에 상태·확인시각·Content-Type만 기록한다. HTTP 200도 원본 취득 성공을 뜻하지 않는다.

## 구현한 재현 도구

[verify-real-poi.mjs](../../scripts/verify-real-poi.mjs)는 운영자가 실제 원본을 확보한 뒤 검증할 수 있는 private 도구다. 기본 실행/SDK 설치/일반 테스트에서 원격 요청이나 DB 접속을 시작하지 않는다.

```sh
pnpm build:sdk
node scripts/verify-real-poi.mjs probe
node scripts/verify-real-poi.mjs validate artifacts/real-poi/operator-config.json
node --env-file=artifacts/real-poi/database.env scripts/verify-real-poi.mjs smoke artifacts/real-poi/operator-config.json
```

명시적 HTTP proxy 환경에서는 Node 24의 `--use-env-proxy` 옵션을 사용할 수 있다. 기존 인증서·proxy·TLS 검증을 끄거나 변경하지 않는다. `probe`는 상세 페이지 하나라도 HTTP 200이 아니면 종료 코드 1을 반환한다. 이는 테스트 통과나 원본 데이터 검증 성공으로 처리하지 않는다.

### 운영자 설정

원본과 설정은 `artifacts/real-poi/` 안에 두고 실제 파일을 확인한 뒤 다음 필드를 작성한다. 자동 헤더 추측·자동 최신 URL 탐색·API 키 발급은 하지 않는다. 파일 경로·해시·좌표·DB 자격증명은 공개 로그에 출력하지 않는다(보고서의 원본 SHA-256은 예외로 기록한다).

| 필드 | 반드시 확인할 값 |
| --- | --- |
| `sourceId` | 기존 CSV 지원 A 자료 중 `yongsan-parking`, `mois-animal-hospitals`, `bukgu-walking` |
| `operatorOptIn`, `realSourceAcknowledged` | 모두 `true`; 합성 파일을 실제 자료로 진술하는 용도가 아님 |
| `sourcePageUrl`, `reviewedLicense` | 데이터 원장의 정확한 공식 상세 URL과 `LicenseRef-DataGo-Unrestricted` |
| `originalUrl` | 해당 원본의 직접 CSV 다운로드 URL. 공식 허용 호스트의 HTTPS, 비밀 키/토큰/인증정보 없음. 상세·`/info` 주소를 원본 CSV로 인정하지 않음 |
| `retrievedAt` | 실제 취득시각. 미래 시각 금지 |
| `sourceFile` | ignored 디렉터리 안 실제 CSV 파일 경로. symlink와 외부 경로 차단 |
| `sha256` | 실제 원본 바이트 SHA-256. 기존 수집기의 검사를 그대로 적용 |
| `snapshotUpdatedAt` | 원천 파일/데이터의 검증된 기준시각. 취득시각과 구분 |
| `encoding` | 실제 확인한 `utf-8` 또는 `euc-kr` |
| `expectedHeader` | 원본의 전체 헤더를 순서대로 명시한 문자열 배열. 한 열이라도 다르면 거부 |
| `expectedRows` | 공식 파일 metadata 또는 별도 검토로 확인한 원본 데이터 행 수(헤더 제외), 1~100000 정수. 고유 행과 중복 행의 합이 다르면 거부. 다운로드한 파일에서 자동 산출해 검토를 대신하지 않음 |
| `columns` | 기존 `CsvImportConfig`의 실제 열 매핑. 동물병원은 관리 ID·상태·X/Y 필수, 산책로는 좌표 열 없음 |
| `controlPoints` | 좌표 제공 자료의 독립적으로 검토한 실제 시설 기준점 1개 이상. 원본 `source_id`, WGS84 `[경도, 위도]`, 허용 오차 `toleranceMeters`(최대 30m), 근거·확인 방법을 설명하는 `referenceNote`(24자 이상) |

동물병원은 EPSG:5174→4326, 주차장은 EPSG:4326으로 검증한다. `controlPoints[].source_id`는 정규화된 `PublicPlace.source_id`다. 원본 ID 열을 제공하지 않는 자료는 기존 수집기 규칙인 NFC 이름+개행+주소의 SHA-256과 대응해야 한다. `bukgu-walking`은 좌표가 없는 텍스트 자료이므로 `controlPoints: []`만 허용하고 위치·경로를 추정하지 않는다.

원본 URL이 공식 호스트에 있다는 사실, 입력된 referenceNote 또는 운영자 동의만으로 파일과 권리·실제 시설의 대응이 독립적으로 증명되지는 않는다. 자동 도구는 **운영자의 원본 진술·권리·기준점 검토를 전제로 하는 파일 검증**이다. 결과에도 `operator-attested-original-file-not-independent-download-proof`를 명시한다. 확인되지 않은 파일을 A로 승격시키거나 C/D 자료를 이 도구로 수집하지 않는다.

### 검증 모드와 DB 격리

`validate`는 10MiB 파일 상한, exact header, 기존 A/기한/권리/CRS admission·SHA·필드 검증과 기준점 ID의 실제 행 존재를 검사한다. `expectedRows`와 고유 행+중복 행을 비교하며, 보고서에는 `originalRows`, `duplicateRows`, `rowsWithoutCoordinates`, 기준시각·인코딩을 기록한다. 무위치 프로파일의 모든 좌표는 null인지 확인한다. 예상 행 수 자체는 운영자 검토 전제이며 자동 독립 다운로드 증명이 아니다. 기존 운영자 설정에도 검토한 `expectedRows`를 추가해야 한다. 기준점의 지리적 오차 및 DB·SDK 통합은 수행하지 않으며 결과에 `not-executed`로 기록한다.

`smoke`에는 운영자가 마련한 **전용·빈 로컬 DB**가 필요하다. `database.env`에 서버 전용 `GEO_DATABASE_URL`과 `KMK_REAL_POI_DATABASE_ACK=disposable-real-poi`를 둔다. DB 이름은 `kmk_real_poi` 또는 `kmk_real_poi_<영소문자·숫자>`여야 하고, host는 localhost/loopback만 허용한다. 기존 `kmk` schema가 있으면 수정 전에 거부한다. 기존 개발/운영 DB를 지정하거나 DB 암호를 `NEXT_PUBLIC_*`/`EXPO_PUBLIC_*`에 넣지 않는다. 도구는 Docker나 DB를 자동 생성·삭제하지 않는다.

실행 경로는 다음과 같다.

1. 허가된 CSV를 기존 `prepareCsv()`로 준비한다. 실제 자료 플래그 및 5,000행 smoke 상한을 확인한다.
2. 기존 PostGIS·검색 migration과 writer/reader 역할을 적용한다. 한 파일의 원자적 upsert를 두 번 수행하고 행 수·정체성의 중복 증가가 없는지 확인한다.
3. 실제 적재 좌표와 독립 기준점의 spheroid 거리 오차를 검사한다. 범위 검사만으로 실제 정확성을 통과시키지 않는다.
4. 공통 `createPlacesClient`의 카테고리·주변·bounds 조회와 PostGIS `KoreanSearchProvider.searchPage()`에서 적재한 레코드·출처·라이선스를 확인한다. 무위치 산책로는 공간 조회 `not-applicable-no-coordinates`로 기록한다.
5. 보고서는 행 수·해시·검사 상태만 ignored `verification.json`에 기록한다. 레코드 이름/주소/좌표/DB 암호/원본 오류 본문을 로그하지 않는다. 결과 DB와 수동 원본 삭제는 운영자 정책으로 수행한다.

이 smoke는 SDK/Provider→PostGIS 통합이며 공개 HTTP 배포·지도 화면·전국 품질·장애 부하 검증이 아니다.

## 이번 실행 결과와 남은 조건

| 항목 | 결과 |
| --- | --- |
| 8개 공식 상세/카탈로그/안내 접근 | HTTP 503; 본문 미보관 |
| `node --use-env-proxy scripts/verify-real-poi.mjs probe` | 세 공식 상세 페이지 HTTP 503을 실제 기록하고 종료 코드 1. 원본 취득 성공으로 처리하지 않음 |
| 실제 CSV URL·원본 파일·헤더·좌표 기준점 | 미확보/미검증 |
| `node --test tests/real-poi.test.mjs` | 3개 통과. 출처/헤더/기준점 요구·전용 DB 제한·bounded file/외부 경로·symlink 거부. 자체 합성 입력의 보호 검사이며 실공공데이터 성공이 아님 |
| 미존재 설정의 CLI `validate` | 종료 코드 1 및 안전한 오류 코드. `verification.json`을 failed로 기록해 이전 성공 결과가 최신 결과로 남지 않음 |
| 파일 `validate` / DB `smoke`의 실제 원본 경로 | 미실행. 원본을 확보하고 운영자 검토·기준점 및 전용 DB를 준비해야 함 |
| 실제 지도 화면·Native | 미실행; headless 도구 구현으로 통과 처리하지 않음 |

실파일 확보 뒤 해당 자료의 권리·기한·헤더·좌표 기준점을 다시 확인하고 `validate`와 `smoke`를 실행해야 한다. 그때의 실제 산출물 hash·DB/SDK 결과와 실패를 별도 기록하기 전에는 STEP 07 실자료 통합 완료 또는 실제 전국 검색 품질 확보로 표시하지 않는다. 제3자 raw payload·연락처·폰트·키를 Git/npm에 포함하지 않는 기존 정책은 유지한다.
