# Windows x64 sharp 라이선스 메타데이터 검토

확인일: 2026-10-24 KST. 기준 main은 `0cb5f153ec96a579a5c665c0670a474a50d3f182`다.
새 Windows frozen install 뒤 `pnpm check`는
`@img/sharp-win32-x64@0.35.5`의 `Apache-2.0 AND LGPL-3.0-or-later`를
미검토로 거부했다. 기존 Linux libvips 검토는 이 복합 표현식을 포함하지 않았다.

## 근거와 적용 범위

- 권리자: Lovell Fuller and others (실제 README의 Copyright 2013).
- [공식 정확 버전 메타데이터](https://registry.npmjs.org/@img%2Fsharp-win32-x64/0.35.5),
  [공식 설치 문서](https://github.com/lovell/sharp/blob/v0.35.5/docs/src/content/docs/install.md),
  [0.35.5 릴리스](https://github.com/lovell/sharp/releases/tag/v0.35.5).
- 기존 lockfile의 정확한 버전으로 새 의존성 선택/업데이트가 아니다.
  Node 요구는 `>=20.9.0`, 실제 Node는 24.19.0, OS/CPU는 win32/x64다.
- registry SRI는 `sha512-x76eH0vEiHlcMQu8Y8IenntaACtddpT6W0wmXtWrnKcnKI7ME5DdgqhAD6SEWOEl1v2zDvkZDhFA9KnURwpfqg==`.
  frozen install의 실제 LICENSE, README, versions.json, lib 디렉터리를 검사했다.
- LICENSE는 Apache-2.0이며 README는 libvips와 전이 구성요소의 LGPLv3 및 기타 고지를 열거한다.
  `AND`를 `OR`로 해석하거나 LGPL을 제거하지 않는다. libvips는 8.18.7이고
  `libvips-42.dll`, `libvips-cpp-8.18.7.dll`, `sharp-win32-x64-0.35.5.node`가 있다.
- [Apache-2.0 원문](https://github.com/lovell/sharp/blob/v0.35.5/LICENSE)과
  [LGPLv3 원문](https://github.com/spdx/license-list-data/blob/main/text/LGPL-3.0-or-later.txt)을 따른다.
  원저작권·라이선스·해당 NOTICE 및 수정 고지를 보존한다. 바이너리 재배포 시
  LGPL 소스 제공·재링크/교체 조건 및 전이 구성요소 의무를 별도로 검토해야 한다.
  이번 개발 설치 메타데이터 수락은 DLL 배포의 완전한 법적 적합성 승인이 아니다.

실제 설치 파일의 SHA-256:

| 파일 | SHA-256 |
| --- | --- |
| LICENSE | `dc1f5d2d43c5531dfe0acaf4e950ea5dbe3e61e1850cf0e983bda7efc10d6693` |
| README.md | `3d083ada5ebafe1e6c227daa7b061d4254b61df4a3901c359ffdeac817ce5866` |
| versions.json | `e2611d5d854815a8b33c8a3d2ec649511a9596ccf16844e8eae7cf81e79881c4` |

정확한 이름/버전/복합 표현식 한 조합만 검토 대상으로 추가한다. ARM64/ia32,
다른 버전·유사 이름·다른 표현식은 계속 거부한다. `pnpm test:licenses`가 이 경계와
기존 검토를 검사하며 전체 `pnpm check`에 포함된다. SDK에 native binary를 추가하지 않는다.

## 환경과 우선순위

Git 2.53.0.windows.3, Node 24.19.0, Python 3.12.14를 확인했다.
기본 pnpm 11.25.0은 engine 검사에서 실패했다. 공식 Windows pnpm 12.14.0 tarball을
ignored 도구 폴더에 받고 registry SRI와 비교해 사용했다. Python은 WindowsApps 별칭
대신 실제 경로를 명령별 PATH에 지정했다. 전역 설정·설치 hook·strict peer·최소 릴리스
경과시간·lockfile은 유지했다.

최신 main [CI40086896131](https://github.com/kasa500000-png/KoreaMap/actions/runs/40086896131)는
기능 6개 성공, 보안/Web/Native 선언 3개 실패다. 새 로컬 audit도 high2(node-forge/Zod), exit1이다.
[forge 권고](https://github.com/advisories/GHSA-86w9-cpqp-85rv)는 수정 버전이 없고
[Zod 권고](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)는 4.6.6 이상을 요구한다.
[최신 Expo CLI 58.1.15](https://registry.npmjs.org/@expo%2Fcli/58.1.15)도
`zod:^3.25.76`, `node-forge:^1.4.0`을 요구하므로 강제 major override를 적용하지 않았다.
MapLibre latest 6.15.0은 geojson-vt 6.3.0/vt-pbf 4.3.2 계열을 유지하고 RN latest는 기존
0.88.0이다. 실제 CSV/독립 정답도 이 checkout에 없다. 따라서 여기서 재현된 라이선스
검토 누락을 독립 후속 작업으로 선택했다.

최종 검사와 미검증 범위는 [진행 기록](../progress.md)의 이번 단계 절을 따른다.
SDK MIT와 제3자 권리를 구분하고 보안·타입·실자료·Native·발행 게이트는 유지한다.

### 추가 Windows 재현과 수정

라이선스 수정 후 전체 check는 한국어 Windows 기본 CP949로 문서를 읽는 Python 코드에서 실패했다. 공통 `scripts/python.mjs`가 `-X utf8`을 지정하도록 수정했다. 실제 Python을 `PYTHONUTF8=0` 조건으로 실행해 UTF-8 한글 읽기·출력, 공백 경로/인자, exit7 전달을 검사한다. 환경 변수 전체 출력이나 시스템 로캘 변경은 없다.

Chromium lifecycle 첫 실행은 5/6 PASS, map chunk 지연 검사 1개 FAIL이었다. 실제 Windows Next manifest의 키는 `app\\map-client.tsx -> ./map-demo`인 반면 검사는 POSIX 문자열만 찾았다. 키의 구분자만 정규화하고 정확한 모듈 1개를 요구한다. chunk URL의 POSIX 형식·개수·크기·내용 검사와 전체 10초 상한을 유지한다. 별도 단위 검사에서 양 OS 키, 미존재/중복 키, traversal·역슬래시 URL·잘못된 확장자·타입·초과 개수를 검증한다. SDK/예제 runtime과 실제 cold/warm/frame 성능 기준은 바꾸지 않는다.

Noto CJK KR는 [공식 OTF](https://github.com/notofonts/noto-cjk/blob/main/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf)와 [OFL](https://github.com/notofonts/noto-cjk/blob/main/Sans/LICENSE)을 로컬 ignored 폴더에 준비했다. SHA256은 `6bcb2a0703aa137e874fc2dffa85f6c21ba9a67fa329e81b8c801663af7e992a`이며 문자 11,190개 누락0이다. Windows 세션 글꼴 로드만 수행했고 registry/시스템 폰트 폴더를 변경하거나 Git/npm에 배포하지 않았다.

### 이 PC에서 재현

이 컴퓨터의 기본 PATH는 아직 pnpm11과 WindowsApps Python 별칭이다. 다음 PATH 변경은 현재 PowerShell 세션에만 적용하며 저장소의 설치 정책/lockfile을 바꾸지 않는다. 다른 PC는 자기 설치 경로를 사용한다. `artifacts/toolchain`은 이번 작업에서 공식 SRI 확인 후 준비한 ignored 경로로 clone되지 않는다.

```powershell
$env:PATH = 'D:\KoreaMap\artifacts\toolchain\package;C:\Users\kasa5\.cache\codex-runtimes\codex-primary-runtime\dependencies\python;' + $env:PATH
pnpm --version
python --version
pnpm install --frozen-lockfile
pnpm check
pnpm pack:check
pnpm check:data --staged
pnpm audit:dependencies
pnpm test:web
pnpm verify:browser-lifecycle --browser=chromium
pnpm verify:packages
pnpm verify:native-consumer
```

각 검사는 개별 실행하고 종료 코드를 구분한다. 브라우저는 공식 Playwright Chromium과 현재 세션에 로드한 Noto CJK KR가 필요하며 재부팅 이후 글꼴 설치/로드를 다시 확인한다. Firefox/WebKit은 이 PC에서 실행하지 않았으며 최종 PR CI의 해당 플랫폼 결과와 구분한다. Docker/실제 POI/OSM/Android 기기/iOS 검증은 이번 개발 검사 변경 범위에서 실행하지 않았다.

### 전체 회귀에서 추가 확인한 Windows 입력 차이

최종 비용 감사 회귀의 CRLF package.json 메타데이터 오인은 `scripts/audit-cost-security.py`에서 정확한 fragment의 줄바꿈만 LF/CRLF를 허용해 수정했다. 원본 문자/byte 위치를 유지한다. `scripts/test-cost-audit.py`는 두 줄바꿈의 정상 메타데이터 허용 및 동일 URL의 실행 script 차단·오류 줄 번호를 검증하며 23/23 PASS다. 도메인·endpoint·자격증명 예외는 추가하지 않았다.

후속 개별 검사에서 발견한 fixture 문제도 수정했다. `tests/service-quality.test.mjs`는 `--import`에 Windows 경로 대신 `pathToFileURL`을 전달한다(14/14 PASS). `tests/native-android-apk.test.py`는 ZipInfo가 Windows에서 역슬래시를 정상 경로로 바꾸지 못하도록 악성 fixture 이름을 raw ZIP에 보존한다(Python13/13, Node7 PASS/기존 POSIX 프로세스2 skip). `tests/web-deploy.test.mjs`는 Windows에서 권한 없이 만들 수 있는 실제 directory junction으로 링크 거부를 검증한다(13/13 PASS). POSIX에서는 기존 file symlink를 유지하며 Windows file symlink 자체의 검증으로 표시하지 않는다.

`tests/tiles-http-v2.test.mjs`는 기존 EPERM 파일 링크 capability 확인을 SQLite 파일을 열거나 삭제하기 전에 수행한다. 링크 가능 환경의 실제 archive 교체/400 거부 assertion은 유지한다. 이 PC에서는 파일 링크 권한이 없어 해당 사례를 기존 규칙대로 NOT_RUN으로 보고한다. 타일40개 중38 PASS/2 skip이며 skip을 통과로 계산하지 않는다. SQLite 파일 삭제 EPERM을 runtime 성공으로 덮지 않고, 파일 링크 생성 불가를 실제 probe로 확인한 결과다. 권한/Windows 보안 설정은 변경하지 않았다.

최종 로컬 전체 check/pack/staged 출처 검사는 exit0이며, 세부 통과·skip·release 실패는 진행 기록에 분리했다. 기존 `packages.json`의 재현 설명문에는 하드코딩된 `same Linux host` 문구가 있으므로 이를 이번 OS 증거로 사용하지 않았다. 이번 실제 호스트는 Windows x64이며 5개 해시는 기존 Linux main CI와도 동일하다. 해당 보고 문구의 자동 OS 표시는 별도 개선 사항이다.
