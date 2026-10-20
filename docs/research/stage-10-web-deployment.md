# Stage 10 — 합성 Web 데모의 정적 배포물 준비

확인일: 2026-10-21 KST. 기준 `origin/main`은 `5f5c58ff7dcd92957500f87a62929c97276f42cc`다. **로컬 배포물 준비와 검증이며 외부 배포·npm 발행·GitHub Release가 아니다.** 배포 대상에 대한 답변은 아직 없으므로 특정 호스팅·계정·도메인·과금 설정을 선택하지 않았다.

## 1. 구현 완료 기능

기존 Next.js `output:'export'`, `build:sdk`, Web build, 로컬 MapLibre worker 복사를 재사용한다. 새 private `prepare-web-deploy.mjs`는 clean `out/.next` 재생성 후 합성 route `/`, `/themes/`, `/walk/`, `/trip/`, `/search/`, `/routing/`, `/api/`만 ignored candidate의 `site/`에 복사한다. operator 타일 입력 `/tiles/`와 실제 GPS 권한 `/gps/`는 포함하지 않는다. HTML 링크도 제외된 route를 가리키면 실패한다. SDK의 선택형 Provider 구현 자체는 번들에 남을 수 있으나 설정·사용자 키·실제 데이터는 주입하지 않는다.

Next `.env*`는 루트/예제 폴더에서 파일명만 확인하고 예제·template 외에는 내용 읽기 없이 차단한다. build 환경은 OS 경로·임시 폴더 등 제한된 allowlist로 다시 구성하며 `NODE_OPTIONS`, 운영자/공개 Provider 환경변수, npm 인증·proxy 값을 전달하지 않는다. telemetry·네트워크 자동 도구 갱신을 끄고 offline pnpm을 사용한다.

출력은 파일별 경로·bytes·SHA-256, 소스 전체 SHA/dirty, route/CSP/notice 기록이 있는 `deploy-manifest.json`, `site/`, 빌드 로그와 선택형 로컬 smoke 결과로 구성된다. manifest와 로그를 공개 web root에 복사하지 않는다. 새 candidate를 검증한 후 rename하며 기존 candidate는 덮어쓰지 않는다. symlink·ancestor symlink·hardlink·경로 이탈·특수 파일을 거부하고 파일 8 MiB/트리 32 MiB/512개 상한을 둔다.

각 HTML에 `connect-src 'self'` 등의 CSP meta를 넣는다. 외부 URL·credential·제3자 데이터/폰트/이미지 파일 형식·미검토 binary를 정적으로 차단한다. React/Next 오류 문서, XML namespace, MapLibre 법적 링크와 기존 URL-parser 시험 상수는 요청 endpoint와 구분한다. 기존 TypeScript parser로 JS 정규식 리터럴을 구분하되 인접한 외부 URL 문자열은 계속 거부한다. MapLibre 6.14.0의 기존 68-byte/1×1 이미지 해제 sentinel만 정확한 SHA로 허용한다. 이는 실제 지도·사진 payload가 아니다.

## 2. 생성·수정 파일

- `scripts/prepare-web-deploy.mjs`
- `tests/web-deploy.test.mjs`
- `docs/research/stage-10-web-deployment.md`

SDK·의존성·lockfile·Next 설정·배포 workflow·루트 tasks는 변경하지 않는다. 테스트 명령 연결과 전체 회귀는 통합 담당자가 처리한다.

## 3. 실행한 테스트와 결과

음성/경계 Node 회귀 **13/13 PASS**, scoped ESLint·소스 Prettier PASS다. 환경값 제거, `.env` 차단, CSP/제외 route 링크, escaped/protocol-relative/credential URL, 알려진 secret·binary·font, notice 폴더에 숨긴 HTML/JS, symlink/hardlink/path escape, 누락 라이선스, 이전 candidate 보존, 암묵적 원격/발행 모드 부재를 검증한다. 이 도구 회귀 성공은 기존 보안·타입·성능 게이트 성공이 아니다.

`pnpm install --offline --frozen-lockfile --ignore-scripts`는 645개 store 재사용/다운로드0으로 성공했다. 실제 SDK+Next export와 정적 candidate 검사를 실행했다. 첫 URL 검사는 glyph URL 검증 정규식을 실제 endpoint로 오인해 실패했고 parser 구분으로 수정했다. 첫 browser 실행은 Playwright 기본 cache가 없어 미실행 실패였으며, 이미 설치된 `/usr/bin/chromium`을 명시해 재실행했다. 독립 리뷰의 추가 실제 bundled 고지17개 누락을 보완하면서 murmurhash README의 MIT 표기 header mismatch도 실제 실패로 확인해 수정하고 회귀를 추가했다. 강화 scan의 1×1 engine sentinel 오탐은 해당 고정 SHA만 허용해 해결했다. 실패 candidate는 공개하지 않았고 ignored 실패 로그를 보존한다.

실제 Chromium 154.0.8037.57, 390×800에서 7개 허용 route 표시, root 마커 선택·카메라 줌·종료를 확인했다. 모든 실제 browser 요청을 loopback origin으로 제한했고 외부 요청0·pageerror0이었다. 실제 폰트는 OS local fallback이며 배포물에 글꼴을 넣지 않는다. 검증 산출물은 ignored worktree `artifacts/web-deploy/`에만 있다. 소스는 작업 중 `sourceDirty=true`로 표시하며 최종 clean 릴리스 증거로 사용하지 않는다.

## 4. 실화면 QA 결과

`smoke-390.png`를 직접 열어 합성 지형·마커·장소 팝업·경로·MIT 합성 출처 표시를 확인했다. 7개 route의 실제 canvas 표시를 검사했으며 이 검사는 기능 전체 E2E·모바일 실기기·다른 브라우저·부하/성능 수락을 대체하지 않는다. Android/iOS·공개 HTTPS·CDN·도메인·실제 호스팅은 이번 단계에서 미검증이다.

## 5. 라이선스·보안·비용

SDK MIT와 MapLibre BSD, Next/React 및 번들 의존성 고지를 구분한다. MapLibre main/worker의 실제 source map에서 node_modules package ID 17개를 확인하고 고정한 정확한 설치 버전·원문 LICENSE/License section을 별도 text notice에 포함한다. ID/버전이 바뀌거나 본문이 없으면 차단하며 manifest의 bundleLicenseInventory를 실제 notice SHA와 연결한다. 별도 LICENSE가 없는 murmurhash-js 1.0.0은 README의 `## License (MIT)` 이하 전체 본문을 보존한다. installed 원본 notice를 text-only 경로에 보존하며, active HTML/JS나 임의 notice 파일을 고지 예외로 숨기지 못하게 한다. 제3자 지도·사진·폰트·glyph·PBF·DB·사용자 기록을 추가하지 않는다. 정적 휴리스틱은 모든 개인정보·동적 URL 구성·권리를 증명하지 못하므로 CSP와 실제 browser 관측, 소스 출처 검토를 함께 사용한다.

Next 16.4.2의 [공식 polyfill package metadata](https://raw.githubusercontent.com/vercel/next.js/v16.4.2/packages/next-polyfill-nomodule/package.json)를 확인했다. vendored `whatwg-fetch`는 3.0.0이며 workspace의 3.6.20과 혼동하지 않는다. 2026-10-21 07:57 KST에 아래 공식 npm metadata/tarball을 수동 조회하고 registry SHA-512 SRI와 실제 archive를 일치시킨 뒤 LICENSE 본문만 ignored evidence에 추출했다. 도구는 이 다운로드를 자동 실행하지 않는다.

| 실제 polyfill | 공식 원본 | LICENSE SHA-256 |
| --- | --- | --- |
| core-js 3.38.1 | [npm 원본](https://registry.npmjs.org/core-js/3.38.1) | `51aff0fa92ac49e01ce6ba0fed992b0a34f8afe15203dd5f38c43f9e88b0167b` |
| object-assign 4.1.1 | [npm 원본](https://registry.npmjs.org/object-assign/4.1.1) | `6fb9754611c20f6649f68805e8c990e83261f29316e29de9e6cedae607b8634c` |
| whatwg-fetch 3.0.0 | [npm 원본](https://registry.npmjs.org/whatwg-fetch/3.0.0) | `05a4adff1d99954f18ed2ef89d47b4567cdba599635ddbe9393a95b9d48b2643` |

원본 archive·조회 metadata는 SDK/npm/site에 포함하지 않고 본문 notice와 버전·원본 URL·SRI·archive/본문 SHA provenance만 candidate에 기록한다. Next metadata SHA는 `f219fb23c2d3365c1a90db1d169a59247786044addb100e42fda4482e1d55b9e`다. 법적 고지 수집을 APK/IPA·모든 배포 binary의 최종 라이선스 감사로 확대하지 않는다.

새 기본 API·공유 키·제작자 backend·유료 계정·상시 작업·배포 action은 없다. 외부 배포는 실행하지 않았다. 정적 호스팅도 대역폭·저장·도메인 비용/무료 한도가 있을 수 있고 이를 선택한 운영자의 책임이다. 로컬 외부요청0을 영구 무과금 보증으로 표현하지 않는다.

## 6. 남은 작업·차단 요인 및 재현

Node24.19.0/pnpm12.14.0 및 frozen dependencies를 준비한다. 기본 SDK 빌드는 이 선택형 배포 도구나 라이선스 evidence·브라우저를 필요로 하지 않는다. 배포물 준비에는 위 검토된 notice 자료를 운영자가 먼저 확보해야 한다.

`artifacts/web-deploy-license-evidence/`에 `next-polyfill-package.json`, 세 `{name}-{version}-LICENSE.txt`, `licenses.json`을 둔다. 각 npm metadata의 `dist.tarball`을 받아 `dist.integrity`와 SHA-512를 확인하고 archive의 `package/LICENSE`(`object-assign`만 `package/license`)만 추출한다. `licenses.json`은 `schemaVersion:1`, `packages` 3개이며 이름/버전/`licenseFile`/`licenseSha256`/`sourceUrl`/`tarballUrl`/`integrity`/`tarballSha256`를 기록한다. 위 metadata·본문 SHA·공식 exact-version 경로를 만족하지 않으면 prepare는 build 전에 차단된다. 계정·API 키·인증 토큰은 필요 없다.

```sh
pnpm exec node scripts/prepare-web-deploy.mjs prepare
node scripts/prepare-web-deploy.mjs verify --directory=<절대_candidate_경로>
node scripts/prepare-web-deploy.mjs smoke --directory=<절대_candidate_경로>
```

`prepare --smoke`는 두 단계를 함께 실행한다. browser는 운영자가 사전에 Playwright Chromium을 설치하거나 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`로 이미 설치된 Chromium을 지정해야 한다. 도구가 browser를 다운로드하지 않는다. 최초 의존성/브라우저/고지 확보에는 공개 네트워크가 필요할 수 있으며 SDK 기본 지도 실행 비용과 별개다.

배포 대상은 **origin root `/`에서 정적 파일을 제공**해야 한다. 현재 worker/Next asset 경로가 absolute이므로 GitHub Pages의 repository subpath 등에서 그대로 작동한다고 주장하지 않는다. subpath 지원은 별도 설정·회귀가 필요하다. `site/` 전체와 고지 파일을 함께 제공하고 HTTPS·올바른 MIME·CSP·`X-Content-Type-Options:nosniff`를 호스팅에 설정해야 한다. 실제 업로드·도메인·쿼터·비용 정책은 대상이 지정되면 기존 승인 범위 안에서 검증한다.

기존 dependency 감사 high2, 독립 소비 선언·성능·전체 플랫폼 수락 및 발행 권한/승인 게이트는 이 도구로 해제하지 않는다. 이 단계의 source merge와 외부 배포는 다른 작업이다.

## 7. Git 브랜치·커밋

`chore/stage-10-web-deploy-artifact`, 기준 `5f5c58ff7dcd92957500f87a62929c97276f42cc`다. 작업자는 stage·commit·push·원격 설정 변경을 하지 않았다. 최종 commit/PR/main 통합은 루트 검증과 보고에서 별도로 식별한다.

## 8. 다음 단계 진행 가능 여부

로컬 정적 candidate의 통합 검토를 진행할 수 있다. 결과는 `VERIFIED_LOCAL_ONLY`, `publicationAuthorized=false`, `releaseBlocked=true`이며 실제 배포·npm/GitHub 릴리스 준비 완료가 아니다.

## 루트 통합 검증

최종 루트 `pnpm check`와 신규13회귀를 통과했다. 동일 동결 도구를 현재 소스에서 실행해 109파일/3,054,947B,31notice와 실제 Chromium7route·선택·줌·종료 PASS 및 외부요청0/pageerror0을 확인했다. 이 검사는 sourceDirty=true인 통합 검토본이다. 기존보안·전체선언·성능 차단을 유지하며 main 반영 뒤 clean SHA 배포물을 다시 생성해 실제 SHA를 최종 보고한다.
