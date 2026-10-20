# 보안 의존성 재조사와 릴리스 게이트 보강

확인일: **2026-10-20 KST (UTC+09:00)**. 대상은 5개 SDK, Web/Expo 예제와 운영자 서비스를 포함한 전체 pnpm workspace다. 이번 변경은 로컬 준비이며 공개 업로드·병합·npm 발행을 수행하지 않는다.

## 현재 판정

**보안 의존성 게이트 차단 유지.** 공식 registry와 GitHub advisory를 새로 조회하고 `pnpm why -r node-forge braces`, `pnpm audit --json`, `pnpm audit:dependencies`를 실행했다. audit 두 명령은 exit 1이며 high 2, critical 0이다. `pnpm check`의 기능 검사 성공과 이 보안 실패를 구분한다.

| 패키지 | 설치 / 공식 latest | 공식 advisory | 취약 범위 | 최초 수정 버전 |
| --- | --- | --- | --- | --- |
| node-forge | 1.4.0 / 1.4.0 | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | <= 1.4.0 | null |
| braces | 3.0.3 / 3.0.3 | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | <= 3.0.3 | null |

두 advisory는 high이며 withdrawn_at=null이다. GitHub advisory API의 `first_patched_version`과 npm audit의 `patched_versions`가 모두 null임을 확인했다. 이는 이후 패치가 나오지 않는다는 예측이 아니라 이 확인 시점의 결과다.

## 실제 의존성 경로와 대안 검토

`pnpm why -r node-forge braces`에서 다음 경로를 확인했다. Expo와 React Native는 Native SDK 개발 의존성 및 Expo 소비 예제에서 사용한다. 이 경로를 개발 도구라는 이유로 감사에서 제외하지 않는다.

- `expo@58.0.14 → @expo/cli@58.1.11 → node-forge@1.4.0`
- `expo@58.0.14 → @expo/cli@58.1.11 → @expo/code-signing-certificates@0.0.7 → node-forge@1.4.0`
- `react-native@0.88.0 → @react-native/community-cli-plugin@0.88.0 → metro@0.87.1 → metro-file-map@0.87.1 → micromatch@4.0.8 → braces@3.0.3`
- Expo의 `@expo/metro@58.0.0`에도 동일 Metro 파일 매핑 경로가 있다.

수정 버전과 공식 상위 패키지의 현재 의존성 요구를 아래 원본에서 함께 확인했다. 조회는 공개 metadata 읽기이며 설치·버전 해석·lockfile 변경은 수행하지 않았다.

| 공식 원본 | 확인한 결과 | 보안 수정으로 적용 가능한지 |
| --- | --- | --- |
| [node-forge registry](https://registry.npmjs.org/node-forge) | latest 1.4.0 | 현재 advisory 범위에 포함 |
| [braces registry](https://registry.npmjs.org/braces) | latest 3.0.3 | 현재 advisory 범위에 포함 |
| [Expo registry](https://registry.npmjs.org/expo) | latest 58.0.16, CLI ^58.1.13 요구 | 아래 CLI에서 취약 의존성이 유지됨 |
| [Expo CLI registry](https://registry.npmjs.org/@expo/cli) | latest 58.1.13, node-forge ^1.4.0 및 code-signing-certificates ^0.0.7 요구 | 두 node-forge 경로가 유지됨 |
| [Expo signing certificates registry](https://registry.npmjs.org/@expo/code-signing-certificates) | latest 0.0.7, node-forge ^1.4.0 요구 | 안전한 대체 버전 확인 안 됨 |
| [React Native registry](https://registry.npmjs.org/react-native) | latest 0.88.0 | 현재 사용 버전과 같음 |
| [Metro registry](https://registry.npmjs.org/metro) | latest 0.87.1, metro-file-map 0.87.1 요구 | 취약 하위 경로 유지 |
| [Metro file map registry](https://registry.npmjs.org/metro-file-map) | latest 0.87.1, micromatch ^4.0.4 요구 | 취약 하위 경로 유지 |
| [micromatch registry](https://registry.npmjs.org/micromatch) | latest 4.0.8, braces ^3.0.3 요구 | 안전한 braces 대체 버전 확인 안 됨 |
| [MapLibre RN registry](https://registry.npmjs.org/@maplibre/maplibre-react-native) | latest 11.5.0, Expo >=54 / RN >=0.80 / React >=19.1 peer | peer 범위만으로 패치·실기기 호환성을 입증하지 못함 |

따라서 Expo 58.0.16/CLI 58.1.13으로 올리는 것만으로 high 2건이 해소되지 않는다. 이번 보안 작업에서는 manifest·lockfile·override·patch를 변경하지 않았다. 이전 취약 버전으로 내리거나 Native workspace를 제거하거나 `--prod`, advisory ignore, `--ignore-registry-errors`, 임의 override로 통과시키지 않는다. 지원되는 안전한 수정 그래프가 확인될 때 별도 브랜치에서 정확한 버전·공식 호환성·라이선스와 Web/Android/iOS 회귀를 검증한다. 패치가 없으면 차단을 유지하며 다른 준비를 진행한다.

## 자동화 변경

- 일반 CI에 독립 `dependency-audit` job과 표시 이름 `Dependency audit`를 추가했다. 다른 기능 job의 성공을 기다리지 않고 frozen install 뒤 전체 workspace의 `pnpm audit:dependencies`를 실행한다. 현재 root script의 `pnpm audit --audit-level=high`는 high/critical 또는 registry 오류에 실패한다. continue-on-error와 오류 무시는 없다.
- Linux 기능 job에도 `pnpm verify:native-consumer`를 추가해 실제 core/native/styles tarball의 지원 모드 앱 타입·plugin·양 OS JS export를 재검증한다. 이 verifier는 `skipLibCheck:false`의 별도 실패를 PARTIAL_PASS로 기록하며 기기/바이너리 통과를 대체하지 않는다.
- job 추가는 GitHub branch protection의 필수 상태 설정을 대신하지 않는다. `Dependency audit`를 필수 검사로 지정하고 실제 실패 상태가 병합을 차단하는지는 승인된 원격 설정/CI 단계에서 별도로 확인해야 한다. 이 job은 현재 high 2건 때문에 실패할 것으로 예상한다.
- npm 발행 workflow는 main에서의 수동 실행, 기존 명시적 활성 변수·정확한 승인 커밋·보호 환경을 모두 요구한다. 의존성 설치 전에 승인 입력의 40자리 SHA 형식과 해당 커밋이 origin/main에 통합되었는지 검사한다. 전체 감사 뒤 기능 검사, staged 데이터 검사, 실제 tarball 검사, Noto CJK/font 검사와 전체 `pnpm test:web`, 격리 Web 소비 앱 및 독립 Native tarball 소비 검증을 수행한 뒤 release manifest를 생성·검증한다. 실패 단계 뒤에는 발행을 수행하지 않는다.
- `release:verify`는 manifest가 선택한 파일을 읽기 **전에** 패키지 이름·버전·정확한 tarball basename을 검증한다. 경로 순회·절대 경로·다른 패키지 경로를 거부하고, 소스 커밋은 정확한 40자리 소문자 Git SHA를 요구한다. 기존 5개 패키지와 체크섬 검증을 유지한다.

## 검증 범위와 남은 작업

`node --test tests/release.test.mjs` 6개, 수정한 두 JavaScript 파일의 ESLint 및 4개 코드/YAML 파일의 Prettier 검사, 두 workflow의 YAML 파싱은 통과했다. 릴리스 단위 검사는 아티팩트 변조/경로 순회/잘못된 커밋, 독립 감사 job의 오류 무시 방지, 전체 Web QA가 발행보다 먼저 실행되는 구성을 검증한다. 이 테스트와 YAML/정적 검사는 실제 GitHub environment, npm OIDC 또는 실제 발행 성공의 증거가 아니다.

새 원격 CI/보호 환경/계정 설정과 실제 npm 발행은 아직 실행하지 않는다. Android 실기기·iOS 환경, Native 소비 앱 및 glyph/PMTiles 검증과 APK/IPA notice inventory도 이 변경으로 통과하지 않는다. 보안 수정 버전이나 검증된 안전한 대체 그래프가 없는 한 전체 공개 발행 판정은 계속 차단이다.
