# 실제 한국 타일 Web 검증

확인일: 2026-10-20. **4개 지역·9개 화면 검증 통과**. 자체 합성 fixture와 달리
운영자 저장소의 실제 OSM 지역 타일 및 OFL 한글 PBF glyph를 연결해 검사했다.
SDK 전체 플랫폼 또는 전국 기본지도 완성을 의미하지 않는다.

## 재현

[타일 생성·운영 가이드](../tiles.md)에 따라 이용허락 검토를 통과한 원본에서 서울·울산·부산·제주의
세대를 생성·활성화하고, 허가된 폰트의 BMP glyph pack을 준비한다. 원본·타일·글꼴·glyph를 Git/npm에
넣지 않는다. SDK와 Web 정적 예제를 빌드한 뒤 별도 터미널에서 다음을 실행한다.

```sh
pnpm exec node scripts/serve-web.mjs --tile-origin=http://127.0.0.1:8787
```

다른 터미널에서 실제 로컬 경로를 명시한다.

```sh
pnpm exec node scripts/verify-real-tiles.mjs --operator-opt-in --store=/absolute/operator/tiles --glyphs=/absolute/operator/glyphs --web-origin=http://127.0.0.1:4173 --port=8787
node --test tests/real-tiles.test.mjs
```

운영자 동의, 절대 로컬 경로, 정확한 loopback Web origin과 타일 포트를 생략하면 실행을 거부한다.
`pnpm check` 기본 실행에서 실제 원본 다운로드·타일 서버 실행·유료 서비스 연결을 시작하지 않는다.
일반 `serve-web.mjs`는 기존 `connect-src 'self'`를 유지하고, 위 명령만 지정한 로컬 타일 origin을 허용한다.
Playwright Chromium 설치가 필요하며 이 환경은 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`을
명시했다. Windows/macOS에서는 설치된 Playwright 브라우저 또는 해당 환경의 실행 경로를 사용한다.

## 실제 실행 범위와 증거

`scripts/verify-real-tiles.mjs`는 8787 loopback 서버를 지역별로 순차 실행한다. `/tiles/` 화면의
일반 입력·동의·연결·지역 이동·테마 버튼을 사용하며, SDK 상태를 임의 변경하거나 원시 엔진을 노출하지 않는다.
서버 시작 후 `/status`의 고정 generation과 원본 기준일·archive SHA를 보고서에 연결한다.
활성 포인터가 바뀌더라도 실행 중인 서버가 고정한 generation을 기록한다.

- 기본 입력 빈 값·동의 해제 상태에서 스타일/타일/glyph 요청 0을 확인했다.
- 연결 후 SDK의 operator origin 정책과 별도로 브라우저의 예상하지 않은 origin을 차단·보고한다.
  UI는 스타일 확인용 GET 후 SDK 로딩 GET을 수행하므로 최초 스타일 요청은 두 번이다.
- `useLocalIdeographs:false`로 로컬 한글 폰트 대체를 끄고 실제 PBF glyph HTTP 200을 확인했다.
  지도 라벨 속성의 한글, 도로·건물·라벨 피처, 출처 가시성 및 가로 overflow도 검사했다.
  최종 재실행은 OSM attribution의 실제 클릭 링크와 공식 copyright 대상도 검증했다.
- 9개 PNG를 직접 열어 한글 지도·4종 팔레트·지역별 도로·건물·출처와 390/768px 배치를 확인했다.
  서울 고밀도 POI/지명 표현과 상세 카토그래피·색각 접근성은 추가 개선 대상이다.
- 연결 해제 뒤 canvas·선택기·지도 control 제거를 확인했다. 브라우저/context/각 타일 서버는
  성공·실패 모두 정리한다. 전역 공유 worker 1개의 종료나 장시간 메모리 누수 부재를 주장하지 않는다.

실행한 glyph pack은 `KoreaNoto`, Noto Sans CJK KR face 1, OFL-1.1이다.
폰트 SHA256은 `b76b0433203017ca80401b2ee0dd69350349871c4b19d504c34dbdd80541690a`,
manifest SHA256은 `dc7c51fd0c45fbecff7f176aa3730d12ca2bb4d1fe09c281c77a3cc07c196c2b`다.
폰트·glyph 자체와 고지 원문은 ignored 운영자 저장소에만 둔다.

| 지역 / Standard 1440px | archive 타일 | 화면 도로 / 건물 / 라벨 | 타일 HTTP 200 | glyph HTTP 200 |
| --- | ---: | ---: | ---: | ---: |
| 서울 | 48 | 2518 / 8783 / 88 | 46 | 233 |
| 울산 | 52 | 1352 / 1326 / 61 | 8 | 40 |
| 부산 | 60 | 1212 / 3926 / 54 | 6 | 39 |
| 제주 | 52 | 1493 / 3756 / 70 | 6 | 41 |

서울 요청 수는 4종 테마와 화면 크기 전환을 포함한 지역 세션 전체 값이다. 화면 도형 수는
`queryRenderedFeatures`의 조각 수이며 타일 경계 중복 가능성이 있고 고유 도로/건물 총수가 아니다.
원본 데이터 기준일은 네 지역 모두 `2026-10-18T20:25:06.000Z`다.
서울 Standard/Dark/Pastel/Outdoor 1440px 및 Standard 390/768px를 확인했고,
390px에서는 730/2770/31, 768px에서는 1492/6582/59 도형을 확인했다.

최종 실행은 예상하지 않은 외부 origin 0, HTTP 오류 0, page exception 0,
console error 0, 서버 오류 0, 정리 성공이었다. 서울에서 소프트웨어 WebGL의 ReadPixels GPU stall
경고 4개를 기록했다. 경고까지 0이라고 보고하지 않는다.

보고서와 PNG는 `artifacts/qa/real-tiles/`에만 보관한다. `report.json`에 소스 커밋/dirty 상태,
각 세대 SHA, 요청·응답·취소·경고와 화면 집계를 기록한다. 이 실행은 미커밋 작업 트리에서 수행했으므로
커밋 식별자만으로 최종 후보의 무변경 검증을 주장하지 않는다. 코드·타일·글꼴·서버 설정을 바꾸면 재검증한다.

## 실패 수정과 제한

첫 실행은 Next route announcer를 앱 오류로 세는 선택자 때문에 중단됐다. 앱 `main`의 오류 영역으로
한정한 후 재실행했다. 다음 실행은 카메라/테마 전환 시 이전 타일의 정상 `ERR_ABORTED` 취소 4건을
일반 네트워크 실패로 분류해 중단됐다. 이후 해당 취소를 별도 집계하되 원본 실패 기록을 보존하고,
실제 타일/glyph 200·피처 표시·HTTP 오류 0 조건은 그대로 유지했다. 최종 전체 실행의 타일 취소는 0이었다.
실패 실행을 합격으로 집계하지 않았다. URL/동의/취소·종료 UI의 일반 회귀는 별도
`tests/e2e-web/self-hosted.spec.ts`에서 합성 응답으로 검사하며 이 실제 OSM 증거와 구분한다.

`observedReadyMs`는 화면 검증 대기·캡처 구간의 관측값이며 초기 앱 렌더링이나 독립 성능 벤치마크가 아니다.
FPS/p95·전국 규모·해양/해안선 완성도·장시간/GPU 메모리·실제 모바일 브라우저·Safari/Firefox,
Android/iOS의 glyph/XYZ/PMTiles 지원은 이번 결과로 통과하지 않는다. 실제 운영 정확도와 OSM 누락은 별도다.
SDK 코드는 MIT, 지도 데이터는 ODbL-1.0, 폰트는 OFL-1.1로 분리한다.
