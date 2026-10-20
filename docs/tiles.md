# 한국 OSM 타일 생성·자체 XYZ 실행

확인일: 2026-10-20 KST. `services/tiles`는 운영자가 명시적으로 실행하는 private 도구다. SDK npm 패키지·기본 fixture 실행에 Planetiler/JDK/원본 다운로드/타일 서버를 요구하지 않는다. 원본·출력·glyph·폰트·실지도 캡처는 ignored `artifacts/tiles/` 등 운영자 저장소에 두고 Git/npm에 포함하지 않는다.

현재 서울·울산·부산·제주의 실제 OSM→Planetiler→MBTiles 생성과 glyph pack 생성은 실행했다. 실제 HTTP/Chromium 9개 화면과 두 세대 전환·rollback도 실행했고 아래 기록에 범위를 남겼다. 최종 전체 회귀·커밋은 [진행 기록](progress.md)에 연결한다. Native·전국 지도·전체 cartography가 완료됐다는 뜻은 아니다.

## 준비

Node 24.19.0, pnpm 12.14.0, Python 3과 **JDK 21의 java/javac**를 준비한다. Node의 SQLite API로 MBTiles를 읽으므로 외부 DB는 필요 없다. 도구 다운로드에는 공식 공개 GitHub/Geofabrik 네트워크가 필요하지만 API 키·클라우드 계정은 없다.

```sh
pnpm install --frozen-lockfile
pnpm build:sdk
pnpm tiles tool --operator-opt-in
```

`tool`은 공식 Planetiler **0.10.2** JAR를 내려받아 pinned SHA-256 `f310bd0413e2e4512b27f4046d418664e8e1d3bf31603c2a70e23de06c167e4d`와 대조한다. 기본 경로는 `artifacts/tiles/tools/planetiler-0.10.2.jar`이며 기존 파일이 있으면 같은 hash인지 먼저 확인한다. GitHub release 자산 redirect는 제한된 공식 호스트만 허용한다. 실제 API·라이선스·Java fixture 검증은 [profile 기록](research/tile-profile-validation.md)을 따른다. 다른 Planetiler/JDK 조합을 임의로 최신/검증됨으로 표시하지 않는다.

CLI 옵션은 `--flag value` 형태다. `--java /path/to/jdk/bin/java`와 `--javac /path/to/jdk/bin/javac`로 PATH와 다른 JDK를 명시할 수 있다. 파일 경로에 공백이 있으면 shell의 따옴표를 사용한다. Windows에서도 같은 Node CLI와 옵션을 사용하며 java.exe/javac.exe 경로를 선택한다. 기본 store 변경은 모든 명령에 같은 `--store` 경로를 전달한다.

## 원본 확인과 서울 생성

[데이터 원장](../data/sources.json)의 `osm-geofabrik-kr` A 등급·기한·ODbL 조건을 다시 확인한다. 출처는 [Geofabrik South Korea](https://download.geofabrik.de/asia/south-korea.html)의 공개 PBF다. 호출자가 검토한 SHA-256과 명시적 `--operator-opt-in`이 없으면 다운로드·빌드가 시작되지 않는다. PBF 기준일을 읽어 기록하며 다운로드 시각으로 대체하지 않는다.

이번 검증은 기존 ignored `artifacts/routing/south-korea-latest.osm.pbf`를 재사용했고 SHA-256은 `57e3ffd07e104d5b9ec511ac2b11cf784936b8982f0b4f30e6f5324928fc9f5e`, 데이터 기준일은 **2026-10-18T20:25:06Z**다. 이 파일은 Git clone에 포함되지 않는다. 이미 검토한 동일 파일이 있는 경우 다음과 같이 생성한다.

```sh
pnpm tiles build --region seoul --input artifacts/routing/south-korea-latest.osm.pbf --sha256 57e3ffd07e104d5b9ec511ac2b11cf784936b8982f0b4f30e6f5324928fc9f5e --heap-mib 4096 --operator-opt-in
```

원본이 없으면 운영자가 현재 공식 파일의 hash를 검토한 뒤 `pnpm tiles download --sha256 <검토한64자리SHA256> --operator-opt-in`을 실행한다. 이 문장의 꺾쇠 부분은 shell 명령이 아닌 교체 설명이다. 다운로드 위치는 `artifacts/tiles/source.pbf`이며 이 파일을 build의 `--input`으로 전달한다. `latest` URL의 바이트가 바뀌면 과거 hash를 그대로 쓰는 요청은 정상적으로 실패한다. 오류를 무시하거나 자동 hash 재생성으로 원본 검토를 대신하지 않는다. 원본 다운로드는 512 MiB, JAR는 120 MiB 상한이다.

생성 전에는 Java 도구 hash, PBF hash·기준일, 데이터 원장 기한, heap·디스크·입력 범위를 검사한다. 기존 성공 archive를 덮어쓰지 않고 새 `generations/<id>/base.mbtiles`와 manifest를 만든다. 실패한 새 세대는 성공본으로 남지 않으며 이미 선택된 세대는 보존한다. 기본 heap 1536 MiB에서 이번 한국 PBF 처리 중 메모리 부족을 실제 관찰했고, 위 명령의 **4096 MiB**로 다시 생성해 통과했다. 작은 bbox도 입력 PBF의 node/way 처리 비용은 남으므로 지역 크기만으로 필요한 메모리를 추정하지 않는다.

## 범위와 스타일 계약

좌표는 WGS84 `[경도, 위도]`이며 bbox는 `[west,south,east,north]`다. 현재 config는 다음과 같다. 행정구역 전체나 전국 완전성을 뜻하지 않는다.

| region | bbox | 표시 카메라 |
| --- | --- | --- |
| seoul | `[126.94,37.53,127.03,37.61]` | `[126.978,37.5665]`, z13 |
| ulsan | `[129.27,35.51,129.36,35.59]` | `[129.3114,35.5384]`, z13 |
| busan | `[129,35.07,129.1,35.17]` | `[129.0756,35.1302]`, z13 |
| jeju | `[126.48,33.46,126.57,33.53]` | `[126.5312,33.4996]`, z13 |
| korea | `[124.5,33,132,39.5]` | `[127.5,36]`, z7 |

`--maxzoom`은 0~14, 기본 14다. 같은 검증 입력과 명령의 `--region`을 바꿔 다른 지역을 별도 생성한다. `korea`는 전국용 명령 선택자이며 실행 전 최소 **8 GiB 디스크**를 요구한다. 이는 실제 최대 용량 예측이 아니라 시작 차단 기준이다. 자원이 부족하면 `INSUFFICIENT_TILE_DISK`로 실패하며 기존 데이터를 지우거나 조건을 낮추지 않는다. 전국 명령 구현을 전국 생성 성공으로 표시하지 않는다.

프로젝트 자체 `KoreaProfile.java`는 기존 스타일의 **design-v1**과 대응한다.

| source-layer / kind | 출력 |
| --- | --- |
| land / park / water / building | 토지·공원·내륙 수역·건물의 polygon |
| boundary / road / trail | 경계·도로·산책로; 경계 원본 geometry에 따라 면 외곽도 표시 |
| place / poi | 지명·시설 point; 면 시설은 내부 label point |
| road.class | `major` / `minor` |
| poi.poi | `park` / `parking` / `trail` / `facility` |
| 이름 | NFC 정규화 `name:ko` → `name` → `name:en` fallback |

원본 tags 전체·전화·이메일·주소/contact tag를 타일에 복사하지 않는다. 이 profile은 외부 OpenMapTiles schema의 자동 변환기가 아니다. 별도 ocean/coastline polygon과 철도 스타일·terrain·전국 주소 완전성은 제공하지 않는다. 기본 POI는 도형이며 외부 sprite를 자동 연결하지 않는다.

## 한글 glyph 준비

Web 로컬 시스템 폰트와 실제 glyph PBF 공급은 별도 검증이다. Native에는 실제 glyph 공급원이 필요하다. [glyph 생성·검증 기록](research/tile-glyph-validation.md)의 exact Python 도구와 검토한 Noto TTC/OFL notice를 준비한다. 자동 폰트 다운로드는 없다.

```sh
node scripts/python.mjs services/tiles/src/glyphs.py --font /usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc --face 1 --sha256 b76b0433203017ca80401b2ee0dd69350349871c4b19d504c34dbdd80541690a --output artifacts/tiles/glyphs-bmp --fontstack KoreaNoto --license OFL-1.1 --license-file artifacts/tiles/tools/NotoSansCJK-OFL.txt --include-bmp --operator-opt-in
```

이 경로는 이번 Linux QA의 실제 로컬 파일 예다. 다른 장비에서는 파일·face·hash·라이선스를 검토하고 해당 경로로 교체한다. output은 기존 pack을 덮어쓰지 않으며 갱신은 새 디렉터리를 사용한다. SDF 생성은 글자 shaping engine이나 모든 한자 지원을 의미하지 않는다. 현재 BMP pack은 256개 range·42,220개 실제 glyph, 필수 현대 한글 11,172개 누락 0을 확인했다. 지원 glyph가 없는 75개 range도 정상 fontstack 메시지로 제공한다. 원본 폰트가 지원하지 않는 BMP Unicode scalar 21,268개는 없는 그대로 coverage에 기록하며 가짜 glyph나 surrogate를 생성하지 않는다. 출력과 `LICENSE.txt`는 OFL 조건을 유지하고 SDK MIT로 재허가하지 않는다.

첫 Web 통합에서 `65024-65279.pbf`(FE00 범위) 요청의 404를 발견했다. 이전 131-range CJK pack의 codepoint/decoder 성공은 실제 renderer의 모든 요청 성공을 뜻하지 않았다. `--include-bmp`로 전체 BMP 256-range endpoint를 생성해 보완했고 상위 decoder 256개와 Python 10개 검사를 통과했다. 이 새 pack으로 실제 Web 통합을 다시 실행해 아래 9개 화면을 통과했다. Native 렌더링 결과는 별도다. manifest SHA는 `dc7c51fd0c45fbecff7f176aa3730d12ca2bb4d1fe09c281c77a3cc07c196c2b`, PBF 합계는 **36,834,573 bytes**다.

## 선택·HTTP 실행·Web 연결

build 출력의 `generation`을 확인한 뒤 해당 지역의 세대를 명시적으로 선택한다. 다음은 실제 생성된 서울 세대 예다. 다른 생성 결과를 사용하면 자신의 generation ID로 바꿔야 한다.

```sh
pnpm tiles activate --region seoul --generation 1792467802360-66258505 --operator-opt-in
pnpm tiles serve --region seoul --glyphs artifacts/tiles/glyphs-bmp --port 8787 --cors-origin http://127.0.0.1:4173
```

glyph를 쓰지 않는 도형 시험은 `--glyphs` 대신 `--no-labels`를 명시해야 한다. 한글 시험을 도형 모드로 통과시키지 않는다. 서버는 시작할 때 archive·manifest·선택 세대와 glyph pack notice/선언 경로를 검증하고 glyph 응답 시 실제 파일 hash도 검사한다.

| 경로 | 동작 |
| --- | --- |
| `/status` | 선택 region/generation·원본 기준일·요청 count |
| `/styles/standard.json` | Standard style; dark/pastel/outdoor도 제공 |
| `/tiles/{z}/{x}/{y}.pbf` | XYZ 요청을 MBTiles row로 변환; MVT MIME/gzip, 없는 tile 204 |
| `/glyphs/{fontstack}/{range}.pbf` | manifest에 선언한 range/hash 검증 후 PBF 제공 |
| `/font-license` | 사용하는 glyph pack의 실제 font copyright/OFL 고지 |

이 서버는 **개발용 loopback reference**이며 `127.0.0.1`에 bind하고 Host·명시한 CORS origin·GET/HEAD를 제한한다. 임의 proxy나 공유 키 발급을 제공하지 않는다. 외부 운영 배치는 TLS·외부 host/origin·style 내부 주소·reverse proxy 정책을 운영자가 검토해야 하며 이 로컬 명령의 성공을 공개 운영 검증으로 표시하지 않는다. Native 실기기의 localhost는 개발 PC가 아니므로 연결 정책과 OS 전송 보안을 따로 검증한다.

Next 정적 출력이 준비되어 있으면 별도 터미널에서 다음 QA 서버를 시작한다. `pnpm check`의 build에도 Next 출력이 포함된다. 타일 origin은 하나의 명시적 loopback HTTP origin만 허용하고 일반 fixture 서버의 기본 CSP를 넓히지 않는다.

```sh
pnpm --filter @korea-map-kit/example-web build
node scripts/serve-web.mjs --tile-origin=http://127.0.0.1:8787
```

`http://127.0.0.1:4173/tiles/`를 열어 `http://127.0.0.1:8787/styles/standard.json`을 직접 입력하고 비용/출처 확인 후 연결한다. 입력·확인 전에는 지도 공급자 요청을 보내지 않는다. 연결 해제는 map·요청·listener를 정리한다. 주소와 client 설정은 공개 정보이며 비밀 key를 넣지 않는다. 지역 이동 버튼이 다른 지역의 서버/archive를 자동 선택하는 것은 아니다. 다른 지역은 해당 지역을 build/activate/serve하고 새 style URL로 명시적으로 연결한다.

## 갱신과 rollback

동일 원본의 재생성 또는 검토한 새 원본으로 build하면 새 generation이 생성된다. 실제 갱신에서는 새 파일의 예상 hash·기준일·권리를 먼저 확인한다. `activate`는 verified generation만 선택하고 직전 세대를 previous로 남긴다.

```sh
pnpm tiles rollback --region seoul --operator-opt-in
```

직전 세대가 없으면 `NO_PREVIOUS_GENERATION`으로 실패한다. 서버는 시작 시 선택한 archive를 유지하므로 activate/rollback 이후에는 서버를 종료하고 다시 시작한다. 기존 archive를 제자리 덮어쓰거나 데이터를 자동 삭제하지 않는다. 이번에는 같은 검증 원본/profile로 서울 B 세대 `1792468553996-b20f1aa1`을 실제 재생성한 뒤 A→B activate와 B→A rollback을 실행해 통과했다. 두 archive SHA는 동일했고 새 B 생성 관찰은 40,268ms였다. OSM license를 MIT로 바꾼 임시 manifest는 `UNREVIEWED_GENERATION`, archive bit flip은 `ARCHIVE_CHECKSUM_MISMATCH`로 각각 종료 코드 1을 반환했으며 실패 전후 active pointer 바이트가 같았다. 최종 active는 A(`1792467802360-66258505`), previous는 B다. 이는 같은 입력/profile의 두 세대 증거이며 다른 도구/스키마의 migration rollback을 자동 보장하지 않는다.

## 현재 실행 증거와 남은 범위

| 항목 | 관찰 결과 |
| --- | --- |
| 서울 실제 한국 PBF 생성 | 2026-10-18T20:25:06Z 기준 공개 PBF, SHA `57e3ffd07e104d5b9ec511ac2b11cf784936b8982f0b4f30e6f5324928fc9f5e` 재확인 |
| 선택한 서울 generation | `1792467802360-66258505`, bbox `[126.94,37.53,127.03,37.61]`, z0~14 |
| archive | 48개 tile, 9개 source-layer, **8,679,424 bytes** |
| archive SHA-256 | `cf6feee8b494160748e637da1044f826f8d2c79f78fdd7f7755a238e565fac3c` |
| 생성 관찰 | 첫 1536 MiB heap 실행 실패 후 4096 MiB로 **38,373ms** 통과. 단일 장비·입력의 관찰값이며 p95/전국 성능 보장 아님 |
| profile fixture | 자체 40개 profile 검사와 실제 Planetiler의 합성 PBF→MVT decode 검증. 실한국 품질 검증과 구분 |
| glyph | Python 10개·실제 Noto·상위 decoder 256개 range·현대 한글 coverage 통과. 42,220개 실제 glyph, 75개 유효한 빈 range. 실지도 renderer·Native와 구분 |
| 실제 HTTP·Web 한글·4테마·출처 | 초기 FE00 glyph 404를 BMP256 pack으로 보완한 뒤 Chromium 실제 9개 화면 통과; 아래 범위 참조 |
| 울산·부산·제주 생성 | 아래 3지역 실제 build/manifest 및 각 Standard 1440px 화면 통과 |
| 실제 세대 rollback | 서울 B 재생성·activate B·rollback A 통과, 미허가 license/손상 archive 선택 거부 및 pointer 유지 확인 |
| 전국 생성 | 실제 명령이 `INSUFFICIENT_TILE_DISK`/exit1로 차단됨. 약 4.8 GiB free로 최소 8 GiB 미충족; 전국 성공으로 표시하지 않음 |
| Android/iOS 실제 XYZ·한글 | 별도 미검증 |

추가 지역은 서울과 같은 원본 SHA·Planetiler/profile·4096 MiB heap으로 생성했다. 각 archive는 z0~14, 9개 source-layer이며 범위는 위 bbox다. 이름과 용량만으로 실제 화면 품질·전국 coverage를 보장하지 않는다.

| region / generation | tile 수 | bytes | 생성 관찰(ms) | archive SHA-256 |
| --- | ---: | ---: | ---: | --- |
| ulsan / `1792468202248-7ae8a861` | 52 | 3,760,128 | 35,267 | `39ae61de5b12f9f8c675f54c946d4aee3678b6551ba76d114ea6193f4ffdddec` |
| busan / `1792468238220-e4591406` | 60 | 4,476,928 | 35,130 | `59dc3ceead20fff6c1f1bcb0de658635b615d19e421a9115d7c391b4c67d15cd` |
| jeju / `1792468274026-b05e924e` | 52 | 2,088,960 | 33,577 | `9e99d45004da713fe48c5d32ddc6a9f8144ed07e17a6fdc831d40272eeaba3dc` |

실제 Web 확인은 Chromium 소프트웨어 WebGL에서 수행했다. 서울의 Standard/Dark/Pastel/Outdoor 1440px 4개, 서울 Standard 390/768px 2개, 울산/부산/제주 Standard 1440px 3개로 **9개 통과**다. 모든 화면에 도로·건물·한글 label이 1개 이상 실제 렌더됐고 출처가 보였다. 표시 개수는 viewport의 rendered feature fragment 수이며 전체 유일 레코드 수가 아니다. 요청 집계·실패 수정·경고와 수동 화면 확인은 [실제 타일 검증 기록](research/real-tiles-validation.md)을 따른다.

| 화면 | 도로 / 건물 / 라벨 | 단회 ready 관찰(ms) |
| --- | --- | ---: |
| seoul standard 1440px | 2518 / 8783 / 88 | 640 |
| seoul dark 1440px | 2518 / 8783 / 88 | 2436 |
| seoul pastel 1440px | 2518 / 8783 / 88 | 2587 |
| seoul outdoor 1440px | 2518 / 8783 / 88 | 2183 |
| seoul standard 390px | 730 / 2770 / 31 | 2110 |
| seoul standard 768px | 1492 / 6582 / 59 | 603 |
| ulsan standard 1440px | 1352 / 1326 / 61 | 2207 |
| busan standard 1440px | 1212 / 3926 / 54 | 2138 |
| jeju standard 1440px | 1493 / 3756 / 70 | 2152 |

모든 지역에서 실제 tile/glyph HTTP200 응답이 있었고 HTTP 오류·의도하지 않은 origin·page/console error·가로 overflow는 0이었다. 연결 해제 후 canvas/SDK selector/control이 0개로 정리됐다. 이번 실행의 취소된 tile 요청은 0이며, 이후 실행에서는 camera/style 변경으로 인한 ERR_ABORTED를 서비스 HTTP 실패와 구분해 원래 계수대로 남긴다. 성능 수치는 단일 실행 관찰치이며 p95·실기기 FPS·장시간 누수/전국 정확도 인증이 아니다. 실제 map glyph 검증은 로컬 ideograph 대체를 끄고 PBF 응답을 관측했다. 캡처·report는 ignored `artifacts/qa/real-tiles/`에만 있다.

같은 검증을 반복하려면 4지역 build/activate와 BMP pack을 먼저 준비한다. 일반 QA Web 서버를 `--tile-origin=http://127.0.0.1:8787`로 실행한 뒤 다음 명령을 쓴다. 아래 절대 경로는 이번 환경 예이므로 자신의 ignored store/pack 경로로 교체한다. verifier가 8787 tile 서버를 직접 순서대로 열고 닫으므로 앞의 수동 serve는 종료한 상태여야 한다.

```sh
pnpm verify:real-tiles --store=/workspace/Koreamap/artifacts/tiles --glyphs=/workspace/Koreamap/artifacts/tiles/glyphs-bmp --web-origin=http://127.0.0.1:4173 --port=8787 --operator-opt-in
```

Java/PBF/OSM/network 입력은 이 verifier가 자동 준비하지 않는다. viewport·지도 이동·테마·한글·출처·HTTP·정리와 각 실제 archive/glyph manifest hash를 함께 검사한다. 보고서에는 현재 source commit과 dirty 상태를 남기며 이전 SHA의 기록을 최종 새 커밋의 통과로 자동 승격하지 않는다. 최종 소스 변경 후 필요한 재검증 범위는 진행 기록에 명시한다.

## 실제 도로 경로와 지도 연결

같은 OSM SHA의 Valhalla graph와 서울 archive를 연결해 `showRoute()` 결과를 실제 지도 위에 표시했다. 세 모드와 경유지의 네 경로가 모두 도로망에서 계산됐으며 직선·다른 모드 fallback을 사용하지 않았다.

| 경로 | 거리(m) | 예상 시간(s) | geometry 좌표 수 |
| --- | ---: | ---: | ---: |
| driving | 1578.189 | 114.260 | 46 |
| walking | 762.720 | 557.391 | 40 |
| cycling | 1253.431 | 303.486 | 59 |
| driving + 경유지 | 1578.189 | 114.260 | 47 |

Chromium 1440/390px에서 네 경로 레이어와 출발·경유·도착 마커 3개, 실제 한글 glyph, 출처가 표시됐고 두 캡처를 직접 확인했다. 세 모드 각각의 섬 단절은 `NOT_FOUND`, 거리 제한은 `INVALID_ARGUMENT`/`ROUTING_DISTANCE_LIMIT`으로 총 6오류 검사를 통과했다. style 1·tile 20·glyph 52개 HTTP 응답이 성공했고 의도하지 않은 요청·HTTP/request/page/SDK 오류는 0이었다. 종료 후 상태 `destroyed`, listener 0, ResizeObserver 미관찰, canvas 0을 확인했다. 공유 worker의 원래 0 목표·장시간 누수는 이 정리 결과와 별도다.

재현하려면 [라우팅 가이드](routing.md)에 따라 검토된 graph의 Valhalla를 별도로 실행하고 SDK/service dist, Playwright Chromium, 활성 서울 archive와 BMP pack을 준비한다. graph manifest의 원본 SHA가 지도 원본과 같아야 한다. 다음은 이번 환경의 경로이며 운영자 자신의 절대 경로로 교체한다. 옵션은 `--이름=값` 형식을 쓴다.

```sh
pnpm verify:real-routing-map --store=/workspace/Koreamap/artifacts/tiles --glyphs=/workspace/Koreamap/artifacts/tiles/glyphs-bmp --engine-url=http://127.0.0.1:8002/route --dataset-file=/workspace/Koreamap/artifacts/routing/korea/v-1792407955980-cd813986/manifest.json --operator-opt-in
```

이 verifier는 임시 소비 Web 서버와 서울 tile 서버를 loopback의 빈 포트에 직접 실행·정리한다. 앞 절의 4173 정적 서버는 필요하지 않으며 원본·graph 다운로드나 라우팅 엔진 시작을 자동 수행하지 않는다. 보고서와 두 캡처·geometry는 ignored `artifacts/tiles/qa/routing-map/`에만 남긴다. 이번 소비는 workspace의 공개 dist export를 사용했으며 독립 npm 설치 증거는 아니다. 결과는 공개 도로 표본의 단일 Chromium 실행이고 실제 기기·현장 통행·전국 정확도·실시간 교통·보행 안전을 검증한 것이 아니다. 실제 공공 POI 적재는 원본 CSV 미확보로 계속 미검증이다.

성공·실패를 확인한 소스와 기기/바이너리 증거는 최종 [진행 기록](progress.md)에 연결한다. 새 기기·OS·입력의 재현성·SLA·장시간 메모리·전국 누락·실시간 교통·보행 안전을 이 결과로 보장하지 않는다. 기본 SDK/공개 fixture는 계속 제작자 자산 서버 요청 없이 실행한다.
## 선택형 상세 형식과 저확대 context

기존 `build`의 기본 `design-v1`과 z14 상한은 유지한다. `--schema design-v2`를 지정하면 별도 `KoreaProfileV2`를 사용한다. v2는 `schemaRevision:1`, profile metadata `2.1.0`, z16 상세 타일과 문자열 `fid`/도로 subclass/교량/터널/rank/minzoom/교통·수로·철도를 제공한다. SDK 패키지 버전과 타일 형식 버전은 별개다. 정확한 컴파일 원문 snapshot과 SHA를 세대에 보존하며 작업 중 profile 변경은 실패시킨다.

```sh
pnpm tiles build --operator-opt-in --schema design-v2 --region seoul --store /operator/tiles --jar /operator/tools/planetiler-0.10.2.jar --input /operator/south-korea.osm.pbf --sha256 REPLACE_WITH_VERIFIED_SHA256 --maxzoom 16
pnpm tiles build --operator-opt-in --schema design-v2 --region context --store /operator/tiles --jar /operator/tools/planetiler-0.10.2.jar --input /operator/south-korea.osm.pbf --sha256 REPLACE_WITH_VERIFIED_SHA256 --maxzoom 9
```

각 생성 후 출력 generation을 검사하고 기존 `activate --operator-opt-in --region ... --generation ... --store ...` 절차로 명시 활성화한다. `context`는 전국 저확대 전용으로 최대 z9/최소 디스크 1GiB를 요구한다. 지역별 상세는 z16, 전국 상세 `korea`는 기존 최소 8GiB 디스크 게이트를 유지한다. 최소 게이트를 충족해도 전국 생성·운영 성공이나 실제 메모리 용량이 보장되지 않는다. 원본·archive·glyph·실지도 이미지는 Git/npm에 넣지 않는다.

```sh
pnpm tiles serve --region seoul --store /operator/tiles --glyphs /operator/glyphs --context --quality balanced --port 8787
```

`--context`가 없으면 자동 연결하지 않는다. `--context-generation`은 `--context`와 함께 특정 검증 세대를 선택한다. v2의 기본 스타일은 balanced cartography이며 sparse/dense도 선택할 수 있다. v1 기본은 기존 legacy factory다. `createCartographyStyle`은 context z0–9와 detail z10 이상을 나누며 실제 capability만 켠다. 승인된 landmask가 없는 현재 형식은 바다·해안선을 생성하지 않는다.

## 자산 캐시와 보관 범위

- `/datasets/{generation}/tiles/{z}/{x}/{y}.pbf`, `/styles/{revision}/{theme}.json`, `/glyphs/{manifestSha}/{fontstack}/{range}.pbf`는 실제 내용·스키마·스타일·glyph에 결합한 경로다. 내용이 같은 지정 세대에만 1년 immutable 캐시를 제공한다. 다른 세대 요청에 현재 자료를 대신 반환하지 않는다.
- 기존 `/tiles/...`, `/styles/{theme}.json`, `/glyphs/{fontstack}/{range}.pbf`는 no-cache ETag alias로 유지한다. GET/HEAD/304와 gzip 협상, glyph gzip 바이트 제한 LRU를 사용한다. archive/manifest sidecar·변조와 glyph hash 불일치는 캐시 응답 전에도 거부한다.
- 서버 시작 시 current/검증 가능한 previous 최대 2개 archive와 명시 context 최대 1개만 열고 종료 때 모두 닫는다. 실행 중 pointer를 바꿔도 해당 서버의 startup snapshot은 바뀌지 않는다. 새 전환은 검증 후 서버를 재시작한다.
- 현재 glyph pack은 지정한 1개만 제공한다. 오래된 style/glyph URL을 서버 교체 뒤 무기한 보관하는 운영 호스팅이 아니다. 공개 CDN·장기 retention·인증·부하/SLA는 운영자가 별도 구성·비용 관리한다.

실제 비교와 성능 명령은 [품질 계획](map-quality.md), 통과·차단 결과는 [검증 기록](research/map-quality-validation.md)을 따른다.
