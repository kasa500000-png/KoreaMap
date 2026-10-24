# Git 이력 보안 감사의 일괄 객체 읽기

확인일: 2026-10-24 KST. 기준 main `6478625e30d791c677e5b17794d7904e43bc7c8e`.

## 우선순위와 기존 차단

[main CI40097711761](https://github.com/kasa500000-png/KoreaMap/actions/runs/40097711761)는 기능6 성공/기존 릴리스3 실패다. 이번 `pnpm audit:dependencies`도 node-forge·Zod high2/exit1이다. 공식 registry의 forge1.4.0, Expo CLI58.1.15의 forge `^1.4.0`/Zod `^3.25.76`, geojson-vt6.3.0, vt-pbf4.3.2, RN0.88.0을 재조회했고 [앞선 조사](windows-license-review.md)와 동일하다. 지원되는 수정 graph를 확인하지 못해 SDK·lockfile·감사 예외를 바꾸지 않는다.

실제 CSV/독립 정답, 로컬 타일/glyph 및 Native 기기 검증 자료가 새로 제공되지 않아 해당 수락을 구현 완료로 대체하지 않는다. 이번 환경에서 반복 재현한 보안 감사의 프로세스 실행 비용을 개선 대상으로 선택했다. 이전 구현은 검사할 `(path, SHA, scope)`마다 `git cat-file -s`와 `git cat-file blob`을 실행했다. Windows에서는 이력 전체 읽기에 수분이 걸렸다.

## 구현과 보존한 계약

[Git 2.53 공식 cat-file 문서](https://github.com/git/git/blob/v2.53.0/Documentation/git-cat-file.adoc)의 `--batch-check`와 `--batch` 프로토콜을 사용한다. 실제 도구는 Git2.53.0.windows.3, Node24.19.0, pnpm12.14.0, Python3.12.14다. 새 라이브러리·설치 훅·네트워크 요청은 없다.

- 객체 metadata/body용 Git 프로세스 두 개를 감사 구간 동안 재사용한다. 검사할 경로·index·도달 가능한 이력·중복 판정 키·탐지 규칙·결과 schema는 유지한다.
- 객체 ID는 전체 hex SHA만 전달하고 응답의 동일 ID·blob 타입·크기를 확인한다. 경로를 Git 프로토콜 입력으로 사용하지 않는다.
- 기존 8MiB 상한 초과는 metadata만 읽고 기존 검토 필요 finding으로 남긴다. 정확히 상한인 본문은 그대로 검사한다.
- 원시 bytes를 읽으며 filters/textconv/본문 변환을 사용하지 않는다. 길이·종결 구분자·없는 객체·비정상 프로세스 종료는 실패한다. 임의 응답·본문은 오류에 출력하지 않는다.
- 성공·실패 시 두 프로세스와 파이프를 정리한다. 종료 대기 5초를 넘으면 종료시키고 성공으로 처리하지 않는다. 이것은 전체 감사나 객체 읽기에 대한 새 timeout 보장을 뜻하지 않는다.

## 검증

합성 temporary Git 저장소에서 binary/NUL/newline/빈 blob·8MiB 경계·oversize 미요청·프로토콜 손상·없는 객체·종료 실패·프로세스 회수와 기존 방식의 보고서 동등성을 확인한다. 동일 blob의 문서/실행 경로, index/worktree 차이 및 삭제된 과거 합성 자격증명도 포함한다. 기존 black-box CLI 보안 회귀를 유지한다.

초기 새 테스트27개는 통과했지만 자체 감사가 테스트 소스의 합성 자격증명 표현을 탐지해 exit1이었다. 이는 기존 dependency 취약점과 별개의 작성 중 실패다. 합성 입력을 실행 시 조합하도록 고쳐 실제 fixture bytes와 탐지 기대값은 유지했으며 허용 목록은 추가하지 않았다. 프로세스 종료 실패 회귀를 포함한 최종 결과와 실저장소 동등성/시간 비교는 [진행 기록](../progress.md)에 기록한다.

재현 명령은 각각 독립 실행한다: `pnpm test:audit`, `pnpm audit:cost`, `pnpm check`, `pnpm pack:check`, `pnpm check:data --staged`. 시간 비교는 같은 변경 트리·index·refs에서 이전 main 스크립트와 수정본을 직렬 실행하며 전체 JSON과 종료 코드를 대조한다. 단일 호스트 시간 차이를 지도 성능·모든 OS 성능·보안 수락으로 확대하지 않는다. UI/SDK 동작 변경이 없어 새로운 화면 QA는 수행하지 않는다.

실저장소 직렬 비교(동일 변경 트리/index/refs, Windows 한 번의 관측): 이전320.566초, 수정본12.878초. 두 실행 모두 exit0이며 전체 JSON이 동일했다. worktree405/index404/history1053 blobs·75 commits, findings0이다. 약24.9배의 이 관측은 다른 호스트/반복 실행의 성능 보장이 아니다. 원본 결과와 비교기는 ignored `artifacts/toolchain/`의 `baseline-comparison.json`, `batch-comparison.json`, `batch-comparison.log`, `compare-audit.py`에 보관한다. 최종 비용 회귀28/28 PASS(62.046초)로 초기 작성 중 자체 감사 실패가 해결됐다.
