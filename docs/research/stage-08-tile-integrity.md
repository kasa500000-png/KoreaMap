# Stage 08 타일 무결성·해안선·용량 검토

기준: `main`의 `259d75e`, 확인일 2026-10-20. SDK 설치에 지도 데이터·JDK·외부 계정을 추가하지 않는다. 기존 성공 세대와 원본은 보존한다.

## 압축 타일의 실제 검증

기존 `inspectArchive()`는 SQLite 구조·메타데이터·BLOB 크기와 첫 타일의 gzip magic만 확인했다. 프로젝트 작성 합성 데이터의 gzip CRC를 손상시키면 `gunzipSync()`는 `Z_DATA_ERROR`로 거부하지만 기존 검사기는 `gzip: true`로 통과했다. 파일 SHA를 올바르게 다시 기록해도 이 구조적 결함은 검출되지 않았다.

수정은 v1/v2 모든 타일 BLOB를 한 행씩 검사한다. 기존 **저장된 BLOB 8MiB** 상한은 유지한다. 추가 SQL 사전검사는 `typeof(tile_data)='blob'`을 모든 행에서 확인한 뒤 byte 길이를 검사하며, 이 검사가 끝나기 전에 `tile_data`를 JavaScript로 읽지 않는다. SQLite `length(TEXT)`가 byte가 아닌 문자 수를 반환하는 모호함을 없애고 TEXT·NULL·숫자 payload를 거부한다. 압축 타일은 gzip 종료·CRC와 별도의 **확장 후 8MiB** 상한을 확인한다. 비압축 MVT도 같은 상한을 적용하고, 한 archive 안의 혼합 압축은 거부한다. 새 private helper는 protobuf wire/varint/길이·UTF-8·레이어 선언·필드 타입·태그 인덱스·기하 명령 구조를 검증한다. uint64 ID를 부정확한 JavaScript number로 변환하지 않는다. 모든 타일을 확인하므로 첫 타일 뒤의 손상도 거부한다. 작은 반복 필드가 객체 수를 무제한 늘리지 않도록 feature의 geometry fragment는 보관 전에 4,096개로 제한한다. 문자열 선두 BOM은 제거하지 않아 선언되지 않은 레이어 이름이 정상 이름으로 바뀌어 통과하는 일을 막는다.

기존 HTTP·SHA·출처·Host/CORS·롤백 테스트의 임의 텍스트 타일은 프로젝트 작성 valid MVT로 교체했다. 네트워크·서버 수명·캐시·권한 검사의 의미는 유지한다. 새 외부 decoder 의존성이나 공개 SDK API 변경은 없다. 무결성 검사는 지리적 정확성·해안선 완전성·실화면 가독성의 증거가 아니다.

## 기존 운영 자료의 관측

기존 active v2 상세 4개 지역과 context의 2,136타일은 수정한 검사기로 모두 검사했다. 이후 v1 상세 4개 지역도 포함해 보존된 **9개 archive / 2,348타일**을 최종 검사했고, 각 archive의 검사 전후 SHA와 원본 PBF의 SHA가 동일함을 확인했다. 파일·원본·활성 포인터를 변경하지 않았다. 확장한 v2 타일의 최대 크기는 context 1,167,158B, 서울 2,008,348B, 울산 541,339B, 부산 634,644B, 제주 336,846B로 8MiB 이하이다. 한 번의 로컬 v2 검사 시간은 archive당 약 0.18–0.87초였으며 통제된 성능 benchmark는 아니다. 원본 JSON 근거는 ignored `artifacts/ten-stages/stage08`에 보관한다.

현재 여유 공간 약 4.2GiB에서 상세 전국 생성의 **최소 8GiB gate를 유지**한다. 기존 21세대의 archive는 약 136.6MB, 생성된 class는 약 60.1MB, 남은 tmp는 0B로 관측했다. 이를 자동 삭제해 자원 부족을 해결하지 않는다. CLI의 명시적 `--store`로 충분한 별도 운영자 볼륨을 지정하는 경로와, 상세 전국에 앞서 제한된 지역·context를 검증하는 순서를 사용한다. 새 데이터의 ZIP·확장본·클립본·새 archive와 이전 세대가 동시에 존재할 공간을 별도로 산정해야 한다.

## 이후 세대의 컴파일 산출물 절감

기존 javac 호출은 fatjar 안의 외부 source도 암묵적으로 컴파일했다. 같은 profile 원문과 JDK에서 한 번 관측한 결과는 기존 옵션 674class/2,862,679B/5,523ms, `-implicit:none -sourcepath ''` 추가 시 2class/16,758B/921ms다. 이는 반복 benchmark가 아니며 기존 class를 삭제한 수치도 아니다. [JDK 21 javac의 source-path와 implicit 옵션](https://docs.oracle.com/en/java/javase/21/docs/specs/man/javac.html)에 따라 프로젝트 원문만 컴파일하고 외부 클래스는 검증된 Planetiler jar의 bytecode를 사용한다.

동일 profile SHA `ef94f5ab80d5e7e981ebf120ec693beadbd5d9c0316eafa036bf4e07a18b5523`와 프로젝트 작성 소형 PBF로 두 옵션을 실행했다. v1 unit 40개, v2 unit 85개와 실제 archive의 78타일·267피처 codec 검사가 통과했다. 두 MBTiles 파일 전체가 SHA `cdf068f1fb98b04efb4d618f303f209bee4114239c0582fce50072ee706602cf`로 byte 동일했다. 이 근거로 이후 `pipeline.ts`의 javac 옵션만 조정하며 profile·JDK·Planetiler pin과 기존 성공 세대는 변경하지 않는다. 실제 전국 생성의 용량·성능이나 macOS/Windows의 새 옵션 실행은 별도 검증이다.

## 해안선 공급원 후보

[osmdata land polygons](https://osmdata.openstreetmap.de/data/land-polygons.html)는 OSM coastline을 조립·보정한 전 세계 육지 polygon을 제공한다. 공식 페이지에 한국 전용 다운로드는 없으며, 자른 해안선의 끝점을 임의로 연결해 육지를 만들지 않는다. 처리 오류로 갱신이 멈출 수 있다는 공식 경고도 유지한다.

| 공식 파일 | HEAD 관측 압축 크기 | 용도·한계 |
| --- | ---: | --- |
| [simplified land / EPSG:3857](https://osmdata.openstreetmap.de/download/simplified-land-polygons-complete-3857.zip) | 24,452,163B | 공식 z0–9용; context landmask 후보이며 고줌 해안선 증거가 아님 |
| [simplified water / EPSG:3857](https://osmdata.openstreetmap.de/download/simplified-water-polygons-split-3857.zip) | 23,730,346B | 공식 z0–9용; 바다 polygon이며 내륙 호수·저수지를 포함하지 않음 |
| [complete land / EPSG:4326](https://osmdata.openstreetmap.de/download/land-polygons-complete-4326.zip) | 923,217,873B | 상세 자료; 이번 100MiB 다운로드 상한 초과 |
| [split land / EPSG:4326](https://osmdata.openstreetmap.de/download/land-polygons-split-4326.zip) | 928,413,925B | 상세 자료; 이번 100MiB 다운로드 상한 초과 |

[공식 라이선스](https://osmdata.openstreetmap.de/info/license.html)는 OSM contributors의 ODbL을 명시한다. [다운로드 정책](https://osmdata.openstreetmap.de/info/downloading.html)은 필요한 파일만 받고, 갱신에는 `If-Modified-Since`를 사용하도록 요구한다. 현재 원장의 Geofabrik 대한민국 추출본 A 판정을 이 별도 원천에 자동 확대하지 않았다. 신규 source별 권리·CRS·갱신 시각·원본 SHA·압축 해제 한도·ODbL 출처·운영자 opt-in 검토와 A 등록이 끝나야 payload 수집을 구현할 수 있다. 이번에는 HTML/HEAD만 확인했으며 원본 ZIP은 다운로드하지 않았다.

[Natural Earth 1:10m land](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-land/)는 주요 섬을 포함한 저축척 대안이다. [공식 약관](https://www.naturalearthdata.com/about/terms-of-use/)은 public domain과 상업·수정·배포 이용을 명시하지만, 이 원천도 기존 원장에는 없으므로 자동 수집하지 않았다. 1:10m 일반화 자료를 상세 한국 해안선으로 표시하지 않는다. 신규 원천 도입은 이번 타일 무결성 수정의 필수 조건이 아니다.

## 검증 범위와 남은 작업

TypeScript와 타일 **40개 회귀**가 통과했다. 기존 34개를 유지하고 저장된 raw/gzip의 과대 byte 길이·BLOB 이외 SQLite 타입·CRC·truncation·과대 확장·혼합 압축·잘못된 wire/varint/UTF-8·BOM-prefix 레이어·태그 인덱스·기하 명령·과도한 geometry fragment와, 손상 archive의 SHA를 다시 계산해도 기존 활성 세대가 보존되는 부정 회귀를 추가했다. 저장 한도와 타입 회귀는 첫 행을 잘못된 MVT로 두고도 뒤 행의 저장 오류를 먼저 반환하는지 확인한다. 이 문서의 지도 공급원 검토는 원장 승인이나 해안선 통합 완료를 의미하지 않는다. Web/Android/iOS 실화면 QA는 이 수정의 검사 범위에 포함하지 않는다.

포인터 전환은 현재 임시 파일의 원자적 rename을 사용한다. 향후 동시 운영자 전환을 막는 지역별 lock/CAS와 전원 장애 내구성을 위한 fsync는 독립적인 운영 개선 후보이며 이번 변경이 이를 구현했다고 주장하지 않는다.

루트통합에서수정후전체pnpm check·타일40개·5pack을통과했다. 현재compiledvalidator로기존9archive/2348tile을다시읽어모두PASS와archive SHA불변을확인했다. 원장archive/pipeline/mvt SHA3개는개별diff검토후반영했다. 처음공식문서host2건의감사실패를보존했고docs-only검토와runtime거부회귀를추가한뒤전체검사를재실행했다.
