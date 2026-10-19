# 모노레포 도구 선택과 검증 근거

확인일: 2026-10-19. 공식 npm package metadata와 공식 문서를 조회하고 실제 설치했다. 원본 설계의 [후보 snapshot](dependency-snapshot.json)은 당시 관찰로 보존하고, 이번 선택은 [toolchain snapshot](toolchain-snapshot.json)과 root/package별 manifest 및 lockfile을 기준으로 한다.

| 구성 | 고정 버전 | 선택 근거 |
| --- | --- | --- |
| Node / pnpm | 24.19.0 / 12.14.0 | 환경 Node24, Expo/Vitest/Changesets engine 공통 범위; pnpm workspace protocol |
| TypeScript | 6.0.3 | latest 7.0.2 대신 typescript-eslint의 `>=4.8.4 <6.1.0` 지원 범위 |
| ESLint / @eslint/js / typescript-eslint | 10.13.0 / 10.0.1 / 8.71.2 | flat config와 명시된 peer 범위 |
| Prettier / Vitest / Vite | 3.9.10 / 5.0.5 / 8.3.4 | Node24 지원, Vitest peer Vite8 충족 |
| Changesets | 3.0.3 | pnpm 모노레포와 fixed SDK group; 발행 자동화 없음 |
| Next / React / React DOM | 16.4.2 / 19.3.0 / 19.3.0 | Next peer 충족; Expo와 React 단일 조합 |
| Expo / React Native | 58.0.14 / 0.88.0 | Expo tarball bundledNativeModules.json의 RN0.88/React19.3.0 조합 |
| MapLibre GL JS / RN | 6.14.0 / 11.5.0 | GL JS latest6.15.0은 24시간 maturity 미충족으로 이전 stable; RN은 Expo58/RN0.88 peer 범위 충족 |
| style-spec / Playwright | 26.4.4 / 1.64.1 | 동일 style validator, 로컬 Chromium 실화면 QA |
| Node/React/React DOM/GeoJSON types | 24.19.2 / 19.3.0 / 19.3.0 / 7946.0.16 | runtime major와 공식 peer에 정렬 |

설치 lifecycle script는 workspace `ignoreScripts: true`로 전부 비활성화한다. 이 조합의 TypeScript·Next SWC·Metro·Vitest 빌드는 script 없이 설치된 플랫폼별 배포물로 실행됐다. 이후 script가 필요한 도구를 추가할 때는 명시적인 감사와 좁은 승인 절차를 별도 설계해야 한다. packageManager 자체의 설치도 `--ignore-scripts`를 사용한다. 24시간 신규 버전 유예와 exact lockfile을 적용했다.

`xcode>uuid`만 11.1.1로 고정 override했다. xcode3.0.1은 `require('uuid').v4()`만 사용하며 uuid11의 CommonJS API가 이를 제공한다. GHSA-w5hq-g745-h8pq가 해결되는 버전으로 확인했다. export와 별개로 해당 xcode ID 생성 smoke도 실행하며 실제 iOS 프로젝트 생성/컴파일은 후속 검증이다.

`pnpm audit`는 node-forge1.4.0, braces3.0.3의 high 2건을 반환했다. 조회 당시 registry에 수정 버전이 없어 suppression으로 통과 처리하지 않는다. Expo/Metro 도구 경로의 취약점으로 현재 로컬 합성 예제 사용과 제품 출시 gate를 구분하며, 자세한 잔여 위험은 [비용 감사](../cost-audit.md)를 따른다.

공식 근거:

- [pnpm workspace](https://pnpm.io/workspaces), [pnpm 설정](https://pnpm.io/settings)
- [TypeScript ESLint 지원 범위](https://typescript-eslint.io/users/dependency-versions/), [flat config 시작](https://typescript-eslint.io/getting-started/)
- [Vitest 시작](https://vitest.dev/guide/), [Prettier 설치](https://prettier.io/docs/install)
- [Next 설치](https://nextjs.org/docs/app/getting-started/installation), [Expo monorepo](https://docs.expo.dev/guides/monorepos/)
- [MapLibre Expo plugin](https://maplibre.org/maplibre-react-native/docs/setup/expo/), [Changesets 설정](https://github.com/changesets/changesets/blob/main/docs/config-file-options.md)
- registry metadata는 `https://registry.npmjs.org/<package>/<version>` 및 Expo tarball bundledNativeModules를 확인했다. GitHub actions SHA는 각 공식 저장소 git ref API에서 tag v5/v5/v6을 조회했다.

일반 build의 암묵적 registry 조회는 [Next agentUpgrade 공식 설정](https://nextjs.org/docs/app/api-reference/config/next-config-js/agentUpgrade)의 false로 끈다. 설치된 Next16.4.2에서 확인했으며 보안 검토는 별도 pnpm audit 결과로 유지한다.
