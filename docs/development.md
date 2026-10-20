# 모노레포 개발 가이드

현재 전체 소스는 `main`에 병합되어 있다. 기본 브랜치 변경은 GitHub 권한 부족으로 반영하지 못했으므로 [빠른 설치](quickstart.md)의 `git clone --branch main`을 사용한다. 새 clone 검증과 미해결 게이트는 [clone 검증 기록](research/clone-validation.md)을 따른다.

아래 경계/API 표는 2026-10-19 foundation 도입 당시의 기록이다. 현재 공통 API·서비스 구현 범위는 [공개 API](public-api.md)와 [로드맵](roadmap.md)이 기준이며, M1 전체 완료(실제 Android/iOS 최소 지도와 장비 예산 확정)는 아니다.

## 도구와 재현

Node 24.19.0과 pnpm 12.14.0을 정확히 맞춘다. Python 3.12+와 Git이 문서/비용 검사에 필요하다. Node 버전은 `.node-version`, pnpm은 `packageManager`, 직접 의존성은 exact, 전이 의존성은 `pnpm-lock.yaml`에 고정했다. `pnpm install --frozen-lockfile`을 사용한다. 처음 설치한 의존성은 공개 registry에서 받으며 API 키나 `.env`는 필요하지 않다.

`pnpm check`는 README의 개발 검사를 순서대로 실행한다. 실제 패키지 검사는 `pnpm pack:check`, Web E2E는 `pnpm exec playwright install chromium` 후 `pnpm test:web`으로 별도 실행한다. 일반 `pnpm build`는 sdk/services TypeScript, Next 정적 export, Expo 양 플랫폼 JS export를 실행한다. Native compiler가 없는 Linux에서도 기본 빌드가 가능하다.

스크립트는 Node `spawnSync`/filesystem API와 Python 표준 라이브러리를 사용한다. `rm -rf`, shell 환경변수 대입, Bash 전용 glob을 package script에 사용하지 않는다. pnpm의 JS launcher와 12.x native 실행 파일을 구분한다. Python은 Windows `py -3`와 `python`/`python3`를 탐색한다. 브라우저 테스트는 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`를 명시해 기존 Chromium을 사용할 수도 있다. 해당 값은 로컬 실행 파일 경로이며 Git에 저장하지 않는다.

## 경계와 API 상태

| 위치 | 구현 범위 | 후속 범위 |
| --- | --- | --- |
| packages/core | 좌표/Mercator 검사, 오류, 명시적 fixture 설정 검증, 최소 검색 계약 | 카메라/이벤트/경로/취소 등 전체 공통 계약 |
| packages/styles | 원본 합성 GeoJSON+background/fill/circle 스타일, 한글 UI와 별개 | 실제 한국 타일·한글 glyph·스타일 토큰 M3 |
| packages/web | 검증 후 dynamic MapLibre import, 로컬 worker, create/destroy | 전체 API·스타일 교체·운영자 endpoint 통제 M2 |
| packages/native | MapLibre RN 11 Map/Camera에 명시적 로컬 style 전달 | 네이티브 실빌드·기기/시뮬레이터·네트워크 QA |
| packages/data-adapters | opt-in 합성 검색 fixture | HTTP 검색/경로/공공데이터/저장 provider M5/M6 |
| examples/web, examples/expo | private SDK 소비 앱 | 실제 플랫폼 parity/접근성/성능 |
| services/* | private manifest/TypeScript 상태 descriptor/문서 | geo-data M3/M6, 검색/경로 엔진 M5 |

별도 React 패키지는 초기 과도한 분리를 피하고 Web 예제 lifecycle 코드로 시작한다. 사용자 지정 디렉터리 이름 `native`, `data-adapters`, `examples/*`, `services/*`가 기존 설계의 경로 표기를 대체한다. SDK가 예제/서비스를 참조할 수 없고 core는 DOM lib와 모든 외부 의존성을 갖지 않는다. `pnpm check:boundaries`와 ESLint가 위반을 실패 처리한다. `skipLibCheck`는 전이 라이브러리 선언 파일 중복 검사를 생략할 뿐 자체 소스의 strict 검사나 플랫폼 경계를 완화하지 않는다.

API는 아직 안정화 전이다. `validateMapConfig`는 설정 누락에 CONFIG_REQUIRED, operator 등 미지원 mode에 UNSUPPORTED를 반환한다. fixture는 synthetic-v1만 허용하고 추가 endpoint 키도 거부한다. 새 네트워크 provider를 넣으려면 source/glyph/sprite/worker/redirect와 설치 hook까지 비용 감사를 확장해야 한다.

## Web 예제와 worker

`pnpm dev:web`로 로컬 Next.js를 실행한다. `pnpm build` 후 `node scripts/serve-web.mjs`는 정적 결과를 loopback 4173에서만 제공한다. 이 서버는 QA용이며 운영 배포가 아니다.

MapLibre GL JS 6은 worker module을 별도 파일로 제공한다. 빌드/개발 실행기는 설치된 패키지의 worker와 BSD LICENSE를 `examples/web/public/vendor/maplibre`로 복사한다. generated vendor는 Git에서 제외하며 빌드 output에는 포함한다. `createMap`은 same-origin 절대 `.mjs` 경로를 명시적으로 요구한다. QA 서버는 `.mjs`의 JavaScript MIME과 로컬 CSP를 제공한다. 원격 CDN에서 worker를 다운로드하지 않는다.

DOM 생성 후 map을 만들고 React unmount/늦게 끝난 import 시 destroy한다. destroy는 중복 호출에 안전하다. Web E2E는 local request만 허용하고 차단한 외부 시도도 실패로 센다. pan 후 idle까지 기다려 화면을 검사한다. screenshot은 로컬 test-results에만 남기고 CI artifact로 업로드하지 않는다.

## Expo와 실제 Native 빌드

Expo Go는 지원하지 않는다. MapLibre config plugin이 app.json에 들어 있다. `pnpm dev:expo`는 offline/localhost Metro만 실행하며 EAS 계정이나 OTA 배포는 사용하지 않는다. 개발 도구 telemetry와 dotenv 로딩은 실행기에서 끈다.

- Android: 로컬 Android SDK/JDK/에뮬레이터 또는 권한 있는 기기를 준비하고 `pnpm build:sdk`, `pnpm --filter @korea-map-kit/example-expo android` 실행.
- iOS: macOS/Xcode/CocoaPods를 준비하고 `pnpm build:sdk`, `pnpm --filter @korea-map-kit/example-expo ios` 실행.
- 현재 공통 build는 Metro JS export만 수행한다. `--no-bytecode`는 교차 OS에서 JS 산출물을 검증하기 위한 설정이며 배포용 Hermes/native 컴파일 검증을 대신하지 않는다.
- Gradle/Pods 잠금, 서명, 최소 OS/장비, Native 렌더·제스처·네트워크·한글 glyph는 실제 로컬 빌드 단계에 남아 있다. 이 미검증을 플랫폼 완료로 표시하지 않는다.

## CI와 Changesets

무료 표준 `ubuntu-24.04`, `windows-2025`, `macos-15` runner에서 동일 `pnpm check`와 tarball 감사를 실행한다. Linux만 Chromium E2E를 추가한다. actions는 공식 tag의 commit SHA에 고정하고 setup-node의 암묵적 package-manager cache를 끈다. contents read, credential 비보존, 20분 timeout, 중복 실행 취소를 적용했다. schedule/cache/upload-artifact/deploy/publish 작업은 없다. hosted runner OS 이미지는 관리형이므로 image digest 고정을 보장하지 않는다. 실제 ImageVersion과 결과는 각 실행 로그가 근거다.

SDK 5개는 0.1.0에서 시작하는 Changesets fixed group이다. `pnpm changeset:status`는 `--since=origin/main`으로 계획만 검사한다. PR detached checkout에도 존재하는 remote-tracking ref를 사용하며 새 clone에서는 origin/main을 fetch해야 한다. 예제/서비스/root는 private이며 자동 version/publish는 없다. npm namespace는 실제 발행 승인 전 소유권 확인이 필요하다. `dist`의 JS/d.ts/MIT 고지와 README만 pack하고 소스맵·tsbuildinfo·앱·서비스·환경값은 제외한다.
