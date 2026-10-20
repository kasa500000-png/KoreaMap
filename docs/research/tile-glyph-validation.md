# 한국어 glyph 생성·검증 — 2026-10-20

범위: private 타일 도구의 **로컬 glyph 생성 및 PBF 구조 검증**이다. Web 지도 실화면은 타일 서비스 통합 결과에서 별도로 기록하고, Android/iOS 렌더링 통과로 대체하지 않는다. 기본 SDK 설치·빌드·테스트에는 이 옵션 도구나 폰트 다운로드를 연결하지 않는다.

## 구현과 근거

프로젝트에서 직접 작성한 `services/tiles/src/glyphs.py`는 Pillow의 FreeType 래스터와 SciPy 거리 변환으로 24 px/em, 4배 샘플링의 SDF를 생성한다. 원본 폰트나 상위 SDF 구현을 소스에 복사하지 않았다. protobuf encoder도 프로젝트 코드다.

- [MapLibre glyph URL·PBF 규격](https://maplibre.org/maplibre-style-spec/glyphs/)에 맞춰 256개 코드포인트 단위 파일을 제공한다.
- 설치된 [GL JS 6.14.0 decoder](https://github.com/maplibre/maplibre-gl-js/blob/v6.14.0/src/style/parse_glyph_pbf.ts)에서 width/height와 별개의 3px border, signed left/top, advance 해석을 확인했다.
- [공식 Font Maker](https://github.com/maplibre/font-maker/blob/main/main.cpp)의 24 px/em에서 사용하는 top 기준(25px baseline)을 확인했다. 이 파일은 동작 근거이며 구현 복제물이 아니다. 공식 도구와 비트 동일한 출력이라고 주장하지 않는다.
- [TinySDF](https://github.com/mapbox/tiny-sdf)의 SDF radius/cutoff 의미를 확인하고 radius 8, cutoff 0.25를 사용한다. 거리 변환·샘플링 코드는 독립 구현이다.

## 입력과 라이선스

[기존 폰트 권리 기록](../font-icon-licenses.md)의 로컬 Noto TTC를 재사용했다. 새 폰트를 자동 다운로드하지 않았다.

| 항목 | 실제 확인 |
| --- | --- |
| 원본 | `/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc`, face 1 |
| 원본 SHA-256 | `b76b0433203017ca80401b2ee0dd69350349871c4b19d504c34dbdd80541690a` |
| 폰트 family / version | Noto Sans CJK KR / Version 2.004 |
| 폰트 embedded copyright | © 2014–2021 Adobe |
| 권리 | font name metadata의 SIL Open Font License 1.1과 [공식 Noto Sans LICENSE](https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/LICENSE) 확인 |
| 원본 OFL 본문 SHA | `6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2` |
| 생성 pack 고지 SHA | `af55b908a0ccf969b7bdd0e6cac6f4866a7ed0d1aeb9c7b29516ca0d24422981` — embedded copyright + OFL 본문 |

변환된 glyph도 OFL 조건을 유지한다. SDK MIT로 재허가하지 않는다. 출력에는 실제 폰트 copyright와 OFL 본문을 `LICENSE.txt`로 보존한다. 운영자는 폰트 파생물·이름 조건·배포 고지를 자신의 배포 방식에 맞춰 확인해야 한다. Noto TTC, PBF, notice 복사본, bitmap preview 및 생성 manifest는 모두 ignored `artifacts/tiles/`에만 두며 Git/npm에 추가하지 않는다.

## 옵션 Python 도구 고정

이미 설치된 아래 버전을 사용했고 [공식 PyPI metadata](https://pypi.org/)에서 exact release를 재확인했다. 추가 패키지 설치는 수행하지 않았다. 도구는 이 버전과 다르면 생성 전에 실패한다.

| 패키지 | 버전 | 라이선스 범위 |
| --- | --- | --- |
| Pillow | 12.3.0 | MIT-CMU |
| NumPy | 2.3.5 | BSD 계열 본체; 배포 wheel의 OpenBLAS/GCC runtime 등 별도 고지 포함 |
| SciPy | 1.17.0 | BSD 계열 본체; 배포 wheel의 수치 라이브러리/runtime 별도 고지 포함 |
| fontTools | 4.61.1 | MIT |

NumPy/SciPy wheel 전체를 단일 BSD 조건으로 재허가하지 않는다. 이 도구·wheel·native binary는 SDK tarball에 포함하지 않는다. 도구를 별도로 재배포하는 운영자는 실제 설치 배포물의 고지를 유지해야 한다. 미설치 환경은 별도 Python venv에 위 exact 버전을 설치한 뒤 해당 venv의 Python으로 생성 명령을 실행한다. Windows의 venv 실행 파일은 `Scripts/python.exe`, macOS/Linux는 `bin/python`이다.

## 재현 명령

아래 명령은 **이미 검토한 로컬 폰트·OFL notice와 옵션 Python 도구**를 준비한 뒤 실행한다. `--operator-opt-in`, font SHA 및 `--license-file`은 필수다. 기존 pack을 덮어쓰지 않으므로 갱신 시 새 output 디렉터리를 사용한다.

```sh
node scripts/python.mjs services/tiles/src/glyphs.py --font /usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc --face 1 --sha256 b76b0433203017ca80401b2ee0dd69350349871c4b19d504c34dbdd80541690a --output artifacts/tiles/glyphs --fontstack KoreaNoto --license OFL-1.1 --license-file artifacts/tiles/tools/NotoSansCJK-OFL.txt --operator-opt-in
```

CJK가 필요한 경우 새 output을 `artifacts/tiles/glyphs-cjk`로 바꾸고 `--include-cjk`를 추가한다. 원본 폰트가 보유한 CJK 코드포인트만 포함하며 없는 문자를 자동 생성하지 않는다.

실제 타일의 다양한 BMP 지명·구두점을 처리할 때는 새 output을 `artifacts/tiles/glyphs-bmp`로 바꾸고 `--include-bmp`를 사용한다. 이 옵션은 원본 cmap의 유효한 BMP Unicode scalar만 생성하고, U+0000–U+FFFF의 256개 range 파일을 모두 제공한다. 지원 글자가 없는 블록도 이름·range가 담긴 정상적인 빈 fontstack 메시지를 반환하므로 리소스 404와 글자 미지원이 혼동되지 않는다. `.notdef`와 surrogate는 coverage에 포함하지 않는다. 이 옵션도 원본 폰트에 없는 variation selector·문자·emoji를 생성하거나 지원한다고 주장하지 않는다.

출력 manifest는 `schemaVersion`, `fontstack`, 원본 font/notice SHA, family/version/copyright, glyph coverage 및 range 파일별 SHA/bytes를 기록한다. 각 range 경로는 `KoreaNoto/0-255.pbf` 형태다. 출력은 일시 디렉터리에서 생성한 뒤 성공 시 전환하며, 폰트 parse·SHA·필수 글자·고지 검사 실패는 성공한 pack으로 남기지 않는다.

## 실제 결과

| 검사 | 결과 |
| --- | --- |
| `python tests/tile-glyphs.test.py` | **10개 통과, skip 0**. wire format·signed metric·bitmap border·빈 range·BMP/.notdef 선택·경로·SHA·동의·라이선스·필수 한글 누락·손상 폰트·실제 Noto glyph 검사 |
| 기본 pack 생성 | 49개 range, glyph **11,883개**, 총 PBF **9,567,636 bytes** |
| CJK 추가 pack 생성 | 131개 range, glyph **32,859개**, 총 PBF **28,623,802 bytes** |
| BMP 전체 endpoint pack 생성 | 256개 range(75개 유효한 빈 range), 실제 glyph **42,220개**, 총 PBF **36,834,573 bytes** |
| 필수 문자 coverage | ASCII + Jamo/호환 자모 + 현대 한글 **11,617개**, 누락 **0**. 현대 한글만 **11,172개** |
| CJK 추가 coverage | U+4E00–U+9FFF 중 **20,976개 보유 / 16개 원본 폰트에 없음**. CJK 전체 지원으로 표시하지 않음 |
| 실제 상위 decoder | 설치된 GL JS 6.14.0 `parseGlyphPbf`를 Vite SSR로 로드해 기본 49개, CJK 131개, BMP 256개 range 전체 decode. bitmap dimensions·metrics·파일 SHA·현대 한글 ID 확인 통과 |
| 반복 생성 | 고지 보강 전후 기본 pack의 49개 PBF 바이트 동일. 다른 OS/native renderer 재현성 증거는 아님 |
| bitmap 형태 확인 | 한/글/힣/ㄱ의 SDF와 threshold preview를 실제로 열어 서로 구분되는 자형 확인. 지도 renderer 실화면 검증은 아님 |

기본 pack의 manifest SHA는 `79c8a3484708c55b1995a66dd9bc559312631d1458f78d20b57a730f05ebb19d`, CJK pack은 `365673b80710b8d2908c71f80f86156d46b307d52a184941a043bc987d4a219e`다. 기본 pack은 CJK 추가 구현 전 생성되어 `coverage.cjkMissingCount` 필드가 없고 CJK pack에는 실제 값 16을 기록했다. range PBF의 형식·의미에는 차이가 없다.

## 검증 한계

이 도구는 코드포인트별 glyph를 생성하며 shaping engine이 아니다. 현대 한국어는 NFC 정규화된 이름을 사용하고 옛한글·이모지·복잡한 문자 조합·모든 한자를 지원한다고 표시하지 않는다. PDF/폰트 coverage나 PBF decode 성공을 실제 Web/Android/iOS 표시 성공으로 간주하지 않는다.

Web 실제 PBF 검증 시 GL JS의 로컬 ideograph 렌더링을 명시적으로 끄고 glyph 요청과 rendered labels를 함께 관측해야 한다. OS 로컬 Noto가 표시됐다는 결과는 PBF 공급원 검증을 대체하지 않는다. Native 한글 glyph, 플랫폼 shaping·줄바꿈·성능·메모리 검증은 별도 미검증이다.


## 실제 타일 통합에서 발견한 range 보강

서울 실제 타일의 첫 Web 통합에서 `/glyphs/KoreaNoto/65024-65279.pbf` 요청이 발생했다. 기본/CJK 선택 pack은 이 블록을 만들지 않아 HTTP404가 반환되었다. 글자가 없는 블록을 성공한 glyph로 위조하지 않고, `--include-bmp` 옵션으로 모든 BMP range endpoint를 생성하도록 보강했다. 기존 기본/CJK pack은 이력으로 보존했다.

`encode_range(..., [])`가 glyph 메시지 없이 올바른 fontstack/name/range를 만드는지, `.notdef`·surrogate·BMP 밖 코드를 실제 glyph coverage에 넣지 않는지 독립 protobuf reader로 회귀 검증한다. 수정한 pack의 실제 지도 재검증은 타일 서비스 통합 기록에서 별도로 판정한다.

BMP pack의 실제 결과는 `artifacts/tiles/glyphs-bmp/manifest.json`에 기록했다. manifest SHA는 `dc7c51fd0c45fbecff7f176aa3730d12ca2bb4d1fe09c281c77a3cc07c196c2b`다. 실제 글리프 42,220개와 75개 유효한 빈 range를 GL JS decoder로 전부 읽었다. 서로게이트를 제외한 BMP scalar 중 원본 폰트의 미지원 21,268개를 coverage에 남긴다. 문제가 된 65024–65279 range에는 원본의 glyph 68개가 있고, 미지원 U+FE0F를 `.notdef` 또는 가짜 bitmap으로 채우지 않았음을 확인했다. 예를 들어 1280–1535 range는 glyph 없는 정상 24byte fontstack 메시지다.
