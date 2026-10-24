# 빠른 설치 / Quick start

소스 프리뷰는 `main`에 통합됐으며 다른 PC에서 clone해 실행할 수 있습니다. v0.1.0은 미발행 후보이고 보안·공개 타입·성능·플랫폼 릴리스 게이트는 남아 있습니다. 현재 `npm install korea-map-web`이 성공한다고 주장하지 않습니다. 이름 선점 방지를 위해 공개 발행 직전 가용성과 소유권을 다시 확인해야 합니다.

Codex 후속 개발은 [인계 안내](handoff.md)와 [복사할 프롬프트](codex-handoff-prompt.md)를 따릅니다. 2026-10-24 새 audit의 high2는 node-forge/Zod이며 아래의 과거 상태 설명과 최신 측정을 구분하세요.

## 다른 PC에서 Web 데모 실행

Node **24.19.0**, pnpm **12.14.0**을 준비합니다. 저장소 검사에는 Python **3.12+**도 필요합니다. 기본 브랜치가 아직 `chore/project-policy`이므로 `--branch main`을 명시합니다. 아래 명령은 Windows/macOS/Linux에서 같은 순서로 실행합니다.

```sh
git clone --branch main https://github.com/kasa500000-png/KoreaMap.git
cd KoreaMap
pnpm install --frozen-lockfile
pnpm dev:web
```

`pnpm dev:web`이 SDK를 빌드하고 로컬 MapLibre worker를 준비한 뒤 `http://localhost:3000`에서 Next.js 데모를 시작합니다. API 키, DB, Docker, Supabase 없이 합성 지도를 실행합니다. 기본 fixture는 실제 한국 기본지도가 아닙니다. 최초 설치에는 공개 npm 네트워크가 필요하며 `pnpm offline:check`는 이미 준비된 store의 오프라인 재설치 검사입니다.

운영자 원본·타일 archive·glyph/폰트·JAR·DB·실지도 캡처·QA 보고서와 `artifacts/` 자료는 Git에서 제외돼 clone되지 않습니다. 실제 지도는 [타일 가이드](tiles.md)에 따라 원본 사용권과 체크섬을 확인하고 직접 생성·호스팅하거나 명시적 Provider로 연결합니다. 기존 제작자 인프라로 자동 연결하지 않습니다.

## 검사와 로컬 패키지

아래는 데모 시작과 별도로 실행하는 검증 명령입니다. 브라우저 검사는 Playwright Chromium과 필요한 폰트 환경, 서비스 통합 검사는 Docker를 별도로 준비해야 합니다. [오류 해결](troubleshooting.md)과 각 서비스 가이드를 따르세요.

```sh
pnpm check
pnpm pack:check
pnpm test:web
pnpm audit:dependencies
pnpm verify:packages
pnpm verify:native-consumer
```

현재 보안 high 2건 때문에 `audit:dependencies`가 실패합니다. Web NodeNext와 RN 상위 선언 오류로 두 독립 소비 verifier도 **PARTIAL_PASS / nonzero exit**합니다. 이 실패는 데모 실행 요구조건이나 성공 결과가 아닙니다. 호스트 Chromium/SwiftShader 프레임 p95 **116.7ms**는 **33ms** 목표에 미달했고, 실제 Android 기기와 iOS는 미검증입니다. 상세 상태는 [릴리스 보고서](releases/v0.1.0.md)를 확인하세요.

실제 npm 형식 tarball은 `artifacts/korea-map-{core,styles,web,native,data-adapters}-0.1.0.tgz`에 생성됩니다. `pnpm verify:packages`는 별도 임시 소비 앱에 Web 관련 4개 tarball을 설치하고 strict 타입·SSR·실제 브라우저·외부 요청을 검증합니다. workspace symlink를 사용하지 않습니다. Native tarball의 독립 APK/IPA 설치 검증은 아직 미완료입니다.

수동 소비 앱에서도 로컬 tarball을 dependencies에 지정하세요. 미발행 형제 의존성이 레지스트리로 해석되지 않도록 `pnpm-workspace.yaml`의 overrides에 각 tarball의 **사용자 로컬 절대 경로**를 지정하고 `ignoreScripts: true`를 유지합니다. 재현 가능한 전체 소비 앱 생성 과정은 [검증 스크립트](../scripts/verify-packages.mjs)를 따릅니다.

## 승인된 npm 발행 이후에만

```sh
npm install --save-exact korea-map-core@0.1.0 korea-map-styles@0.1.0 korea-map-web@0.1.0 maplibre-gl@6.14.0
```

이 명령은 현재 검증된 레지스트리 설치 결과가 아닙니다. 발행 후 새 빈 디렉터리에서 실행하고, 실제 registry integrity/소유자/provenance를 확인한 뒤 설치 검증 상태를 변경해야 합니다.

Web은 MapLibre CSS, 같은 origin의 로컬 worker 파일과 LICENSE, 높이가 있는 컨테이너가 필요합니다. [Web 가이드](web-guide.md)와 [Expo 설치 가이드](native-sdk.md)를 참고하세요. 앱 빌드에 들어가는 값은 공개되므로 비밀 키를 전달하지 마세요.
