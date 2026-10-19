# ADR-008 — 작은 MVP와 재현 가능한 릴리스

날짜: 2026-10-19. 상태: 설계 채택, 구현 검증 전. [전체 아키텍처](../architecture.md)

## 결정

pnpm workspace/TypeScript로 시작하고 core/web/native/styles/data-adapters를 초기 동일 SDK 버전으로 관리한다. 사용자 지정 packages/examples/services 디렉터리로 구현하며 별도 React 패키지는 필요 시 분리한다. API SemVer, tileset schema, style assets와 데이터 snapshot은 별도 versioning한다. exact runtime/dev 의존·lockfile, Native 잠금·CI 이미지 digest를 설치 단계에 기록한다.

## 이유와 대안

초기 Kubernetes·다중 엔진·전국 실시간 갱신·완전한 스타일 편집기는 운영 비용과 검증 범위를 키운다. M1~M4 P0를 먼저 완료하고 선택 서비스를 P1, 큰 기능은 P2로 분리한다. Web만 통과한 릴리스를 전체 플랫폼 완료로 표시하지 않는다.

## 결과와 제약

성능 목표와 실측값을 분리하고 고정 장비·fixture·네트워크 조건으로 검증한다. npm에는 코드와 작은 자체 fixture만 넣고 대형 타일/폰트는 별도 release로 제공한다. dependency/license/SBOM/security 검토 및 dry-run 소비 검증 후 release candidate를 만든다.

[ADR-009](009-zero-publisher-cost.md)의 Zero Publisher Cost를 릴리스 조건에 추가한다. 무료 표준 runner를 기본으로 하되 저장소 공개 여부와 storage/cache 한도를 별도로 확인한다. 과금 가능 기능은 명시적 승인 없이 활성화하지 않는다. 실제 배포 파일과 설치·실행·테스트 요청 감사는 [비용 감사 기록](../cost-audit.md)에 남기며 정적 검사만으로 런타임 합격을 선언하지 않는다.

## 검증과 재검토

R15 R16 R24 및 모든 단계의 N01~N07. main 병합·운영 배포·공개 전환·npm 실제 발행은 각각 사용자 명시적 승인이 필요하다. 이번 설계 브랜치를 병합하거나 실제 발행하지 않는다. 작업 캐시·전국 배치 확대는 실측 비용과 병목이 있을 때 재검토한다.

## 근거

[프로젝트 정책](../../AGENTS.md), [요구사항](../requirements.md), [로드맵](../roadmap.md), [의존 조사](../research/technical-review.md).
