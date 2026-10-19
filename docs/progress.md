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
