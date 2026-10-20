# Step 1 보안 및 공개 타입 검증

확인일: 2026-10-20 19:46–19:47 KST (10:46–10:47 UTC). 조사 기준 커밋: `3cb1a37d9b2bebcd66586c614f681ded7aaeb116`.

## 보안 결과: BLOCKED

현재 전체 workspace의 `pnpm audit --json`은 **exit 1, high 2, critical 0**이다. 두 취약 패키지의 설치 버전과 공식 npm `latest`가 같고, GitHub Advisory와 npm audit 모두 공개 수정 버전을 제시하지 않는다. 지원되는 상위 패키지 업그레이드로 이 두 경로를 제거할 후보도 확인하지 못했다. 이번 조사로 보안 게이트를 완료 처리하지 않는다.

| 패키지 | 설치 / 공식 latest | 취약 범위 | 공개 수정 버전 | 공식 권고 |
| --- | --- | --- | --- | --- |
| node-forge | 1.4.0 / 1.4.0 | <=1.4.0 | GitHub `first_patched_version=null`, npm `patched_versions=null` | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) |
| braces | 3.0.3 / 3.0.3 | <=3.0.3 | GitHub `first_patched_version=null`, npm `patched_versions=null` | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) |

GitHub 권고의 마지막 갱신일은 각각 2026-10-01, 2026-10-02이고 철회되지 않았다. node-forge 권고는 RSA PKCS#1 v1.5 서명 검증, braces 권고는 과도하게 중첩된 glob 패턴의 stack exhaustion을 다룬다. 공개 수정 버전 부재는 이 확인 시점의 관측이며 이후 릴리스까지 예측하는 표현이 아니다.

공식 registry의 공개 시각(UTC)은 node-forge 1.4.0이 `2026-03-24T21:44:34.668Z`, braces 3.0.3이 `2024-05-21T08:59:11.390Z`다. 상위 최신 릴리스는 React Native 0.88.0 `2026-10-15T14:08:56.115Z`, Expo 58.0.16 `2026-10-19T14:28:59.230Z`, Expo CLI 58.1.13 `2026-10-19T14:38:17.541Z`로 확인했다. 이 안정 릴리스들도 아래 취약 경로를 유지한다.

## 실제 의존 경로와 지원 버전 조사

`pnpm why --recursive node-forge braces`와 현재 lockfile에서 다음 경로를 확인했다. Native 패키지 개발 의존성과 Expo 예제를 포함한 실제 workspace 그래프다.

```text
expo@58.0.14
  → @expo/cli@58.1.11 → node-forge@1.4.0
  → @expo/cli@58.1.11 → @expo/code-signing-certificates@0.0.7 → node-forge@1.4.0

react-native@0.88.0
  → @react-native/community-cli-plugin@0.88.0
  → metro@0.87.1 → metro-file-map@0.87.1
  → micromatch@4.0.8 → braces@3.0.3

expo@58.0.14 → @expo/metro@58.0.0 → metro-file-map@0.87.1
  → micromatch@4.0.8 → braces@3.0.3
```

설치 소스에서도 Expo CLI의 iOS code-signing `Security.js` 및 Expo signing certificates가 node-forge를 import하고, Metro file-map watcher가 micromatch를 호출한다. 개발 도구 경로라는 이유로 감사 범위를 축소하지 않는다. 패키지 그래프와 코드 참조 확인은 악용 가능성의 실환경 검증이나 취약성 부재의 증거가 아니다.

| 공식 npm 원본 | 새로 확인한 안정 버전 / 의존 조건 | 판단 |
| --- | --- | --- |
| [node-forge](https://registry.npmjs.org/node-forge) | latest 1.4.0, 다른 배포 태그 없음 | 설치 버전이 취약 범위의 최신 공개 버전 |
| [braces](https://registry.npmjs.org/braces) | latest 3.0.3, 다른 배포 태그 없음 | 설치 버전이 취약 범위의 최신 공개 버전 |
| [Expo](https://registry.npmjs.org/expo) | latest 58.0.16 → CLI ^58.1.13, @expo/metro ~58.0.0 | 패치 업그레이드만으로 취약 경로가 제거되지 않음 |
| [Expo CLI](https://registry.npmjs.org/@expo/cli) | latest 58.1.13 → forge ^1.4.0, signing certificates ^0.0.7 | node-forge 두 경로 유지 |
| [Expo signing certificates](https://registry.npmjs.org/@expo/code-signing-certificates) | latest 0.0.7 → forge ^1.4.0 | 수정 대체 버전 확인 안 됨 |
| [React Native](https://registry.npmjs.org/react-native) | latest 0.88.0 → CLI plugin 0.88.0 | 설치 버전과 동일 |
| [RN CLI plugin](https://registry.npmjs.org/@react-native/community-cli-plugin) | latest 0.88.0 → Metro ^0.87.1 | 설치 버전과 동일 |
| [Metro](https://registry.npmjs.org/metro) | latest 0.87.1 → file-map 0.87.1 | 설치 버전과 동일 |
| [Metro file-map](https://registry.npmjs.org/metro-file-map) | latest 0.87.1 → micromatch ^4.0.4 | 현재 micromatch 4.0.8 경로 유지 |
| [micromatch](https://registry.npmjs.org/micromatch) | latest 4.0.8 → braces ^3.0.3 | 수정 대체 버전 확인 안 됨 |

[Expo 58.0.16 공식 bundledNativeModules](https://raw.githubusercontent.com/expo/expo/expo%4058.0.16/packages/expo/bundledNativeModules.json)는 React Native 0.88.0과 React 19.3.0을 명시한다. Native 담당자와 이 지원 조합을 교차 확인했다. React Native nightly나 Expo canary는 현재 안정 SDK의 안전한 대체 버전으로 채택하지 않는다. 같은 취약 경로를 유지하는 Expo 패치 업그레이드는 보안 해결로 간주하지 않으며, 이번 보안 작업에서는 install이나 manifest·lockfile 변경을 수행하지 않았다.

## 유지하는 게이트와 다음 조치

전체 5개 패키지와 Web/Android/iOS 목표를 유지한다. advisory ignore, `--prod` 감사로의 축소, `continue-on-error`, `--ignore-registry-errors`, 임의 override·node_modules 수정·Native 제거로 통과시키지 않는다. 기존 CI의 독립 `Dependency audit` 및 npm 발행 전 `pnpm audit:dependencies`는 그대로 실패해야 한다. 기능·타입 검사 성공은 이 보안 실패를 대체하지 않는다.

공식 수정 릴리스가 확인되면 해당 패키지를 소유하는 Expo/RN/Metro의 지원 경로부터 검토한다. 정확한 버전과 공식 호환성을 확인하고 Native 담당자와 그래프를 합의한 뒤 frozen install 재현성, 전체 audit, strict 공개 타입·Web·Android·iOS 회귀를 실행한다. 수정 릴리스가 없으면 이 보안 항목은 차단 상태로 두고 독립적인 타입·성능 작업을 진행한다.

## 재현과 검증 범위

```sh
pnpm audit --json
pnpm audit:dependencies
pnpm why --recursive node-forge braces
pnpm view node-forge dist-tags --json
pnpm view braces dist-tags --json
pnpm view expo@58.0.16 dependencies --json
pnpm view @expo/cli@58.1.13 dependencies --json
pnpm view react-native@0.88.0 dependencies --json
pnpm view metro-file-map@0.87.1 dependencies --json
pnpm view micromatch@4.0.8 dependencies --json
```

이번 실행: `pnpm audit --json`과 `pnpm audit:dependencies` 모두 exit 1 및 전체 `why` 경로 확인, 공식 registry 10개와 권고 2개 재조회, 공식 Expo 지원 조합 확인. 문서 Prettier 검사와 `git diff --check`는 통과했다. 공개 metadata 조회 이외 외부 쓰기·다운로드 설치·계정 연결은 없다. 의존성 그래프 변경이 없어 SDK 빌드·실화면 QA를 보안 조사 목적으로 반복하지 않았다. 공개 타입 및 소비 앱의 독립 검증 결과는 해당 Step 1 코드 변경 검증과 구분해 기록한다.

## 공개 선언 검증 도구 수정

`verify:packages`는 기존에 Web NodeNext 선언 오류를 보고해도 지원 Bundler 검사 성공 뒤 exit 0으로 끝났다. 이 동작을 고쳐, 재현 빌드·독립 설치·지원 Bundler 타입·DOM 없는 core NodeNext·SSR import·브라우저 결과를 모두 보고서에 보존하고 별도 Web NodeNext가 통과하지 않으면 **`PARTIAL_PASS`, `blocked=true`, nonzero exit**로 끝낸다. `PARTIAL_PASS`는 발행 게이트 성공이 아니다. 보고서 schema 2는 실제 검증 코드의 `sourceCommit`과 `sourceDirty`도 기록한다.

새 `scripts/declaration-probe.mjs`는 정상 완료한 compiler exit 0만 허용한다. 실제 compiler 오류는 `FAIL`, timeout·signal 종료·실행 실패·미실행은 `NOT_RUN`으로 구분한다. stdout과 stderr 양쪽의 TypeScript 진단을 모으고 ANSI·작업 경로를 정규화한다. Native verifier도 같은 helper를 재사용한다. 지원 Bundler 검사와 upstream 선언 검사는 별도 결과를 유지하며 `skipLibCheck`·shim·node_modules 패치로 공개 선언 검사를 우회하지 않는다.

`pnpm test:release`에 새 helper 회귀 검사를 연결했다. compiler exit 2, stderr 진단, 미실행, 실제 child timeout·실행 파일 부재, signal 상태, 정상 완료를 포함한다. 실제 Node gate 프로세스가 probe summary 출력 후 실패/미완료에서는 exit 1, 정상 완료에서는 exit 0임을 확인한다. 기존 발행 통제 검사와 합계 **12/12 통과**했고 Native 회귀 **6/6**도 통과했다. report 쓰기가 실패해도 소비 앱·브라우저·서버 정리를 시도하도록 finally를 보호했다. 도구 회귀 성공은 실제 공개 선언이나 보안 high 2건의 해결을 의미하지 않는다.

실제 `pnpm verify:packages`는 **exit 1 / PARTIAL_PASS / blocked=true**를 확인했다. SDK5개 clean rebuild가 기존 tarball과 byte 동일하고, 격리 설치·Bundler strict/skipLibCheck:false·DOM 없는 core NodeNext·SSR import·Chromium 표시/선택/종료는 PASS, 외부 브라우저 요청0이다. Web NodeNext만 두 upstream 선언의 TS2834로 정상 compiler exit2/FAIL이다. 지원 경로의 성공을 모두 보존하면서 전체 명령은 실패한다. ignored `artifacts/security-types/web-consumer.log`, `artifacts/qa/packages.json`에 근거를 남겼다.

실제 Native 독립 tarball도 **exit 1 / PARTIAL_PASS / releaseBlocked=true**다. offline 설치·strict 앱/API·config plugin·Android/iOS JS export PASS를 보존했고, 전체 선언은 TS2411/TS2344/TS2416 및 정상 compiler exit2/FAIL이다. 2026-10-20 10:52:29–10:52:34 UTC(19:52:29–19:52:34 KST)에 정확한 pnpm12.14.0 CLI로 실행했다. 앞선 engine 불일치 시도는 verifier 실행 전 실패로 별도 기록했으며 성공으로 포함하지 않았다. report는 ignored `artifacts/qa/native-consumer.json`이다. APK/IPA·기기·OS 네트워크 검사로 확대하지 않는다.

전체 `pnpm check`는 통과했지만 이 명령은 독립 소비·보안 수락 전체를 포함하지 않는다. 변경된 검증 명령이 실패를 정확히 전달하는 수정만 완료이며, 보안·공개 타입 해결과 단계 전체 수락은 **BLOCKED**다. 사용자는 두 단계의 커밋·PR·main 병합을 승인했지만, 실패한 감사/선언 검사를 우회하거나 발행을 승인한 것은 아니다. 원격 main에는 정책 문서만 있어 첫 통합 PR은 기존 검증된 SDK 기반도 포함한다. 검증 실패 상태에서는 main 병합하지 않는다.

## MapLibre GL JS 6.15.0 실제 선언 조사

2026-10-20 10:52–10:53 UTC에 [공식 npm 6.15.0 metadata](https://registry.npmjs.org/maplibre-gl/6.15.0)와 실제 tarball을 조회했다. tarball 6,166,111 bytes의 SHA-512가 registry `dist.integrity`와 일치함을 확인하고, ignored `artifacts/research/security-types`에만 저장했다. 설치·manifest/lock 변경·lifecycle script 실행은 없다.

실제 `dist/maplibre-gl.d.ts`는 746,446 bytes이며 3행에서 `@maplibre/geojson-vt`, 5행에서 `@maplibre/vt-pbf`를 여전히 외부 import한다. 두 의존성의 공식 최신은 각각 [6.3.0](https://registry.npmjs.org/@maplibre/geojson-vt), [4.3.2](https://registry.npmjs.org/@maplibre/vt-pbf)로 현재 설치와 같다. 실제 의존 선언의 확장자 없는 상대 import가 유지된다.

6.15.0의 실제 선언을 현재 검토된 의존 그래프에 연결한 별도 무설치 probe에서 TypeScript 6.0.3, strict, NodeNext, `skipLibCheck:false`, 공식 geojson 타입을 사용했다. compiler는 **exit 2 / TS2834**를 두 의존성의 `dist/index.d.ts`에서 반환했다. 원본 선언·설치 의존성·타입 검사를 수정하지 않았다. 증거는 ignored `artifacts/research/security-types/maplibre-6.15.0-probe.json`이다. 이는 실제 6.15.0 전체 설치/플랫폼 호환성 검증과 구분되는 선언 조사이며, 단순 metadata 비교보다 직접적인 upstream 제약 증거다. 6.15.0 업그레이드만으로 현재 Web NodeNext blocker를 해결한다는 근거는 확인하지 못했다.
