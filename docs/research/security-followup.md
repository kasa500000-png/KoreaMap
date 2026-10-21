# 보안 후속 조사 — 지원되는 수정 릴리스 확인

확인: **2026-10-21 07:12 UTC**, 기준 `ce8e8e1ad797f9a0780d6bc5e782b66505c7ab23`. 결론은 **BLOCKED**다. 최신 공식 자료와 전체 workspace audit를 새로 조회했지만, 두 high 취약점을 해소하는 지원되는 stable 버전 조합을 확인하지 못했다. SDK·manifest·lockfile·감사·발행 정책은 변경하지 않았다.

| 공식 권고 | 현재 설치 / npm latest | 영향 범위 | 공식 수정 버전 |
| --- | --- | --- | --- |
| [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | node-forge 1.4.0 / 1.4.0 | `<=1.4.0` | `first_patched_version:null` |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | braces 3.0.3 / 3.0.3 | `<=3.0.3` | `first_patched_version:null` |

두 GitHub 권고는 철회되지 않았다. 공식 npm [node-forge](https://registry.npmjs.org/node-forge/latest)·[braces](https://registry.npmjs.org/braces/latest) 메타데이터도 위 latest를 반환했다. npm audit의 `patched_versions` 역시 두 건 모두 `null`이다. [forge 수정 PR #1152](https://github.com/digitalbazaar/forge/pull/1152)는 open·unmerged, [braces 이슈 #70](https://github.com/micromatch/braces/issues/70)도 open이다. 미출시 PR을 적용하거나 수정 완료로 표시하지 않는다.

지원 그래프도 다시 확인했다. 현재 Expo 58.0.14의 CLI 58.1.11뿐 아니라 [최신 Expo 58.0.16](https://registry.npmjs.org/expo/latest) → [CLI 58.1.13](https://registry.npmjs.org/@expo%2fcli/latest)도 `node-forge:^1.4.0` 및 signing-certificates 0.0.7 → 같은 forge를 유지한다. [공식 Expo 58.0.16 호환 목록](https://raw.githubusercontent.com/expo/expo/expo%4058.0.16/packages/expo/bundledNativeModules.json)은 React 19.3 / RN 0.88 조합이다. RN latest는 현재와 같은 0.88.0이며, RN CLI와 Expo Metro → metro-file-map 0.87.1 → micromatch 4.0.8 → `braces:^3.0.3` 경로도 남는다. Expo 패치만 올려 보안 문제가 해결됐다고 처리할 근거가 없어 dependency 버전은 변경하지 않았다.

실행 결과는 다음과 같다. 조회에는 기존 프록시·CA를 사용했고 인증 우회·추가 서비스·새 패키지 다운로드는 없다.

- `pnpm audit --json`: **exit 1**, high **2**, critical 0. 전체 726개 의존성 집계이며 응답에는 forge 28개·braces 100개 경로가 보고됐다. 보고 경로 수를 전체 가능한 의존 경로의 완전한 열거로 해석하지 않는다.
- `pnpm audit --audit-level=high`: **exit 1**, 같은 두 high를 유지했다. production 전용 감사나 advisory suppression은 적용하지 않았다.
- `pnpm why --recursive node-forge braces`: **exit 0**, 현재 workspace 의존 경로를 확인했다.
- GitHub advisory·상위 PR/issue와 npm 공식 메타데이터 GET은 성공했다. 원문·명령 로그와 작은 호환성 receipt는 ignored `artifacts/security/`에 저장했다.
- `pnpm check:docs`: **통과**, Markdown 91개·내부 링크 487개. 이 명령의 최초 실행에서 pnpm이 기존 캐시 패키지 645개를 worktree에 자동 hardlink했다(`downloaded:0`); manifest·lockfile·설치 훅 정책은 바뀌지 않았다. `git diff --check`도 통과했다.

안전한 다음 단계는 **공식 수정 버전 또는 취약 경로를 제거한 지원 stable 릴리스가 실제 발행됐을 때** 재개한다. 먼저 권고의 수정 범위와 Expo/RN 호환 선언을 대조한 뒤 필요한 direct dependency만 exact pin하고 lockfile을 갱신한다. 기존 최소 릴리스 경과시간·설치 훅 차단·strict peer 정책을 유지하면서 전체 audit, `pnpm check`, 실제 pack과 독립 Web/Native 소비 검사, Expo 양 OS JS export 및 Android APK payload 검증을 수행해야 한다. 두 취약점을 우회하는 override·수동 patch·downgrade·canary·Native 제거는 사용하지 않는다. upstream에 새 이슈나 메시지를 발송하지 않았다.

이번 변경 파일은 **이 문서 하나**다. 문서 검사와 diff를 확인하며 SDK 단위·빌드·실화면 QA는 다시 실행하지 않는다. 코드·패키지를 바꾸지 않았기 때문이며 이 조사를 기능 QA 통과로 표시하지 않는다. 기존 [보안/CI 기록](stage-01-security.md)과 [독립 Android 빌드 결과](stage-05-android-consumer.md)를 대체하지 않는다. 제3자 payload·개인정보·키·제작자 endpoint·유료 인프라는 추가하지 않았다.

브랜치는 `fix/recommended-security`, 위 기준 커밋에서 분리했다. 스테이징·커밋·push는 수행하지 않았다. 다른 독립 개발은 진행할 수 있지만 **취약점 해소·보안 수락·공개 릴리스 준비 완료는 미완료**다. 전체 RN 선언 오류와 기기 QA 등 다른 릴리스 조건도 별도로 유지한다.
