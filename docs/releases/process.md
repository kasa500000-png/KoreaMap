# 릴리스 절차와 승인 경계

확인일: 2026-10-19. 후보는 v0.1.0이며 Git tag/GitHub Release/npm 버전은 아직 생성하지 않았습니다. 패키지 version 0.1.0은 후보 내용의 목표 버전이며 rc dist-tag가 존재한다는 뜻이 아닙니다.

## 이름과 권한

| 후보 | 공개 npm registry 응답 | 의미 |
| --- | --- | --- |
| korea-map-core | 404 | 확인 시점 미등록; 예약 아님 |
| korea-map-web | 404 | 동일 |
| korea-map-native | 404 | 동일 |
| korea-map-styles | 404 | 동일 |
| korea-map-data-adapters | 404 | 동일 |

`@korea-map-kit/{core,web,native,styles}`도 404였지만 scope 소유권은 확인되지 않았습니다. 사용자 소유 scope 응답이 없어 비스코프 후보를 선택했습니다. `npm whoami`는 ENEEDAUTH였습니다. 이름 등록·소유권·2FA/OIDC 접근은 미검증입니다. 공식 registry metadata 조회만 수행했으며 새 계정/조직/패키지는 생성하지 않았습니다. 발행 직전 공식 registry에서 각 후보를 다시 조회하고 새로 등록된 타인 이름이면 중단하세요.

## 후보 생성과 검증

1. 후보 소스에서 `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm pack:check`, `pnpm verify:packages`, `pnpm test:web`을 실행합니다. 서비스 변경은 해당 실제 Docker 통합 검사도 필요합니다.
2. `pnpm audit:dependencies`의 high 이상, 실제 디바이스 및 Native APK/IPA notice inventory, 라이선스/권리, 비용 경로, 플랫폼 미검증 사항을 해결하고 보고서를 검토합니다. 감사 실패를 자동 무시하지 않습니다.
3. 검증 후 로컬 커밋을 만들고 clean tree에서 `pnpm release:prepare`를 실행합니다. ignored `artifacts/release/integrity.json`에 5개 파일 이름, version, 길이, SHA-256, SHA-512 SRI와 source commit/dirty 상태를 저장합니다. RELEASE_NOTES.md는 CHANGELOG와 실제 체크섬에서 생성합니다. dirty 후보는 승인 검증에서 거부됩니다. 이 체크섬은 서명이나 npm provenance를 대체하지 않습니다.
4. 사용자가 정확한 커밋과 플랫폼 범위를 검토한 뒤 **공개 업로드·npm 발행·GitHub Release를 각각 승인**해야 합니다. 현재 저장소는 이미 Public이므로 새 후보 push도 공개 업로드입니다. 기본 브랜치 변경/main 통합은 별도 승인 사항입니다.

## 승인 이후 최초 npm 발행

현재는 이 절차를 실행하지 않습니다. npm 11.9.0에서 확인했으며 trusted publishing 요구 최소는 npm 11.5.1 / Node 22.14.0입니다.

- 소유 npm 사용자/조직, 이름 가용성, 2FA 및 권한을 확인합니다. 신규 패키지는 npm 웹 설정에서 trusted publisher를 미리 설정할 수 있는지 확인해야 합니다. 최초 소유권 bootstrap에 대화형 npm 인증/2FA 발행이 필요하면 **별도 승인된 운영자 세션에서** 정확한 검증 tarball만 발행합니다. 토큰을 Git/워크플로/채팅에 저장하지 않습니다. 최초 발행에서 provenance를 검증하지 못하면 없다고 보고합니다.
- GitHub `npm-release` environment를 실제로 생성하고 required reviewers, self-review 방지, 대상 branch/tag 제한을 설정합니다. private security reporting과 안전한 비공개 신고 경로도 확인합니다. 이 설정들은 아직 적용·검증하지 않았습니다. 새 trusted publisher 설정은 공식 문서 기준 2일 내 첫 성공 발행으로 검증하지 않으면 만료되므로, 승인과 검증 완료 후에만 생성하세요.
- 각 패키지의 npm trusted publisher에 direct npm publish 허용을 설정하고 이 저장소의 `npm-publish.yml` 및 environment `npm-release`에 연결합니다. 이미 발행된 버전은 덮어쓸 수 없습니다. bootstrap으로 0.1.0을 발행했다면 이 0.1.0 워크플로를 다시 실행하지 말고, 다음 버전 준비 시 스크립트·tarball 이름·정책을 함께 갱신합니다.
- 사용자 승인 이후에만 repo variable `NPM_PUBLISH_ENABLED=true`, `NPM_APPROVED_COMMIT=<정확한 40자 SHA>`를 설정합니다. 변수는 자격증명이 아닙니다. 승인 커밋 입력과 변수 일치 + protected environment 승인이 모두 필요합니다. 권한은 contents:read/id-token:write이며 정적 NPM_TOKEN을 사용하지 않습니다.
- 워크플로는 audit high가 있으면 중단하고, clean source와 실제 tarball 무결성을 `release:verify`로 확인한 후 `--provenance --access public --ignore-scripts`로 의존 순서에 따라 발행합니다. 발행 명령은 이번 준비 과정에서 실행하지 않았습니다. OIDC/실제 발행 성공을 정적 YAML 검사로 주장하지 않습니다.
- 다중 패키지 발행은 원자적이지 않습니다. 일부 성공 후 실패하면 성공한 버전과 registry integrity를 기록하고, 승인된 나머지만 별도 복구 절차로 처리합니다. 전체 워크플로를 무작정 재시도하거나 자동 unpublish하지 마세요.

## 발행 이후 검증과 GitHub Release

새 소비 디렉터리에서 registry의 정확한 0.1.0을 실제 설치하고, 로컬 tarball 체크섬과 registry integrity, publisher identity/provenance, Web 실행을 대조합니다. Native 독립 소비 APK/IPA도 검증합니다. registry 실제 설치 전에는 해당 항목을 통과로 표시하지 않습니다.

사용자가 GitHub Release까지 승인한 경우에만 정확한 검증 커밋에 v0.1.0 tag와 Release를 생성합니다. 생성된 RELEASE_NOTES.md, 실제 체크섬과 지원 한계를 검토해 사용합니다. 어떤 명령도 main merge, 배포, 공개 전환 또는 Release 생성까지 자동으로 수행하지 않습니다.

## 버전 정책

초기 pending Changeset 11개는 CHANGELOG 0.1.0 baseline으로 통합했습니다. 이후 변경은 `pnpm changeset`, 리뷰된 `pnpm changeset version`, lock 갱신, 전체 회귀 검사 순서로 진행합니다. fixed group 5개 패키지를 함께 관리합니다. workflow/release.mjs의 고정 0.1.0 보호값도 버전 PR에서 명시적으로 검토합니다. main 기반 Changesets 정책은 현재 default branch 차이를 해결한 후 정상 release branch 통합 절차와 맞춰야 합니다.

## 공식 근거

- [npm package naming](https://docs.npmjs.com/package-name-guidelines)
- [npm trusted publishers](https://docs.npmjs.com/trusted-publishers)
- [npm provenance](https://docs.npmjs.com/generating-provenance-statements)
- [GitHub environment protections](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)

표준 GitHub-hosted Linux runner와 읽기 전용 일반 CI가 기본입니다. 캐시/유료 runner/자동 artifact 저장/cron/유료 클라우드 배포는 추가하지 않았습니다. 계정 과금 설정 자체는 코드 검사로 보증하지 않습니다.
