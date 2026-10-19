# Korea Map Kit 품질 감사 — 2026-10-19

**판정: 수정한 Web/패키지 검증은 통과. 전체 플랫폼 QA와 공개 출시는 미완료·차단.**
기준은 `feat/scenario-apps`의 `0d3a8d20bf490b841ca86e9e7854275862977edf`, 감사 브랜치는 `feat/quality-audit`다.
검사하지 않은 항목과 실패 항목을 통과로 계산하지 않는다. npm 발행·main 병합·운영 배포는 수행하지 않았다.

## 심각도별 발견 사항

P1은 공개 출시 차단, P2는 지원 범위/기능·검증 결함, P3는 개선 항목이다. 미검증은 결함이 확인됐다는 뜻이 아니다.

| ID | 심각도 | 발견 및 영향 | 조치 / 최종 상태 |
| --- | --- | --- | --- |
| SEC-01 | P1 | Expo CLI 경로의 node-forge 1.4.0 RSA 서명 검증 취약점 | **미해결**. GHSA-86w9-cpqp-85rv, 공식 수정 버전 미배포. 의존성 감사 exit 1, 출시 차단 유지 |
| SEC-02 | P1 | RN/Metro → micromatch → braces 3.0.3의 자원 고갈 취약점 | **미해결**. GHSA-vfj7-8cjw-p6xm, 공식 수정 버전 미배포. 임의 override/감사 제외 없음 |
| TYPE-01 | P2 | 독립 tarball 소비 앱에서 `skipLibCheck:false`일 때 GeoJSON namespace 미해결(TS2503); 워크스페이스의 타입 환경과 skipLibCheck가 가렸음 | **수정·회귀 통과**. web/styles가 @types/geojson 7946.0.16과 보존되는 ambient reference를 직접 제공. strict Bundler 선언 검사 성공 |
| TYPE-02 | P2 | MapLibre 하위 geojson-vt/vt-pbf의 확장자 없는 ESM 상대 import가 NodeNext 선언 검사에서 TS2834 발생 | **미해결/지원 제한**. Web 소비 앱은 `moduleResolution: Bundler` 사용. core의 NodeNext·DOM 없는 선언 검사는 통과. Web NodeNext까지 통과했다고 표시하지 않음 |
| PERF-01 | P2 | 동일 카메라/1,000개 마커 값 재설정에도 snapshot과 엔진 갱신 발생 | **수정·회귀 통과**. 검증 후 의미 있는 값 변경만 알림. 순서/내용/카메라 변경은 보존, 잘못된 입력은 계속 거부 |
| QA-01 | P2 | 기존 offline 검사에서 examples/scenarios manifest가 빠져도 pnpm 설치 성공으로 통과 처리 | **수정·회귀 통과**. 12개 manifest 자동 발견, workspace target 확인, 설치된 27개 link 실제 해석 |
| QA-02 | P2 | 루트 license inventory만 실행하면 설치 그래프 199개 이름만 관찰 | **수정·회귀 통과**. recursive + include-workspace-root, Linux 645개 설치 버전의 정책 검사. 신규/알 수 없는 조건 실패 처리 |
| QA-03 | P2 | 배포 tarball을 독립 소비 앱에서 컴파일·실행하는 검증 부재 | **수정·회귀 통과**. 4개 Web 계열 tarball의 오프라인 설치, strict 선언, SSR import, 실제 Chromium 표시/선택/종료를 CI에 추가 |
| QA-04 | P3 | 768px 명시 검사 및 성능 수치/카메라 중 마커 DOM 갱신 근거 부족 | **보강·통과**. 390/768/1440 matrix, 503 복구, 4종 테마, 요청/시간/DOM mutation 측정 |
| QA-05 | P2 | 최초 Linux CI에서 독립 소비 앱의 registry metadata 캐시가 없어 ERR_PNPM_NO_OFFLINE_META 발생 | **수정**. 빈 전용 metadata 캐시에서 공개 registry로 소비 앱 lock을 명시적으로 준비한 뒤 frozen/offline 설치. 설치된 제3자 버전이 기존 검토 그래프에 있는지도 검사. 원격 재검증 결과는 PR checks를 따름 |

보안 근거는 [node-forge 공지](https://github.com/advisories/GHSA-86w9-cpqp-85rv),
[braces 공지](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
[공식 node-forge metadata](https://registry.npmjs.org/node-forge),
[공식 braces metadata](https://registry.npmjs.org/braces)를 2026-10-19 확인했다.
최신 배포는 각각 1.4.0/3.0.3, advisory의 first_patched_version은 null이다.
`pnpm why -r node-forge braces`로 경로를 확인했다. SDK core 자체 의존성은 0이지만,
Expo 개발 도구와 Native 소비 앱의 RN 의존성까지 안전하다는 뜻은 아니다.
취약 입력의 실제 악용 재현은 수행하지 않았다. 패치 배포 후 공식 호환성을 확인해 lockfile 갱신과 전체 회귀가 필요하다.

## 실행 환경과 정적 검증

Linux, Node 24.19.0, pnpm 12.14.0, TypeScript 6.0.3, 시스템 Chromium/SwiftShader,
Docker 28.4.0. API 키·유료 클라우드 계정 없이 수행했다. 도구 다운로드/registry와 운영자 서비스 요청은 구분한다.

| 검사 | 결과 / 범위 |
| --- | --- |
| `pnpm check` | 통과. strict SDK/서비스/Web/Expo/테스트, ESLint 경고 0, Prettier, API 문서, Native 실제 타입, Next production build, Android/iOS JS export |
| strict 설정 | 상속을 해석한 패키지/앱/서비스 config의 strict=true와 개별 strict 옵션 false override 금지. scenario 코드는 Web/Expo config에서 검사 |
| 외부 선언 | 워크스페이스의 기존 skipLibCheck=true는 유지. 별도 독립 소비 앱에서 skipLibCheck=false로 Web/Bundler 및 core/NodeNext 검증 |
| `pnpm audit --json` | **실패(exit 1)**: critical 0, high 2, moderate/low 0. `pnpm audit:dependencies`로 재현. 일반 check 성공은 의존성 보안 합격이 아님 |
| `pnpm check:licenses` | 통과: 현재 OS에 설치된 645개 의존성 버전의 metadata 정책. 아래 별도 의무와 한계 적용 |
| 비밀/비용/출처 | 작업 트리·index·로컬 refs 도달 가능 이력·실제 SDK tarball 검사. 발견 0은 탐지 규칙 범위이며 개인정보/모든 비밀 부재의 증명은 아님 |
| `pnpm offline:check` | 통과: 채워진 pnpm store 사용, 다운로드 0, 12개 manifest/27개 내부 연결. 빈 캐시에서 최초 설치는 registry 접속 필요 |

## 단위·통합 및 실화면 결과

| 검사 | 실제 결과 |
| --- | --- |
| Vitest | 100개 / 13 files 통과. 좌표/bounds·거리·GeoJSON/GPX·검색·마커·GPS·경로·설정·취소/오류·native adapter·예제 세션 포함 |
| 독립 core | Node 테스트 1개 통과. node_modules/MapLibre/브라우저 없이 복사한 core 실행 |
| 출처/재배포 정책 | 19개 통과. 등록/기한/해시/fixture·미승인 payload 차단 |
| 비밀/비용 감사 회귀 | 16개 통과 |
| 실제 PostGIS | 19개 통과. Docker 임시 DB, EPSG:5174 기준점 변환, 공간 거리/인덱스, 트랜잭션·복구·권한, pg_trgm, 서울/울산/제주·오타/띄어쓰기·취소/지연·HTTP |
| 실제 Valhalla | 8개 통과. 자체 합성 PBF graph의 세 모드·경유지·단절/섬·시간초과·취소·gateway·지역 갱신/롤백. 실제 전국 도로 품질을 대체하지 않음 |
| Chromium Web | 15개 통과, retry/skip 없음. 이동·줌/회전·마커100/1000·클릭/키보드·GeoJSON/경로·테마·검색/GPS/산책/여행·화면 복귀·종료/정리·503 복구 |
| 반응형 직접 확인 | 390/768/1440px 캡처를 열어 확인. 가로 넘침 없음, 390px 세로 배치, 768/1440px 분할 배치, 컨트롤·출처·합성 경로 표시 |
| 한국어 | 4개 테마의 실제 Web 라벨/아이콘, 로컬 Noto Sans CJK KR의 font resolution/래스터 및 확대별 표시 규칙 확인. 지도는 실제 한국 지도 데이터가 아닌 자체 합성 fixture |
| Android 물리 기기 | **미검증**. SDK platform-tools의 `adb devices -l` 목록 비어 있음. 이전 API35 에뮬레이터 증거는 [별도 기록](research/example-apps-validation.md)이며 이번 실기기 통과 근거 아님 |
| iOS Development Build/기기 | **미검증**. Linux/Xcode 없음. iOS JS export 성공을 기기 테스트로 계산하지 않음 |

Native 터치/스크롤 충돌·회전·백그라운드 복귀·GPS 권한·한글 glyph·PMTiles/XYZ 전환·메모리와
OS 전체 네트워크는 이번에 실행하지 못했다. [Native 검증 기록](research/native-sdk-validation.md)의
재현 절차와 [GPS 검증](research/gps-validation.md)에 따라 실제 기기/macOS 환경에서 진행해야 한다.
이전 Android 첫 실행 ANR는 소프트웨어 에뮬레이터에서 발생했으며 실기기에서 원인/영향이 해소됐다고 판정하지 않는다.

## 성능 표본과 한계

아래는 이번 최초 전체 회귀 실행의 단일 표본이다. Playwright 클릭/대기 시간까지 포함하며
초기 렌더는 navigation 시작→100개 마커 준비, 마커 갱신은 버튼 클릭→1,000개 확인,
카메라는 이동+줌 두 동작 완료다. production SLA/p95/FPS/기기 성능 보증이 아니다.

| Web 폭 | 초기 준비 ms | 1,000개 갱신 ms | 이동+줌 ms | 카메라 중 selector DOM 변경 | fixture 타일 요청 / 외부 HTTP |
| --- | ---: | ---: | ---: | ---: | ---: |
| 390 | 1111 | 174 | 109 | 0 | 0 / 0 |
| 768 | 1140 | 213 | 97 | 0 | 0 / 0 |
| 1440 | 1047 | 157 | 105 | 0 | 0 / 0 |

- 회귀 상한은 초기 10초, 1,000개 갱신·카메라 각 5초로 기능 정체를 잡는다. 더 엄격한 실서비스 예산은 별도 실데이터 벤치마크로 결정한다.
- CDP GC 뒤 5회 지도 종료/재생성: main-page JS heap 9,258,056→10,601,508 bytes, 증가 1,343,452 bytes(약 1.28MiB), 회귀 상한 8MiB 미만. 장기 누수 없음 판정이 아니다.
- 종료 후 SDK listeners=0, ResizeObserver=0, canvas/popup/selector 제거. MapLibre의 공유 worker 1개 유지, 반복 생성으로 증가하지 않음. GPU/worker/native heap은 이 수치에 포함되지 않는다.
- 동일값 setter는 snapshot 유지/알림 0, 실제 변경은 알림 유지. 카메라 이동 중 selector 재구축 0을 확인했으며 모든 React render를 계측했다고 주장하지 않는다.
- 기본 fixture는 원격 타일 자체가 없어서 요청 0이다. 운영자 실제 타일의 cache hit·네트워크/타일 예산·전국 POI·10,000개 이상·60fps·장시간 메모리는 **미검증**이다.

## 패키지와 재현성

`pnpm pack:check` 후 `pnpm verify:packages`를 실행한다. SDK5개의 생성 dist를 삭제해 다시 빌드하고
tarball 바이트를 비교한다. 운영자 artifacts/DB/graph는 지우지 않는다. 현재 동일 Linux/도구/lockfile 조건에서
5개 tarball이 일치한다. OS 간 바이트 일치, Next/Expo 배포물 및 APK/IPA의 bit-for-bit 재현은 **미검증**이다.

| SDK 0.1.0 | gzip bytes | 파일 내용 합계 bytes(타르 헤더 제외) |
| --- | ---: | ---: |
| core | 25238 | 96836 |
| web | 13580 | 46543 |
| native | 9673 | 32469 |
| styles | 13767 | 45824 |
| data-adapters | 6816 | 22103 |

이 크기는 peer/transitive dependencies·MapLibre bundle·서비스/지도 데이터·앱 설치 크기를 포함하지 않는다.
정확한 SHA와 소비 앱 결과는 ignored `artifacts/qa/packages.json`에 기록한다.

독립 임시 디렉터리에 core/web/styles/data-adapters tarball4개와 MapLibre6.14.0을 설치했다.
SDK 내부 의존성도 로컬 tarball override로 해석해 workspace 소스를 참조하지 않는다.
최초 소비 앱 lock 해석은 공개 npm registry metadata 접속이 필요하며 빈 전용 캐시에서 수행한다.
이후 frozen/offline·install hook 차단으로 설치하고, 모든 제3자 설치 버전이 기존 검토 그래프에 있는지 확인한다.
strict Bundler/전체 declaration 검사, Node SSR import,
Vite+Chromium에서 지도/마커 선택/종료와 외부 요청0을 확인했다. Native 독립 소비 앱 설치/개발 빌드는 이번에 미실행이다.
최소 소비 앱과 동일하게 Web은 `module: ESNext`, `moduleResolution: Bundler`, `strict:true`를 사용한다.
core는 `module: NodeNext`, `lib:[ES2022]`, `types:[]`, `skipLibCheck:false`로도 통과했다.

## 오픈소스·라이선스·개인정보·비용

- SDK 자체 코드·합성 fixture는 MIT. 제3자 원본 POI/OSM/타일/사진/폰트/GPS 기록을 이번 Git/npm에 추가하지 않았다. 코드3개 파일의 출처 SHA를 개별 검토했고 공개 허용 경로를 넓히지 않았다.
- `check:licenses`는 현재 설치 그래프의 package metadata 검사다. 설치되지 않은 다른 OS optional 패키지, native 정적 링크 구성요소, Docker 이미지 전체 SBOM/CVE, 소스 고지 이행까지 자동 인증하지 않는다.
- Next의 sharp/libvips binary(`@img/sharp-libvips-*` 1.3.4)는 LGPL-3.0-or-later, lightningcss1.33.0은 MPL-2.0이다. SDK tarball에는 이 도구를 번들하지 않는다. 해당 binary/수정 파일을 재배포하는 운영자는 LGPL 고지·해당 소스/재링크 조건, MPL 파일 단위 소스 공개 등 정확한 배포 의무를 별도 이행해야 한다.
- caniuse-lite1.0.30001816은 CC-BY-4.0(저작자/라이선스·변경 고지), argparse2.0.1은 Python-2.0(고지 유지), node-forge1.4.0은 BSD-3-Clause OR GPL-2.0 중 BSD를 선택한다. MIT/ISC/Apache/BSD 등의 저작권·고지 의무도 유지한다. SDK MIT로 재허가하지 않는다.
- MapLibre worker를 Web public에 복사할 때 기존 LICENSE.txt도 함께 복사한다. 한글 Web QA 폰트는 시스템 설치본이며 패키지/Git에 넣지 않는다. [글꼴/아이콘 조건](design-system.md)을 따른다.
- 추가로 실제 Next 정적 출력·Expo Android/iOS JS export 94파일을 기존 비용/비밀 규칙으로 검사했다. 외부 URL 검토 후보120, URL credential 후보1, 이름 기반 credential 후보4가 발생했다. 이를 “발견0”으로 숨기지 않는다.
- 후보1은 Next URL parser의 `a@b` 형식 적합성 probe, 후보4는 RN TextInput의 `password`/`password-new`/`newPassword` 의미 토큰으로 upstream 설치 소스와 대조했다. private-key/token/JWT 규칙 일치는 없었다. URL 후보는 문서/namespace/polyfill probe와 Expo asset fallback을 구분했다.
- Expo asset의 CDN 문자열은 upstream `AssetSources.ts`의 `ExponentKernel`(Expo Go home) 조건부 fallback이다. SDK 제작자 endpoint가 아니며 Expo Go를 지원/검증하지 않는다. Native OS egress를 실행 검증했다는 근거로 쓰지 않는다. 일반 SDK tarball에는 Expo가 포함되지 않는다.
- Web matrix와 독립 tarball 소비 앱에서 외부 요청0. source/npm의 정적 발견0과 실제 브라우저 결과를 분리한다. registry/개발 도구 설치 통신, 운영자 서비스 비용, 계정 청구 상태까지 0원으로 보증하지 않는다.
- GitHub Actions는 기존 표준 Linux/Windows/macOS runner와 read-only 권한을 유지한다. 캐시/artifact 업로드/유료 runner/cron/배포는 추가하지 않았다.

## 재현 순서와 남은 출시 조건

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm offline:check
pnpm pack:check
pnpm exec playwright install --with-deps chromium
pnpm verify:packages
pnpm test:web
pnpm test:geo
pnpm test:routing
pnpm audit:dependencies
pnpm check:data --staged
pnpm audit:cost
```

Linux QA font 준비는 CI의 fonts-noto-cjk 설치/check-font 명령을 따른다. 시스템 Chromium을 쓰면
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`를 지정한다. 마지막 audit:dependencies는 현재 high2로 실패하는 것이 알려진 결과다.
검사 JSON/스크린샷/로그는 ignored artifacts/test-results에 두며 npm에 포함하지 않는다.
CI는 기능/정책 회귀의 상태이며 취약점·실기기 출시 승인 상태를 대체하지 않는다.

다음 우선순위는 P1 공식 패치 검증, 가속/실제 Android와 macOS/iOS 기기 QA,
Web NodeNext upstream 타입 수정 확인, 운영자 tile/POI·실GPS·장시간 성능/네트워크 감사다.
각 항목의 실제 증거가 생기기 전까지 전체 플랫폼 품질 감사와 공개 출시를 완료 처리하지 않는다.


최초 [원격 CI](https://github.com/kasa500000-png/KoreaMap/actions/runs/39261616248)에서
Windows/macOS는 통과했고 Linux의 새 소비 앱 검사만 metadata 캐시 누락으로 실패했다.
이를 숨기거나 재시도만 하지 않고 위 QA-05로 설치 준비 조건과 회귀 스크립트를 수정했다.
최종 원격 판정은 [Draft PR #14](https://github.com/kasa500000-png/KoreaMap/pull/14)의 최신 commit checks를 따른다.
503 복구 검사는 실패한 지도를 종료하고 사용자 버튼으로 로컬 fixture를 재생성하는 흐름이다.
원격 provider 자동 retry/장애 후 동일 서버 복구까지 검증했다는 뜻은 아니다.
