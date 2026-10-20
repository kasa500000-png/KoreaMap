# 지도 품질 구현 검증

기준: 2026-10-20 · 브랜치: `feat/map-quality` · 시작점: `964e9674ee626f60942be4d0f4bfe4f1aec9bbc8`

기능 구현과 수락 검증을 구분한다. 아래 `NOT_RUN/BLOCKED`는 통과가 아니다. 새 의존성·외부 Provider·유료 계정·공개 데이터 payload는 추가하지 않았다. 상용 서비스 전체 동등성과 공개 릴리스 판정은 차단 상태다.

| 항목 | 상태 | 근거/제한 |
| --- | --- | --- |
| 고정 240개 케이스/통계/opt-in 검사 | PASS | Node 6개, production/static 소비자 2개; 빈 저확대/한국어 라벨 없음/짧은 frame 표본 거부 |
| 공통 interaction/기존 API 회귀 | PASS | 전체 Vitest 17파일/177개. core14, Web16, Native34의 목표 검사와 기존 기능 포함 |
| style v1 보존/v2·4종 Style Spec | PASS | 스타일 46개; 4테마×3밀도×Web/Native 24조합을 Spec26.4.4/26.2.1 양쪽 검사 |
| Planetiler 실제 codec/profile | PASS | 기존 v1 40개, 최종 v2 85개. 실제 합성 PBF→v1 19타일/87피처/9레이어, v2 78타일/267피처/12레이어; z16 밀도·원본 element fid·multipolygon hole·저확대 도시 보존 |
| 4지역 v2 실제 생성 | PASS | 아래 archive4개; 원본/산출물 ignored, 실제 지역 bbox 표본이며 도시 전체 coverage 아님 |
| context z0–9 | PASS | 124타일/6,176,768B, 명시 활성화·연결. 저확대만이며 전국 상세 생성과 구분 |
| 불변 HTTP/gzip/rollback | PASS | Node 34개; legacy17+v2 8+HTTP9. ETag/HEAD/304/gzip q=0/변조/sidecar/old generation/context/종료 |
| 240개 실제 Chromium 화면 | PASS(렌더링 한정) | 4지역×4테마×5zoom×3폭, 실제 도로/건물·zoom별 한국어 symbol/출처. 최종 z6 화면에 도시 symbol 13–19개; 지리 정확도·전체 수동 수락은 별도 |
| 30회 cold/warm 로딩 | PASS(이 호스트 한정) | cold p95 2,934ms(목표3,000), warm1,493ms(목표1,500). 단일 호스트·목표 근처 결과이며 장치/회선 일반 보장 아님 |
| 1,000마커 frame | FAIL | 5회 완료 이동/56 delta의 p95 116.7ms(목표33). 별도 software GPU 관측이며 물리 기기 미검증 |
| 실제 운영자 연결 예제 | PASS | 9화면, 테마/연결/한글/도로/건물/출처/종료 정리. browser style12/tile73/glyph333, 예상 밖 origin·HTTP/page/console 오류0 |
| Web Next/Expo JS/Android 컴파일 | PASS | Next static/양OS Expo JS export, workspace x86_64 debug APK offline44.30초. 실제 JS 내장·독립 tarball APK·기기 렌더링 검증 아님 |
| Android 물리/iOS·모바일 OS QA | BLOCKED | 연결 기기/Mac/iOS 환경 없음 |
| 육지 마스크·해안선/전국 생성 | BLOCKED | 승인된 landmask 미제공; 전국 디스크 게이트 유지 |
| 기존 전이 취약점·상위 타입 선언 | BLOCKED | 이전 audit high2와 RN/NodeNext 선언 문제를 통과 처리하지 않음 |

전체 상용 서비스 동등성, 전국 데이터 정확도·현장 안전·SLA를 검증한 결과가 아니다. 결과 파일은 ignored이며 코드·MIT와 지도/OSM ODbL·폰트 라이선스를 분리한다.

## 실제 입력과 생성

OSM 원본은 기존 승인된 `osm-geofabrik-kr`이며 SHA256 `57e3ffd07e104d5b9ec511ac2b11cf784936b8982f0b4f30e6f5324928fc9f5e`, OSMHeader 기준일 `2026-10-18T20:25:06.000Z`이다. Planetiler0.10.2/JDK21/4096MiB heap 한 프로세스로 순차 생성했다. 마지막 profile SHA는 `ef94f5ab80d5e7e981ebf120ec693beadbd5d9c0316eafa036bf4e07a18b5523`다. 컴파일 원문 snapshot과 종료 시 변경 검증을 적용한 최종 세대만 아래에 기재한다. 이전 성공본과 v1 active는 보존했다.

| 지역 | 최종 generation | 타일 수 | archive bytes | gzip tile p95 bytes | gzip 최대 bytes |
| --- | --- | --- | --- | --- | --- |
| 서울 | 1792488349559-c91461a3 | 498 | 14,876,672 | 107,681 | 695,838 |
| 울산 | 1792488402242-31bb3cb5 | 466 | 4,775,936 | 33,822 | 220,050 |
| 부산 | 1792488444203-d713f0d1 | 636 | 7,086,080 | 38,977 | 227,270 |
| 제주 | 1792488485383-bfdaf403 | 412 | 3,657,728 | 41,468 | 120,922 |
| context | 1792488315968-7f82a116 | 124 | 6,176,768 | 171,831 | 425,410 |

모두 p95 목표307,200B 이하이며 최대값까지 모두 300KiB 이내라는 뜻은 아니다. 상세4지역의 rail/waterway/transport는 실제 레이어로 검증했다. context는 rail/waterway만 true이며 transport는 최소z12여서 false다. landmask/ocean은 모든 세대에서 false다. 전용 저장소는 `artifacts/tiles/quality-v2`다. 신규 해안선 공급원은 [공식 조건만 조사](coastline-review.md)했고 수집·승격·다운로드하지 않았다.

수동 z6 검수에서 시·도 label만 남고 주요 도시가 사라지는 결함을 발견했다. minzoom 우선순위와 96px당1개 제한이 도시를 원천 MVT에서 제거한 것이어서 스타일 변경만으로 복구할 수 없었다. 원본 capital/population 태그를 제한된 우선순위 hint로 사용하고 z0–9 place grid를 해제했다. z10–16 place grid·POI/transport 제한은 보존한다. 같은 원본의 context z6 후보는10→97개, archive는303,104B(+5.16%) 증가했다. 최종 MVT에서 서울/부산/울산/제주를 확인하고 서울 z6 화면도 직접 열었다. QA는 실제 city symbol 존재를 요구해 시·도 글자만 있는 화면을 거부한다. 인구 hint는 최신 인구 통계 검증이나 신규 데이터 도입을 뜻하지 않는다.

Glyph는 이전 검토된 OFL1.1 Noto CJK의 `KoreaNoto` pack을 재사용했다. manifest SHA `dc7c51fd0c45fbecff7f176aa3730d12ca2bb4d1fe09c281c77a3cc07c196c2b`, font SHA `b76b0433203017ca80401b2ee0dd69350349871c4b19d504c34dbdd80541690a`다. BMP256 range/현대 한글11,172자 coverage와 모든 Unicode 지원을 구분한다. 폰트·glyph·실지도 이미지를 SDK MIT로 재배포하지 않는다.

## 실화면과 성능 범위

정식 측정은 Vite production build를 gzip/ETag/immutable 정적 서버에서 제공한다. 개발 서버 모듈 비용이 섞이는 초기 측정은 수락 결과에서 제외했다. 브라우저 HTTP-cache cold/warm이며 process/GPU/서버 cache는 warm이다. 20Mbps/80ms에서30+30회 navigation-to-idle, 서울 Standard z14/390px 조건이다. 별도 frame 관측은 z14(클러스터 상한13보다 높음)에서 실제 표시된 개별 점1,000개와 완료된1초 이동/최소20 delta를 요구한다. cache를 끄는 Playwright route interception 대신 측정 context는 local-only CSP와 request 감시를 사용한다.

도시 보존 수정 후 정식 결과는 `artifacts/qa/map-quality/report.json`이다. 240/240 렌더링, 예상 밖 origin0·HTTP 오류0·pageerror0이고, 각 캡처 SHA와 실제 production bundle assets SHA/크기를 보존했다. cold30회 p95 **2,934ms**, warm30회 **1,493ms**로 이번 호스트에서 각각3,000/1,500ms 목표를 통과했다. 여유가 작고 단일 호스트 결과이므로 장치·회선 전반의 보장은 아니다. matrix 안의 짧은 frame 관측은 source/visible1,000개·이동완료/1,062.1ms를 확인했지만 delta11개로 최소20미달이므로 `NOT_RUN`이다. 따라서 원본 report의 전체 판정은 `FAIL`로 보존한다.

별도 `verify:map-frames`는 최종 서울 generation `1792488349559-c91461a3`로5회 완료된1초 왕복 이동을 실측했다. 실제1,000개 marker IDs가 전후 모두 표시되고 marker extent가 bounds 안에 있음을 확인했다. 충분한 **56 delta**, p95 **116.7ms**, 목표33ms로 **FAIL**이다. min66.6/max133.3ms, 예상 밖/HTTP/request/page/map 오류0, 종료 listeners0/observerfalse였다. SwiftShader software renderer를 확인했고, 고정 프로토콜을 물리 장치 수락으로 확대하지 않는다. 전체 표본과 해시는 ignored `frames-report.json`에 있다. 성능 수락은 이 실패로 계속 차단된다.

수정 전 production 결과 cold3,071ms/warm1,570ms·13 delta 부족과 별도47 delta/p95 150ms는 `before-city-fix-report.json`/`before-city-fix-frames-report.json`에 당시 실패로 보존했다. 최종 수치와 혼합하거나 표본을 제외하지 않았다. 개발 harness의 초기 측정도 별도 이력이며 production 수락 표본으로 사용하지 않았다.

실제 `/tiles/` 소비 앱도 최종 세대로 별도9화면 검증했다. 서울4테마/390·768·1440px와 울산/부산/제주에서 연결·전환·한글/도로/건물/출처·disconnect 정리가 통과했다. browser 성공 응답 style12/tile73/glyph333, 서버 style12/tile74/glyph333/errors0이다. 이동/전환 중 취소된 tile 요청5개는 report에 보존했으며 서버/browser tile 집계는1개 차이가 난다. 예상 밖 origin·HTTP/page/console 오류는0이고4지역 모두 cleanup을 확인했다. software GL의 ReadPixels 경고4개는 오류와 구분해 남겼다. 근거는 ignored `artifacts/qa/real-tiles/report.json`이다.

`pnpm check`/Web24 E2E/5 SDK pack과 clean rebuild byte 동일성 및 격리 Web 설치·타입·SSR/브라우저 검사가 통과했다. Web NodeNext 선언 probe는 기존 TS2834로 실패했다. 새 Native tarball의 offline 설치·strict 앱/API·config plugin·Android/iOS JS export는 통과했으나 `skipLibCheck:false`의 상위 RN 선언은 TS2411/TS2344/TS2416으로 실패해 `PARTIAL_PASS`다. 전체 선언을 검증한 것처럼 표시하지 않는다.

Chromium154.0.8037.57/Debian13/software WebGL, deviceScaleFactor1/세 viewport 조건이다. Android debug compile은 08:54:01.028~08:54:45.328UTC에 실행됐으며 뒤의 정식 production 성능 창과 중첩하지 않는다. 실물 GPU/모바일 frame·실제 회선·장기 누수 검증은 별도다.

서울 z14/1440의4테마와 서울 z6/제주 z10을 직접 열었다. 도로·건물·공원 구분, 한글과 출처 링크가 표시된다. 도시 보존 수정 후 서울 z6에서 서울특별시 등 주요 도시가 다시 표시되는 화면도 확인했다. Outdoor는 도심 보행로가 많이 강조돼 추가 밀도 조정이 필요하다. 제주 z10의 bbox/tile 경계 절단은 현재 작은 detail범위와 landmask부재의 한계이며 전국/섬 완성으로 수락하지 않는다. 색상 비교는 같은 카메라/원본을 쓴다. 전체240개에 대한 사람이 하는 겹침·정확도 검수로 확대하지 않는다. 기본 SDK의 빈 마커 selector가 QA 전용 소비 화면에는 남아 있으며 실제 `/tiles/` 소비 앱은 빈 selector를 숨긴다.

| 테마 | 비교 의도 | 실제 이미지 위치(ignored) |
| --- | --- | --- |
| Standard | 일반 지도, 밝은 도로·중립 건물·녹지 | `artifacts/qa/map-quality/seoul-standard-z14-1440.png` |
| Dark | 어두운 바탕·밝은 글자·주요 도로 대비 | `artifacts/qa/map-quality/seoul-dark-z14-1440.png` |
| Pastel | 낮은 채도·부드러운 건물/공원 구분 | `artifacts/qa/map-quality/seoul-pastel-z14-1440.png` |
| Outdoor | 녹지와 산책로, z10 표시 준비 | `artifacts/qa/map-quality/seoul-outdoor-z14-1440.png` |

## 남은 게이트와 우선순위

| 심각도 | 작업 | 종료 조건 |
| --- | --- | --- |
| 공개 차단 | node-forge/braces high2, 상위 RN/NodeNext 선언 문제 | 지원되는 공식 수정과 독립 소비·audit 통과. ignore/억제/Native 제거로 통과시키지 않음 |
| P1 | Android 실제 기기·Mac/iOS | 한글/제스처·후보선택/접근성·회전·복귀·위치 권한·메모리·OS egress 실제 실행 |
| P1 | 승인된 landmask·해안선, 전국 상세 | 정확한 파일/권리/시점/SHA/CRS/clip·섬/이음새 검사, 충분한 디스크와 실제 전국 생성 |
| P1 | frame 성능·장치별 로딩 여유 | software GPU frame 목표 미달. 실제 GPU 장치 관측, worker/폰트/전송·스타일 복잡도 최적화와 고정 조건 재측정. 최종 단일 호스트 로딩 및 저확대 도시 보존 검사는 통과 |
| P1 | 현장 데이터·후속 검색/주소/라우팅 정확도 | 승인 원본과 지역별 정답 표본 확보·오류율/최신성 측정. 이번 cartography 구현으로 대체하지 않음 |
| P2 | 지도 편집과 운영 품질 | zoom별 행정경계·복잡한 교차로·희귀문자·아이콘·더 많은 장치/색각/부하/장기 retention 검수 |

새 스타일·조작 API의 기능 검사를 통과한 부분만 준비 완료다. 장비 없는 항목, 미실행 브라우저, 해안선·전국 범위와 남은 보안 게이트 때문에 전체 Q0–Q5 또는 공개 릴리스 완료를 선언하지 않는다.
