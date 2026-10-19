# 공공 POI 저장·조회와 ETL

구현 범위: 운영자가 선택한 A 등급 CSV의 검증·정규화·PostGIS 적재, 합성 샘플, 공통 SDK 조회 계약. **실제 공공 원천 파일 적재는 미검증**이다. 2026-10-19 재접근에서 공공데이터포털 상세 페이지와 LOCALDATA 링크가 HTTP 503을 반환했다. A 판정은 STEP 02의 개별 자료 이용허락 검토이며, 현재 파일 접근·헤더·품질 검증 완료를 뜻하지 않는다.

## 공급원별 실행 상태

| 우선 분야 / 원장 ID | 판정 | 이번 실행 지원 / 차단 사유 |
| --- | --- | --- |
| 도시공원 `parks-standard` | C | 수집 차단. 전국 취합의 개별 권리 확인 후 별도 승인 필요 |
| 주차장 `yongsan-parking` | A | CSV 프로파일, EPSG:4326. 실제 헤더·스냅샷은 운영자가 원본 확인 후 지정 |
| 반려동물 `mois-animal-hospitals` | A | CSV 프로파일, EPSG:5174→4326. 관리 ID·영업/폐업 상태 필수, 개인 연락처·대표자 제외. 실제 위치 기준점 검증은 남음 |
| 산책로 `bukgu-walking` | A | CSV 프로파일, 위치 없는 텍스트 POI. `location:null`, 주소 지오코딩과 선형 추정 없음 |
| 반려동물 `hanam-pet-bags` | A | XLSX 프로파일 미구현으로 수집 차단. 삽입 미디어 처리 없음 |
| 관광지 `tourapi-text` | A(텍스트 범위) | 좌표 매뉴얼·운영자 키/서비스 승인 미확인으로 이번 수집기에서 차단. 사진·HTML·미디어 수집 없음 |
| 공중화장실 / 기타 POI | 승인된 개별 자료 없음 | 카테고리·합성 샘플만 지원. 실제 자료 자동 수집 없음 |
| OSM `osm-geofabrik-kr` | A / ODbL | 별도 OSM 파이프라인 대상. 이 CSV 수집기는 ODbL DB를 혼합하지 않음 |
| 나머지 B/C/D | B 현재 0개 | 이 저장 파이프라인은 A만 허용. B는 장기 저장 금지, C/D는 선택형 호출에서도 제외 |

`data/sources.json`의 등급·권리·기한과 고정된 세 CSV 프로파일이 모두 일치해야 실행한다. 검토 만료(현재 2027-01-17), CRS 변경, 필수 필드 누락, 미지원 라이선스/포맷은 실패한다. 원장 등급을 임의로 올리거나 기관 전체로 승인을 확장하지 않는다. 다운로드 URL이 공식 호스트에 있다는 사실만으로 권리가 확정되지는 않으므로 **정확한 파일과 원장 항목의 대응·해시·헤더는 운영자 검토가 필요**하다.

## 공통 모델과 저장

`PublicPlace`는 `id`, `name`, `category`, `location`, `address`, `source`, `source_id`, `license`, `attribution`, `updated_at`, `metadata`를 포함한다. 기존 검색/표시용 `Place`는 호환성을 유지하며, 위치가 있는 레코드만 `publicPlaceToPlace()`로 변환할 수 있다. 출처 표시에는 원본 `PublicPlace.attribution/license`도 별도로 유지한다.

- 위치는 WGS84 `[longitude, latitude]` 또는 `null`. PostGIS `geography(Point,4326)`와 GiST 인덱스로 미터 단위 반경 검색, geometry 표현식 GiST로 bbox 검색. 날짜변경선 bbox는 두 envelope로 나눈다.
- 카테고리는 park/tourism/parking/toilet/pet_facility/trail/other. 카테고리 조회는 위치 없는 자료도 반환하지만 반경·bbox 조회에서는 제외한다.
- `(source,source_id)` 고유키. 원천 ID가 있는 동물병원은 해당 ID 필수. 주차장/산책로에 ID 열을 지정하지 않으면 NFC 정규화 이름+주소의 SHA-256을 사용한다. 이름/주소 변경 시 새로운 ID가 되므로 운영자 매칭·정정이 필요하다. 좌표 변경만으로 ID가 바뀌지는 않는다.
- `updated_at`은 운영자가 확인한 **원천 파일 기준시각**(UTC ISO, 밀리초 포함). 적재시각은 별도 `ingested_at`. 새 파일의 SHA-256, 원본 상세 URL, 원천 CRS, 필요한 영업 상태만 metadata에 보존한다. 행별 수정시각 매핑은 후속이다.
- `kmk`는 비공개 schema. 모든 자료에 출처/라이선스를 보존한다. `kmk_reader`는 places SELECT만, `kmk_writer`는 places/import_runs SELECT·INSERT·UPDATE만 가능하다. RLS와 schema 권한을 모두 적용하고 PUBLIC 접근·DELETE·DDL은 허용하지 않는다. 마이그레이션 관리자 계정은 조회 서버 운영에 사용하지 않는다.
- 서버의 `SET ROLE` 대상 그룹 역할은 마이그레이션이 만든다. 운영자가 별도 로그인 역할에 필요한 그룹만 부여한다. 로컬 자동 생성 계정은 개발 관리자이므로 운영 환경에 재사용하지 않는다.

## 키 없는 로컬 실행

Docker Engine/Desktop과 Compose v2가 설치된 저장소 루트에서:

```sh
pnpm install --frozen-lockfile
pnpm build:sdk
pnpm geo:local start
pnpm geo:migrate
pnpm geo:fixture
pnpm geo:serve
```

DB는 `127.0.0.1:54329`, 읽기 서비스는 `127.0.0.1:8099`에만 바인딩한다. 암호는 실행 시 무작위 생성해 ignored `artifacts/geo-dev/db-password`와 서버 전용 `.env`에 기록한다. 암호/연결 문자열을 콘솔에 출력하지 않는다. `pnpm geo:local stop`은 DB 컨테이너를 종료하지만 volume과 로컬 설정은 보존한다. 해당 파일을 지운 채 기존 volume을 다시 쓰면 암호가 달라지므로 백업·설정 복구 후 재시작해야 한다.

`pnpm test:geo`는 별도 무작위 프로젝트·포트·암호·임시 volume에서 실제 PostGIS를 검사한 뒤 제거한다. Docker가 없으면 실패하며 통과/skip으로 숨기지 않는다. 기본 `pnpm check`에는 DB/네트워크가 필요 없다. CI Linux는 추가로 `test:geo`를 실행하고 Windows/macOS는 일반 타입/단위/빌드만 실행한다. Docker Desktop Windows/macOS 실행은 미검증이다. 로컬 스크립트는 원격 Docker context를 사용하지 않으며 기본 로컬 socket/named pipe가 필요하다.

공식 이미지는 amd64 전용이므로 Compose에 `platform: linux/amd64`를 명시한다. Apple Silicon에서는 Docker Desktop의 x86 에뮬레이션이 필요하며 이번 환경에서는 미검증이다. PostgreSQL 18 / PostGIS 3.6 계열 이미지를 digest로 고정했다. PG18 volume 경로는 `/var/lib/postgresql`이다. Compose에 1 CPU/512MiB 제한을 두었으며 대용량 성능 보장은 아니다. 이미지와 개발 의존성 다운로드에는 인터넷이 필요하지만 제작자 API/유료 계정은 사용하지 않는다.

## 원천 다운로드·수집 설정

운영자 설정과 수동 취득 원본은 ignored `data/raw/` 아래에만 둔다. `.env`의 `KMK_IMPORT_CONFIG`에 JSON 설정 경로를 지정한다. 다음은 **실제 헤더가 아닌 설정 예시**다. 파일을 직접 확인한 뒤 각 값과 `snapshotUpdatedAt`, SHA-256을 채운다. 샘플 값으로 수집 성공을 주장하지 않는다.

```json
{
  "sourceId": "yongsan-parking",
  "operatorOptIn": true,
  "sha256": "<검토한 원본 파일의 SHA-256 64자리>",
  "snapshotUpdatedAt": "2026-10-13T00:00:00.000Z",
  "encoding": "utf-8",
  "columns": {
    "name": "<원본 명칭 열>",
    "address": "<원본 주소 열>",
    "x": "<원본 경도 열>",
    "y": "<원본 위도 열>"
  }
}
```

동물병원은 `source_id`, `status`, `x`, `y` 열을 지정한다. 산책로는 `name`, `address`, 선택 `source_id`만 사용한다. UTF-8(BOM 포함), 명시적 `euc-kr`(WHATWG EUC-KR/CP949 계열)만 지원하며 인코딩을 추측하지 않는다. 파일 원본의 실제 디코딩 품질은 별도 확인한다. `status` 외 원천 추가 컬럼은 DB에 전달하지 않는다.

- `pnpm geo download`: `KMK_DOWNLOAD_URL`의 정확한 공식 파일을 메모리로 내려받고 해시·CSV를 검증한다. 결과는 안전한 개수/해시 로그뿐이며 원본 응답을 디스크/DB에 저장하지 않는다.
- `pnpm geo collect`: 동일 다운로드·검증 후 허용 필드만 DB에 적재한다. 원본 응답의 연락처·미디어·오류 본문을 장기 저장하지 않는다.
- `pnpm geo import`: `KMK_SOURCE_FILE`에 운영자가 이미 확보한 CSV 경로를 지정해 검증 후 적재한다. 이 수동 원본의 보관/개인정보 정리도 운영자 책임이다.
- 다운로드는 opt-in·고정 SHA 확인, HTTPS 공식 호스트만 허용, redirect/cookie/URL 키 금지, 30초/10MiB 제한. 유효한 새 스냅샷은 사람이 대응·권리를 확인하고 새 SHA·기준시각을 설정해야 한다. 자동 최신 링크 탐색, 키 발급, 스케줄러, 자동 재시도는 없다.
- CSV는 최대 100,000행, 행 크기 64KiB. 중복 헤더, 잘못된 컬럼 수, 비정상 수치, 한쪽 좌표만 존재, `(0,0)`은 거부한다. 양쪽 좌표가 비면 `null`. 투영 좌표는 PostGIS로 변환하고 한국 프로파일의 결과가 경도 124..132/위도 33..39 밖이면 전체 파일을 롤백한다. 범위 검사만으로 실제 위치 정확성을 증명하지는 않는다.

DB URL은 `GEO_DATABASE_URL`로 서버에만 지정한다. 설정 누락 시 안전하게 실패한다. 로컬 설정 파일을 자동 생성하는 동작은 `geo:local start`에만 있다. 자체 PostgreSQL도 같은 schema·마이그레이션을 사용할 수 있으며 Supabase 패키지는 설치하지 않는다. 원격 DB는 인증서 검증 TLS를 요구하고 URL의 SSL override/query parameter는 거부한다. 별도 CA는 운영자의 Node 신뢰 저장소로 설정한다. DB URI나 API secret을 `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*`에 넣지 않는다.

## 갱신·중복·실패 복구

1. 권리/기한/설정/해시/필드를 검사한다. 여기서 실패하면 DB에 원본·오류 본문을 남기지 않고 안전한 오류 코드만 stderr에 기록한다.
2. 파일 내 동일 ID와 내용은 한 번만 적재하고 중복 수를 기록한다. 동일 ID의 상충 내용은 전체 실패다.
3. source별 session advisory lock을 취득한다. 동시 실행은 `SOURCE_IMPORT_BUSY`. 이전 프로세스가 종료되어 lock이 풀린 경우 잔존 running 로그는 interrupted로 변경한다.
4. 모든 행과 성공 로그를 한 트랜잭션으로 커밋한다. 중간 오류는 전체 롤백 후 실패 코드만 별도 run 로그에 남긴다. DB 연결 자체가 끊겨 실패 로그를 못 쓰면 다음 실행의 interrupted 복구가 처리한다.
5. 동일 source/id는 upsert하며 오래된 `updated_at`은 덮어쓰지 않는다. 재시도는 파일 전체 재실행 방식이며 부분 체크포인트는 없다. 갱신 파일에서 사라진 행은 자동 삭제하지 않는다. 폐업 상태도 원본대로 유지하며 “현재 영업 중”으로 오해하지 않도록 표시한다.
6. 같은 이름·카테고리의 15m 이내 다른 ID는 후보 개수만 기록하고 합치지 않는다. 이 수는 매칭 쌍의 유일 개수/완전한 중복 판정이 아니다. 다기관 출처·권리·개별 시설을 보존한다.

`kmk.import_runs`에 run ID, source, SHA, 시작/종료, 상태, 행 수, 중복/근접 후보, 안전한 오류 코드가 남는다. 원본 행·HTTP 응답·DB 오류 상세·암호는 로그에 없다. 파일 단위 원자성은 소규모 MVP용이며 대규모 분할/스테이징/COPY, 삭제·병합 승인 작업, 실제 수집 속도·대용량 장애 검증은 후속이다.

## SDK와 HTTP 계약

`createPlacesClient(provider, scheduler)`의 `getNearbyPlaces`, `getPlacesInBounds`, `getPlacesByCategory`는 Web·React Native 공통이다. core는 DOM·React·DB 의존성이 없다. 기본 limit 20, 최대 100, 반경 최대 50km, 기본 기한 10초. 페이지네이션·전체 DB 다운로드 API는 제공하지 않는다. 같은 bounds/category 결과는 ID 순서, nearby는 거리·ID 순서다.

```ts
import { createPlacesClient, publicPlaceToPlace } from '@korea-map-kit/core';
import { createFixturePlacesProvider } from '@korea-map-kit/data-adapters';

const scheduler = {
  schedule(callback: () => void, delayMs: number) {
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
  },
};
const places = createPlacesClient(createFixturePlacesProvider(), scheduler);
const nearby = await places.getNearbyPlaces({ center: [127, 37.5], radiusMeters: 500 });
const parks = await places.getPlacesByCategory({ category: 'park' });
const visible = await places.getPlacesInBounds({ bounds: { west: 126.9, south: 37.4, east: 127.1, north: 37.6 } });
const displayPlaces = nearby.filter(p => p.location !== null).map(publicPlaceToPlace);
```

실제 연결은 `createRemotePlacesProvider(request)`에 운영자가 transport를 주입한다. transport는 `POST /places/query`에 `PlacesQuery` JSON을 보내고 응답 `PublicPlace[]`를 반환한다. 예를 들어 운영자 애플리케이션에서:

```ts
import { createRemotePlacesProvider } from '@korea-map-kit/data-adapters';

// endpoint는 운영자 앱 설정에서 명시적으로 받는다. 기본값·제작자 키 없음.
function remoteProvider(endpoint: string) {
  return createRemotePlacesProvider(async (query, context) => {
    const controller = new AbortController();
    const off = context.signal.subscribe(() => controller.abort());
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(query),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('POI request failed');
      return await response.json();
    } finally { off(); }
  });
}
```

샘플 HTTP 서버는 loopback 또는 운영자의 인증 프록시 뒤에서만 사용한다. 직접 cross-origin Origin 요청은 거부한다. 웹은 인증·인가·쿼터를 적용한 same-origin 서버 프록시를 사용하고, 그 서버가 이 로컬 서비스를 호출해야 한다. 임의로 공개 바인딩하거나 origin 검사를 제거하지 않는다. 운영 인증/요금제/검색 엔진은 SDK에 포함하지 않는다. 앱용 공개 URL도 클라이언트에서 노출됨을 전제로 설계한다.

HTTP 서버는 요청 8KiB, 동시 처리 8, 연결 32, 요청 기한 10초로 제한한다. 취소는 클라이언트 대기를 종료하고 transport에 전달한다. 이미 실행된 SQL은 별도 PG cancel을 보내지 않으며 5초 statement timeout으로 제한한다. 취소가 DB rollback을 보장하지 않는 기존 계약을 유지한다. SDK는 DB 자격증명을 받지 않는다. 다른 DB는 `PlacesProvider` 계약만 구현하면 된다.

## Supabase 선택형 배포

Supabase는 사용자 소유 PostgreSQL을 제공하는 선택지다. 클라우드 프로젝트 생성·변경·배포는 수행하지 않았다. 공식 PostGIS 문서와 changelog를 확인했고 2026-10-12 HTTP TLS cipher 폐기 공지(11월 10일 예정)는 이 직접 DB 경로와 구분한다.

운영자는 PostGIS 확장과 관리자 권한, 별도 reader/writer 로그인 권한을 준비하고 이 마이그레이션을 검토한다. 기존 PostGIS가 `public` 또는 `extensions` 등에 설치되어 있으면 실제 namespace를 조회해 SQL을 한정한다. `kmk`를 Data API의 exposed schema에 추가하지 않는다. anon/authenticated/service_role에 포괄 권한을 부여하지 않으며 Supabase HTTP API나 SDK key를 사용하지 않는다.

ETL의 session advisory lock 때문에 **직접 DB 연결 또는 session pool**이 필요하다. transaction pool 연결은 미지원이다. 운영자 계정의 TCP/TLS 연결·RLS·백업·비용·쿼터와 실제 Supabase 실행은 **미검증**이다. 이 문서는 배포 승인이나 무료 클라우드 무제한 운영 보장이 아니다.

## 배포·라이선스·잔여 작업

SDK/자체 합성 데이터는 MIT, 실제 공공데이터는 원장에 기록한 별도 조건이다. 자동 수집 결과는 사용자 DB에만 저장하며 Git/npm에는 A 데이터도 포함하지 않는다. 상용 데이터 복제·지도 이미지·공개 API 결과의 무단 장기 저장은 없다. 출처/라이선스를 지도 장소 카드와 다운로드 데이터에 표시하고 운영자 DB 배포 시에도 보존한다. 데이터 수집 권리 검사는 법률 판단·원본 품질 검사를 대체하지 않는다.

실제 원천 접근 복구, 헤더/CP949 파일 검증, 동물병원 실측 기준점, 우선 분야 추가 승인, TourAPI 키·좌표 매뉴얼, XLSX·대규모 ETL, 운영 인증 프록시 및 Native 실화면 QA가 남았다. 현재 자료 현황과 검증은 [데이터 원장](../data/sources.json), [검증 기록](research/poi-etl-validation.md), [비용 감사](cost-audit.md)를 따른다.
