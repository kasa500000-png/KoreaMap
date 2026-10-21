# Korea Map Kit 진행 기록

아래 기록은 시간순이다. 현재 상태는 마지막 후속 기록을 기준으로 확인한다.

## 0단계 — 개발 정책과 로드맵

- 기준일: 2026-10-19 (UTC)
- 작업 위치: `/workspace/Koreamap`
- 상태: 문서 작성 및 내용 검사 통과. 커밋 여부는 아래 식별 명령으로 확인한다.
- 범위: 프로젝트 정책 저장과 개발 계획 수립. 지도 SDK 기능 구현은 아직 시작하지 않았다.

### 1. 구현 완료 기능

- 사용자 지정 설계 원칙 10개, 개발 운영 규칙, 단계 종료 보고 항목 8개를 루트 정책에 기록했다.
- Web/Android/iOS, 선택형 어댑터, 한국 데이터 및 자체 호스팅을 포함한 단계별 로드맵을 작성했다.
- 명시적 승인이 필요한 네 가지 작업을 정책과 로드맵에 기록했다.

### 2. 생성/수정 파일

- [AGENTS.md](../AGENTS.md): 프로젝트 전역 정책.
- [docs/roadmap.md](roadmap.md): 단계별 범위, 완료 기준, 기술 조사 출발점.
- [docs/progress.md](progress.md): 진행 상태, 검증 및 차단 사항.

### 3. 실행한 테스트와 결과

- Python 3.12.14 문서 검사: 통과. 사용자 설계 원칙 10/10개를 원문과 비교했고, 운영 규칙과 명시적 승인 대상 4개를 확인했다.
- 보고 항목 검사: 정책과 진행 기록에 8/8개 항목 존재, 통과.
- 내부 상대 링크 5개와 UTF-8 문서 3개 읽기 검사: 통과. 외부 URL의 접근성 및 최신 내용은 이번 검사 범위에 포함하지 않았다.
- 공백 오류 검사: `git diff --cached --check` 통과. 커밋 직전 최종 문서에도 다시 적용한다.
- SDK 단위·통합·E2E 테스트: 미실행. 이번 단계에는 실행 가능한 SDK 코드나 테스트 환경이 없다. SDK 동작은 미검증이다.
- 의존성: 추가하지 않았다. 최신 공식 문서 조사와 버전 고정은 1~2단계의 작업이다.

### 4. 실화면 QA 결과

- Web: 미실행·미검증. 실행할 UI가 없다.
- Android: 미실행·미검증. 앱 및 기기/에뮬레이터 검증을 수행하지 않았다.
- iOS: 미실행·미검증. 앱 및 macOS/Xcode/시뮬레이터 검증을 수행하지 않았다.

### 5. 라이선스 및 보안 문제

- SDK 코드의 최종 라이선스 목표는 MIT다. 현재 라이선스 확정이나 외부 데이터 이용허락 검토가 완료된 상태는 아니다.
- 외부 지도 데이터, 타일, 디자인 에셋, 런타임 의존성을 도입하지 않았다.
- 데이터별 이용허락 및 제3자 라이선스 검토는 미착수다. OSM 데이터와 타일 서비스 정책을 별도로 확인할 계획이다.
- 자격 증명이나 API 키를 문서에 포함하지 않았다. 자동 보안 스캐너는 실행하지 않았다.

### 6. 남은 작업 또는 차단 요인

- 제공된 작업 공간에 기존 체크아웃이 없어서 로컬 저장소를 초기화했다.
- 초기 작성 시 `Koreamap` 이름만으로 GitHub 소유자와 원격 URL을 확정할 수 없었다. 이후 사용자가 URL을 제공했으며 아래 원격 연결 기록에 후속 결과를 남긴다.
- 기존 원격 이력이 확인되면 로컬 문서 변경을 검토하여 해당 이력 위의 독립 브랜치에 적용한다. 원격 이력을 덮어쓰지 않는다.
- SDK 구현, 공식 의존성 조사, 데이터 라이선스 검증 및 플랫폼별 테스트는 후속 단계에 남아 있다.

### 7. Git 브랜치와 커밋 해시

- 브랜치: `chore/project-policy`
- 커밋: 이 기록을 포함하는 `docs: establish Korea Map Kit project policy`. 정확한 해시는 아래 명령으로 조회한다.
- 단계 커밋 식별 명령: `git log -1 --format='%H %s' --grep='^docs: establish Korea Map Kit project policy$'`
- 실제 커밋 해시는 커밋 직후 사용자에게 보고한다. main 병합·운영 배포·공개 전환·npm 발행은 수행하지 않았다.

### 8. 다음 단계 진행 가능 여부

- 문서 내용 검사를 통과했으므로 1단계 공식 문서·호환성·데이터 라이선스 조사를 진행할 수 있다.
- 원격 저장소 연계 후속 상태는 아래에 기록한다. SDK 기능 완료 및 출시 준비 완료를 선언할 수 있는 상태는 아니다.

## 0단계 후속 — GitHub 원격 연결

기준일: 2026-10-19 (UTC).

### 1. 구현 완료 기능

- 사용자가 제공한 `https://github.com/kasa500000-png/KoreaMap`을 `origin`으로 등록하고 fetch했다.
- 원격 조회에서 기존 커밋·브랜치가 없는 빈 저장소임을 확인했다. 기존 정책 커밋을 그대로 보존한다.
- GitHub 저장소는 조회 시 이미 공개 상태였으며 현재 계정에 ADMIN 권한이 있었다. 공개 전환 작업은 수행하지 않았다.

### 2. 생성/수정 파일

- `AGENTS.md`: 원격 URL 및 실제 저장소명 `KoreaMap` 기록.
- `docs/progress.md`: 원격 주소 차단 해소와 후속 검증 기록.
- 로컬 Git 설정: `origin` 등록. 설정 파일은 커밋 대상이 아니다.

### 3. 실행한 테스트와 결과

- `gh repo view ... --json nameWithOwner,url,isPrivate,defaultBranchRef,viewerPermission`: 접근 성공, 공개 상태 및 권한 확인, 기본 브랜치 이름 없음.
- `git ls-remote --symref ... HEAD 'refs/heads/*'`: 성공, 참조 없음. `git fetch origin`: 성공.
- 변경 후 Python 문서 검사 통과: 이전 커밋 대비 설계·운영·보고 정책 보존, 각 진행 기록의 보고 항목 8개, 내부 링크 5개, origin URL 일치 확인. `git diff --check` 통과. 최종 `git diff --cached --check` 성공 시에만 커밋·push한다.
- SDK 기능 테스트는 미실행·미검증이다. 이번 변경은 문서와 Git 연결에 한정된다.

### 4. 실화면 QA 결과

- Web·Android·iOS 모두 미실행·미검증. 실행 가능한 UI가 아직 없다.

### 5. 라이선스 및 보안 문제

- 데이터·의존성 도입 없음. MIT 코드 목표와 외부 데이터 이용조건 분리 정책 유지.
- 커밋 대상에 자격 증명 없음. GitHub 저장소의 공개 상태는 변경하지 않는다.

### 6. 남은 작업 또는 차단 요인

- `chore/project-policy`를 원격에 push한 뒤 원격 해시를 대조한다. 이 기록의 커밋 자체로 push 성공을 증명하지 않으며 실행 결과는 사용자에게 별도로 보고한다.
- 기존 기준 브랜치가 없어서 PR 비교 대상을 정할 수 없다. 첫 push 브랜치는 GitHub 기본 브랜치가 될 수 있다. main 생성·병합 및 기본 브랜치 설정 변경은 이번 작업에서 수행하지 않는다.
- main 병합·운영 배포·공개 저장소 전환·npm 실제 발행에는 계속 명시적 승인이 필요하다.

### 7. Git 브랜치와 커밋 해시

- 브랜치: `chore/project-policy`.
- 최초 정책 커밋: `08b3e89619e6a64da35b80f4170e61e6a2804959`.
- 후속 커밋 식별 명령: `git log -1 --format='%H %s' --grep='^docs: record KoreaMap GitHub remote$'`.
- 원격 확인 명령: `git ls-remote origin refs/heads/chore/project-policy`.

### 8. 다음 단계 진행 가능 여부

- 원격 URL 차단은 해소됐다. 공식 문서 기반 의존성·호환성·라이선스 조사 진행 가능.
- PR 생성은 기준 브랜치 마련 후 가능하다. SDK 기능과 플랫폼별 QA는 아직 미검증이다.

## 0단계 후속 — 승인된 main 최초 반영

기준일: 2026-10-19 (UTC). 사용자 지시: “위 작업이 첫 작업으로 main 병합까지 진행”. 이번 승인은 첫 정책 설정 작업의 main 반영에 한정된다.

### 1. 구현 완료 기능

- 기존 main이 없는 것을 확인하고 정책 브랜치의 커밋 `c8bab54d3009342264adac070cce0c1cd1e4d666`에서 main을 생성하여 원격에 push했다.
- 기존 정책 커밋 이력을 보존했다. 최초 브랜치 생성이므로 PR 및 별도 merge commit은 만들지 않았다.
- 이 후속 기록은 정책 브랜치에서 검사·커밋 후 main에 fast-forward로 반영한다.

### 2. 생성/수정 파일

- `docs/roadmap.md`: 0단계 완료 및 main 반영 상태 기록.
- `docs/progress.md`: 명시적 승인, main 반영 결과, 기본 브랜치 설정의 권한 제한 기록.

### 3. 실행한 테스트와 결과

- main 생성 전 문서 내부 링크, 커밋 공백 검사, 작업 트리 청결, 로컬/원격 정책 커밋 일치 검사 통과.
- `git push -u origin main`: 성공. 기존 정책 커밋을 원격 main에 반영했다.
- `gh repo edit kasa500000-png/KoreaMap --default-branch main`: 실패. HTTP 403 `Resource not accessible by integration`.
- 이 기록의 커밋 전 문서 정책·보고 항목·링크 및 staged diff를 검사하고, 반영 후 로컬/원격 main 해시와 정책 브랜치의 포함 관계를 확인한다. 최종 결과와 해시는 사용자에게 보고한다.
- SDK 기능 테스트는 코드 미구현으로 미실행·미검증이다.

### 4. 실화면 QA 결과

- Web·Android·iOS 모두 UI 미구현으로 미실행·미검증이다.

### 5. 라이선스 및 보안 문제

- 지도 데이터·의존성·자격 증명 추가 없음. 코드와 데이터 라이선스 분리 정책 유지.
- 저장소 공개 상태는 변경하지 않았고 운영 배포·npm 발행은 수행하지 않았다.

### 6. 남은 작업 또는 차단 요인

- main 반영은 완료됐으나 기본 브랜치 변경은 GitHub 연동 자격 증명 권한 부족으로 차단됐다. 저장소의 ADMIN 역할 조회 결과와 연동 토큰의 API 작업 권한은 다를 수 있다.
- 저장소 관리자가 GitHub 설정에서 기본 브랜치를 main으로 변경하거나, 연동에 해당 설정 변경 권한을 부여해야 한다.
- 후속 PR은 기본 브랜치가 바뀌기 전에도 `--base main`을 지정할 수 있다. 정책 브랜치는 보존한다.

### 7. Git 브랜치와 커밋 해시

- 원본 브랜치: `chore/project-policy`. 반영 브랜치: `main`.
- 최초 main 커밋: `c8bab54d3009342264adac070cce0c1cd1e4d666`.
- 최종 기록 커밋 식별 명령: `git log -1 --format='%H %s' --grep='^docs: record approved main initialization$'`.
- 원격 확인 명령: `git ls-remote origin refs/heads/main refs/heads/chore/project-policy`.

### 8. 다음 단계 진행 가능 여부

- main을 기준으로 독립 브랜치를 만들어 1단계 공식 문서·호환성·데이터 라이선스 조사 진행 가능.
- 기본 브랜치 변경은 권한 차단 상태이며 별도 해결이 필요하다. 이후 main 병합은 해당 작업에 대한 명시적 승인을 받아야 한다.

## 1단계 / M0 — 전체 기술 아키텍처 설계

기준일: 2026-10-19 (UTC). 사용자가 요청한 기술 조사·도구 점검·UX 분석·설계 일관성 검증 범위다. 상태: 설계 문서와 검증 완료, 커밋 식별은 아래 명령 참조. 제품 코드 구현 완료를 뜻하지 않는다.

### 1. 구현 완료 기능

- 모노레포·Web/Native 공통 계약·지역별 타일 파이프라인·자체 호스팅·스타일/한글 글리프·선택형 검색/경로/PostGIS/Supabase의 전체 설계를 작성했다.
- P0 전체 MVP(M1~M4), P1 서비스/데이터 확장(M5/M6), P2 고도화(M7)를 분리했다. 기능 요구사항 24개, 비기능 기준 7개, ADR 8개를 연결했다.
- REA MCP/Ghidra MCP 노출 여부와 ADB/Ghidra CLI 가용성을 점검하고, 대체로 공식 문서 및 공개 MapLibre Web 예제를 관찰했다.
- 최신 공식 문서·npm metadata·GitHub 공식 릴리스·Expo/RN 배포 manifest를 확인했다. exact 후보 버전과 통합 미검증을 구분했다.

### 2. 생성/수정 파일

- 신규: [architecture.md](architecture.md), [requirements.md](requirements.md).
- 수정: [roadmap.md](roadmap.md), 이 진행 기록.
- 신규 ADR: `docs/decisions/001-renderers-and-platforms.md`부터 `008-release-and-quality.md`까지 8개.
- 신규 조사: [technical-review.md](research/technical-review.md), [design-validation.md](research/design-validation.md), `docs/research/dependency-snapshot.json`, `docs/research/ux-observations.json`.
- 신규 검증 도구: [scripts/check-design.py](../scripts/check-design.py). 외부 의존 없는 문서 추적성 검사다.

### 3. 실행한 테스트와 결과

- `python3 scripts/check-design.py`: 통과. 내부 링크, R01~R24 유일성, 로드맵 단계/P0~P2 배치, ADR 양방향 참조, exact registry 관찰, UX 범위 구분.
- `git diff --check`: 통과. 검사기 Python AST 구문 검사: 통과. 첫 staged 검사에서 ADR EOF 빈 줄 8건을 수정한 뒤 `git diff --cached --check` 재검사 통과. 최종 파일에도 재적용 후 커밋한다.
- 수동 일관성 리뷰: 11개 시나리오 확인. 좌표 축 탐지 보장과 추가 이동 모드의 우선순위 표현을 수정해 계약/ADR/로드맵을 맞췄다.
- 전체 SDK/Native/DB/검색/경로 테스트와 보안 audit는 미실행·미검증이다. 후보 버전의 peer 범위/문서 확인을 빌드 호환 테스트로 간주하지 않는다.

### 4. 실화면 QA 결과

- 공개 upstream Web 예제: Chromium/Playwright에서 마커 popup 열기·닫기, drag 위치 변화, wheel/Fly 클릭 전후 canvas 변화 확인. screenshot 두 장을 직접 열어 확인했으며 pageerror는 0이었다.
- 첫 관찰 스크립트는 module-scope 변수에 접근해 실패했다. DOM/스크린샷 관찰로 수정 후 실행했다. Fly의 최종 화면은 단색 수역이어서 정확한 카메라 좌표·상세 타일 완전성은 미검증이다.
- 자체 Korea Map Kit Web·Android·iOS 실화면, 실제 검색/경로 계산, native 제스처 및 성능은 미검증이다. REA/Ghidra/ADB 분석은 실행하지 않았다.

### 5. 라이선스 및 보안 문제

- SDK MIT 목표와 OSM ODbL·폰트 OFL·외부 라이브러리/서버 라이선스를 분리했다. 한국 공공데이터 후보를 배포 허가 완료로 표시하지 않았다.
- 공개 문서/릴리스/예제만 확인했으며 보호 우회·비공개 데이터·타일·API 키 추출을 하지 않았다.
- 외부 지도 screenshot은 workspace scratch에만 보관하며 저장소에는 관찰 로그와 hash만 기록한다. 데이터·폰트·타일 바이너리·자격 증명은 커밋하지 않는다.
- 선택 Supabase 경계 검토에 Supabase 스킬을 적용했으며 프로젝트/테이블 생성이나 외부 메시지 전송은 하지 않았다.

### 6. 남은 작업 또는 차단 요인

- M1에서 exact 후보 설치·lockfile·Android/iOS 빌드, 실제 지원 OS/장비·메모리 예산을 확정해야 한다.
- 공공데이터 원본별 라이선스·폰트 도구 잠금·한국어 검색 품질·타일 비용/성능은 해당 도입 단계에서 실제 검증해야 한다.
- REA MCP/Ghidra MCP가 노출되지 않고 ADB/Ghidra CLI도 발견되지 않았다. 권한 있는 앱이나 APK가 제공되지 않아 모바일 앱 UX 분석은 미실행이다.
- GitHub 기본 브랜치 설정은 여전히 main이 아니므로 PR base를 명시한다. 이번 설계 main 병합 및 실제 배포는 승인되지 않았다.

### 7. Git 브랜치와 커밋 해시

- 브랜치: `docs/technical-architecture`, base: `main`의 `38c36f84f1e62f0419583faa5b593a2d6a71daf8`.
- 커밋 식별 명령: `git log -1 --format='%H %s' --grep='^docs: design Korea Map Kit architecture and MVP$'`.
- 문서 검사 통과 후 commit/push하고 연결된 GitHub 커넥터로 검토용 PR을 생성한다. 실제 커밋 해시와 PR 결과는 사용자에게 보고한다.

### 8. 다음 단계 진행 가능 여부

- M1 모노레포·공통 계약·버전 잠금·모바일 호환성 spike 진행 가능. 설계 검증은 제품 구현/성능 합격과 별개다.
- 이번 PR은 main에 자동 병합하지 않는다. main 병합·운영 배포·공개 전환·npm 실제 발행에는 각각 명시적 승인이 계속 필요하다.

## M0 후속 — Zero Publisher Cost 정책과 정적 감사

기준일: 2026-10-19 (UTC). 기존 아키텍처 설계에 사용자가 지정한 비용 정책 12개를 적용한다. 상태: 정책·설계 반영 및 정적 검사 통과. SDK 런타임 정책 구현과 실제 요청 검증은 미완료다.

### 1. 구현 완료 기능

- 제작자 계정 기본 연결 금지, 운영자 provider 설정, 무설정 안전 실패/명시적 로컬 fixture, 공개 환경변수 노출, 데모·Actions 비용 제한을 프로젝트 정책에 저장했다.
- README에 무료 SDK 배포와 운영자 타일·검색·경로·서버 비용의 차이를 설명했다. 요구사항 Z01~Z12와 ADR-009를 추가해 MVP 단계에 배치했다.
- 외부 요청 없이 작업 트리·Git index·도달 가능한 이력 및 지정 npm tarball을 검사하는 정적 감사 도구를 구현했다. 실제 비밀값을 출력하지 않으며 런타임 검증 여부를 항상 별도로 표시한다.
- 실제 배포 전 설치·실행·테스트의 네트워크 시도를 조사하는 절차와 현재 증거/미검증을 비용 감사 문서에 기록했다.

### 2. 생성/수정 파일

- 신규: [README.md](../README.md), `.gitignore`, [cost-audit.md](cost-audit.md), [ADR-009](decisions/009-zero-publisher-cost.md).
- 신규 도구: [audit-cost-security.py](../scripts/audit-cost-security.py), [test-cost-audit.py](../scripts/test-cost-audit.py).
- 수정: [AGENTS.md](../AGENTS.md), [architecture.md](architecture.md), [requirements.md](requirements.md), [roadmap.md](roadmap.md), [ADR-008](decisions/008-release-and-quality.md), [design-validation.md](research/design-validation.md), [check-design.py](../scripts/check-design.py), 이 진행 기록.

### 3. 실행한 테스트와 결과

- `python3 scripts/check-design.py`: 통과. 36개 요구사항, ADR 9개, 단계별 배치와 상대 링크 검사.
- `python3 scripts/audit-cost-security.py`: `PASS_STATIC_ONLY`, 탐지 규칙에 해당하는 발견 사항 0건. 정적 범위이며 SDK 무요청 증명이 아니다.
- `python3 scripts/test-cost-audit.py`: 11개 통과. staged/삭제 이력 secret, 값 미출력, 외부/사설 endpoint, install hook·runner·cache·배포 config, tar 내부 secret·경로 탈출 등의 회귀 검증.
- 초기 스캐너 자신의 문자열에 대한 탐지 결과를 검토하고 오프라인 참조/합성 fixture를 명확히 한 뒤 재검사했다. 실제 키를 예외로 허용하지 않았다.
- 최종 변경에도 위 세 명령, Python AST, `git diff --check`와 `git diff --cached --check`를 재적용한 후 커밋한다. 실제 SDK/npm/Web·Native 빌드 테스트는 제품 코드가 없어 미실행·미검증이다.

### 4. 실화면 QA 결과

- 이번 변경의 Web·Android·iOS 실화면 QA는 미실행·미검증이다. 실행할 자체 지도 UI나 앱이 없고 기존 upstream 예제 관찰을 이 정책의 제품 QA로 재사용하지 않는다.

### 5. 라이선스 및 보안 문제

- 데이터·폰트·타일·런타임 의존성 추가 없음. MIT 코드 목표와 데이터별 이용허락 분리 유지.
- 현재 정적 감사 발견 사항 0건. 정규식 기반 도구는 임의/난독화 secret과 실제 네트워크를 증명하지 못하며 한계를 비용 감사에 명시했다.
- `.env`·인증 파일·빌드 파일을 ignore하고 실제 npm publish allowlist/tarball 검사를 출시 gate로 설정했다. `.gitignore`만으로 유출 방지를 보장하지 않는다.
- 제작자 API/유료 계정, 원격 cache, Actions workflow, 운영 데모, 배포 설정을 생성하거나 활성화하지 않았다.

### 6. 남은 작업 또는 차단 요인

- M1부터 provider 필수 검증과 로컬 fixture를 실제 구현하고 외부 통신이 차단된 환경에서 기본 빌드·테스트를 검증해야 한다.
- 실제 npm 산출물, Web bundle/APK·IPA, 설치/실행 네트워크, 데모 및 CI 계정 한도 감사가 남아 있다. 제품 배포는 이 미검증 항목이 해소되기 전 완료 처리하지 않는다.
- 아키텍처 PR #1이 미병합 상태이므로 이번 PR은 해당 브랜치를 기준으로 정책 변경만 비교한다. 후속 main 병합과 실제 배포는 이번 요청의 범위가 아니다.

### 7. Git 브랜치와 커밋 해시

- 브랜치: `docs/zero-publisher-cost`, base: `docs/technical-architecture`의 `e832012f341c41f6670ba27c423195f97ad927d1`.
- 커밋 식별 명령: `git log -1 --format='%H %s' --grep='^chore: enforce Zero Publisher Cost policy$'`.
- 검사 후 commit/push하고 연결된 GitHub 커넥터로 draft PR을 만든다. 실제 커밋 해시와 PR URL은 사용자 보고에 포함한다. main 변경·npm 발행·운영 배포는 수행하지 않는다.

### 8. 다음 단계 진행 가능 여부

- 정책과 정적 검사를 기반으로 M1 구현 진행 가능. 현재 결과는 제품 Zero Publisher Cost 런타임 검증 완료나 출시 승인이 아니다.

## STEP 01 / M1 진행 — 모노레포 foundation

기준일: 2026-10-19 (UTC). 사용자 요청의 실제 workspace와 개발 도구 구축 범위다. M1 전체와 제품 출시 완료가 아니다. 비용 정책 PR #2 위에 독립 브랜치로 작업한다.

### 1. 구현 완료 기능

- TypeScript strict/project references, pnpm 11 workspace projects, ESLint/Prettier, Vitest, Changesets, cross-platform Node/Python scripts, 환경 예제와 MIT LICENSE를 구성했다.
- core/web/native/styles/data-adapters 5개 SDK, Next/Expo private 소비 앱, geo-data/search/routing private 서비스 경계를 분리했다. 서비스 엔진은 descriptor만 가진 미구현 상태다.
- core의 외부/DOM/React Native/Supabase 의존성 차단 검사, 명시적 fixture 설정·실패 계약, 원본 합성 스타일/검색과 최소 Web/Native wrapper를 구현했다.
- 무료 표준 3 OS GitHub Actions workflow를 구성했다. cache/artifact/deploy/publish는 활성화하지 않았다.

### 2. 생성/수정 파일

- root: package.json, pnpm-workspace.yaml, pnpm-lock.yaml, tsconfig.base/build, ESLint/Prettier/Vitest/Playwright, .node-version/.npmrc/.gitattributes/.env.example/LICENSE, .changeset, .github/workflows/ci.yml.
- packages 5개, examples 2개, services 3개의 manifest/tsconfig/source/README 및 환경 예제.
- scripts: task runner, tool wrapper, 경계 검사, Python launcher, pack 검사, offline install 검사, 로컬 static QA 서버. tests: 단위 3파일 및 Web E2E.
- 정책·README·architecture·ADR-008·roadmap·progress·cost-audit 수정, development/toolchain/foundation validation 기록 추가. 정확한 파일 목록은 이 단계 commit diff를 따른다.

### 3. 실행한 테스트와 결과

- `pnpm check`: 경계·ESLint·Prettier·strict typecheck·Vitest16·SDK/services/Next/Expo JS build·문서·정적 감사·Python 회귀11·Changesets status 통과.
- `pnpm pack:check`: 실제 SDK tarball 5개 내용과 secret/endpoint 규칙 검사 통과. `.env`, 소스맵, tsbuildinfo, 예제/서비스 제외.
- `pnpm offline:check`: 새 임시 workspace에 캐시만으로 설치 성공, dependency hook 비활성. Linux trace에서 인터넷 connect 0건.
- `pnpm test:web`: Chromium에서 로드·pan·합성검색·reload 통과. 관측 외부 HTTP 시도 0건, pageerror 0.
- `pnpm audit --json`: **미통과, high 2건**. 수정 버전이 없는 Expo/Metro 전이 의존성으로 제품 출시 차단. 상세는 비용 감사 참조.
- 초기 오류: pnpm12 실행 파일 방식, RN11 API 이름, 테스트 모듈 mock 해석, worker 경로/MIME, screenshot idle 조건을 실제 실행으로 수정했다. offline 재설치는 다른 filesystem의 캐시 경로 문제를 명시적 store/copy로 해결했다.
- 최종 Linux pnpm check syscall 추적: 외부 TCP connect 0, Expo 로컬 경로 탐색용 UDP connect 1, 인터넷 send 계열 호출 0. probe까지 0으로 표현하지 않는다.
- 원격 CI 3 OS 결과는 PR checks로 확인한 뒤 사용자에게 보고한다. 로컬 Linux 결과를 Windows/macOS 실행 결과로 대체하지 않는다.

### 4. 실화면 QA 결과

- 자체 Next.js 정적 예제를 실제 Chromium에서 열어 합성 polygon/point·한글 앱 UI·MIT 출처 표시를 관찰했다. pan 이후 idle screenshot을 확인하며 실제 지리 데이터나 한글 map glyph QA는 아니다.
- Android/iOS: JavaScript 번들 생성만 성공. 네이티브 컴파일·설치·실화면·Native 네트워크는 도구/기기 부재로 미검증이다.

### 5. 라이선스 및 보안 문제

- 자체 코드·합성 fixture에 MIT LICENSE 적용. OSM/공공데이터/외부 폰트는 도입하지 않았다. MapLibre worker의 BSD LICENSE는 로컬 자산과 함께 복사한다.
- API 키·제작자 endpoint·결제 설정·클라우드 계정 없음. 클라이언트 환경값 공개 가능성을 문서화했다. 정적 감사는 heuristic이며 실제 Native/network 전체 검증을 대체하지 않는다.
- node-forge/braces high2 미해결을 숨기지 않고 출시 gate로 유지한다. uuid 경고는 한정 override와 합성 xcode ID smoke로 해소했다.

### 6. 남은 작업 또는 차단 요인

- Android/iOS 실제 로컬 빌드·Gradle/Pods 잠금·기기/시뮬레이터 QA·성능 예산, 전체 공통 API 및 네트워크 provider 구현이 남아 있다.
- 전국/한국 실제 타일·glyph·공공데이터·검색/라우팅 엔진은 후속 milestone이다. backend descriptor를 실행 서비스로 표시하지 않는다.
- 의존성 보안 high2로 제품 출시는 차단된다. npm scope 소유권·최종 데이터/의존 라이선스/SBOM·전체 배포물 감사도 필요하다.

### 7. Git 브랜치와 커밋 해시

- 브랜치: `feat/monorepo-foundation`, base: `docs/zero-publisher-cost`의 `131a1789231745d1dc791597d0a9844f384a2bb5`.
- 커밋 식별: `git log -1 --format='%H %s' --grep='^feat: bootstrap Korea Map Kit monorepo$'`.
- 기능 테스트/타입/빌드 통과 후 commit/push, 연결된 GitHub 커넥터로 draft PR을 생성한다. 보안 audit 실패는 명시적으로 남긴다. main 병합·운영 배포·npm 발행은 하지 않는다.

### 8. 다음 단계 진행 가능 여부

- M1 남은 Native 호환성/실화면과 M2 SDK 계약 구현을 계속 진행할 수 있다. 모노레포 기능 검증 통과이며 M1/MVP 전체 완료 또는 보안/출시 합격이 아니다.

### CI 최초 실행과 수정

- [최초 CI 실행](https://github.com/kasa500000-png/KoreaMap/actions/runs/39205075633): Windows 전체 통과. Linux/macOS는 build·unit·문서·감사까지 통과했으나 마지막 Changesets에서 로컬 main ref가 없어 실패했다.
- changeset:status에 `--since=origin/main`을 명시해 detached checkout에서도 비교할 수 있게 수정했다. 로컬 main이 없는 임시 clone의 detached HEAD에서 실제 재현 검사 통과. 수정 커밋 식별: `git log -1 --format='%H %s' --grep='^fix: resolve Changesets base in detached CI checkouts$'`. 원격 재실행 결과는 PR #3 checks와 사용자 보고로 확인한다.
- 실제 core tarball을 새 임시 소비 프로젝트에 `npm install --offline --ignore-scripts --no-audit --no-fund`로 설치하고 Node에서 import·좌표 검사·CONFIG_REQUIRED 실패를 확인했다.
- GitHub Actions 권한 설정 조회는 연동 API 권한 부족 HTTP403이었다. 실제 workflow 실행 조회는 가능하며 과금/권한 설정을 변경하지 않았다.

### 원격 CI 재실행 결과

- [https://github.com/kasa500000-png/KoreaMap/actions/runs/39205327239](https://github.com/kasa500000-png/KoreaMap/actions/runs/39205327239): 코드/CI 수정 커밋 `b538e9506fb6e238f60421a6751100c822fc3320`에서 Linux·Windows·macOS **모두 success**. 각 OS의 pnpm check와 pack 검사, Linux Chromium E2E까지 통과했다.
- 이 결과는 3 OS에서 JavaScript/TypeScript 개발 경로를 검증한 것이다. macOS runner 사용 자체를 iOS 앱 컴파일·시뮬레이터 QA로 해석하지 않는다. Native 실빌드/기기 QA와 high2 출시 차단은 그대로 남는다.
- 최종 문서 기록 커밋 식별: `git log -1 --format='%H %s' --grep='^docs: record foundation CI verification$'`. 문서 갱신 후 문서/감사/format/diff 검사를 통과한 뒤 커밋한다.

## STEP 02 — 데이터 공급원·라이선스·공개 차단 (2026-10-19)

### 1. 구현 완료 기능

- 7개 조사 대상군을 16개 범위별 항목으로 분리: A 6 / B 0 / C 8 / D 2. 공식 원본·기관·형식·CRS·포털 수정일/데이터 기준일·권리·출처·비용/쿼터·충돌·접근 실패 기록.
- A 수집 자격과 운영자 opt-in, A/B 외부 API 선택, C/D 제외, 90일 검토 만료를 offline 정책 검사로 구현했다. B 실제 확인 사례는 없어 실 API 어댑터를 추가하지 않았다.
- Git worktree/index payload 차단, runtime source 출처·SHA-256 검토, 실제 npm tarball 파일/바이트 검사, 문서-원장 일치 검사와 CI 연결을 구현했다.

### 2. 생성/수정 파일

- 생성: docs/data-sources.md, docs/data-licenses.md, docs/attribution.md, docs/research/data-validation.md, data/sources.json, data/publication.json.
- 생성: scripts/data_policy.py, scripts/check-data.py, scripts/test-data-policy.py, scripts/render-data-docs.py.
- 수정: AGENTS.md, README.md, .gitignore, package.json, .github/workflows/ci.yml, scripts/tasks.mjs, scripts/pack-check.mjs, scripts/audit-cost-security.py, docs/roadmap.md, docs/progress.md, docs/cost-audit.md.
- SDK runtime 코드·의존성·lockfile은 변경하지 않았다.

### 3. 실행한 테스트와 결과

- `pnpm check`: 데이터 정책 회귀16, 기존 Vitest16·비용 감사 회귀11, 경계·lint·format·타입·SDK/services/Next/Expo JS build·문서·원장 동기화·정적 비용 검사·Changesets 통과.
- `pnpm pack:check`: 다섯 실제 tarball의 source 대응 멤버·manifest·내용 일치 및 보안/비용 검사 통과. 해시는 검증 기록 참조.
- `pnpm check:data --staged`: index 출처·payload 검사 통과 후 커밋한다. CI에도 동일 명령을 추가했다.
- `pnpm test:web`: Chromium 로드·pan·합성 검색·reload 통과. 외부 HTTP 시도 0, pageerror 0.
- 정책 CLI의 실제 Linux 네트워크 syscall 0건. 검사 중 API 키·외부 서비스 계정 불필요.

### 4. 실화면 QA 결과

- 로컬 Next fixture 화면의 합성 polygon/point, 한글 UI, MIT 출처 표시를 실제 screenshot으로 확인했다. 제3자 데이터 원본이나 API를 표시한 화면 QA는 수행하지 않았다.
- Android/iOS 실빌드·실화면은 미검증이다. Expo JS export 성공만 확인했다.

### 5. 라이선스 및 보안 문제

- ODbL 데이터와 MIT 코드를 분리한다. 개별 포털의 제한 없음 표기를 MIT/CC0/공공누리로 재명명하지 않았다.
- 전국 표준 목록과 메타데이터 제공자의 범위 불일치, VWorld/NGII/주소정보 열람·공급조건 미확인, TourAPI 사진 혼합 권리는 C/D로 제외했다. D는 적힌 용도에 대한 제외이며 모든 사용이 불법이라는 뜻이 아니다.
- 실제 제3자 payload·API secret·제작자 endpoint를 추가하지 않았다. 정적/해시 검사는 수동 권리 검토를 대신하지 않는다.
- 기존 dependency high2 출시 차단 유지, 이번 dependency audit 재조회는 미실행이다.

### 6. 남은 작업 또는 차단 요인

- A 원본 파일의 SHA·실제 기준일·필드/개인정보·CRS/품질 확인과 운영자 수집기 구현, B 실 provider 권리 확인 및 어댑터 구현이 남아 있다.
- C 자료의 개별 약정/출처·미디어별 권리 확인, ODbL 파생 DB 공개/접근 제공 설계, 실제 타일/DB 분리 배포 검증 필요.
- 검토 만료일 2027-01-17. 자동 승격하지 않으며, 만료 후 공식 근거를 재확인한다.
- 원격 3 OS CI 결과는 PR 실행 후 별도 기록한다. Native·제품 전체 출시는 여전히 차단된다.

### 7. Git 브랜치와 커밋 해시

- 브랜치: `feat/data-source-policy`, base: `feat/monorepo-foundation`의 `828911bd63ea354ed33eeeb06446cfe085aeeacf`.
- 커밋 식별: `git log -1 --format='%H %s' --grep='^feat: add data provenance and publication gates$'`.
- 로컬 검사 통과 후 commit/push, 연결된 GitHub 커넥터로 독립 draft PR을 만든다. 이번 단계 main 병합·운영 배포·npm 발행은 수행하지 않는다.

### 8. 다음 단계 진행 가능 여부

- 승인 범위의 A 데이터에 대한 운영자 수집 파이프라인·파일 QA 및 독립 SDK 개발 진행 가능. C/D 도입, 실제 데이터 공개 배포, MVP 전체 완료 판정은 불가하다.

### 원격 검증과 구조화 데이터 차단 보강

- [PR #4](https://github.com/kasa500000-png/KoreaMap/pull/4)를 연결된 GitHub 커넥터로 생성했다. `ac2d4d209f848c70ab9b49afe05f431623d50ad6`의 [CI 실행](https://github.com/kasa500000-png/KoreaMap/actions/runs/39207562003)은 Linux·Windows·macOS 모두 success다. 각 OS의 check/staged/pack과 Linux E2E가 통과했다.
- 추가 수동 검토에서 CSV 외 XML/RDF/줄 단위 JSON 등의 형식과 임의 경로의 JSON도 명시적으로 거부하도록 보강했다. 알려진 설정/조사 JSON 경로만 허용하며 그 안의 중첩 GeoJSON도 거부한다. 음성 회귀 사례를 확장한 뒤 `pnpm check`, 실제 tarball 검사, staged 검사를 통과했다.
- 보강 커밋 식별: `git log -1 --format='%H %s' --grep='^fix: reject unreviewed structured data payloads$'`. 최종 커밋의 원격 결과는 PR checks와 사용자 보고를 따른다. Native 및 외부 데이터 QA 미검증 범위는 동일하다.

## Web 지도 SDK — 2026-10-19

1. **구현 기능:** MapLibre 초기화/종료, 상태 분리, 카메라/줌/이동/회전, 배치 마커와 선택·장소 카드, GeoJSON Point/Line/Polygon·경로 표시, 사용자 레이어, 이벤트, 자동 크기 조정, 로딩/오류/Abort 처리, 키보드 선택과 출처. 명시적 운영자 style/허용 origin/비용동의 및 Next 클라이언트 dynamic import.
2. **파일:** packages/core/src/index.ts, packages/web/src/{index,state,provider,geojson}.ts, packages/web/README.md, examples/web/app/{map-client,map-demo,page}.tsx와 style.css, tests/unit/web.test.ts, tests/e2e-web/fixture.spec.ts, data/publication.json, .changeset/web-map-sdk.md, README와 roadmap/progress/cost-audit/Web 검증 문서.
3. **테스트:** Vitest 18, 타입/ESLint, Next production build 및 Chromium E2E 4개 통과. 100/1,000 실제 렌더링 마커, 포인터/모바일 터치, 선택, resize, 5회 재생성, 오류/복구 및 origin 차단 검사. 전체 검사·tarball·staged 최종 결과는 아래 확정 기록에 추가한다.
4. **실화면:** desktop 및 390×844 mobile Chromium screenshot 직접 확인. 합성 지도와 한글 UI·경로·장소 카드·MIT 출처 정상. 실기기 및 Safari/Firefox 미검증.
5. **라이선스/보안:** 자체 작성 데이터만 MIT, 실제 외부 데이터 없음. 외부 endpoint 기본값/제작자 credential 없음. 운영자 config는 공개정보이며 secret 저장소가 아니다. 기존 dependency high2 출시 차단 유지.
6. **남은 작업:** 상위 MapLibre global dispatcher worker 1개 유지(완전 종료 미충족). 지도별 리스너/observer/DOM 해제 및 worker 비증가·제한된 heap 회귀 통과. Native API 동등성, 실제 타일/glyph/검색·경로 계산, 장시간/GPU/실기기 QA 미완료.
7. **Git:** `feat/web-map-sdk`, base `feat/data-source-policy` (`001252c6f4fea50fea7dfbc3feafb035676a18fd`). 커밋 조회: `git log -1 --format='%H %s' --grep='^feat: implement MapLibre web map SDK$'`. 연결된 GitHub 커넥터로 draft PR 생성 예정. main 병합·운영 배포·npm 발행 없음.
8. **다음 단계:** 독립 Native adapter/실제 타일 파이프라인 및 Web 호환성 검증 진행 가능. 제품 전체 완료/출시 판정은 불가. 자세한 제한은 [Web SDK 검증](research/web-sdk-validation.md) 참조.

### 최종 로컬 검사 확정

`pnpm check`·`pnpm pack:check` 통과, 최종 Next 배포물 Playwright 4개 통과(0 skipped/flaky). SDK 상태/오류 단위 테스트를 포함한 Vitest 18개, 데이터 정책 16개, 비용 감사 11개 통과. 다섯 재생성 전후 GC heap 증가 +206,008 bytes; 공유 worker 1개 유지와 SDK 리스너/observer 해제 확인. artifact SHA와 범위는 Web 검증 문서에 기록했다. staged 검사를 통과한 뒤 커밋하며 원격 3 OS CI는 PR에서 확인한다.

## 독립 지도 디자인 시스템 — 2026-10-19

1. **구현:** Standard/Dark/Pastel/Outdoor 토큰·JSON 생성기, 도로/건물/녹지/수역/경계/POI/지명/배경·zoom 규칙, 사용자 색/테마 override, custom JSON/추가 source/layer, 자체 RGBA 아이콘. 한국어 fallback·cmap/glyph coverage·Web inline style/image API 및 Next `/themes/` 비교 예제.
2. **파일:** packages/styles/src의 tokens/themes/labels/icons/design-fixture/font-coverage와 index, packages/web의 index/provider, examples/web의 themes 페이지·CSS·Next 설정·manifest/lockfile, 단위/E2E, scripts/check-font.mjs·data policy 검사, 네 screenshot과 publication manifest, CI·Changeset·AGENTS·README·디자인/폰트/비용/검증 문서.
3. **테스트:** 4종 실제 Style Spec과 Native glyph 설정 계약, Noto KR face 1의 11,190 코드포인트 coverage, Chromium 테마/기존 SDK 회귀 검사를 실행한다. 최종 전체 검사·tarball·staged 결과는 아래 확정 기록에 추가한다.
4. **실화면 QA:** Web Chromium 4종의 합성 지형·한글·아이콘·출처를 실제 캡처하고 직접 확인. Android/iOS·Safari/Firefox는 미검증. Web 결과를 Native 결과로 보고하지 않는다.
5. **라이선스·보안:** 자체 코드/합성 fixture/아이콘은 MIT. Noto OFL-1.1 조건 확인, 폰트/glyph payload는 Git/npm 미포함. 외부 endpoint 기본값과 제작자 키 없음. 사용자 요청 screenshot 네 경로만 검토·해시 승인하며 원본 데이터 차단 유지. 기존 high2 미해결.
6. **남은 작업:** REA/ADB/Ghidra/iOS 환경 부재. Native 실화면·운영자 glyph pack QA, 실제 tile 스키마 변환·지명 밀집/색각·전체 플랫폼 동등성 검증 필요. MapLibre 전역 worker 제한 유지.
7. **Git:** `feat/map-design-system`, base `feat/web-map-sdk`의 `7eb09fce85b5dbbf4f33afe3b57da0ab7467f1e2`. 커밋 조회: `git log -1 --format='%H %s' --grep='^feat: add independent map design system$'`. 테스트 후 커밋/푸시 및 연결된 GitHub 커넥터로 draft PR을 준비한다.
8. **다음 단계:** 실제 타일·폰트/glyph 운영자 파이프라인 및 Native 시각 QA 개발 가능. 플랫폼 전체 검증 또는 출시 완료 판정은 불가하다.

### 최종 로컬 검사 확정

`pnpm check`(Vitest 31·데이터 정책 17·비용 감사 12), `pnpm pack:check`(5개 tarball), 최종 Next 배포물 Playwright 5개가 통과했다. Noto KR face 1의 11,190 코드포인트와 Chromium font 선택/실제 한글 raster·4종 화면·override 픽셀·출처 표시를 확인했다. 외부 HTTP 시도 0. staged 검사를 통과한 뒤 커밋하며 원격 결과는 해당 PR checks를 따른다. Android/iOS 렌더링 미검증과 high2 출시 차단은 유지한다.

## Web·React Native 공통 Public API — 2026-10-19

1. **구현:** 필수 공통 타입/GeoJSON 부분집합, 9개 주요 API와 setCamera/removeGeoJSON/onEvent/destroy, 여섯 Provider 인터페이스, 순수 검증·bounds/route 변환, portable 취소/기한/error 모델. Web handle.api와 Native ref/Source/Layer 연결, 생성 API 문서·타입 예제·동등성 표·Changeset.
2. **파일:** packages/core/src의 base/contracts/validation/operations/controller/index, packages/web의 public-api/index/state/geojson, packages/native의 controller/index, data-adapters 검색 취소 처리, Web /api·Expo 예제, tests/types·unit·core-independent·e2e, API 문서 generator·경계 검사·task/manifest·publication·README·설계/진행/비용 문서.
3. **테스트:** Vitest 41, core 독립 Node 1, 타입 검사와 Next production build, Expo Android/iOS JS export, Playwright 6개 통과. 최종 check/pack/staged 확정은 아래 기록. 발견한 초기 ready 시점의 origin 차단 회귀를 수정하고 전체 브라우저 검사를 다시 통과했다.
4. **실화면:** Web 공통 API Dark 지도·도형·경로·선택 팝업·한글 UI·출처 캡처 직접 확인. 2회 스타일 교체 후 표시 유지, 종료 canvas/popup 제거 검증. Android/iOS는 mock bridge와 JS export만 수행해 실화면 **미검증**이다.
5. **라이선스/보안:** 기존 라이선스 경계 유지, 자체 코드/합성 예제 MIT. 새 외부 데이터/폰트·엔드포인트·키 없음. core UI/백엔드 의존성 없음. 비용 gate 유지, Native 외부 스타일 실패. 기존 high2 미해결(새 advisory 조회 미실행).
6. **남은 작업:** Native 기기 build/렌더링·접근성/제스처/lifecycle, resource interceptor·glyph 공급, 실제 Provider 구현, Safari/Firefox 및 장시간/GPU 검증. 기존 MapLibre singleton worker 1개 유지 제한. API 계약 구현을 서비스/전체 MVP 출시 완료로 판정하지 않는다.
7. **Git:** `feat/shared-public-api`, base `feat/map-design-system` (`f112fb0330e8de88e85bc75591d6cf4f7c3ee509`). 커밋 조회: `git log -1 --format='%H %s' --grep='^feat: implement shared public map API$'`. 검사 후 commit/push 및 연결된 GitHub 커넥터로 draft PR을 생성한다. main 병합·운영 배포·npm 발행 없음.
8. **다음 단계:** 공통 계약을 이용한 선택형 provider 구현과 Native 기기 QA 진행 가능. 외부 Native 스타일 지원 및 제품 출시 완료 판정은 위 차단 항목 해결 후 가능하다. [검증 기록](research/public-api-validation.md) 참조.

### 최종 로컬 검사 확정

`pnpm check`(Vitest 41·core 독립 Node 1·데이터 정책 17·비용 검사 12), `pnpm pack:check`(5 SDK tarball), 최종 Next 배포물 Playwright 6개가 통과했다. 타입 음성 사례, API 선언 문서 일치, core 외부 의존성/DOM 금지, 실제 Web 스타일 교체·카메라·overlay·선택·취소·종료·출처를 검증했다. 외부 HTTP 시도 0. staged 검사를 통과한 뒤 커밋하며 원격 결과는 PR checks를 따른다. Native 실기기/실빌드 및 기존 high2 출시 차단을 유지한다.

### Native 타입 및 CI 회귀 보강

Native의 실제 MapLibre 선언 해석을 검사해 NodeNext의 암묵적 any를 발견하고 Bundler로 수정했다. CameraStop union과 RN 고정 Style Spec 26.2.1(ISC) validator를 적용하고 `check:native-types`를 CI 필수 단계로 추가했다. pnpm lockfile에는 기존 전이 버전을 Native 직접 의존성으로만 연결했다. 첫 원격 CI는 Windows/macOS 통과, Linux 기존 font-probe 조회 실패였다. 폰트 준비·레이아웃 후 동일 KR face 조건을 검사하도록 보강하고 전체 check/pack/브라우저 6개를 다시 통과했다. 후속 커밋의 원격 CI 결과는 PR checks로 구분한다. 후속 커밋 식별: `git log -1 --format='%H %s' --grep='^fix: enforce resolved native API types and font readiness$'`.
## 공공 POI 데이터 통합 기반 — 2026-10-19

1. **구현:** A CSV 3종의 opt-in/권리·기한·CRS·해시·필드 검증, 인코딩/중복 처리, PostGIS 변환·원자적 upsert·갱신·복구·실행 로그, 로컬 Docker, 비공개 schema/RLS·reader/writer, 제한된 HTTP 조회. 공통 PublicPlace/PlacesProvider와 getNearbyPlaces/getPlacesInBounds/getPlacesByCategory, 합성 7카테고리·운영자 transport, 타입 예제·API 문서.
2. **파일:** packages/core/src/places.ts 및 index, packages/data-adapters/src/places.ts 및 index/README, services/geo-data/src와 compose/manifest/tsconfig/README, scripts/geo-local.mjs, tests/unit/geo-ingestion·places, tests/geo-integration·types/places·core-independent, root scripts/lockfile/CI/.env, data 원장/출처 해시, 문서·Changeset·AGENTS.
3. **테스트:** `pnpm check` 통과(Vitest 52, 독립 core 1, 데이터 정책 17, 비용 감사 13, strict/ESLint/포맷/API 선언·설계 검사, Next production build, Expo Android/iOS JS export). `pnpm test:geo` 실제 임시 Docker PostgreSQL18/PostGIS3.6.4 총 12개 통과. 개발용 start/migrate/fixture/stop 7건 적재 확인. 초기화 중 socket ready 판정 실패를 TCP healthcheck로 수정 후 통과했다. tarball/staged/브라우저 최종 기록은 아래에 확정한다.
4. **실화면 QA:** 이번 기능은 headless 서비스/API이며 신규 지도 UI를 구현하지 않았다. 실제 DB·HTTP 동작을 검증했지만 공공 POI의 지도 화면과 Android/iOS 실기기 화면은 **미검증**이다. 기존 Web 렌더러의 회귀 검사와 별개로 판단한다.
5. **라이선스·보안:** SDK/합성 자료 MIT, pg/csv-parse MIT. 실제 데이터와 PostGIS/GPL·PostgreSQL/DB 이미지 라이선스는 분리. Git/npm에 공공 행·사진·폰트·암호 미포함. 원본은 메모리 처리, 개인 필드/이미지 저장 제외. 제작자 서비스 fallback 없음. 최신 의존성 감사의 기존 high2는 미해결이며 출시 차단 유지.
6. **잔여/차단:** 공공데이터포털/LOCALDATA HTTP 503으로 원본 파일·헤더·실위치 미검증. 공원/화장실 추가 승인, TourAPI CRS/키, XLSX, 대규모 파일/삭제·병합·행별 기준시각, 운영 인증/공개 서버, Supabase·Native 실기기·macOS/Windows Docker 검증은 후속. 현재 수집기를 실제 전국 데이터 통합 완료로 표시하지 않는다.
7. **Git:** `feat/public-poi-etl`, base `feat/shared-public-api` (`7bd4ea416de0d2f19de4b80ca09a79aa7a757d2d`). 커밋 조회: `git log -1 --format='%H %s' --grep='^feat: add rights-gated public POI ingestion and queries$'`. 검사 후 커밋/푸시하고 연결 GitHub 커넥터로 draft PR을 생성한다. main/배포/npm 발행 없음.
8. **다음 단계:** 접근 가능한 정확한 A 원본의 운영자 검토/매핑/좌표 QA와 누락 분야 권리 검토 진행 가능. 실자료 적재 성공·전체 M6 완료·운영 공개 판정은 아직 불가하다. [가이드](public-data-etl.md), [검증 기록](research/poi-etl-validation.md) 참조.

### 최종 로컬 검사 확정

`pnpm check`, 실제 Docker `pnpm test:geo` 12개, `pnpm pack:check` 5개 SDK tarball, 기존 Web Playwright 6개가 통과했다. Vitest 52·core 독립 1·데이터 정책 17·비용 회귀 13개이며 새 CSV 인코딩/opt-in 타입 오류 차단도 확인했다. 패키지에서 DB 서비스/원본/키가 제외되고 검토한 빌드와 바이트가 일치한다. stage 후 `check:data --staged`와 비용 검사를 다시 수행하고 커밋한다. 원격 3 OS CI는 PR checks의 실제 결과로 구분한다. 신규 공공 POI 실화면·실자료·Supabase·Native 디바이스와 high2는 미검증/잔여 상태를 유지한다.

## 한국 주소·장소 검색 — 2026-10-19

1. **구현:** SearchProvider 호환 한국 POI 이름/주소·영역·근거리·카테고리 검색, 접두어 자동완성, 페이지·출처, portable 취소/기한/오류, 선택 카메라, nearby-poi 역조회. private PostGIS/pg_trgm 생성 열·GIN/prefix 인덱스·read-only SQL·로컬 HTTP와 Next `/search/` 합성 예제. 전국 주소 geocoding은 별도 계약으로 유지한다.
2. **파일:** packages/core/src/search·index, data-adapters/src/search·index/README, services/search/src/{migration,provider,server,cli,index} 및 manifest/tsconfig/README, geo-data manifest, Web app/search, tests/unit·types·e2e·search-integration·core-independent, scripts/geo-local·비용 감사, .env·root scripts·lockfile·Changeset·publication, API/검색/검증/README·roadmap·cost-audit·진행 문서.
3. **테스트:** `pnpm check` 통과: Vitest57, 독립 core1, 데이터정책17, 비용감사14, strict/native 타입·lint·format·API/설계·Next production·Expo Android/iOS JS export. 실제 Docker `pnpm test:geo`19개 통과(기존 ETL 포함), 서울/울산/제주·한글 오타/띄어쓰기·주소/필터/페이지·지연/취소·실제 HTTP 확인. 소형 fixture HTTP10회 p50 5.49ms/p95 23.61ms이며 전국 성능 증거가 아니다. 최종 tarball/staged/브라우저 결과는 아래 확정 기록을 따른다.
4. **실화면 QA:** Chromium 7개 E2E 첫 실행 통과. `/search/` 캡처 직접 확인: 한글 결과·합성 주소·MIT 출처·중심 이동·마커 정상. fixture 배경 도형은 서울 일부만 있어 울산/제주는 단색 배경+선택 마커다. 실제 지도/주소 데이터 화면으로 표시하지 않는다. 신규 검색 Native 기기·Safari/Firefox는 **미검증**이다.
5. **라이선스/보안:** 자체 코드·7건 fixture MIT, 제3자 데이터/키/DB URL 배포 없음. 공개 Nominatim 호출 없음, 운영자 서비스만 명시 연결. SDK core 외부 의존성0, pg는 private 서비스. 기존 high2 취약점 미해결로 출시 차단 유지; 새 advisory 조회는 하지 않았다.
6. **잔여/차단:** 전국 도로명·필지 지오코딩, 실자료 적재/정확도·초성/형태소/동의어·규모/부하·운영 인증 gateway·Native UI/기기 QA 미완료. reverseNearby는 인접 POI 주소이며 정확한 지점 주소로 간주하지 않는다. 실제 원천 HTTP503과 이전 단계 제한 유지.
7. **Git:** `feat/korean-search`, base `feat/public-poi-etl` (`2c1ed9690fdba647eada8b21f07c8c056973a2dd`). 커밋 조회: `git log -1 --format='%H %s' --grep='^feat: add Korean PostGIS place and address search$'`. 테스트 후 커밋/푸시하고 연결된 GitHub 커넥터로 draft PR 생성. main 병합·운영 배포·npm 발행 없음.
8. **다음 단계:** 사용권/접근성이 확인된 실자료를 이용한 한국 검색 품질·자연 query plan/규모 성능 및 Native UI 검증 진행 가능. 전국 주소 서비스·M5 전체·제품 출시 완료 판정은 불가하다. [검색 가이드](search.md), [검증 기록](research/search-validation.md) 참조.

### 최종 로컬 검사 확정

`pnpm check`, 실제 Docker `pnpm test:geo`19개, `pnpm pack:check` SDK5개, 최종 Next 배포물 Playwright7개가 통과했다.
Vitest57·독립 core1·데이터정책17·비용감사14개이며 생략/재시도 통과 없음. 외부 HTTP 시도0, 정적 findings0.
추가 CLI smoke에서 search:migrate와 loopback 서버 조회(기존 합성7건)/no-store/정상 종료를 확인했다.
`pnpm search` 내장 명령 충돌은 search:service/search:migrate/search:serve로 수정했고 전체 검사를 다시 통과했다.
SDK tarball의 서버/원본/비밀 제외와 빌드 바이트 일치도 검사했다. staged 데이터·비용 검사는 커밋 직전 별도로 실행한다.
원격 Linux/Windows/macOS CI는 해당 PR checks의 실제 결과를 따른다. Native/전국 실주소/대규모 품질·기존 high2는 잔여다.

## 공통 GPS·이동 경로 — 2026-10-19

1. **구현:** 동의 기반 현재 위치/구독·수평 정확도, Web/Expo foreground 어댑터·권한 오류/취소·수명 정리, 순수 메모리 경로 recorder와 이상값/시각/중복/속도/공백 필터, 거리·활성 시간, pause/resume/stop/clear, GeoJSON/GPX 교환·다중 표시·리플레이. 앱별 장기 보관은 분리했다.
2. **파일:** core/src의 location/tracks/track-formats/replay 및 index, web/native 위치 어댑터·exports, data-adapters mock GPS, Web /gps와 Expo GPS 화면/설정/exact dependency·lockfile, 단위·타입·독립 core·E2E, API/가이드/검증/README·roadmap·cost-audit, Changeset·출처 해시·namespace 비용 회귀 검사.
3. **테스트:** 새 Vitest17개와 Chromium GPS2개 통과. 거리 기준값·필터·pause/지연/취소·파일 왕복/잘못된 입력·리플레이, 실제 브라우저 Geolocation 권한 허용/거절과 모의 위치를 검증했다. Expo config introspect에서 foreground 권한만 확인. 최종 전체 check/pack/staged/회귀 결과는 아래에 확정한다.
4. **실화면 QA:** Web 실제 Chromium에서 합성 GPS·정확도·경로/리플레이·출처·내보내기/불러오기·삭제 화면 확인. 권한 허용/거절은 브라우저 API, visibility와 Expo AppState는 모의다. **Android 실제 기기·OS background·iOS는 미검증**이며 JS export/타입/모의를 해당 통과로 표시하지 않는다.
5. **라이선스·보안:** 자체 코드/합성 경로 MIT, Expo Location MIT는 예제 의존성만 추가. 기본 외부 전송/제작자 키/endpoint·장기 저장·민감 위치 로그 없음. GPX namespace는 네트워크 URI로 사용하지 않는다. 기존 high2 취약점 재확인·출시 차단 유지.
6. **잔여/차단:** ADB·Android SDK·USB/기기·에뮬레이터 부재로 실기기 검증 미실행. 실제 이동거리/센서 정확도·배터리·잠금/백그라운드/권한 전환·장시간·Safari/Firefox와 iOS QA 필요. background 지속 기록 미지원; Native 파일 선택/암호화 보관·영구 삭제/동기화는 앱 책임이다.
7. **Git:** `feat/gps-tracks`, base `feat/korean-search` (`2c3e14994dbb5d3e3430b8724b52706bb0ece337`). 커밋 조회: `git log -1 --format='%H %s' --grep='^feat: add consent-gated GPS tracking and route exchange$'`. 검사 후 commit/push 및 연결 GitHub 커넥터로 draft PR 생성. main/배포/npm 발행 없음.
8. **다음 단계:** 권한 있는 실제 Android 기기에서 [재현 절차](research/gps-validation.md)의 센서/권한/비활성 검증 진행 가능. 기기 QA를 포함한 이번 단계 전체 검증·제품 출시 완료 판정은 아직 불가하다. [사용 가이드](gps-tracks.md) 참조.

### 최종 로컬 검사 확정

`pnpm check` 통과: Vitest74·독립 core1·데이터정책18·비용감사15, strict/native 타입·lint·format·API/설계,
Next production build·Expo Android/iOS JS export. `pnpm pack:check` SDK5개 실제 tarball과 Chromium 전체9개 E2E 통과.
합성 경로 화면에서 pause 구간의 끊어진 선·평행한 다중 경로·정확도 원·리플레이 마커를 직접 확인했다.
외부 HTTP 시도0, 정적 findings0. 파일 내용 입력란의 자동 교정/맞춤법 검사를 꺼 불필요한 플랫폼 처리를 줄였다.
이 변경 후 전체 check를 다시 통과했다. staged 데이터/비용 검사는 커밋 직전 수행하며 원격 CI는 PR checks에서 확인한다.
실제 Android 기기와 OS background 검증은 도구/기기 부재로 **미실행·차단**이며, 해당 항목은 완료 처리하지 않는다.

## 선택형 자체 길찾기 — 2026-10-19

1. **구현:** Valhalla 3.9.1의 walking/cycling/driving, 출발·도착·순서 있는 경유지, 미터/예상 초·GeoJSON·공통 showRoute, 입력/스냅/geometry/출처 검증·오류/취소. 검색/DB와 독립인 Docker engine·private Node gateway, 지역별 전체 rebuild·smoke 후 선택·이전 세대 rollback. 공급자 없는 지도 유지, 직선 fallback 없음.
2. **파일:** core/routing, data-adapters/routing, services/routing, Docker/PBF 생성 스크립트, Web /routing, 단위/타입/실제 엔진/지역 운영/한국 OSM/E2E 검사, CI·환경 예제·Changeset·출처 해시, API/architecture/ADR-005/가이드/검증/README·roadmap·cost-audit·AGENTS.
3. **테스트:** 실제 Docker 합성 그래프/HTTP/운영 정책 8개, 실제 한국 공개 PBF 빌드 및 한국 도로 5개 통과. 서울 차량 1578.189m/114.260s, 도보 762.720m/557.391s, 자전거 1253.431m/303.486s. 경유지·단절 graph·island/no-segment·거리 상한·실패 active 보존·취소/지연을 구분 검증했다. 전체 최종 check/pack/staged/E2E 결과는 아래 기록을 따른다.
4. **실화면 QA:** Chromium /routing에서 합성 경로 꺾임·마커·경유지·거리/시간/출처·오류 후 제거와 미설정 지도 유지를 실제 캡처 확인했다. 배경은 해당 fixture 범위의 단색이며 실제 한국 도로 지도 화면 검증으로 표시하지 않는다. Android/iOS/Safari/Firefox와 현장 통행 검증은 미검증이다.
5. **라이선스/보안:** SDK·자체 PBF fixture MIT, Valhalla MIT 및 이미지 내 구성 요소 별도 조건, OSM/파생 graph ODbL. 한국 PBF/DB/graph는 ignored artifacts에만 보존한다. 제작자 URL/키·공용 routing demo·자동 다운로드 없음. 기존 npm high2는 audit 종료1로 재확인했으며 출시 차단 유지.
6. **잔여/차단:** 전국 정답/현장 통행·부하·안전·image 전체 CVE 감사·Native 통합, Windows/macOS Docker 실실행은 미검증. 자동 clipping/증분 갱신/무중단 운영·교통·내비게이션은 미구현. 공개 서비스는 인증·TLS·쿼터를 운영자가 별도 구성해야 한다.
7. **Git:** `feat/self-hosted-routing`, base `feat/gps-tracks` (`dc6621704483a6b3406e51207f9adf1fcc46cbf9`). 커밋 조회: `git log -1 --format='%H %s' --grep='^feat: add optional self-hosted Valhalla routing$'`. 검사 후 commit/push 및 연결 GitHub 커넥터로 draft PR 생성. 이번 main 병합·운영 배포·npm 발행은 수행하지 않는다.
8. **다음 단계:** 운영자 지역 품질/경계·부하·Native 기기 검증으로 진행 가능. 전국 품질 보장·M5 전체·공개 출시 완료 판정은 불가하다. [가이드](routing.md), [검증 기록](research/routing-validation.md).

### 최종 로컬 검사 확정

`pnpm check` 통과: Vitest81(11 files), 독립 core1, 데이터정책18, 비용감사15, strict/native 타입,
lint/format/API/설계 검사, Next production build·Expo Android/iOS JS export.
`pnpm test:routing` 실제 Docker/운영 8개, 한국 공개 OSM 별도 5개, Chromium 전체 E2E10개,
`pnpm pack:check` 실제 SDK tarball5개 모두 통과했다. skip/retry 통과 없음.
날짜/검토기한 검증 보강 뒤 관련 Docker/운영 테스트와 lint를 재실행했다.
정적 findings0·Web 외부 HTTP 시도0이며 패키지에 서비스/PBF/graph/비밀 설정이 없음을 확인했다.
지역 한국 graph/원본은 ignored 상태로 보존하고 QA용 컨테이너/gateway는 종료한다.
커밋 전 index 데이터·비용 감사와 diff를 확인한다. 원격 CI의 실제 결과는 해당 PR checks를 따른다.
기존 high2, 현장/전국 품질·운영 부하·Native 기기·OS 전체 egress·이미지 CVE 검증은 잔여다.

## React Native SDK — 2026-10-19

1. **구현:** 공통 MapController와 MapLibre RN 11.5.0을 연결한 지도/카메라/마커·닫기 카드/GeoJSON·경로·이벤트를 확장했다. 명시적 XYZ/glyph/sprite, 실험 PMTiles 및 HTTP fallback source, 4종 테마·레이어 예제, 접근 가능한 장소 버튼과 제스처 전환, 스타일 revision·카메라 유지·리스너 정리를 추가했다. 기존 foreground GPS 동의/권한/정확도·기록 화면을 유지한다.
2. **파일:** `packages/native/src/{index.tsx,controller.ts,resources.ts}`, Native README, `examples/expo/{App.tsx,app.json,package.json,.env.example,README.md}`, lockfile, Native 단위 테스트, Changeset·publication 원장, AGENTS/README/공통 API·roadmap·cost 문서, 공식 Android 문서 검토와 비용 회귀 검사를 변경했다. [설치 가이드](native-sdk.md), [검증 기록](research/native-sdk-validation.md).
3. **테스트:** 최종 `pnpm check` 통과: Vitest95/12파일, 독립 core1, 데이터 정책18, 비용 회귀16, strict/Native 실제 타입·lint/format·API/문서·Next production·Expo Android/iOS JS export. SDK5개 실제 `pnpm pack:check` 통과. Android/iOS prebuild 후 Android x86_64 Development Build APK Gradle 컴파일 성공(최종 2m 3s). APK SHA256는 검증 문서에 기록했다. npm audit는 기존 high2로 실패, 출시 차단 유지.
4. **실화면 QA:** Expo Go를 사용하지 않았다. 하드웨어 가속 없는 API35 x86_64 에뮬레이터를 설치·기동했으나 부팅 중 package service 부재 및 APK 설치 45초 timeout으로 앱 화면을 검증하지 못했다. black boot 캡처는 지도 렌더링 성공 증거가 아니다. Android 실제 기기 없음, iOS/Xcode 없음. 터치·회전·복귀·OS 권한·native 메모리·4종 테마/한글 glyph와 PMTiles/HTTP 네이티브 렌더링은 미검증이다.
5. **라이선스·보안:** SDK/합성 자료 MIT, 상위 native/font/data 조건 분리. 제3자 지도/font payload·서명·APK는 Git/npm에 포함하지 않는다. 기본 리소스 요청 endpoint 없음; operator origin 입력 검사는 native redirect 방화벽이 아니다. worktree/index/history/tarball 정적 감사는 OS 전체 네트워크 감사를 대체하지 않는다. node-forge/braces high2 해결 필요.
6. **남은 작업:** 실제 ARM64 Android 및 iOS 빌드/기기·한글 glyph·PMTiles/XYZ·네트워크 capture·장시간 heap/GPU·제스처/회전/복귀/권한 QA. 개발 APK는 x86_64 전용이며 물리 기기 설치 패키지가 아니다. 배경 지속 GPS·자동 native redirect 제어·파일 PMTiles는 미지원이다.
7. **Git:** `feat/native-sdk`, 커밋 식별: `git log -1 --format=%H feat/native-sdk`. `feat/self-hosted-routing` 위에 Draft PR을 구성한다. main 병합·운영 배포·npm 발행은 수행하지 않는다.
8. **다음 단계:** 코드 리뷰 및 기기 QA 준비는 가능하다. M4 전체/실화면 합격/공개 출시 완료로 처리하지 않는다.

## 두 예제 앱 — 2026-10-19

1. **구현:** Web/Expo의 몽실 산책 지도(모의 현재 위치·실시간 기록·시작/정지/재개/종료·저장·시설·Pastel/Outdoor·재생)와 차곡 여행 지도(검색·저장·날짜별 핀/방문 순서 연결선·카드·카메라·Standard)를 추가했다. 같은 private session과 core MapController를 사용한다. core bounds 유틸리티, Web 출처 컨트롤 겹침, 모바일 버튼 CSS·replay 정리를 수정했다.
2. **파일:** `examples/scenarios`, `examples/web/app/{scenarios,walk,trip}`, `examples/expo/scenario-screen.tsx`와 앱 진입점/의존성/lockfile, `packages/core/src/coordinate-bounds.ts`, Web renderer, 단위/E2E·출처 정책 검사, Changeset/publication 원장, API·README·roadmap·cost·설치/검증 문서를 변경했다. [사용 가이드](example-apps.md).
3. **테스트:** `pnpm check` 통과(Vitest99/13파일, 독립 core1, 데이터19, 비용 회귀16, 타입/lint/format/문서/Next build/Expo JS export). `pnpm pack:check` SDK5개, 실제 Chromium 전체 E2E12개 통과. Android x86_64 Development Build 성공(3m32s) 및 APK 설치 Success. npm audit high2 실패는 기존 출시 차단으로 유지한다.
4. **실화면 QA:** Web 산책/여행 기능·모바일390×844·4회 전환·저장/reload·재생·카드/출처를 실행하고 수정 후 캡처를 직접 확인했다. 준비 시간915~1158ms, 외부 HTTP0. Android API35 x86_64에서 두 지도·시설 마커·검색 목록·산책 5점/8.8m 저장·앱 전환 후 복원, 여행 2곳 저장·날짜 분리·연결선과 Pastel→Outdoor 전환·복원 경로 다시 보기 완료를 실제 확인했다. 초기 startup ANR 후 OS 사전 컴파일로 실행에 도달했으며 느린 소프트웨어 에뮬레이터 결과를 성능 합격으로 취급하지 않는다. 실제 Android 기기와 iOS/Xcode 부재로 해당 QA는 미검증이다. [상세 결과](research/example-apps-validation.md).
5. **라이선스·보안:** 자체 코드·가상 자료 MIT. AsyncStorage2.2.0은 예제 전용 MIT 의존성이다. 실제 개인 위치·제3자 지도/font payload·비공개 앱 코드·제작자 키/URL 없음. 가짜 GPS만 사용하고 방문 연결선을 도로 경로로 표시하지 않는다. APK/로그/캡처는 ignored artifacts에만 보존한다. 기존 node-forge/braces high2와 Native 전체 egress 감사는 잔여다.
6. **남은 작업:** Android 가속 환경/실기기의 전체 UI 분기·권한·회전/복귀·프로세스 종료 후 복원·성능 확인, iOS 빌드/실행, 장시간 heap/GPU·배터리·Native 네트워크 검사. 실제 위치와 전국 검색/도로 길찾기는 이 합성 예제의 검증 범위가 아니다. 모바일 QA 완료로 처리하지 않는다.
7. **Git:** `feat/scenario-apps`, base `feat/native-sdk`의 `502d165030ac657a9648829372dce9a247140921`. 커밋 식별: `git log -1 --format='%H %s' --grep='^feat: add shared walking and itinerary example apps$'`. 검사 후 commit/push 및 연결 GitHub 커넥터로 Draft PR 생성. main 병합·배포·npm 발행은 하지 않는다.
8. **다음 단계:** 코드 리뷰와 가속 Android/iOS 기기 QA로 진행 가능하다. 전체 모바일 QA 완료 또는 공개 출시 판정은 불가하다.

구현 커밋 `30792ba4ee1a311b498c84efd4f790890e6a7ecb`의 [원격 CI](https://github.com/kasa500000-png/KoreaMap/actions/runs/39251573849)는 Linux·Windows·macOS 모두 success다. [Draft PR #13](https://github.com/kasa500000-png/KoreaMap/pull/13)을 연결 GitHub 커넥터로 생성했다. 후속 Android 실화면 결과는 문서 커밋으로 보완한다.


## 전체 품질 감사 및 개선 — 2026-10-19

1. **구현:** Web 동일 카메라/1,000개 마커 setter의 불필요한 알림·엔진 갱신 제거, GeoJSON ambient 공개 타입 누락 수정, strict 상속 검사, 전체 workspace 라이선스·offline 연결·독립 tarball 소비 앱/재현성 검사, 3폭 QA/성능 회귀를 보강했다.
2. **파일:** web state/index·styles index/manifest·lockfile·출처 SHA3개, 단위/Web QA, check-boundaries/offline/check-licenses/verify-packages/tasks·CI·root package, Changeset, README/qa-report/progress/roadmap/cost-audit.
3. **테스트:** 로컬 check(Vitest100/13 files, core1, data19, cost16, strict/lint/build), 실제 PostGIS19·Valhalla8, Web15, SDK tarball5·독립 Web 소비 앱·offline12 manifests/27 links 통과. npm audit **high2/exit1**, Web NodeNext 선언 probe **TS2834/exit2**는 별도 실패로 유지한다. 최종 검사 결과는 QA 보고서와 해당 commit의 CI를 따른다.
4. **실화면:** Chromium390/768/1440 실제 캡처 확인, 마커100/1000·이동/줌·테마/한글·경로·503 복구·정리·예제 화면 전환 통과. Android adb 연결 목록 없음, iOS/Xcode 없음으로 이번 실기기 QA **미검증**. 이전 에뮬레이터 실행을 재사용해 완료 표시하지 않는다.
5. **라이선스/보안:** 자체 코드/fixture MIT, 전체 설치645버전 license metadata 통과 및 LGPL/MPL 등 별도 의무 기록. 비밀/데이터 정책과 SDK tarball 통과, built app URL/credential 형식 후보125개 수동 분류. Web 외부 요청0. 공식 패치 미배포 high2로 출시 차단 유지.
6. **잔여:** 물리 Android/iOS·Native glyph/PMTiles/권한/메모리·OS egress, 장시간/실제 타일·전국 데이터 부하, Web NodeNext, native/image SBOM, OS 간 및 앱 binary 바이트 재현은 미완료다. [전체 QA 보고서](qa-report.md)의 심각도별 표를 따른다.
7. **Git:** `feat/quality-audit`, base `feat/scenario-apps` (`0d3a8d20bf490b841ca86e9e7854275862977edf`). 구현 커밋 조회: `git log -1 --format='%H %s' --grep='^fix: strengthen SDK quality gates and isolated consumer types$'`. 기능 회귀 통과 후 commit/push 및 연결 GitHub 커넥터 Draft PR. main 병합/운영 배포/npm 발행 없음.
8. **다음 단계:** P1 의존성 수정 버전 확인과 실제 기기 QA 진행 가능. 전체 품질 감사·모바일 QA·공개 제품 출시 완료 판정은 불가하다.


### CI 환경 차이 회귀 수정

구현 커밋 `200a11fcd7c8029ad47b905a2a9278207e2ab1e5`를 연결 GitHub 커넥터의 [Draft PR #14](https://github.com/kasa500000-png/KoreaMap/pull/14)로 제출했다.
첫 원격 Windows/macOS는 통과, Linux의 독립 소비 앱은 package store와 registry metadata 캐시의 차이로 실패했다.
소비 앱 lock을 빈 metadata 캐시에서 공개 registry로 명시적으로 준비한 뒤 frozen/offline 설치하도록 고쳤다.
기존 검토 그래프 밖의 제3자 버전은 거부한다. 로컬 재검증 뒤 후속 커밋하며 최신 원격 checks로 판정한다.
이 변경은 검사 준비 절차이며 SDK runtime/타입/타일 endpoint는 변경하지 않는다.

## 릴리스 후보 준비 — 2026-10-19

영문/국문·커뮤니티·설치·운영 문서, 5개 비스코프 후보 패키지 이름, 초기 CHANGELOG와 승인 제한 발행 자동화를 로컬 후보로 준비했다. 기능/패키지/실화면 검증은 보고서의 실제 실행 범위에서 통과했으나 공개 발행은 차단 상태다. 상세 구현 파일, 테스트, 실화면, 보안/라이선스, 차단 사항과 다음 단계는 [후보 보고서](releases/v0.1.0.md)를 따른다. 현재 high 취약점과 Native/registry 미검증은 공개 차단으로 유지한다. 브랜치 `release/v0.1.0-preparation`; 커밋은 `git log -1 --format=%H release/v0.1.0-preparation`로 식별한다. 제작자 provider를 추가하지 않았고 공개 npm 메타데이터 조회/의존성 설치만 수행한다. 원격 공개 업로드·배포·npm 발행·GitHub Release는 승인 전 실행하지 않는다.


## 남은 작업 실행 — 2026-10-20 KST

1. **구현:** private Planetiler/MBTiles/XYZ 타일 도구, 4지역 실제 지도, offline OFL glyph, immutable 갱신·검증·rollback, 명시적 opt-in Web 연결을 구현했다. 실제 Valhalla→서울 지도 통합, 독립 Native tarball 소비와 실공공 원본 검증 도구, CI 전체 보안 감사·발행 입력/경로 보호도 추가했다. [실행 보고](research/completion-validation.md)를 따른다.
2. **파일:** `services/tiles` 전체, `examples/web/app/tiles`, Web 선택형 glyph 옵션, 실제 타일/경로/POI/Native 소비 verifier, 관련 단위/E2E, CI/발행/보안·출처 도구, runtime 15개 개별 검토 SHA, README/CHANGELOG/요구사항·ADR·가이드/검증 기록. 새 외부 payload 허용은 없다.
3. **검사:** `pnpm check`(Vitest101/core1/data20/cost19/tiles17/release6/verifier9 포함), Next production·Expo 양 OS JS export, PostGIS19·Valhalla8·한국 실제 라우팅5, Web19, 실제타일9화면, profile40+실제19tiles/87features, glyph10+decoder256, 5개 pack/재현·격리 Web 소비, Native 지원 모드 소비 및 offline13manifest/29link를 실행했다. 최종 결과는 보고서와 commit의 검사 범위를 따른다. 전체 audit high2/exit1 및 Native 전체 상위 선언 3건 실패는 별도 차단이며 check 성공으로 덮지 않는다.
4. **실화면:** Chromium 서울4테마·390/768/1440px 및 울산/부산/제주 실제 지도 9화면, 실제 도로 경로+마커1440/390px 통과. 한글 PBF·출처·연결 해제 정리, 외부 예상 밖 요청/HTTP 오류0 확인. screenshot은 ignored이고 일부를 직접 열어 확인했다. 현재 워크스페이스 Android x86_64 debug APK도 offline37.86초 빌드 통과했으며 독립tarballAPK/JS내장·설치/기기 실행 통과가 아니다. 새 Android/iOS 기기·Firefox/WebKit·장시간/센서 QA는 미검증이다.
5. **라이선스/보안:** 자체 코드 MIT, OSM ODbL·Noto/OFL 분리. 공식 unpatched high2 유지, 강제 override/감사 제외 없음. 원본·JAR·font/glyph·실지도 캡처는 Git/npm에 넣지 않았다. 정확한 private operator 다운로드 URL만 좁게 검토해 비용 감사에 등록했다. 계정 결제/OS egress 전체 보장은 아니다.
6. **잔여:** 보안 수정 그래프, 실제 공공 CSV HTTP503 해결 후 ETL/DB/검색/지도, Android ARM64·macOS/iOS Development Build/기기·XYZ/glyph/PMTiles·GPS/권한·메모리/OS egress·binary notice, Web NodeNext와 RN 상위 선언, 전국 자원 확보(현 여유4.7GiB<8GiB)·장기 운영 검증. 원격 main/default에는 아직 SDK가 없으며 이번 커밋의 원격CI/통합과 npm 권한·발행·registry 설치는 별도 남았다.
7. **Git:** `feat/korean-map-completion`, 기반 `76b379b9dd2abbb6393e90f789a78ac2fd352762`. 구현 커밋 조회: `git log -1 --format='%H %s' --grep='^feat: add verified operator tiles and completion gates$'`. 기능/패키지 검증 후 로컬 커밋하며 원격 push/PR·main merge·배포·발행·Release는 하지 않는다. [커넥터 통합 예행](research/integration-rehearsal.md)은 14개 기존 PR 및 기준 tree 범위이고 새 커밋 원격 CI 성공을 의미하지 않는다.
8. **다음:** 차단과 추가 플랫폼·실원본 검증은 진행 가능하다. 공개 발행 판정은 **BLOCKED**이며 전체 계획 완료로 처리하지 않는다. 별도 외부 작업 승인은 정확한 검증 커밋과 남은 게이트를 검토한 뒤 적용한다.
## 지도 가독성·공통 조작 품질 구현 — 2026-10-20 UTC

### 1. 구현 완료 기능

기존 API/design-v1을 보존하면서 상세 design-v2/cartography4테마/밀도·도로·지명·POI 위계, 선택형 공통 interaction과 Web/Native adapter를 추가했다. 실제 완료/취소/여백·일괄 마커·클러스터·최대8개 후보·접근성 카드/가상화·예제 조작을 구현했다. 버전에 결합한 타일/style/glyph URL, ETag/304/HEAD/gzip/byte 제한 캐시와 명시 context를 추가했다. SDK/backend/앱 저장 정책 경계를 유지한다. 전체 품질·출시 완료 판정은 아니다.

실지도 검수에서 확인한 저확대 도시 누락도 고쳤다. 수도/행정수도/검증 가능한 인구 hint로 rank를 나누고 z0–9 도시 후보를 보존한다. z10–16 장소 제한과 POI/transport 밀도 제한은 유지했다. 원본에 없는 새 사실·데이터를 만들지 않았다.

### 2. 생성/수정 파일

`packages/core/src/interaction.ts`, Web/Native adapter·선택 helper, styles의 cartography/schema/합성 fixture, 타일 profile/config/archive/pipeline/HTTP 자산 서버, Web/Expo 소비 예제와 단위/타입/브라우저/실제 codec 회귀를 수정·추가했다. `scripts/map-quality-cases.mjs`, production 소비자와 matrix/frame QA 도구, [품질 계획](map-quality.md), [결과](research/map-quality-validation.md), [ADR-010](decisions/010-map-quality-and-interactions.md), API 선언 문서·가이드·README·로드맵·출처 원장·minor Changeset을 갱신했다. 폰트·실지도·원천 payload는 Git/npm에 추가하지 않았다.

### 3. 실행한 테스트와 결과

`pnpm check`(strict/경계/라이선스/출처/ESLint/Prettier/API 문서/Next·Expo JS/회귀), Vitest177개/17파일, Web E2E24개, 타일Node34개, 고정 QA/production 소비자8개 통과. 선택형 실제 Planetiler 검사는 v1 40개/19타일87피처, 최종v2 85개/78타일267피처다. actual4지역+context 생성·verify·활성화와 이전 포인터 보존을 확인했다. SDK5 pack·원본/비용 스캔·clean byte 동일 재빌드와 격리 Web 설치/타입/SSR/브라우저도 통과했다. Native 격리 설치·앱타입/plugin/JS export는 부분 통과이며 상위 RN 선언3건·Web NodeNext 선언은 실패 상태를 유지한다.

### 4. 실화면 QA 결과

도시 누락을 수정한 최종 세대로 Chromium154/software WebGL에서4지역×4테마×5zoom×3폭240개 실제 화면을 다시 검사했다. 렌더링·출처/한국어·z6 도시 symbol을 확인했고 예상 밖 origin/HTTP/page 오류는0이다. 수동 검수는4테마 서울z14와저확대서울·제주 등 표본이며 수정 후 서울 도시명 표시도 확인했다. 최종30cold/warm의 p95는2,934/1,493ms로이번호스트 목표3,000/1,500ms를 통과했다. 별도5회 frame56개 p95는116.7ms로목표33ms에 미달했다. 짧은 matrix frame11개는 표본 부족이며 전체 성능 수락은 미완료다. 실제 운영자 연결 예제9화면도 통과했고 browser style12/tile73/glyph333·예상 밖/HTTP/page/console 오류0·종료 정리를 확인했다. 최신 수치·실행 범위와 수정 전 실패 이력은 [품질 기록](research/map-quality-validation.md)을 따른다. Android offline debug compile44.30초는통과했으나 연결실기기0/iOS없음으로 실제기기·터치/접근성·회전/복귀·glyph·메모리·OS egress는미검증이다.

### 5. 라이선스 및 보안 문제

추가 코드는 원본MIT이며 OSM ODbL/폰트OFL과 분리한다. 새 의존성·키·제작자 provider·공개 데이터 payload가 없다. 최종 staged 데이터 검사16원천/342파일 통과, 작업 트리342·index342·로컬26커밋/739blob·실제5tarball의 비밀/비용 정적 감사는 findings0(`PASS_STATIC_ONLY`)다. heuristic의 한계와 Native OS 요청 미검증을 유지한다. 의존성 audit high2/critical0는 공개 차단이며 우회하지 않는다.

### 6. 남은 작업 또는 차단 요인

실제 GPU/Android·Mac/iOS, 승인 landmask/해안선과 충분한 전국 상세 생성 자원, frame 성능 목표와 장치별 로딩 여유·후속 주소/검색·경로/현장 정확도·운영 retention/부하가 남아 있다. 작은 detail bbox의 경계 절단과 Outdoor 도심 보행로 과밀 등 수동 검수 잔여도 기록했다. 미실행과 실패를 통과로 바꾸지 않는다.

### 7. Git 브랜치와 커밋 해시

브랜치 `feat/map-quality`, 시작점 `964e9674ee626f60942be4d0f4bfe4f1aec9bbc8`. 기능검사 통과본의 단계 커밋은 `git log -1 --format='%H %s' --grep='^feat: improve cartography and shared map interactions$'`로 식별한다. 실제 SHA는 커밋 직후 보고한다. main 병합/원격 공개 업로드/Release/npm 발행/운영 배포는 수행하지 않았다.

### 8. 다음 단계 진행 가능 여부

검증된 SDK 기능과 운영 도구를 바탕으로 후속 작업은 가능하다. 성능·보안/선언·실기기·해안선/전국 수락이 남아 있어 전체 Q0–Q5 완료 또는 공개 릴리스 가능으로 표시할 수 없다. 사용자가 추후 장비/저장 자원을 확보한다는 선호를 유지하며 승인 없는 유료 인프라를 만들지 않는다.

## 후속 1단계 — 보안·공개 타입 게이트 — 2026-10-20 KST

1. **구현:** 실패한 공개 선언 검사가 exit0으로 끝나던 결함을 수정했다. Web/Native는 지원 검사·진단·PARTIAL_PASS를 보존하고 오류/중단/미실행에 nonzero exit한다. 상위 취약점/선언 자체를 해결한 단계 완료는 아니다.
2. **파일:** `scripts/declaration-probe.mjs`, 두 tarball verifier·회귀 테스트·test:release 명령, [보안·타입 근거](research/security-types-validation.md), 독립 Native 가이드·로드맵·비용/진행 기록. SDK 소스·의존성·lockfile은 변경하지 않았다.
3. **검사:** 전체 `pnpm check` 통과(Vitest177, release12, Native consumer6 포함). 실제5tarball byte 동일 재빌드·격리 Bundler/core/SSR/browser PASS, Web NodeNext TS2834로 verifier exit1. Native offline 설치·앱타입/plugin/양OS JS export PASS, 상위 RN3건으로 verifier exit1. `pnpm audit:dependencies` high2/critical0·exit1 유지.
4. **실화면:** 독립 Web 소비 앱에서 지도 표시·선택·종료 및 외부 요청0 확인. 이 단계는 SDK renderer를 변경하지 않았다. Native APK/IPA/실기기 및 OS 네트워크는 미검증이다.
5. **라이선스/보안:** 신규 도구는 자체MIT, 원본 지도/font payload·키·제작자 endpoint 추가 없음. 공식 registry/advisory 및 새 MapLibre 선언만 ignored 저장소에서 조사했다. 감사 제외·강제 override·shim·Native 제거·유료 인프라는 추가하지 않았다.
6. **차단:** node-forge1.4.0/braces3.0.3에 공식 패치 없음. 최신 지원 RN/MapLibre 경로에도 전체 선언 오류가 남는다. CI 실패를 우회한 main 병합이나 단계 전체 완료를 하지 않는다.
7. **Git:** `fix/security-and-public-types`, 기반 `3cb1a37d9b2bebcd66586c614f681ded7aaeb116`. 단계 커밋: `git log -1 --format='%H %s' --grep='^fix: fail closed on public declaration verification$'`. 사용자가 두 단계의 commit/PR/main merge를 승인했다. 최초 PR은 main에 없는 기존 SDK 기반도 포함하며, 실제 PR/CI/병합 상태는 최종 사용자 보고로 연결한다.
8. **다음:** 독립적인 성능 개선은 가능하다. 보안·전체 타입은 BLOCKED이며 병합·발행 수락으로 처리하지 않는다. npm 발행/Release/운영 배포 승인은 없다.

## 후속 2단계 — 지도 조작 비용 감소·프로파일 — 2026-10-20 KST

1. **구현:** Web 명령 status의 전체 마커 query 제거, selector fragment 배치, WeakMap 마커 ID 인덱스, 예제 좌표의 idle 갱신, 수락과 분리된 opt-in CPU/trace 수집을 추가했다. 도로/건물·마커 수·위계·기본 protocol/33ms 기준은 유지했다.
2. **파일:** Web runtime3개·예제2개·개별 출처 SHA5개, 관련 unit/E2E·프레임 verifier/QA 회귀·Web patch Changeset·가이드·[최종 성능 기록](research/map-performance-validation.md)·로드맵·비용/진행 기록.
3. **검사:** `pnpm check`(Vitest181/18파일·release12·타일34·QA12·Native consumer6 등), Web25 E2E·5pack·clean byte 동일 재빌드·격리 Web 지원 경로 PASS. 실제100명령에서 query/source write/selector mutation0·camera100·표시 마커1000 유지. 독립 Web 전체 판정은 NodeNext TS2834/exit1로 PARTIAL_PASS다. Native offline 설치·앱타입/plugin/양OS JS export도 재검증PASS이나 RN상위3건으로 PARTIAL_PASS/exit1이다.
4. **실화면/성능:** Chromium390/768/1440·터치 모의·4테마·선택/복구/정리 통과,390px 지도/테마 이미지 직접 확인. 실제 서울1,000마커 고정5회/54표본p95116.7ms로33ms목표 **FAIL**(수정 전도116.7ms). 실제profile12.48MB 수집은 NON_ACCEPTANCE/exit2이며 기본report byte동일 보존. GPU/readback 병목이 남는다. 이번 코드의 실제240화면·30cold/warm·Native 기기는 미재실행/미검증이다.
5. **라이선스/보안:** 자체MIT 수정만 반영, SDK 의존성/lock·기본 provider·키·제작자endpoint·제3자payload 추가 없음. 프로파일·실지도/font·이미지는 ignored. 최종 staged16원천/348파일·diff 검사 PASS, 작업 트리/index·로컬29커밋/820blob·실제5tarball의 정적 findings0이다. 보안 high2·상위 RN/NodeNext 선언 차단은 유지한다.
6. **차단:** frame 목표·실제GPU/Android·Mac/iOS, 상위 공식 보안/타입 수정, 해안선/전국·장기 부하/OS 네트워크 검증은 남는다. 기능 회귀 성공을 전체 성능·출시 성공으로 처리하지 않는다.
7. **Git:** 1단계 `39d77444154b3dfedf7971316df10a004526d30e`와 macOS 회귀 `0390182482a1c2b2da26eea353971ae603080e7b`를 [PR15](https://github.com/kasa500000-png/KoreaMap/pull/15)에 반영했다. CI21 Windows/macOS 성공, audit/Linux 공개타입 실패. 2단계 브랜치 `perf/map-interactions`; 커밋 조회 `git log -1 --format='%H %s' --grep='^perf: avoid redundant work during map interactions$'`. 별도 stacked PR의 실제번호·SHA·CI는 최종 보고한다. main·기본브랜치·배포/Release/npm은 변경하지 않는다.
8. **다음:** 후속 개선은 가능하지만 두 단계 전체 수락·main 병합은 BLOCKED다. 사용자의 단계별 병합 승인은 기록했으며 실패 검사를 억제하지 않는다. 기존14개 stacked PR은 자동 정리하지 않았다.

## 현재 소스 main 통합·다른 PC clone 준비 — 2026-10-20 KST

이후 사용자가 현재 작업의 병합 커밋을 명시적으로 요청했다. 위 단계의 병합 보류 판단 이후, 실패를 미완료로 유지하는 preview 소스 통합을 진행했다. [상세 실행·제한](research/clone-validation.md)을 따른다.

1. **구현:** GitHub 커넥터로 PR15·16을 각각 일반 merge commit으로 main에 반영했다. PR16 retarget·expected head SHA 확인을 거쳤으며 보호 우회·체크 억제는 없다. 다른 PC에서 `git clone --branch main`으로 전체 소스를 받는다.
2. **파일:** README 양 언어·quickstart·개발/릴리스 안내·보안/성능 기록 주석·로드맵·비용/진행 기록·새 clone 검증 보고서다. 문서 후속 단계는 runtime·lockfile·출처 원장을 변경하지 않는다.
3. **검사:** 원격 main `49e8aac`를 별도 폴더에 새 clone하고 frozen install(기존 store645재사용), `pnpm check`(Vitest181/18·Next production·Expo 양OS JS 포함), 5pack·기존 해시 일치, staged 출처 검사·Web25 E2E 통과. dev:web 실제 실행도 확인했다. 별도 dependency audit는 high2/exit1 실패다. 문서 검사·최종 staged/정적 감사는 이 단계 커밋 전에 실행한다.
4. **실화면:** Chromium154/SwiftShader의 새 clone Web390/768/1440 E2E 통과. E2E의1000마커/장소1팝업 캡처와 별도 dev390px 기본 화면(86개 visible·선택 없음·ready/출처)을 각각 직접 확인했다. dev브라우저 외부 요청/pageerror0. 합성 fixture이며 실제240화면·frame·실기기/iOS·다른 물리 PC 검증은 이번에 수행하지 않았다.
5. **라이선스/보안:** MIT/ODbL/OFL 분리·제3자payload 금지 유지. 새 키/개인정보/제작자provider·유료 인프라·발행 trigger 없음. npm workflow 승인·감사 게이트를 유지한다. 초기 registry 네트워크와 운영자 지도 서비스 비용은 별개다.
6. **차단:** high2·Web/RN 상위 선언·p95116.7ms>33ms·실제Android/iOS·해안선/전국·POI/릴리스 계정 검증은 남는다. 기본 브랜치 main 변경은 GitHub HTTP403으로 거부돼 기존 `chore/project-policy` 그대로이며 `--branch main`이 필요하다. 독립 소비 결과는 기존 PARTIAL_PASS/exit1이다.
7. **Git:** PR15 병합 `8d068bf6935b0290001695071db66d3e754c81b3`, PR16 병합 `49e8aac64d7b7f2de3236cfaaff2373da602999e`. 문서 브랜치 `docs/clone-ready-preview`, 커밋 조회 `git log -1 --format='%H %s' --grep='^docs: document clone-ready main preview$'`. 최종 문서 PR/병합 SHA는 완료 보고에서 제공한다.
8. **다음:** main clone 후 후속 개발 가능. 소스 통합을 전체 기능 수락/릴리스로 보고하지 않는다. npm·tag·GitHub Release·운영 배포·visibility 변경은 하지 않았다.

## 우선순위 10단계 — 01 보안 재검증·CI 격리 — 2026-10-21 KST

사용자의 새 요청은 [10단계 실행](ten-stage-plan.md)의 단계별 commit/PR/main 반영과 지정 대상 배포다. Android 물리 기기·macOS/iOS는 제외하며 기존 실패를 수락으로 바꾸지 않는다.

1. **구현:** Web 선언 실패 때문에 뒤의 Native/Web/DB/라우팅 검사가 미실행되던 CI를 수정했다. Web·Native 소비를 독립 Ubuntu job으로 옮겨 모든 실패를 유지하면서 Linux 기능 회귀를 실행한다. [공식 재조사](research/stage-01-security.md)에서는 안전한 수정 의존성 경로를 찾지 못했다.
2. **파일:** CI workflow·release 정책 회귀·단계01 검증 문서·10단계 계획과 현재 진행/로드맵/비용 기록이다. SDK runtime·의존성·lock·발행 workflow는 변경하지 않았다.
3. **검사:** 실제 전체 audit high2/critical0·exit1, why 경로 exit0. release/선언 정책 회귀14개와 전체 `pnpm check`(Vitest181·Next production·Expo 양OS JS·정책/문서 검사) 통과. 최종 staged/정적 검사는 단계 commit 전에 실행하며 보안 실패는 통과로 계산하지 않는다.
4. **실화면:** CI 전용 변경으로 renderer/UI는 미수정, 이번 단계의 화면 QA는 재실행하지 않았다.
5. **라이선스/보안:** 자체 MIT 정책/테스트 변경, 새 원본 payload·키·제작자 endpoint·유료 runner·cache/artifact upload 없음. 알려진 node-forge/braces high2 및 Web/RN 선언 오류는 그대로 실패한다.
6. **차단:** 공식 수정 버전·지원 그래프, 전체 소비 선언 수락과 원격 새 CI의 실제 결과가 남는다. 배포 대상은 사용자 선택 확인 중이며 아직 외부 배포를 실행하지 않았다.
7. **Git:** `fix/stage-01-security-review`, 기준 `259d75e116a2de456f546c736014d50197774a4d`. 단계 commit은 `git log -1 --format='%H %s' --grep='^ci: isolate consumer declaration gates$'`로 식별한다. 실제 PR/merge SHA는 원격 반영 후 보고한다.
8. **다음:** CI 격리 개선을 검증해 preview 소스로 반영하고 독립 타입/QA/데이터 단계를 계속한다. 취약점 해소·보안 수락 자체는 BLOCKED다.

## 우선순위 10단계 — 02 Native 공개 GeoJSON 타입 — 2026-10-21 KST

1. **구현:** Native가 공개 선언에서 사용하는 GeoJSON namespace 참조와 설치 타입 의존성 누락을 수정했다. 실제 tarball의 Bundler/NodeNext SDK 선언을 각각 strict·skipLibCheck:false로 검사한다. 전체 RN 앱 선언은 별도 실패 게이트를 유지한다. [검증 근거](research/stage-02-public-types.md)를 따른다.
2. **파일:** Native index의 보존 참조·Native manifest/lock importer 역할 이동·독립 verifier/회귀8개·patch Changeset·개별 sourceSHA1개·문서/비용 기록. 공식 TypeScript/React Native 문서 host2개는 docs-only로 검토했고 executable URL 차단 회귀를 추가했다.
3. **검사:** 격리 tarball install·SDK Bundler/NodeNext 전체 선언2개·앱 strict·plugin·Android/iOS JS export PASS, 전체RN TS2411/TS2344/TS2416으로 PARTIAL_PASS/exit1. 최초 pack의 미검토 docs URL/sourceSHA 실패는 루트 개별 검토 후 `pack:check`5개 PASS로 재검사했다. 미추적 신규 Changeset을 index에 추가한 뒤 전체 `pnpm check`도 PASS(Vitest181·Native policy8·release14)다. 최초 실패는 보존한다.
4. **실화면:** 타입/주석 변경으로 runtime 실행문은 불변, 이번 단계 UI QA는 미실행이다. JS export를 기기 성공으로 표시하지 않는다.
5. **라이선스/보안:** 자체 MIT 2줄 참조, 기존 정확한 @types/geojson7946.0.16을 dev에서 dependencies로 옮겼고 새 버전/외부 그래프/endpoint/원본 payload를 추가하지 않았다. Native sourceSHA는 개별 diff 검토 후 갱신했다. 공식 docs 허용은 runtime 요청 허용이 아니다.
6. **차단:** Web TS2834·전체 RN 선언3건·보안 high2는 그대로 실패한다. 지원 공개 SDK 부분 개선과 전체 앱/릴리스 수락을 구분한다.
7. **Git:** 01단계 [PR18](https://github.com/kasa500000-png/KoreaMap/pull/18), commit4914fbc681fca9fd0cec3b24574b735d836494e7/merge9db22c21f68509aaa1e242bd78e969805121559e. 02통합 브랜치 `fix/stage-02-public-types`, commit조회 `git log -1 --format='%H %s' --grep='^fix: preserve native public GeoJSON declarations$'`.
8. **다음:** 선언 누락 수정은 검증 후 preview 통합 가능하며 브라우저·성능·Android 독립 빌드 단계를 계속한다. 전체 타입/보안·기기 수락 및 실제 외부 배포 완료가 아니다.

## 우선순위 10단계 — 03 브라우저·반복 생명주기 — 2026-10-21 KST

1. **구현:** 기존 Chromium25회귀를 유지하고 별도 Chromium/Firefox/Linux WebKit4검사씩,3폭·4테마·한글/마커/경로/503복구·20회 반복/정리·실제PNG검사를 추가했다. 세 브라우저의 독립 Ubuntu CI matrix도 구성했다. [실행 기록](research/stage-03-browser-lifecycle.md)을 따른다.
2. **파일:** Playwright설정·선택형CLI·새E2E/PNGhelper·옵션/CI 정책3회귀·package/tasks 연결·CI·docs-only 공식host검토·단계/진행/비용/로드맵 문서. SDK/예제/lock/Provider는 미변경이다.
3. **검사:** 격리 실제 기본25/25와 신규3브라우저12/12, strict/관련SDK·Next빌드·ESLint/Prettier·옵션10/PNG4검사 PASS. 루트 새정책3회귀와 전체`pnpm check`도PASS, 복사본Chromium4개는47.8초에재실행PASS. 최종staged/정적 검사는commit전에수행한다. 스킵/재시도로통과시키지않았다.
4. **실화면:** 각테마 viewport 캡처·독립PNG색검사와Firefox/WebKit390px Outdoor 이미지 직접확인. 처음발견한offscreen 긴캡처누락을실제그림판정과분리했다. ChromeGC주heap20회약1.18MB증가,Worker/Observer종료기준복귀. FF/WK heap/GPU메모리와Safari/iOS는 미검증이다.
5. **라이선스/보안:** 합성MITfixture·공식Playwrightarchive·서명/SHA검증Debian유저전용libs만사용,원문/폰트/브라우저파일은ignored. root권한/전역환경/PWsource수정없다. 로컬WK의ldconfig기반사전검사는해당실행에서만독립 loader검증으로분리했고실제4검사PASS를요구했다. CI에는그생략값이없다.
6. **차단:** 장시간/Worker·GPU전체메모리·실기기·브라우저원격CI는별도다. 보안high2·상위선언·33ms프레임목표는유지한다. 무료표준runner만사용하며배포대상선택전외부호스팅은미실행이다.
7. **Git:** 02단계 [PR19](https://github.com/kasa500000-png/KoreaMap/pull/19), commit2196e7254126178c402c0bdeac7d3d6995983582/merge469bb3c5958b00e639c5d0f0df9c3f4c93d822d2. 03브랜치 `test/stage-03-cross-browser`, commit조회 `git log -1 --format='%H %s' --grep='^test: add cross-browser map lifecycle QA$'`.
8. **다음:** 세Linux브라우저범위는실검증후반영가능하며고정프레임·Android독립빌드·실자료단계를계속한다. WebKit을Safari실기기지원으로표시하지않는다.


## 우선순위 10단계 — 04 프레임 실행 환경 증거 — 2026-10-21 KST

1. **구현:** 고정 프레임 측정 뒤 실제 WebGL 속성·브라우저 버전·소프트웨어 renderer 근거를 기록한다. 설정 추정이나 성능 기준 완화 없이 [진단](research/stage-04-rendering.md)을 보강했다.
2. **파일:** renderer metadata helper·프레임 verifier·관련 회귀·단계/진행/로드맵/비용 문서. SDK runtime·공급자·의존성은 불변이다.
3. **검사:** 관련19개 회귀 PASS. 전체 pnpm check PASS, 새 helper 실제 지도 실행58간격/p95 116.6ms FAIL/exit1. 5회 실제1000마커·이동완료 및종료정리를 확인했다. A/B 임시 설정은 원복했다.
4. **실화면:** 동일 실제 서울 지도·glyph·1000마커·5회 이동의 직렬 A/B에서 PNG SHA·카메라·피처 수 일치. p95 116.7/100ms 모두33ms FAIL이며 단일 비교를 개선 확정으로 사용하지 않는다.
5. **라이선스/보안:** MIT QA 코드만 추가, 실제 OSM/glyph/캡처/환경 보고서는 ignored에만 보관한다. 외부 전송·유료 인프라·키·새 endpoint 없음.
6. **차단:** 33ms 목표·하드웨어 GPU·장기 메모리는 미충족/미검증이다. 보안 high2·상위 선언·기기 수락 및 배포 대상도 별도다.
7. **Git:** 03단계 PR20/commit05da9d8808ffefef842208ba5102d6261c859cb4/merge5f5c58ff7dcd92957500f87a62929c97276f42cc. 04브랜치 perf/stage-04-map-rendering, commit조회 `git log -1 --format='%H %s' --grep='^test: record actual frame rendering context$'`.
8. **다음:** 진단 코드 검증 후 preview 소스 통합과 Android/데이터 단계를 계속한다. 성능 수락 완료가 아니다.


## 우선순위 10단계 — 05 독립 Android APK — 2026-10-21 KST

1. **구현:** 현재5tarball 중core/native/styles를격리설치하고명시적localtool로offline APK를빌드하는선택형QA다. 생성Hermes번들과APK내번들SHA일치·ELF64 MapLibre·ZIP전체rawstream/CRC/경계를검사한다. [근거](research/stage-05-android-consumer.md).
2. **파일:** Android QA CLI·제한된프로세스감시·Pythonstdlib APK검사·Native export동기hook·Node/Python음성회귀·선택형명령/기본unit연결·단계/진행/로드맵/비용문서. SDKruntime·lock은불변이다.
3. **검사:** Node17/Python9 PASS. 격리SDK strict Bundler/NodeNext·plugin·양OS JS export·prebuild·실제Gradle335tasks PASS. APK83,969,186B/Hermes1,871,700B·ELF11,207,424B·ZIP1330entry 검증PASS_BUILD_ONLY. 보존실APK를보강한rawZIP검사로재검증PASS. 전체RN선언3오류는PARTIAL_PASS/exit1이다. 통합pnpm check PASS, staged·정적감사도commit전에확인한다.
4. **실화면:** adb연결0/KVM미지원으로에뮬레이터실행NOT_RUN. 물리Android와iOS는이번범위제외·미검증이며 APK나JSexport로화면통과를주장하지않는다.
5. **라이선스/보안:** 자체MIT검증도구만추가. APK/생성프로젝트/번들/도구/키는ignored, 재배포하지않았다. Gradle9.4.1/JDK21/SDK37은명시적사용자local도구이며SDK기본설치요구가아니다. binarynotices/OSegress는NOT_RUN이다.
6. **차단:** 전체RN/Web선언·high2·성능·앱실행수락이남는다. PPIDpolling은빠른재부모화자손을보장하지않아descendantCoverage UNKNOWN으로기록하며모든자손정리성공을주장하지않는다. 선택형QA의Windows launcher는미지원, SDKWindows지원과별개다.
7. **Git:** 04 PR21/commitb6bdd4ca88fdbee1d066da357329c4df459a0b9f/merge729bf19bea53adc6aad4810bba8dd77fff5f2a8f. 05브랜치 test/stage-05-android-artifact, commit조회 `git log -1 --format='%H %s' --grep='^test: verify isolated Android APK payloads$'`.
8. **다음:** 검증된빌드/검사도구를preview소스에반영하고데이터단계를계속한다. Native전체릴리스수락·실제외부배포완료가아니다.


## 우선순위 10단계 — 06 공공 POI 파일 입력 보호 — 2026-10-21 KST

1. **구현:** private ETL CLI가 data/raw 밖으로 이어지는 symlink/junction·일반파일 아닌 입력·크기초과를 거부하고 단일 fd로 읽는다. [세부 근거](research/stage-06-poi-ingestion.md).
2. **파일:** services/geo-data/src/operator-files.ts, services/geo-data/src/cli.ts, tests/unit/operator-files.test.ts, docs/research/stage-06-poi-ingestion.md 및 개별출처원장/명령연결/진행·로드맵·비용문서. SDK와운영자서비스 경계를 유지한다.
3. **검사:** 합성 Vitest188/19·실제 Docker PostGIS19·compiled CLI 링크 거부3개 PASS. 공식8원본 URL은503, 실제CSV 미확보로 실자료통합 NOT_RUN. 통합 pnpm check PASS(Vitest188), 실제 PostGIS19/19·5pack 동일SHA PASS. staged·정적감사는commit전에확인한다.
4. **실화면:** 서비스 CLI 변경으로 새 지도 화면 QA는 미실행이며 실제 POI 표시도 미검증이다.
5. **라이선스/보안:** 자체MIT코드만추가, 원본데이터·glyph·폰트·APK·키·개인정보·제작자endpoint는포함하지않았다. 새의존성·유료runner·외부배포없음. runtimeSHA는해당diff검토후개별검증했다.
6. **차단:** 원본CSV exact URL·SHA·header·독립 좌표기준점 확보가 필요하다. A등급만으로 원본통합 성공을 주장하지 않는다. 기존보안·전체선언·프레임·기기수락과배포대상미지정은별도차단이다.
7. **Git:** 브랜치 `fix/stage-06-operator-files`. commit조회 `git log -1 --format='%H %s' --grep='^fix: constrain operator ETL file inputs$'`. 이전단계와이단계의PR/mergeSHA는최종실행보고서에기록한다.
8. **다음:** 통과한개별수정만preview소스에반영하고다음단계를계속한다. 미실행·실패항목을완료로처리하지않으며npm·Release·외부호스팅은실행하지않았다.


## 우선순위 10단계 — 07 한국어 검색·라우팅 품질 평가 — 2026-10-21 KST

1. **구현:** 최소100고유한국어질의와30경로의 독립정답·출처·권리·기간을 검사하는 offline 평가 도구다. 합성결과는 NON_ACCEPTANCE/releaseAcceptance:false다. [세부 근거](research/stage-07-service-quality.md).
2. **파일:** scripts/service-quality.mjs, tests/service-quality.test.mjs, docs/research/stage-07-service-quality.md 및 개별출처원장/명령연결/진행·로드맵·비용문서. SDK와운영자서비스 경계를 유지한다.
3. **검사:** Node14개 PASS, 자료없는 실제실행 NOT_RUN/exit2. 한국어질의 희석과 syntheticID 보고서 유출 회귀를 포함한다. 통합 pnpm check·품질도구14회귀 PASS, 실제무입력평가 NOT_RUN/exit2 재확인. staged·정적감사는commit전에확인한다.
4. **실화면:** offline 평가 도구로 지도UI는 미수정·이번단계 화면미실행이다.
5. **라이선스/보안:** 자체MIT코드만추가, 원본데이터·glyph·폰트·APK·키·개인정보·제작자endpoint는포함하지않았다. 새의존성·유료runner·외부배포없음. runtimeSHA는해당diff검토후개별검증했다.
6. **차단:** 허가된 실제 정답·관측자료가 없어 검색·경로 정확도 수락은 NOT_RUN이다. 기존보안·전체선언·프레임·기기수락과배포대상미지정은별도차단이다.
7. **Git:** 브랜치 `test/stage-07-search-routing`. commit조회 `git log -1 --format='%H %s' --grep='^test: evaluate Korean search and route observations$'`. 이전단계와이단계의PR/mergeSHA는최종실행보고서에기록한다.
8. **다음:** 통과한개별수정만preview소스에반영하고다음단계를계속한다. 미실행·실패항목을완료로처리하지않으며npm·Release·외부호스팅은실행하지않았다.


## 우선순위 10단계 — 08 타일 CRC·MVT 무결성 — 2026-10-21 KST

1. **구현:** 모든archive행의 bounded gzip CRC/끝·MVT protobuf/geometry를 검증한다. 기존8MiB저장상한에더해SQL BLOB타입을첫payload조회전에검사한다.4096fragment 상한과BOM이름보존으로 우회/과다할당을 거부한다. javac의 암묵적상위소스 컴파일도 제거한다. [세부 근거](research/stage-08-tile-integrity.md).
2. **파일:** services/tiles/src/archive.ts, services/tiles/src/pipeline.ts, services/tiles/src/mvt.ts, tests/tiles-fixture.mjs, tests/tiles.test.mjs, tests/tiles-security.test.mjs, tests/tiles-v2.test.mjs, tests/tiles-http-v2.test.mjs, docs/research/stage-08-tile-integrity.md 및 개별출처원장/명령연결/진행·로드맵·비용문서. SDK와운영자서비스 경계를 유지한다.
3. **검사:** tile40회귀 PASS; 실제기존9archive/2348tiles 모두PASS·archive/PBF SHA불변. Java v1 40/v2 85·codec78tile267feature PASS, 새compile의 MBTiles byte동일. 통합 pnpm check·tile40회귀·5pack PASS. 실제현재컴파일러로9archive/2348tile을재검증해SHA불변 PASS. 최초공식문서host2건 감사실패를보존하고문서전용검토/회귀후전체재실행PASS. staged·정적감사는commit전에확인한다.
4. **실화면:** 이번단계renderer변경없음. 실제archive구조검증을 지도UI 또는 전국coverage 검증으로 표시하지 않는다.
5. **라이선스/보안:** 자체MIT코드만추가, 원본데이터·glyph·폰트·APK·키·개인정보·제작자endpoint는포함하지않았다. 새의존성·유료runner·외부배포없음. runtimeSHA는해당diff검토후개별검증했다.
6. **차단:** 해안선은 공식메타데이터 후보만 조사했으며A수집승인/통합하지 않았다. 전국8GiBgate·기존성공세대보존은 유지한다. 기존보안·전체선언·프레임·기기수락과배포대상미지정은별도차단이다.
7. **Git:** 브랜치 `fix/stage-08-mvt-validation`. commit조회 `git log -1 --format='%H %s' --grep='^fix: validate complete vector tile payloads$'`. 이전단계와이단계의PR/mergeSHA는최종실행보고서에기록한다.
8. **다음:** 통과한개별수정만preview소스에반영하고다음단계를계속한다. 미실행·실패항목을완료로처리하지않으며npm·Release·외부호스팅은실행하지않았다.


## 우선순위 10단계 — 09 릴리스 운영 조건 사전검사 — 2026-10-21 KST

1. **구현:** clean 최종SHA와24h이내 완료된 감사/소비/registry 근거·5tarball·버전·검토된workflow를 검사한다. 기본은로컬만, 명시적GitHub옵션은GET만 수행하며 publicationAuthorized:false다. [세부 근거](research/stage-09-release-preflight.md).
2. **파일:** scripts/release-preflight.mjs, tests/release-preflight.test.mjs, docs/research/stage-09-release-preflight.md 및 개별출처원장/명령연결/진행·로드맵·비용문서. SDK와운영자서비스 경계를 유지한다.
3. **검사:** preflight16개 PASS, 원격main조회실패·주석처리된발행guard·Native부분성공우회3건 회귀포함. 실제실행 BLOCKED/exit1을 유지한다. 통합 pnpm check·preflight16회귀 PASS. 실제GitHub명시조회 BLOCKED/exit1, pending check PASS·defaultbranch발행workflow미등록을확인했다. Changeset소비에따른2개검사실패는독립합성fixture로보완후재검사PASS다. staged·정적감사는commit전에확인한다.
4. **실화면:** CLI 변경으로 이번단계지도화면미실행이다. 이전JS export를 APK/IPA실행으로 재분류하지 않는다.
5. **라이선스/보안:** 자체MIT코드만추가, 원본데이터·glyph·폰트·APK·키·개인정보·제작자endpoint는포함하지않았다. 새의존성·유료runner·외부배포없음. runtimeSHA는해당diff검토후개별검증했다.
6. **차단:** 최초미발행0.1.0에3개Changeset본문을CHANGELOG로보존/소비했다. high2·Web/RN선언·npm발행주체·GitHub기본브랜치/환경보호가 남는다. npmworkflow는현재defaultbranch에없어미등록이다. 기존보안·전체선언·프레임·기기수락과배포대상미지정은별도차단이다.
7. **Git:** 브랜치 `chore/stage-09-release-readiness`. commit조회 `git log -1 --format='%H %s' --grep='^chore: verify release readiness without publishing$'`. 이전단계와이단계의PR/mergeSHA는최종실행보고서에기록한다.
8. **다음:** 통과한개별수정만preview소스에반영하고다음단계를계속한다. 미실행·실패항목을완료로처리하지않으며npm·Release·외부호스팅은실행하지않았다.


## 우선순위 10단계 — 10 최종 회귀·정적 데모 배포물 — 2026-10-21 KST

1. **구현:** 키 없는 합성 데모의 정적 배포물 준비·해시 검증·브라우저 smoke를 추가했다. 환경 주입을 제한하고7개 허용route·CSP·31개법적고지·파일별SHA를 기록한다. [도구 검증](research/stage-10-web-deployment.md), [10단계 결과](research/ten-stage-execution.md)를 따른다.
2. **파일:** prepare-web-deploy.mjs·web-deploy.test.mjs·단계/전체실행보고서·package/tasks 명령 연결·README와 진행/로드맵/비용 문서다. SDK runtime·의존성/lock·발행 workflow는 미변경이다.
3. **검사:** 도구13개·독립리뷰 PASS, 실제 SDK/Next export109files/3,055,021B와7route smoke PASS다. 루트 최종 Web25/25·Docker Valhalla8/8 PASS, 5tarball재현·격리설치/Bundler/core/SSR/browser PASS. Native SDK strict2개·plugin/양OS JS export PASS지만 Web NodeNext/전체RN은 PARTIAL_PASS/exit1을 유지한다. 통합 pnpm check·13회귀 PASS, 루트 실제109files/3,054,947B·31notice·7route 외부0/pageerror0 PASS다. 최종main 배포물과staged/정적감사를추가확인한다.
4. **실화면:** Chromium154/390px에서 합성 지도·마커선택·실제줌·종료, 허용7route와외부0/pageerror0을확인했다. Web390/768/1440·4테마·한글·터치·100/1000마커·오류복구25 E2E도최종재실행PASS다. 호스팅/CDN·실기기/iOS 화면은 미검증이다.
5. **라이선스/보안:** Nextpolyfill정확3버전·MapLibre실제번들17의고지를포함해31notice를배포물에보존한다. 원문LICENSE/metadata/SRI증거는ignored이고 기본prepare에서자동다운로드하지않는다. 개인정보·제작자키/provider·지도/font/타일payload·유료runner·외부발행없음이다.
6. **차단:** high2·Web/RN상위선언·p95 116.6ms>33ms·실제POI/정답·해안선/전국·Native실행·발행계정/보호환경이남는다. 배포대상미지정으로실제외부배포NOT_RUN, 현재정적배포물은origin root전용이며repository subpath는별도검증이필요하다.
7. **Git:** 09 PR26/commitc2271334a62aa162e5aba29ab6366abecafe00ed/mergeeee4b2c3a4fa744aa2c06243a1ffda93ba816a66. 10브랜치 chore/stage-10-deployment, commit조회 `git log -1 --format='%H %s' --grep='^chore: prepare verified fixture deployment$'`. 최종 PR/merge는 사용자완료보고와원격기록으로제공한다.
8. **다음:** 검증된preview소스와로컬정적산출물은검토/후속개발가능하다. 실제서비스배포·npm·tag·GitHub Release 및전체품질수락은미완료이며실패/미검증을통과로바꾸지않는다.

## 권장 후속 1 — 정리 명령의 운영자 자료 보존

기준: 2026-10-21 UTC, main `ce8e8e1ad797f9a0780d6bc5e782b66505c7ab23`. 사용자의 권장 방안 진행 지시 및 기존 단계별 commit/PR/main 반영 승인을 따른다.

1. 구현: `pnpm clean`이 운영자 저장소까지 삭제하던 문제를 수정했다. 고정된 빌드 출력만 정리하고 모든 대상의 링크/junction 경로를 삭제 전에 검사한다.
2. 파일: `scripts/clean-build-outputs.mjs`, `scripts/tasks.mjs`, `tests/clean.test.mjs`, root `package.json`, `CONTRIBUTING.md` 및 진행/로드맵/비용 감사 문서. SDK·lockfile 변경 없음.
3. 검사: 실제 정리 task를 합성 임시 workspace에서 두 번 실행해 빌드 출력 삭제, 원본·타일·설정·APK·tarball·QA 기록·worktree 보존을 확인했다. 링크 조상/출력 거부와 canonical root 별칭 포함 3개 통과. 최초 ESLint unused import 1건을 제거한 뒤 재검사 통과. 전체 `pnpm check` 통과: Vitest 188개, 새 정리 3개, strict·lint·출처·문서·Next build·양 OS Expo JS export와 기존 정책 회귀를 확인했다. 이는 별도 full audit/상위 선언 실패를 해소하지 않는다. `pnpm pack:check`와 `pnpm check:data --staged`도 통과했고 SDK tarball 5개 SHA는 기존과 동일하다.
4. 실화면 QA: CLI 정리 수정이므로 이번 단계에서 Web/Android/iOS 화면 검사를 실행하지 않았다. 기존 화면 통과를 새 결과로 재사용하지 않는다.
5. 라이선스/보안: 자체 MIT 코드, 새 데이터·의존성·키·외부 endpoint 없음. 검사 전후 동시 경로 변경에 대한 OS 격리 보장은 아니다. high 2건 및 상위 공개 선언 실패는 별도 차단이다.
6. 남은 작업: 공식 보안 수정 경로·공개 선언 호환성·공공 CSV 접근 조사, 수정 커밋의 원격 CI 확인.
7. Git: `fix/clean-preserve-operator-data`, 커밋 식별 `git log -1 --format='%H %s' --grep='^fix: preserve operator data during workspace cleanup$'`. 실제 해시/PR/main 결과는 커밋 후 보고한다.
8. 다음 단계: 이 수정의 검증/PR 통합과 독립 후속 조사는 가능하다. npm/Release 발행 수락은 차단 상태다.

## 권장 후속 2 — 공개 레이어 타입 계약과 차단 원인 재확인

기준: 2026-10-21 UTC, 조사 기반 `ce8e8e1ad797f9a0780d6bc5e782b66505c7ab23`.

1. 구현: 실제 tarball을 격리 설치한 Web 소비 검사에 사용자 정의 레이어·스타일 레이어·Map/WebGL callback의 strict 타입 계약과 잘못된 입력의 거부 검사를 추가했다. 전체 NodeNext 검사에도 같은 fixture를 포함하며 기존 실패 gate를 유지한다.
2. 파일: `scripts/verify-packages.mjs`, `tests/fixtures/web-layer-consumer.ts`, [Web 선언 조사](research/web-declaration-compatibility.md), [Native 선언 조사](research/native-types-followup.md), [보안 재조사](research/security-followup.md), 진행/로드맵/비용 감사 문서. SDK·의존성·lockfile 변경 없음.
3. 검사: 담당 격리 worktree에서 새 실제 tarball layer 계약·Bundler/core·SSR·Chromium PASS, 다섯 tarball byte 동일, release 회귀 30개 PASS. full Web NodeNext는 TS2834 9개로 PARTIAL_PASS/exit1을 유지했다. Native 최소 RN probe는 TS6.0.3 및 공식 TS7.0.2 모두 동일한 TS2411/TS2344/TS2416 FAIL이다. 전체 audit는 high 2/critical 0 및 exit1이며 공식 수정 버전 없음. 루트 통합의 전체 `pnpm check`와 `pnpm pack:check`도 통과했다. 루트 실제 소비 재검사에서 새 layer 계약·Bundler/core/SSR/Chromium PASS, 외부 요청/page error 0과 전체 NodeNext TS2834 9개 및 exit1을 다시 확인했다.
4. 실화면 QA: 담당 Web 격리 소비 앱의 실제 Chromium 표시·선택·종료 PASS, 외부 요청 0. Native/iOS/기기 QA는 이 단계에서 미실행이다.
5. 라이선스/보안: 새 제3자 payload·키·제작자 endpoint·유료 계정 없음. 공식 TS7 비교 compiler는 SRI/Apache-2.0 확인 후 ignored 조사 폴더에서만 실행했으며 프로젝트 버전은 유지했다. upstream 선언을 복사·수정하거나 검사 조건을 완화하지 않는다.
6. 남은 작업: MapLibre의 확장자 누락 선언, RN 생성 선언 세 오류, forge/braces 공식 수정 및 지원 조합 확인이 필요하다. 세 차단 모두 미해결이다.
7. Git: `test/recommended-public-contracts`; 커밋 식별 `git log -1 --format='%H %s' --grep='^test: verify strict public layer contracts and refresh blockers$'`. 커밋/PR/main 결과는 실제 실행 후 보고한다.
8. 다음 단계: 검증 도구의 회귀 방지 변경과 문서 통합은 가능하다. 공개 타입·보안 해결 완료나 npm/Release 발행 가능 상태로 처리하지 않는다.

## 권장 후속 3 — 공식 공공 POI 접근 검사 보호

1. 구현: 공식 A 원장 자료의 상세 페이지에 명시적 `probe --retry-once`를 제공한다. 기본은 각 1회, opt-in도 세 고정 URL 총 6회 이하·5초 backoff 상한이다. Retry-After·취소·25초 deadline을 유지하고 응답 스트림 정리 실패/정체에서 재시도하지 않는다. 원문 헤더 대신 고정 MIME 분류만 출력한다.
2. 파일: `scripts/verify-real-poi.mjs`, `tests/real-poi.test.mjs`, 비용 감사기/회귀 2파일, [원본 확보 조사](research/recommended-poi-acquisition.md), 진행/로드맵/비용 문서. 원장·Provider·DB/ETL/검색 SQL·SDK·lockfile은 그대로다.
3. 검사: 담당 회귀 14개 PASS. 리뷰에서 무기한 body.cancel·원시 MIME 노출·정리 reject 후 재시도 문제를 발견해 수정하고 실제 ReadableStream throw/reject/stall·취소 회귀를 추가했다. 실제 포털 검사 6요청은 모두 HTTP503/exit1이었으며 원본 취득 성공이 아니다. 첫 통합 `pnpm check`는 새 고정 URL 3개를 미검토 실행 주소로 차단했다. private metadata probe의 명시적 실행·정확한 세 URL·무인증·무본문·상한을 개별 검토한 뒤 해당 파일에만 적용하는 감사 항목을 추가했다. SDK 경로·다른 주소/query 거부 회귀를 포함한 비용 검사 21개 및 POI 14개 통과 후 전체 `pnpm check` 재실행과 `pnpm pack:check`를 통과했다. SDK tarball 5개는 byte 동일하다.
4. 실화면 QA: 지도/시설 마커/실제 검색 화면은 미실행이다. 상세 페이지 metadata 접근을 지도 QA로 간주하지 않는다.
5. 라이선스/보안: 기존 A 3개 상세 주소만 허용하고 redirect·인증 실패·network 오류는 재시도하지 않는다. 원본·본문·좌표·키·원시 오류를 Git/npm에 넣지 않는다. 기본 SDK 설치/테스트 요청·제작자 endpoint·과금 경로 추가 없음.
6. 남은 작업: 직접 CSV·SHA·exact header·독립 기준점을 확보한 뒤 실제 validate/전용 PostGIS smoke가 필요하다. 실제 공공자료 통합은 BLOCKED/NOT_RUN이다.
7. Git: `fix/bounded-official-poi-probes`; 커밋 식별 `git log -1 --format='%H %s' --grep='^fix: bound official POI probe retries and cleanup$'`. 커밋/PR/main은 검사 후 실제 해시로 보고한다.
8. 다음 단계: 보호 도구 통합과 독립 후속 작업 가능. 접근 실패를 우회하거나 실제 ETL 수락/릴리스 가능으로 처리하지 않는다. Android 실기기/iOS는 제외 범위를 유지한다.

## 권장 후속 4 — 실제 Android APK 고지 후보 목록

1. 구현: 기존 bounded ZIP raw CRC 검증 루프에 notice/native library/model 후보의 크기·SHA·본문 분류를 추가했다. 각 목록 256개, 본문 분류 64KiB 상한이며 cap 이후도 CRC를 검증한다. 원문은 출력하지 않고 Android build report에 inventory를 전달한다.
2. 파일: `scripts/verify-native-apk.py`, `scripts/verify-native-android.mjs`, `tests/native-android-apk.test.py`, [실제 APK 조사](research/native-binary-notices.md), `THIRD_PARTY_NOTICES.md` 및 진행/로드맵/비용 문서. SDK·dependency·lockfile·CI 변경 없음.
3. 검사: 담당 Python 13개 회귀와 root의 동일 파일 13개 회귀 통과. 실제 기존 APK는 SHA `219e48a5dd5030702420124ad953df65885613057448f9d5ca9ad6dce6de96b6`, 83,969,186 bytes·1,330 ZIP entry·Hermes/필수 MapLibre ELF·raw CRC PASS다. notice 후보 5개·native 19개·TFLite 3개를 확인했다. 루트 전체 `pnpm check`, `pnpm pack:check`와 실제 기존 APK 재검사를 통과했다. SDK tarball 5개 SHA는 기존과 동일하고 법적 적합성은 계속 미검증이다.
4. 실화면 QA: 새 앱 build·실행·기기·에뮬레이터·iOS는 미실행이다. 기존 APK 바이트 재검사이며 사용자 notice 화면·OS network 수락으로 확대하지 않는다.
5. 라이선스/보안: cached AAR의 실제 6개 entry SHA 일치만 확인했다. MLKit POM은 별도 약관을 선언하므로 SDK MIT로 덮지 않는다. inventory는 항상 complete:false, licenseCompliance:NOT_EVALUATED, distributionReady:false이며 payload PASS와 구분한다. 새 payload·본문·키·endpoint·외부 요청 없음.
6. 남은 작업: 최종 APK variant의 완전한 resolved dependency graph·정확 버전 원문/고지·원저작권·bundle/source 의무 연결 및 실제 배포 notice 제공을 검증해야 한다. 법적 적합성은 UNKNOWN/BLOCKED다.
7. Git: `test/native-binary-notice-inventory`; 커밋 식별 `git log -1 --format='%H %s' --grep='^test: inventory native APK notice and binary candidates$'`. 실제 커밋/PR/main은 검사 후 보고한다.
8. 다음 단계: 검증 도구 및 자료 보존 개선은 통합 가능하다. 보안 high 2건·Web/RN 상위 선언·공공 CSV·실제 품질·플랫폼/외부 배포·발행 차단을 해제하지 않는다.
