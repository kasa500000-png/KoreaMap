# 공공데이터와 자체 지도 인프라

SDK는 특정 DB·타일 서버에 종속되지 않습니다. 초기 실행은 합성 fixture이며 실제 지도 연결은 운영자가 선택합니다. 코드 MIT와 데이터 라이선스·서버 운영비를 분리하세요.

## 자체 타일 서버

1. [데이터 원장](../data/sources.json)과 [이용 조건](data-licenses.md)에서 사용할 개별 데이터의 A 권리 범위·기한을 재확인합니다. OSM/Geofabrik을 사용하면 ODbL 및 출처 의무를 적용합니다. 원본 PBF·PMTiles·MBTiles는 ignored 운영자 저장소에 둡니다.
2. Planetiler 등의 운영자 파이프라인으로 벡터 타일을 생성합니다. 엔진 실행과 전체 한국 타일 생성은 이 릴리스의 실측 통과 범위가 아닙니다. 산출물의 schema와 실제 source-layer 이름을 기록합니다.
3. 선택한 HTTP 서버에서 TileJSON과 XYZ PBF, style JSON, glyph PBF, sprite PNG/JSON을 제공합니다. EPSG:3857 XYZ 타일과 WGS84 feature 좌표를 구분하세요. 운영 서버 HTTPS, 정확한 CORS, gzip/Content-Type과 범위 요청(PMTiles 사용 시)을 확인합니다. 서버/스토리지/트래픽 비용은 운영자 부담입니다.
4. MapLibre Style Spec v8 style에 운영자 URL과 각 source의 올바른 attribution을 설정합니다. 테마 sourceLayers를 실제 데이터 schema에 맞추세요. 합성 fixture schema를 OpenMapTiles에 그대로 적용하면 도로/POI가 누락될 수 있습니다.
5. Web `createMap`에 다음 설정을 전달합니다. `.invalid`는 의도적으로 해석되지 않는 문서용 주소이므로 운영자 주소로 교체해야 합니다.

```ts
const config = {
  mode: 'operator' as const,
  styleUrl: 'https://tiles.example.invalid/style.json',
  allowedOrigins: ['https://tiles.example.invalid'],
  attribution: '운영자가 검증한 데이터 출처 및 라이선스',
  costAcknowledged: true as const,
};
```

허용 origin에 실제 필요한 glyph/sprite/TileJSON origin도 각각 등록합니다. style나 타일 URL에 비밀 토큰을 넣지 마세요. Native는 같은 style JSON을 `defineMapStyle`로 검증하고 명시적 NativeResourcePolicy와 함께 전달합니다. [Native 가이드](native-sdk.md)의 일반 HTTP XYZ 대체 경로를 우선 사용하세요. RN/OS PMTiles 및 실제 한국어 glyph는 아직 미검증이며 문서상 엔진 지원을 실측으로 표현하지 않습니다.

로컬 테스트는 loopback HTTP를 사용할 수 있지만 실제 휴대폰의 localhost는 개발 PC가 아닙니다. 기기 연결용 운영자 주소와 Android/iOS 전송 보안 설정을 별도 검토하세요. 프로덕션 보안을 일괄 해제하지 마세요. 데모는 공급자 URL을 자동으로 탐색하지 않습니다.

## 공공 POI와 검색

[ETL 가이드](public-data-etl.md)의 로컬 PostGIS 절차를 사용합니다. `pnpm geo:local` 도구의 하위 명령과 예제를 따르며, DB/검색/라우팅 서비스는 SDK npm 패키지에 포함되지 않는 private 운영자 서비스입니다. Supabase는 선택형 배포 방식이며 필수 의존성이 아닙니다.

실제 CSV 수집 프로파일은 원장 A 중 `yongsan-parking`, `mois-animal-hospitals`, `bukgu-walking`만 구현되어 있습니다. 실제 원천 파일의 접근/헤더/기준점 검증 공백을 합성 데이터 테스트로 대체하지 않습니다. 모든 공원·관광·반려시설 데이터가 수집 가능하다는 의미가 아닙니다. B는 허용된 범위의 선택형 API 어댑터만, C/D는 실행에서 제외합니다.

SDK의 PlaceRepository 조회는 `getNearbyPlaces`, `getPlacesInBounds`, `getPlacesByCategory`입니다. SearchProvider는 자체 PostGIS POI 검색을 사용하며 전체 도로명주소 지오코딩은 별도 GeocodingProvider입니다. 공개 Nominatim을 기본 백엔드나 자동완성에 연결하지 않습니다. [검색 설정](search.md)과 [라우팅 설정](routing.md)을 따르세요.

## 출처와 삭제

각 장소의 source/source_id/license/attribution/updated_at을 유지하고 화면·내보내기 데이터에 필요한 출처를 표시합니다. 테마가 출처를 숨기면 안 됩니다. 권리 만료/철회 시 수집을 중단하고 운영자 보유 데이터 갱신·삭제 정책을 적용합니다. 위치 기록은 동의 이후 로컬 앱 정책으로 보관하며 기본 외부 업로드가 없습니다.
