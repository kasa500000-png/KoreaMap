# 한국 주소·장소 검색

자체 PostGIS POI를 우선 사용한다. SDK의 `KoreanSearchProvider`는 기존 `SearchProvider`와 호환되며,
DB·fetch·UI 의존성 없이 `core`에서 독립 실행된다. 웹/React Native 모두 동일 계약을 사용한다.
기본 endpoint·공개 Nominatim·제작자 계정은 없다. 라이브 데이터 대신 명시적 합성 모드로 시작한다.

## 지원 범위와 주소 정확도

- 장소명과 **적재된 POI의 주소 열** 검색, 현재 bounds, 중심 거리/반경, 카테고리, 페이지네이션.
- 이름 접두어 자동완성, 검색 결과 좌표로 지도 이동, 출처·라이선스·거리 반환.
- `reverseNearby()`는 반경 내 가장 가까운 POI의 주소다. `kind: 'nearby-poi'`와 거리를 반환하며,
  좌표 지점의 정확한 건물·필지·도로명주소를 의미하지 않는다. 후보가 없으면 null이다.
- 전국 도로명주소 정방향/역방향 변환은 기존 `GeocodingProvider.geocode/reverse`로 분리한다.
  이번 구현에는 전국 주소 DB와 실제 외부 geocoder가 없다. 권리·쿼터·저장 조건을 확인한 운영자가
  별도 구현을 주입해야 한다. C/D 공급원을 연결하거나 POI 조회를 정확한 지오코딩으로 표시하지 않는다.
- 검색은 빈 입력에 서버 요청 없이 빈 페이지를 반환한다. 검색어 없이 가까운 장소를 찾을 때는
  기존 `createPlacesClient().getNearbyPlaces()`를 사용한다.

## SDK 예제

```ts
import { createCancellationSource, focusSearchHit } from 'korea-map-core';
import { createFixtureKoreanSearchProvider } from 'korea-map-data-adapters';

const scheduler = {
  schedule(callback: () => void, ms: number) {
    const timer = setTimeout(callback, ms);
    return () => clearTimeout(timer);
  },
};
const search = createFixtureKoreanSearchProvider(scheduler);
const cancel = createCancellationSource();
const page = await search.searchPage({
  text: '서 울 합성공원', language: 'ko', limit: 10,
  category: 'park', center: [127, 37.5], radiusMeters: 5000,
}, { signal: cancel.signal, timeoutMs: 1500 });
// map은 Web handle.api 또는 Native MapView ref의 MapController다.
// if (page.hits[0]) await focusSearchHit(map, page.hits[0]);
const suggestions = await search.autocomplete({ text: '서울', language: 'ko', limit: 5 });
const nearbyAddress = await search.reverseNearby({ center: [127, 37.5], radiusMeters: 1000 });
// cancel.cancel()은 현재 대기를 중단하고 transport에도 취소 신호를 전달한다.
```

`SearchHit.place`에는 id/name/category/location/address/source/source_id/license/attribution/updated_at/metadata가
보존된다. 결과 UI는 attribution을 표시해야 한다. 좌표는 `[longitude, latitude]`이고 위치 미제공은 null이다.
기존 `search()`는 위치가 있는 결과만 `Place[]`로 변환한다. 전체 출처/미위치 결과가 필요하면 `searchPage()`를 쓴다.
`focusSearchHit()`는 위치 없는 결과를 거부하며 지도 중심·zoom16·bearing0·pitch0을 설정한다.

`createRemoteKoreanSearchProvider(request, scheduler)`에는 운영자 transport를 반드시 주입한다.
request 인자는 `{kind: 'search'|'autocomplete'|'reverse', query}`와 `{signal}`이다.
서버 `/search` 응답은 search/autocomplete에 `SearchPage`, reverse에 `ReversePoiResult|null`이다.
HTTP transport는 portable signal을 `AbortController`에 연결하고 finally에서 구독을 해제해야 한다.
비정상 HTTP 상태는 안전한 `KitError`로 변환하고 원문 URL/키/응답을 사용자 오류로 노출하지 않는다.
[실행 가능한 transport 예제](../tests/search-integration.test.mjs)는 loopback HTTP와 실제 DB를 연결한다.
DB 암호는 서버 전용이며 Web/Expo 환경변수에 넣지 않는다.

## 검색 규칙과 성능 한계

- NFC 정규화 후 ASCII 공백/탭/개행·NBSP·전각 공백을 제거한다. 영문 ASCII 대문자만 소문자로 변환한다.
  한글 초성·자모 분해 검색, 형태소/동의어·철자 교정 사전은 아직 없다.
- 이름/주소에 substring LIKE를 적용하고 정규화 길이 3 이상은 pg_trgm similarity 0.25 이상도 허용한다.
  정확한 이름 → 이름 접두어 → 부분 일치 → 유사도로 순위를 매긴다. SQL 파라미터 바인딩과 LIKE 특수문자 escaping을 적용한다.
  오타 회복은 휴리스틱이며 짧거나 여러 글자가 틀린 검색어의 정확도를 보장하지 않는다.
- 저장 생성 열 search_name/search_address의 GIN gin_trgm_ops, 이름 접두어 text_pattern_ops B-tree,
  기존 geography/geometry GiST·category 인덱스를 사용한다. 자동완성은 두 글자 이상 **이름 접두어만**,
  최대 10건, offset0이다. 짧은 일반 substring 검색은 선택도가 낮아 대규모 DB에서 느릴 수 있다.
- center가 있으면 기본 거리순, 없으면 관련도순이다. `sort:'relevance'`로 바꿀 수 있다.
  ST_Distance geography는 미터 단위 spheroid 거리이며 반경은 ST_DWithin으로 제한한다.
  fixture의 Haversine/문자 trigram은 작은 합성 예제용 근사치로 실제 PostGIS 계산과 동일하다고 보장하지 않는다.
- 검색 limit1..50, offset0..1000, 반경 최대50km, 입력 최대120 UTF-16 code unit, language ko/ko-KR.
  bounds는 날짜변경선 교차도 처리한다. 거리 없는 결과는 distanceMeters null이다.
  LIMIT+1과 마지막 id tie-breaker를 사용하며 전체 COUNT를 수행하지 않는다.
  DB가 갱신되면 offset 페이지 사이의 중복/누락이 가능하다. 대규모 export·snapshot 용도로 사용하지 않는다.
- HTTP 요청당 SDK 기한2초, SQL statement1.5초/lock0.5초, 동시 요청8, body8KiB, 연결32로 제한한다.
  SDK 기본 기한10초를 호출별로 줄일 수 있다. TIMEOUT/ABORTED/INVALID_ARGUMENT/UNAVAILABLE로 구분한다.
  취소하면 클라이언트 대기를 즉시 끝내고 진행 중 DB 연결을 폐기한다. 서버의 쿼리가 같은 순간 정지한다고
  보장하지 않으며 statement/lock timeout이 남은 작업을 제한한다. pool 연결 대기는 최대5초다.

## 로컬 PostGIS 실행

```sh
pnpm install --frozen-lockfile
pnpm build:sdk
pnpm geo:local start
pnpm geo:migrate
pnpm geo:fixture
pnpm search:migrate
pnpm search:serve
# 종료 후
pnpm geo:local stop
```

`geo:fixture`는 기존 ETL의 합성 7카테고리 데이터다. `/search/` Web 데모의 서울·울산·제주 7건과는 별도다.
서비스는 운영자 `GEO_DATABASE_URL`을 요구한다. 로컬 helper만 ignored 암호를 생성하며 SDK는 환경변수를 탐색하지 않는다.
`KMK_SEARCH_PORT` 기본8100, bind127.0.0.1이다. `POST /search`에 JSON 요청을 보내며 Origin 헤더는 거부한다.
DB reader 역할은 쓰기/DDL 권한이 없고 migration은 운영자 관리자 연결로만 실행한다.
프로세스 import만으로 DB나 HTTP를 시작하지 않는다. 직접 공개 서비스로 배포하지 말고 운영자가 소유한
인증·인가·요청량 제한 프록시를 둔다. 요청/응답 no-store, 검색어·좌표·DB 연결 문자열은 로그하지 않는다.

`pnpm dev:web`의 `/search/`는 DB 없이 자체 합성 fixture만 사용한다. 한글 IME 조합 중 요청 중지,
250ms debounce, 이전 요청 취소, 결과 attribution, 빈 결과/오류, 지도 선택을 제공한다.
데모는 실재 장소/주소 검색이라고 표시하지 않으며 지도 이동에 필요한 타일·검색 API 비용이 없다.

## 공식 근거와 운영 정책

2026-10-19 공식 문서 HTTP200 확인:

- [PostgreSQL 18 pg_trgm](https://www.postgresql.org/docs/18/pgtrgm.html): GiST/GIN·LIKE·similarity 연산.
- [PostgreSQL 18 문자열 함수](https://www.postgresql.org/docs/18/functions-string.html): UTF8 normalize NFC.
- [PostGIS ST_DWithin](https://postgis.net/docs/ST_DWithin.html): geography 미터 반경과 공간 인덱스.
- [공개 Nominatim 정책](https://operations.osmfoundation.org/policies/nominatim/): 공개 서버의 autocomplete 금지와 사용량 제약.

공개 Nominatim은 상용 기본 백엔드나 자동완성에 연결하지 않는다. 이번 구현은 Nominatim API 요청을 전혀 하지 않는다.
pg8.23.1/@types/pg8.23.1/@types/node24.19.2는 기존 geo-data와 동일 exact 버전 재사용이며 새 버전 채택이 아니다.
PostgreSQL18/PostGIS3.6.4는 기존 digest 고정 개발 이미지에서 실행 검증한다. pg_trgm은 PostgreSQL 배포 extension이다.
SQL/코드·합성 데이터 MIT와 DB/제3자 데이터 라이선스는 분리한다. A 수집·검증된 운영자 DB만 검색 대상이며
검색 기능 자체가 추가 데이터 저장/재배포 허가를 부여하지 않는다. 서비스·DB·트래픽 비용은 운영자 책임이다.

[검증 기록](research/search-validation.md), [생성 API](api/core.md), [비용 감사](cost-audit.md)를 함께 확인한다.
