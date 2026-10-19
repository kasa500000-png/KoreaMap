# 선택형 자체 길찾기

SDK 지도는 라우팅 서비스 없이 동작한다. `RoutingProvider`를 명시적으로 주입한 앱만
경로 요청을 보낸다. 제작자 URL·키·계정, 공용 demo routing 서버, 검색 DB 자동 연결은 없다.
`pnpm check`는 Docker/API 키 없이 실행되고, 별도 `pnpm test:routing`만 로컬 Docker가 필요하다.

## 엔진과 계약

Valhalla **3.9.1** 공식 base 이미지를 digest로 고정했다. 2026-10-19 확인:

- [공식 릴리스](https://github.com/valhalla/valhalla/releases/tag/3.9.1)
- [공식 Docker 안내](https://github.com/valhalla/valhalla/blob/3.9.1/docker/README.md)
- [MIT 원문](https://github.com/valhalla/valhalla/blob/3.9.1/COPYING)
- [API·costing·상관점·오류](https://valhalla.github.io/valhalla/api/route/api-reference/)
- 이미지: `ghcr.io/valhalla/valhalla:3.9.1@sha256:4fd114eb1d26b8fc2f43bcb3df234c1b63a0bf13c277405e5943d5361dc575de`

walking → pedestrian, cycling → bicycle, driving → auto. 다른 모드로 자동 변경하지 않는다.
OSRM은 대안이나 세 모드의 별도 그래프/프로파일 운영 대신 Valhalla의 단일 그래프·동적 비용 모델을 선택했다.
scripted 이미지의 timezone/default-speeds 등 자동 원격 다운로드를 사용하지 않는다.
새 npm 외부 의존성은 없다. 엔진·이미지 내 구성 요소의 라이선스는 SDK MIT와 별개로 유지한다.

core의 `RoutingRequest`는 `[longitude, latitude]` 순서의 **2~10개** 지점과 mode를 받는다.
첫/마지막이 출발·도착이며 나머지는 순서 있는 경유지다. 인접 지점이 1m 미만이면 오류다.
`RoadRoutingProvider`는 기존 `RoutingProvider`와 호환되며 현재 한 경로만 반환한다.
`RoadRoute`에는 실제 graph geometry, 거리(m), 예상 시간(s), 매칭된 지점, 데이터 출처/버전/라이선스가 있다.
`roadRouteToGeoJSON()`은 출처를 포함한 LineString FeatureCollection을 만든다.

Valhalla의 `radius`만으로는 거리 상한이 되지 않는다. `search_cutoff`도 설정하고 응답의 모든
매칭점과 원래 입력 사이 거리를 다시 검사한다. 기본 50m, 어댑터 허용 범위 1~100m다.
경유점이 geometry 순서에 존재하는지 검사한다. 입력점→도로의 임의 직선을 그리지 않는다.
연결 불가·미매칭은 `NOT_FOUND / ROUTE_NOT_FOUND`, 먼 스냅은 `ROUTING_SNAP_TOO_FAR`,
서비스 거리 상한은 `INVALID_ARGUMENT / ROUTING_DISTANCE_LIMIT`, 잘못된 응답/엔진 장애는 `UNAVAILABLE`, 취소/기한은 `ABORTED`/`TIMEOUT`이다. 빈 성공 결과나 직선 fallback은 없다.
불완전한 OSM을 자동 복구하지 않는다. 응답 원문·URL·좌표·토큰을 오류/로그에 복사하지 않는다.

```ts
import { createValhallaRoutingProvider } from '@korea-map-kit/data-adapters';
import { roadRouteToGeoJSON } from '@korea-map-kit/core';

// transport와 scheduler는 소비 앱에서 주입한다. 기본 URL/환경변수 탐색은 없다.
const routing = createValhallaRoutingProvider({
  request: operatorApprovedValhallaTransport,
  scheduler: appScheduler,
  dataset: operatorDataset,
});
const [route] = await routing.route({
  mode: 'walking',
  waypoints: [[126.977, 37.5663], [126.9769, 37.573]],
}, { signal: cancellation.signal, timeoutMs: 5000 });
if (route) {
  await map.showRoute(route); // Web/Native 공통 MapController
  const geojson = roadRouteToGeoJSON(route);
  // 화면에 route.dataset.attribution과 OSM 저작권 링크를 함께 표시한다.
}
```

소비 앱 gateway가 정규화된 `RoadRoute[]`를 반환하면 `createRoadRoutingProvider({request}, scheduler)`를 쓴다.
포터블 cancellation을 HTTP AbortController에 연결해야 한다. HTTP 상태/JSON/크기 검사와 인증은 transport 책임이다.
실제 Node transport 구현은 private `services/routing`에 있으며 SDK가 이를 import하지 않는다.

## 로컬 설치·OSM 준비

Node/pnpm 버전은 루트 문서를 따른다. Docker Engine 또는 기본 로컬 socket/pipe를 제공하는 Docker Desktop이 필요하다.
원격 Docker context를 소비하지 않는다. Linux 실실행, Windows/macOS 스크립트 타입/빌드와 Docker 실실행은 구분한다.

1. `pnpm install --frozen-lockfile`, `pnpm build:sdk`.
2. [A 원장](../data/sources.json)의 `osm-geofabrik-kr` 권리·검토 만료를 확인한다.
   [Geofabrik 한국 공개 추출본](https://download.geofabrik.de/asia/south-korea.html)의 공개 PBF만
   `artifacts/routing/south-korea-latest.osm.pbf` 등에 직접 내려받는다. internal/history 자료는 제외한다.
   SDK 설치·CI·서버 시작은 이 다운로드를 자동 실행하지 않는다. 원본·SHA-256·OSM 기준 시각을 보존한다.
3. 권한 있는 원본에서 특정 지역을 추출했다면 완전한 way/relation과 경계 버퍼를 보존하는 별도
   OSM 추출 도구를 사용한다. 이 단계의 도구는 자동 clipping/변경분 적용을 제공하지 않는다.
   단순 bbox 노드 삭제는 도로 연결을 끊을 수 있다. 지역 간 경로에는 겹치는 자료/통합 그래프가 필요하다.
4. 각 지역에서 세 모드로 연결 가능한 공개 도로 좌표 2개를 JSON 배열로 저장한다.
   예: `artifacts/routing/smoke.json` 내용 `[[126.977,37.5663],[126.9769,37.573]]`.
5. 실제 파일 SHA-256과 원본에 명시된 기준 시각을 아래에 넣는다. 파일명이나 다운로드 시각을 데이터 최신성으로 간주하지 않는다.

```sh
pnpm routing:local build --region korea --input artifacts/routing/south-korea-latest.osm.pbf --sha256 <실제-SHA-256> --as-of <YYYY-MM-DDTHH:mm:ssZ> --smoke artifacts/routing/smoke.json --accept-odbl
pnpm routing:local start --region korea
node --env-file=artifacts/routing/korea/.env services/routing/dist/cli.js
```

`build`는 A/collectionEligible/만료/opt-in/해시/시각을 검사하고 복사 뒤 해시를 재검사한다.
고정 이미지로 admin DB·routing tiles를 **network none**에서 빌드한다. 파일은 ignored `artifacts/routing/<region>/<generation>`에만 저장된다.
서빙은 loopback 8002, 별도 Node gateway는 loopback 8093 POST `/route`다. 검색 서비스/PostGIS와 포트·저장소·프로세스가 독립이다.
기본 서버 설정은 좌표 10개, 질의 200km 상한, 2개 worker, 1GiB 메모리다. 이는 전국 부하 용량 권장값이 아니다.
서빙 컨테이너는 read-only root/data, 임시 `/tmp`, capability 제거, no-new-privileges, 제한 PID를 쓴다.
로컬 bridge는 OS 수준 egress 차단망이 아니다. 엔진에 원격 tile/traffic/telemetry URL을 넣지 않으며 운영자는 추가 egress 정책을 적용할 수 있다.

gateway는 Origin을 거부하고 JSON POST·loopback Host만 허용한다. 입력 4KiB, upstream 응답 8MiB,
동시 4개, 경로 5초/전체 6초 제한과 client disconnect 취소가 있다. CORS 공개 proxy가 아니다.
공개 운영 시 별도 인증·TLS·할당량·감사 정책이 필요하다. 엔진 8002도 인터넷에 직접 노출하지 않는다.
서버 URL은 운영자 설정에서만 읽고 HTTPS 또는 loopback HTTP, `/route`, 자격증명/쿼리/fragment 없음만 허용한다.
redirect를 따르지 않는다. `ROUTING_DATASET_FILE`은 해당 엔진 세대의 manifest여야 한다.

## 지역 갱신·실패 복구

같은 region에 새 원본/해시/시각으로 `build`를 실행한다. 새 generation에서 세 모드 smoke가 성공해야
`active.json`을 원자적 rename으로 바꾼다. 빌드 중 기존 서버는 이전 세대의 고정 mount를 유지한다.
실패 시 active는 그대로이며 실패 폴더를 격리해 남긴다. 원본 수정·전체 rebuild·검사를 다시 수행한다.
Node gateway 종료 → `pnpm routing:local stop --region korea` → `start` → 새 `.env`로 gateway 재실행 순서로 전환한다.
로컬 샘플은 무중단 배포가 아니다. 운영 zero-downtime은 별도 gateway/두 인스턴스로 설계한다.

롤백: `pnpm routing:local activate --region korea --generation <검증된-이전-generation>` 후 동일한 재시작.
`activate`는 smokePassed와 고정 engine image를 확인한다. 엔진 버전 업그레이드는 새 전체 빌드/회귀 검사와 별도 검토가 필요하다.
원본·graph·실패 세대 자동 삭제는 하지 않는다. 운영자가 보존/디스크 한도와 다운로드 주기를 정하며 자동 cron은 없다.
admin DB는 OSM에서 만들지만 별도 timezone/고도/실시간 교통 자료는 받지 않는다. 조건부 통행·국경·고도 품질은 제한될 수 있다.

## 라이선스·개인정보·비용

OSM DB와 파생 graph는 **ODbL 1.0**이며 MIT로 바꾸지 않는다. 데이터 제공/가공/공개 사용에 따른
출처와 파생 DB 공유·접근 제공 의무는 운영자가 검토·이행한다. 경로 화면에는
`© OpenStreetMap contributors`와 [저작권/ODbL 안내](https://www.openstreetmap.org/copyright), Geofabrik 가공 출처를 표시한다.
map attribution과 경로 출처는 모두 유지한다. 합성 데모는 실제 OSM 출처로 표시하지 않는다.
원본 PBF, graph/admin DB, 경로 결과, 이미지 등 제3자 payload는 Git/npm에 넣지 않는다.

SDK 코드 제공은 무료지만 Docker 실행·다운로드·지역 갱신·서빙 CPU/RAM/저장/전송은 운영자 비용이다.
위치 입력은 사용자가 요청한 운영자 서비스에만 전송되므로 앱에서 이를 알리고 동의를 얻는다.
gateway/엔진 요청 로그, 재시도, 자동 위치 전송, 장기 경로 저장은 기본 제공하지 않는다.
브라우저/모바일 환경변수·번들에 서버 비밀을 넣지 않는다.

## 검증과 한계

[검증 기록](research/routing-validation.md), `pnpm test:routing`, `pnpm test:web` 참조.
`examples/web /routing/`는 고정된 **자체 합성 도로망** 결과만 표시하며 외부 요청이 없다.
경로 실패/공급자 미설정에서도 지도 canvas가 유지된다. GeoJSON과 `showRoute`는 엔진 계산과 별개다.

OSM 누락·잘못된 접근/일방통행/폐쇄·ferry·계절/시간 제한·사유지 정보 때문에 경로가 잘못되거나 없을 수 있다.
스냅 거리 내 다른 도로로 매칭될 수도 있다. 가까운 스냅이 올바른 도로/접근 가능성의 증명은 아니다.
예상 시간은 costing 모델 결과다. **실시간 교통, 최단/최적 경로, 보행·자전거 안전, 무장애 이동을 보장하지 않는다.**
회전별 음성 내비게이션·실시간 재탐색·오프라인 기기 내 Valhalla·대중교통·전국 품질 SLA는 범위 밖이다.
