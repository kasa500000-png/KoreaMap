# GitHub 통합 사전 검증 — 2026-10-20

**원격 조회와 로컬 Git tree rehearsal만 수행했다. main 병합·공개 push·PR 수정·기본 브랜치 변경·발행은 수행하지 않았다.** 로컬 기준 커밋은 `76b379b9dd2abbb6393e90f789a78ac2fd352762`다. 현재 `feat/korean-map-completion`의 미커밋 개선 사항은 아래 rehearsal 및 과거 원격 CI의 검증 대상에 포함하지 않았다.

## 현재 공개 저장소와 기본 진입점

2026-10-20 12:55 KST 전후, 연결된 GitHub 커넥터의 GET으로 [저장소](https://github.com/kasa500000-png/KoreaMap), 전체 PR, 16개 branch, 19개 workflow run과 PR head별 check-run을 확인했다.

- visibility: **Public**. 저장소는 이미 공개되어 있으며 이번 작업에서 공개 전환하지 않았다.
- default branch: **`chore/project-policy`**.
- 원격 `main`과 `chore/project-policy`: `38c36f84f1e62f0419583faa5b593a2d6a71daf8`.
- 두 브랜치의 최상위 tree에는 `AGENTS.md`와 `docs/`만 있다. 따라서 현재 기본 clone에는 SDK·루트 README·LICENSE·package.json이 없다. 코드가 다른 공개 feature branch에 존재하는 것과 기본 진입점에서 설치 가능한 상태는 다르다.
- `release/v0.1.0-preparation`과 `feat/korean-map-completion`은 원격 branch 목록에 없다. 두 로컬 branch의 현재 HEAD는 위 `76b379b...`다.
- branch 목록의 `protected`는 16개 모두 false였다. 이는 해당 조회 필드의 관찰이며, 조직 정책·모든 ruleset·배포 environment 보호 및 발행 권한 검증을 대신하지 않는다. 계정·자격증명·결제 설정을 조회하지 않았다.

원격에서 확인한 16개 branch SHA는 각 로컬 branch 및 `origin/<branch>` ref와 **모두 일치**했다. 새로운 원격 commit이나 divergence는 발견하지 않았다. 이 확인을 위해 `git fetch`나 ref 갱신은 실행하지 않았다.

## Draft PR inventory

PR **#1~#14 모두 open·Draft·merged_at=null**이다. 각 행은 조회 당시 정확한 base/head SHA다. 모든 head commit이 로컬 객체 DB에 있고 기준 커밋 `76b379b...`의 조상임을 확인했다.

| PR | base / 정확한 SHA | head / 정확한 SHA | 현재 head의 원격 CI |
| --- | --- | --- | --- |
| [#1](https://github.com/kasa500000-png/KoreaMap/pull/1) | `main`<br>`38c36f84f1e62f0419583faa5b593a2d6a71daf8` | `docs/technical-architecture`<br>`e832012f341c41f6670ba27c423195f97ad927d1` | check-run 0개 |
| [#2](https://github.com/kasa500000-png/KoreaMap/pull/2) | `docs/technical-architecture`<br>`e832012f341c41f6670ba27c423195f97ad927d1` | `docs/zero-publisher-cost`<br>`131a1789231745d1dc791597d0a9844f384a2bb5` | check-run 0개 |
| [#3](https://github.com/kasa500000-png/KoreaMap/pull/3) | `docs/zero-publisher-cost`<br>`131a1789231745d1dc791597d0a9844f384a2bb5` | `feat/monorepo-foundation`<br>`828911bd63ea354ed33eeeb06446cfe085aeeacf` | [3 OS success](https://github.com/kasa500000-png/KoreaMap/actions/runs/39205577041) |
| [#4](https://github.com/kasa500000-png/KoreaMap/pull/4) | `feat/monorepo-foundation`<br>`828911bd63ea354ed33eeeb06446cfe085aeeacf` | `feat/data-source-policy`<br>`001252c6f4fea50fea7dfbc3feafb035676a18fd` | [3 OS success](https://github.com/kasa500000-png/KoreaMap/actions/runs/39207815756) |
| [#5](https://github.com/kasa500000-png/KoreaMap/pull/5) | `feat/data-source-policy`<br>`001252c6f4fea50fea7dfbc3feafb035676a18fd` | `feat/web-map-sdk`<br>`7eb09fce85b5dbbf4f33afe3b57da0ab7467f1e2` | [3 OS success](https://github.com/kasa500000-png/KoreaMap/actions/runs/39211345795) |
| [#6](https://github.com/kasa500000-png/KoreaMap/pull/6) | `feat/web-map-sdk`<br>`7eb09fce85b5dbbf4f33afe3b57da0ab7467f1e2` | `feat/map-design-system`<br>`f112fb0330e8de88e85bc75591d6cf4f7c3ee509` | [3 OS success](https://github.com/kasa500000-png/KoreaMap/actions/runs/39215281322) |
| [#7](https://github.com/kasa500000-png/KoreaMap/pull/7) | `feat/map-design-system`<br>`f112fb0330e8de88e85bc75591d6cf4f7c3ee509` | `feat/shared-public-api`<br>`7bd4ea416de0d2f19de4b80ca09a79aa7a757d2d` | [3 OS success](https://github.com/kasa500000-png/KoreaMap/actions/runs/39220952768) |
| [#8](https://github.com/kasa500000-png/KoreaMap/pull/8) | `feat/shared-public-api`<br>`7bd4ea416de0d2f19de4b80ca09a79aa7a757d2d` | `feat/public-poi-etl`<br>`2c1ed9690fdba647eada8b21f07c8c056973a2dd` | [3 OS success](https://github.com/kasa500000-png/KoreaMap/actions/runs/39226329706) |
| [#9](https://github.com/kasa500000-png/KoreaMap/pull/9) | `feat/public-poi-etl`<br>`2c1ed9690fdba647eada8b21f07c8c056973a2dd` | `feat/korean-search`<br>`2c3e14994dbb5d3e3430b8724b52706bb0ece337` | [3 OS success](https://github.com/kasa500000-png/KoreaMap/actions/runs/39230435677) |
| [#10](https://github.com/kasa500000-png/KoreaMap/pull/10) | `feat/korean-search`<br>`2c3e14994dbb5d3e3430b8724b52706bb0ece337` | `feat/gps-tracks`<br>`dc6621704483a6b3406e51207f9adf1fcc46cbf9` | [3 OS success](https://github.com/kasa500000-png/KoreaMap/actions/runs/39239373851) |
| [#11](https://github.com/kasa500000-png/KoreaMap/pull/11) | `feat/gps-tracks`<br>`dc6621704483a6b3406e51207f9adf1fcc46cbf9` | `feat/self-hosted-routing`<br>`6ef44c1c1e0a9df6cec13ea6934321b1e64a640e` | [3 OS success](https://github.com/kasa500000-png/KoreaMap/actions/runs/39244051584) |
| [#12](https://github.com/kasa500000-png/KoreaMap/pull/12) | `feat/self-hosted-routing`<br>`6ef44c1c1e0a9df6cec13ea6934321b1e64a640e` | `feat/native-sdk`<br>`502d165030ac657a9648829372dce9a247140921` | [3 OS success](https://github.com/kasa500000-png/KoreaMap/actions/runs/39247963900) |
| [#13](https://github.com/kasa500000-png/KoreaMap/pull/13) | `feat/native-sdk`<br>`502d165030ac657a9648829372dce9a247140921` | `feat/scenario-apps`<br>`0d3a8d20bf490b841ca86e9e7854275862977edf` | [3 OS success](https://github.com/kasa500000-png/KoreaMap/actions/runs/39253838801) |
| [#14](https://github.com/kasa500000-png/KoreaMap/pull/14) | `feat/scenario-apps`<br>`0d3a8d20bf490b841ca86e9e7854275862977edf` | `feat/quality-audit`<br>`21a2c761795c29598e8ddfb468f81f31b0eecc73` | [3 OS success](https://github.com/kasa500000-png/KoreaMap/actions/runs/39262807292) |

#3~#14의 각 현재 head에서 `linux`, `windows`, `macos` check-run **총 36개가 completed/success**였다. #1~#2는 check-run이 없으므로 CI 통과로 표시하지 않는다. 과거 실패·취소 run도 존재하지만 최신 head의 성공으로 교체되었음을 SHA로 구분했다. PR #14의 현재 성공 run은 [39262807292](https://github.com/kasa500000-png/KoreaMap/actions/runs/39262807292)다.

이 결과는 각 당시 workflow·commit의 범위다. 현재 미커밋 변경, 통합 후 새 commit, 실제 Android/iOS 기기 QA, npm 발행 또는 모든 보안 문제가 통과했다는 뜻이 아니다. 새 통합 후보가 확정되면 그 정확한 SHA에서 검사를 다시 실행해야 한다.

## 로컬 통합 rehearsal

공유 작업트리를 checkout하거나 실제 merge하지 않고 다음 Git plumbing만 사용했다.

```sh
git merge-base --is-ancestor <PR-head-SHA> 76b379b9dd2abbb6393e90f789a78ac2fd352762
git merge-base --is-ancestor <PR-base-SHA> <PR-head-SHA>
git merge-tree --write-tree <PR-base-SHA> <PR-head-SHA>
git merge-tree --write-tree 38c36f84f1e62f0419583faa5b593a2d6a71daf8 76b379b9dd2abbb6393e90f789a78ac2fd352762
```

실제 결과:

1. 14개 PR head가 모두 기준 커밋의 조상이었다.
2. 각 PR base가 해당 head의 조상이었다. 14회 `merge-tree`의 종료 코드가 0이고 결과 tree가 각 head tree와 일치했다. 현재 stack의 해당 SHA 조합에서 충돌은 발견되지 않았다.
3. `main → 76b379b...`는 **22개 commit의 fast-forward 관계**다. `main`에서 기준 후보까지의 `merge-tree` 결과는 `6205e1dba784c271c424354ff254e361bb533671`이며 기준 후보의 tree와 바이트 식별자가 같다.
4. rehearsal 전후 현재 branch `feat/korean-map-completion`, HEAD, `main` SHA, 실제 index tree가 동일했다. 작업트리·index·ref를 병합 결과로 변경하지 않았다. `merge-tree --write-tree`는 Git 객체를 만들 수 있으나 branch를 이동하거나 merge commit을 만들지 않는다.
5. **새 미커밋 개선 사항은 tree rehearsal에 포함하지 않았다.** 통합 후보 commit 후 같은 검사를 재실행해야 한다. 기존 clean tree 관계만으로 새 코드의 기능/품질 검사를 완료 처리하지 않는다.

안전한 원격 inventory/CI 요약과 로컬 검사 결과는 ignored `artifacts/integration/{remote-inventory,remote-ci,local-rehearsal}.json`에 기록했다. 이 로컬 증거 파일은 Git/npm 산출물이 아니다.

## 남은 통합 작업

- 현재 구현과 문서의 검사를 마친 새 후보 commit에서 기준 SHA·tree·변경 범위를 다시 고정한다.
- 공개 통합 방식을 선택한다. 현재 후보는 14개 feature head를 이미 포함하므로 통합 PR 하나로 누적 변경을 검토할 수 있다. 기존 stacked PR의 retarget·닫기·병합 여부는 별도로 검토하며 자동 처리하지 않는다. 단순히 14개 PR이 존재한다는 이유로 같은 변경을 반복 적용하지 않는다.
- 실제 공개 push/PR 작성과 main 병합의 승인을 각각 확인한 뒤 실행한다. 원격 head가 이동하면 자동 병합하지 않고 차이·추가 commit·검사 상태부터 다시 검토한다.
- 기본 clone에 검증된 SDK·README·MIT LICENSE·설치 가이드가 보이도록 통합된 기본 브랜치를 정리한다. default branch 설정 변경도 별도 검토 대상이다.
- 새 정확한 commit에서 3 OS CI·패키지 소비·보안/라이선스·지원 플랫폼 상태를 확인한다. npm/Release 승인과 실제 registry 설치 검증은 별도 공개 절차다.

이번 결과는 **기존 commit stack의 통합 가능성 검증 통과**다. 새로운 후보의 원격 CI·승인·main 통합·기본 브랜치 정리·npm 발행까지 완료한 상태는 아니다.
