# 10단계 중 01 — 보안 재검증과 CI 격리

확인일: **2026-10-21 07:13 KST** / 2026-10-20 22:13 UTC. 조사 기준 소스는 `259d75e116a2de456f546c736014d50197774a4d`다. 새 공식 조회와 실제 audit를 수행했으며, 이전 확인 결과를 현재 결과로 재사용하지 않았다.

## 1. 구현 완료 기능

일반 CI에서 알려진 Web NodeNext 오류가 Linux job을 중단시켜 뒤의 Native 소비·Web E2E·PostGIS·routing 검사가 실행되지 않는 구조를 수정했다. Linux 기능 job은 기존 Web/geo/routing 검사를 유지하고, Web·Native 독립 소비 검증을 각각 자체 Ubuntu job으로 분리했다. 각 소비 job이 frozen install·SDK 빌드·실제 5개 pack을 준비하고 기존 verifier를 실행한다.

새 job은 다른 job의 성공을 기다리는 `needs`나 실행 조건, `continue-on-error`를 사용하지 않는다. 두 소비 verifier와 기존 독립 `Dependency audit`의 실제 실패는 모두 그대로 실패로 남는다. 기존 명령을 제거하지 않았으며 npm 발행 workflow도 변경하지 않았다. 이 수정은 CI에서 각 검사 결과를 관찰할 수 있도록 한 개선이다. 취약점 자체를 해결하거나 security gate를 통과한 것은 아니다.

## 2. 생성·수정 파일

- `.github/workflows/ci.yml`: Web·Native 독립 소비 job, Linux 기능 검사와의 실행 격리.
- `tests/release.test.mjs`: 실행 격리·자체 pack 준비·기능 검사 보존을 검증하고 `needs`·조건부 skip·실패 무시·준비 누락을 거부하는 회귀.
- 이 검증 문서. SDK runtime·package version·lockfile·설치 훅·발행 조건은 변경하지 않았다.

조회 원문과 실행 로그는 ignored `artifacts/ten-stages/stage01/`에만 저장했다. `official-metadata.json`, `audit.json`, `audit-gate.log`, `why.log`, 명령별 `*-execution.json`, `investigation-summary.json`이 근거다. 외부 registry/advisory를 SDK runtime의 기본 요청 경로로 추가하지 않는다.

## 3. 실행한 테스트와 결과

| 검사 | 실제 결과 |
| --- | --- |
| `pnpm audit --json` | **FAIL / exit 1**, high 2 / critical 0 |
| `pnpm audit --audit-level=high` | **FAIL / exit 1**, 두 기존 advisory 유지 |
| `pnpm why --recursive node-forge braces` | PASS / exit 0, 전체 workspace 경로 확인 |
| `pnpm test:release` | PASS, release·선언 helper 합계 14개; 격리 정책의 정상/실패 fixture 포함 |

CI YAML·테스트의 포맷·ESLint·정적 비용 정책 검사를 통과했다. 루트 통합 `pnpm check`도 통과했다(Vitest181, release14, Next production·Expo 양OS JS와 정책 검사 포함). 새 원격 job 실행은 해당 PR/main CI로 별도 보고하며, 로컬 정책 테스트를 원격 GitHub 실행 성공으로 확대하지 않는다. 실제 소비 verifier가 이번 수정으로 통과했다고 주장하지 않는다.

## 4. 실화면 QA 결과

CI와 검사 정책만 변경했다. 지도 renderer·데이터·UI는 수정하지 않았고 실화면 QA를 재실행하지 않았다. 기존 Web 및 Native의 통과/실패·미검증 범위는 [최신 clone 기록](clone-validation.md)을 유지한다.

## 5. 라이선스 및 보안 문제

기존 두 취약점은 **미해결**이다. 아래는 이번 공식 재조회 시점의 관측이며 이후 릴리스까지 예측하지 않는다.

| 공식 원본 | 이번 관측 |
| --- | --- |
| [node-forge registry](https://registry.npmjs.org/node-forge) / [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | 설치/latest 1.4.0, 취약 <=1.4.0, `first_patched_version=null` / npm `patched_versions=null` |
| [braces registry](https://registry.npmjs.org/braces) / [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | 설치/latest 3.0.3, 취약 <=3.0.3, `first_patched_version=null` / npm `patched_versions=null` |
| [Expo registry](https://registry.npmjs.org/expo) / [CLI registry](https://registry.npmjs.org/@expo/cli) | latest Expo 58.0.16 → CLI ^58.1.13가 node-forge ^1.4.0과 signing certificates ^0.0.7을 유지 |
| [signing certificates registry](https://registry.npmjs.org/@expo/code-signing-certificates) | latest 0.0.7 → node-forge ^1.4.0 |
| [React Native registry](https://registry.npmjs.org/react-native) / [공식 stable release](https://github.com/react/react-native/releases/tag/v0.88.0) | latest/stable 0.88.0으로 설치 버전과 동일 |
| [Metro](https://registry.npmjs.org/metro) / [file-map](https://registry.npmjs.org/metro-file-map) / [micromatch](https://registry.npmjs.org/micromatch) | latest 0.87.1 / 0.87.1 / 4.0.8, micromatch → braces ^3.0.3 경로 유지 |

두 GitHub advisory는 철회되지 않았고 마지막 갱신은 각각 2026-10-01 / 2026-10-02다. node-forge 1.4.0의 registry 공개 시각은 2026-03-24 21:44 UTC, braces 3.0.3은 2024-05-21 08:59 UTC다. Expo 58.0.16은 2026-10-19 14:28 UTC, CLI 58.1.13은 같은 날 14:38 UTC, RN 0.88.0은 2026-10-15 14:08 UTC 공개됐다. 공식 [Expo 58.0.16 bundledNativeModules](https://raw.githubusercontent.com/expo/expo/expo%4058.0.16/packages/expo/bundledNativeModules.json)는 React 19.3.0 / RN 0.88.0을 명시한다. 이 지원 조합의 상위 최신 버전도 취약 경로를 없애지 못한다.

실제 설치 경로는 `expo@58.0.14 → @expo/cli@58.1.11 → node-forge@1.4.0` 및 CLI의 signing certificates 경로, `react-native@0.88.0 → CLI plugin@0.88.0 → metro@0.87.1 → metro-file-map@0.87.1 → micromatch@4.0.8 → braces@3.0.3`이다. Expo Metro 경로도 동일 braces를 사용한다. audit는 forge 28개, braces 101개 경로를 반환했으며 별도 `why` 원문을 보존했다.

지원되는 안전한 dependency upgrade 후보를 확인하지 못해 버전 변경이나 install을 수행하지 않았다. advisory ignore·감사 축소·Native 제거·강제 patch/override로 통과시키지 않는다. 직접 작성 MIT 코드/정책 변경이며 제3자 payload·기본 Provider·API 키·유료 runner·cache·artifact upload·deploy를 추가하지 않았다. 표준 Ubuntu job 실행량은 늘어나지만 계정 전체 과금 상태를 코드로 보증하지 않는다.

## 6. 남은 작업 또는 차단 요인

공식 수정 릴리스나 지원되는 안전한 대체 그래프를 확인한 뒤 exact pin·lock 갱신·전체 audit·독립 소비·기능 회귀가 필요하다. Web TS2834와 RN 상위 선언 오류도 별도 해결 대상이며 이번 CI 분리가 오류를 해결하지 않는다. GitHub에서 각 새 job이 실제로 독립 실행하고 자체 nonzero exit를 유지하는지는 해당 PR/main CI로 확인해야 한다. 브랜치 보호의 필수 상태 설정은 관리자 권한으로 별도 검증한다.

## 7. Git 브랜치와 커밋

브랜치: `fix/stage-01-security-review`. 기준 커밋은 위에 기록했다. 에이전트는 스테이징·커밋·push·PR·병합을 수행하지 않았다. 통합 후 단계 커밋은 `git log -1 --format='%H %s' --grep='^ci: isolate consumer declaration gates$'` 등 루트가 확정한 실제 커밋 메시지로 식별하고, 최종 보고에 정확한 SHA와 원격 결과를 기록한다.

## 8. 다음 단계 진행 가능 여부

CI 격리 수정의 검증과 후속 타입·기능 작업은 진행 가능하다. **단계 01의 취약점 해소 및 보안 수락은 BLOCKED**다. 수정 게이트와 알려진 실패를 모두 유지한 source preview 통합과 npm/Release/운영 배포 승인은 구분한다.
