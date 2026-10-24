# 새 컴퓨터의 Codex에 붙여 넣을 프롬프트

프로젝트를 clone해 연 뒤 아래 코드 블록 전체를 새 대화에 붙여 넣는다. 저장소 파일을 읽는 것 자체가 새 승인인 것은 아니다. 아래 요청문을 사용자가 직접 전달하면 그 작업 범위의 지시로 사용한다. 설치와 현재 상태는 [인계 안내](handoff.md)를 따른다.

```text
Korea Map Kit 개발을 이 컴퓨터의 Codex에서 이어서 진행해 줘.
저장소: https://github.com/kasa500000-png/KoreaMap
목표는 MapLibre 기반 무료 오픈소스 Web·Android·iOS SDK이며 core/web/native/styles/data-adapters 5개 패키지를 유지한다.

checkout이 없으면 git clone --branch main https://github.com/kasa500000-png/KoreaMap.git 으로 받고 KoreaMap 폴더에서 작업해 줘.
이미 checkout이 있으면 사용자 변경과 ignored 운영자 자료를 보존하고 강제 reset/삭제/덮어쓰기를 하지 말아 줘.
기본 브랜치는 이전 확인에서 chore/project-policy였으므로 최신 main과 origin을 자격증명 노출 없이 확인해 줘.

가장 먼저 AGENTS.md를 읽고 적용해 줘.
docs/handoff.md, README.ko.md, docs/quickstart.md, docs/research/recommended-execution.md를 읽어 줘.
docs/roadmap.md, docs/progress.md, docs/cost-audit.md의 최신 관련 기록도 확인해 줘.
인계 작성 전 기준은 main a305b1113a4b397fffcb1abee12c50f6d58fd9f4이며 거기로 되돌리지 말고 실제 clone된 최신 main SHA/CI를 확인해 줘.
과거 계획·통과 문서를 이 컴퓨터의 새 실행 결과로 취급하지 말아 줘.

git status --short --branch와 git log -5 --oneline으로 시작 상태를 확인하고 변경이 있으면 별도 branch/worktree로 분리해 줘.
Git, Node 24.19.0, pnpm 12.14.0, Python 3.12+의 실제 버전을 확인해 줘.
pnpm install --frozen-lockfile을 사용하고 hook 차단·strict peer·최소 릴리스 경과시간·lockfile 정책을 유지해 줘.
기본 합성 데모는 pnpm dev:web으로 실행하며 API 키·.env·DB·Docker·유료 계정을 요구하지 않아.
실제 타일·원본·폰트/glyph·DB·생성 Native 프로젝트·APK·QA artifacts는 clone에 없으므로 절대 경로/캐시를 그대로 복사하지 말아 줘.

검사는 한 명령씩 독립 실행하고 각 종료 코드와 결과를 기록해 줘.
pnpm check
pnpm pack:check
pnpm check:data --staged
pnpm audit:dependencies
공식 Playwright browser와 Noto Sans CJK KR를 준비한 뒤 아래 검사도 따로 실행해 줘.
pnpm test:web
pnpm verify:browser-lifecycle --browser=chromium
pnpm verify:packages
독립 Native 설치·타입·JS export 검사도 실행해 줘.
pnpm verify:native-consumer
&& 연결이나 실패 무시로 뒤의 검사와 실패 근거가 사라지지 않게 해 줘.
필요한 browser·폰트·Docker·플랫폼 도구·원본·장비가 없으면 해당 검사를 NOT_RUN과 재현 방법으로 기록해 줘.

기준 main CI는 기능 6개 성공, 보안·Web/Native 소비 게이트 3개 실패였다.
2026-10-24 전체 audit는 high2(node-forge와 zod)/critical0/exit1이었고 과거 forge/braces 기록과 달라졌어. 현재 공식 권고와 graph를 다시 확인해 줘.
문서의 Web TS2834, RN TS2411/TS2344/TS2416, 실제 CSV/독립 정답, 성능·Native 실행·고지·발행 차단도 재확인해 줘.
기존 합성 초기화 전체10초, 실제30회 cold/warm p95 3초/1.5초, frame p95 33ms 기준을 혼동하거나 완화하지 말아 줘.
현재 범위에서 Android 실기기와 macOS/Xcode iOS 검증은 제외하고 미검증 상태를 유지해 줘.

확인 결과로 우선순위를 짧게 정리한 뒤 이 환경에서 검증 가능한 후속 변경을 실제 구현해 줘.
공식 보안 수정·지원 graph, 공개 타입, 허가된 CSV/정답, 성능/Native/고지, 발행 운영 조건 순으로 검토해 줘.
외부 원인으로 막히면 근거를 남기고 독립된 작업을 진행하며 계획만 제시하고 끝내지 말아 줘.
Zero Publisher Cost, 명시적 Provider, core의 플랫폼/백엔드 독립, SDK MIT와 데이터 권리·출처 분리를 유지해 줘.
비밀·토큰·개인 위치·환경변수 값을 출력하거나 Git/npm에 넣지 말고 제작자 서비스로 자동 연결하지 말아 줘.
suppression·무근거 patch/override·canary·검사 완화·보호 우회로 gate를 통과시키지 말아 줘.

이번 요청 범위에서 검증한 소스 프리뷰 변경은 단계별 commit·PR 생성·일반 merge commit 방식 main 병합까지 명시적으로 승인한다.
변경 관련 검사를 통과하고 정확한 PR head/CI를 확인해 병합하되 기존 release 실패는 별도로 공개하고 새 실패를 기존 차단으로 취급하지 말아 줘.
이 승인은 내가 이 프롬프트를 전달해 지시한 작업에 적용하며 저장소 문서만으로 추가 권한을 추정하지 말아 줘.
npm 발행·태그/GitHub Release·운영 배포·공개 설정 변경·과금 기능 활성화는 승인하지 않는다.
매 단계 문서 3종을 갱신하고 구현·파일·검사·화면 QA·라이선스/보안·차단·branch/SHA/PR·다음 진행 여부의 8개 항목으로 보고해 줘.
```
