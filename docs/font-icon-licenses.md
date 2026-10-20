# 폰트·아이콘 라이선스와 플랫폼 검증

확인일 2026-10-19. SDK 코드와 지도 데이터/폰트의 라이선스를 분리한다. SDK tarball 및 Git에는 폰트·glyph PBF·외부 sprite를 포함하지 않는다.

| 자산 | 원본/권리자 | 조건·배포 판단 |
| --- | --- | --- |
| Noto Sans CJK KR | [Noto CJK](https://github.com/notofonts/noto-cjk), Google 및 기여자; 로컬 Debian 고지는 Google Corporation 2010–2012 | [원본 Sans LICENSE](https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/LICENSE), SIL OFL-1.1 확인. 상업 사용/앱 포함/수정·재배포 가능하나 고지·OFL 유지, 폰트 단독 판매 금지, 수정 시 Reserved Font Name 조건 검토. 이번 Git/npm에는 미포함 |
| 시스템 sans-serif fallback | 실행 OS/폰트 설치 환경별 권리자 | 이름 참조만 하며 복사/번들하지 않음. 시스템 폰트 이름으로 임의 재배포 허가를 추정하지 않음 |
| Korea Map Kit POI 4종 | 이 프로젝트 기여자 | 직접 작성한 도형 생성 코드, 루트 MIT. 나무·P·곡선 산책길·십자 시설 표식. 외부 SVG/폰트 아이콘 없음 |
| MapLibre 기본 control | MapLibre GL JS | 기존 BSD 고지 유지. 새 제3자 아이콘 패키지를 도입하지 않음 |
| 테마 QA PNG 4장 | 자체 합성 데이터/토큰/UI를 실제 렌더링 | 문서용 출력물, MIT. 글꼴 소프트웨어 자체가 아니며 [OFL FAQ](https://openfontlicense.org/ofl-faq/)의 출력물 구분을 따른다. 폰트/glyph 라이선스를 MIT로 바꾼 것이 아님 |

OFL 폰트에서 glyph PBF·subset·WOFF 등 파생물을 만들면 해당 배포에도 원본/수정 여부·저작권·OFL·이름 조건을 검토하고 제공해야 한다. 변환이 곧 MIT 전환이라는 판단을 하지 않는다. 실제 운영자 font pack은 이번에 생성/호스팅/배포하지 않았다. 각 원본 버전과 고지를 그대로 보존해야 한다.

## Web에서 실제 사용한 폰트

- 로컬 OS 패키지: `fonts-noto-cjk` `1:20240730+repack1-1`.
- 파일: `/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc`, collection face 1 (`fc-match`의 Noto Sans CJK KR).
- SHA-256: `b76b0433203017ca80401b2ee0dd69350349871c4b19d504c34dbdd80541690a`.
- 라이선스 확인: 배포판의 `/usr/share/doc/fonts-noto-cjk/copyright` Fonts 섹션 SIL-1.1 및 위 upstream LICENSE. 배포판 패키징 파일의 GPL 표기를 폰트 자체에 적용하지 않는다.
- 현대 한글 11,172자 + corpus의 영문/숫자/호환 자모 포함 11,190개 코드포인트 cmap coverage 통과. 조합형 문자열은 NFC 정규화 후 검사한다. 모든 옛한글/한자/이모지 지원을 주장하지 않는다.
- Chromium CDP에서 실제 플랫폼 폰트 Noto Sans CJK KR 선택, 캔버스 한/글/힣/ㄱ이 누락 glyph 모양과 다르게 그려지는 것, 지도 라벨 screenshot을 별도로 확인한다. cmap 검사는 글리프 보유 여부이고 shaping/렌더링 증명은 아니다.

```sh
pnpm build:sdk
node scripts/check-font.mjs --font /path/to/reviewed/NotoSansCJK-Regular.ttc --face 1
pnpm build
pnpm test:web
```

Linux CI는 무료 표준 runner에 `fonts-noto-cjk`를 QA용 설치하고 같은 검사를 수행한다. 배포판 제공 폰트 bytes는 OS 업데이트로 달라질 수 있으므로 CI 로그의 실제 SHA가 해당 실행의 증거다. 재현 스크린샷은 위 로컬 SHA에 고정되어 있다. SDK 설치·빌드·단위 테스트는 이 OS 폰트를 다운로드하지 않는다. macOS/Windows에서 동일 Web QA를 하려면 라이선스를 검토한 Noto CJK 설치와 실제 face/해시 확인이 먼저 필요하다.

## Web / Android / iOS matrix

| 검증 | Web Chromium/Linux | Android Native | iOS Native |
| --- | --- | --- | --- |
| 4종 Style Spec·한국어 expression | 실행 통과 | Native용 JSON 계약 검사 통과, 실제 renderer 아님 | Native용 JSON 계약 검사 통과, 실제 renderer 아님 |
| 실제 한글 라벨/아이콘/출처 화면 | 실행 통과 | 미검증: ADB/기기/빌드 환경 없음 | 미검증: xcrun/시뮬레이터/macOS 실행 환경 없음 |
| cmap 글리프 보유 | 위 Noto TTC 통과 | 같은 폰트 검사를 사용할 수 있으나 앱 폰트/pack 미제공 | 같은 제한 |
| 로컬 폰트 생략 모드 | GL JS 6.14.0에서 통과 | factory에서 거부 | factory에서 거부 |
| 운영자 glyph pack/range | 실제 네트워크 공급원 미검증 | 미검증 | 미검증 |

공식 [Glyphs 문서](https://maplibre.org/maplibre-style-spec/glyphs/)는 로컬 폰트 사용을 위한 glyph URL 생략이 Native에서 동일하게 지원된다고 표시하지 않는다. [font-faces](https://maplibre.org/maplibre-style-spec/font-faces/)의 플랫폼 지원 표와 설치 코드가 달라질 수 있어 이 기능을 공통 계약에 포함하지 않았다. 현재 공통 Native 라벨 경로는 명시적 glyph URL이다.

## Native 실화면 QA 재현 절차

1. 운영자가 검토한 OFL 원본에서 glyph pack을 생성하고 저작권/OFL·SHA·font stack·실제 포함 glyph ID를 기록한다. `auditGlyphCoverage`에 실제 디코딩한 ID를 넣어 corpus 누락을 차단한다. HTTP 200만으로 통과시키지 않는다.
2. `createThemeStyle({target:'native', typography:{mode:'glyphs',fontStack:[...],url:...}, ...})`의 JSON과 4종 RGBA 이미지를 해당 Native renderer에 명시적으로 연결한다. 최신 SDK enum/이미지 등록 API는 해당 플랫폼 실제 빌드에서 확인한다.
3. Android/iOS 각각 light/dark 시스템 모드, z10/12/14/16, 회전/확대, name:ko/빈 값 fallback, 긴 지명·조합형 NFC, 저밀도/고밀도 화면을 캡처한다. 글자 누락·충돌·halo·아이콘·출처 가독성을 기록한다.
4. glyph range 실패/빈 pack/잘못된 stack·폰트 누락을 주입하고 오류 및 요청 수를 기록한다. 제작자 endpoint로 fallback하는지 확인한다.
5. OS·앱 commit·renderer 버전·font/pack SHA와 screenshot을 함께 기록한 뒤에만 플랫폼 렌더링 통과로 승격한다.
