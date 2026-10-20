# 설계 일관성 검증

날짜: 2026-10-19. 최초 대상: [아키텍처](../architecture.md), [요구사항](../requirements.md), [로드맵](../roadmap.md), ADR 8개, [조사 기록](technical-review.md). 상태: 문서 자동 검사 및 수동 일관성 리뷰 통과. 제품 동작은 미검증. Zero Publisher Cost 추가 검증은 마지막 절을 따른다.

## 재현 명령

프로젝트 루트에서 `python3 scripts/check-design.py`를 실행한다. 이어 `git diff --check`와 커밋 대상의 `git diff --cached --check`를 실행한다. 검사기는 Python 표준 라이브러리만 사용하며 외부 서비스에 접속하지 않는다.

## 자동 검증 범위

- Markdown 내부 파일 링크의 존재 및 UTF-8 읽기.
- R01~R24의 유일성, P0/P1/P2별 단계 분리, 요구사항과 로드맵 배치 일치.
- ADR 8개의 결정/대안/결과/검증/근거 구조와 요구사항 양방향 연결.
- exact npm 관찰값과 출처 URL, 실제 설치 미검증 표기.
- 공개 예제 관찰 로그와 프로젝트 QA의 구분.

검사기는 문서 내용의 의미·라이선스 적합성·API 호환성을 자동 증명하지 않는다. 외부 URL 전체 가용성과 Mermaid 렌더링도 자동 검사 범위 밖이다.

## 수동 시나리오 리뷰

| 질문/시나리오 | 설계에서 확인한 결과 |
| --- | --- |
| DB/유료 키 없이 시작 가능한가? | core + renderer + 자체 static/Martin; PostGIS와 검색·경로·Supabase는 선택 |
| 모바일도 PMTiles를 읽을 수 있는가? | Native 지원은 인정, 직접 접근 검증 전 공통 XYZ 기본; offline pack 보장 안 함 |
| Expo Go에서 된다고 오해하는가? | development build/플러그인/New Architecture를 명시, M1 양 플랫폼 spike |
| MVP에 실제 검색·길찾기가 필요한가? | P0는 계약/명시적 fixture, P1 M5에 실제 Nominatim/OSRM; 가짜 결과를 실제 서비스로 표시 금지 |
| 한국 공공데이터가 아직 미허가라면? | OSM 기반 MVP 유지, 후보 원본별 승인 이후 P1 추가 |
| 좌표 축을 항상 자동 감지할 수 있는가? | 불가; 요구사항의 과도한 보장을 수정하고 metadata/기준점 검증으로 한정 |
| walking/cycling 우선순위가 같은가? | 아키텍처 표의 P1/P2 표현을 P2로 맞추어 R24/M7과 일치시킴 |
| glyph/styles/data 라이선스가 MIT로 묶이는가? | 각 manifest와 고지 분리, OFL/ODbL 의무 유지 |
| 실패한 release로 지도가 깨지는가? | immutable 객체·검증 후 포인터 전환·직전 bundle rollback |
| Web preview를 전체 완료로 쓰는가? | MVP는 M1~M4 전체, Android/iOS QA 미실행 시 플랫폼 완료 금지 |
| 이번 커밋이 main 승인으로 오해되는가? | 이전 초기 main 승인과 분리, 이번 PR base만 main 지정 |

## 실행 결과와 미검증

- 자동 문서 검사: `python3 scripts/check-design.py` 통과. 15개 Markdown 문서의 상대 파일 링크, 요구사항 24개, ADR 8개, registry 관찰 9개 및 UX 증거 범위를 확인했다. 검사기 Python AST 구문 검사도 통과했다.
- Git diff 검사: `git diff --check` 및 `git diff --cached --check` 통과. 첫 staged 검사에서 ADR 8개의 EOF 빈 줄을 발견해 제거한 뒤 다시 검사했다. 최종 문서에도 커밋 직전 재적용한다.
- 공개 upstream Web UX: 마커 popup·drag·wheel/Fly 화면 반응 관찰 완료. 정확 카메라 좌표와 상세 타일 완전성은 미검증. [관찰 로그](ux-observations.json).
- SDK 단위/통합/E2E, Next.js 빌드, Expo native 빌드, Android/iOS 실화면, 실제 한국 타일·PostGIS·검색·경로 엔진, 성능·비용·의존성 보안 audit: 미실행·미검증.
- 이유: 이번 범위는 설계이며 제품 코드/서비스를 설치하지 않았다. REA/Ghidra/ADB 사용과 앱 역분석도 수행하지 않았다.

## Zero Publisher Cost 후속 검증

기준일: 2026-10-19. [ADR-009](../decisions/009-zero-publisher-cost.md), [비용 감사](../cost-audit.md), [README](../../README.md)를 추가했다. 최초 검증 기록을 보존하고 현재 검사 범위를 아래와 같이 확장한다.

- 자동 추적성: 기존 R01~R24와 Z01~Z12 총 36개 요구사항, ADR 9개, 요구사항의 단계/P0~P2 배치와 양방향 참조를 검사한다.
- 무설정 지도: renderer 생성 전 `INVALID_ARGUMENT` / `CONFIG_REQUIRED`로 실패하도록 설계했다. SDK 내부 기본 style 또는 제작자 계정 연결은 금지한다.
- 외부 서비스: 타일·검색·경로·공공데이터 provider를 운영자가 명시적으로 설정한다. 로컬 fixture도 명시적 모드이며 공용 무료 서비스 자동 fallback을 두지 않는다.
- 자산/설치: style의 하위 tile/glyph/sprite 요청, worker/Native, redirect, transitive install hook, remote cache까지 감사 범위에 포함했다.
- 배포/비용: README의 운영자 책임, 공개 환경변수 노출, 무료 표준 Actions runner 조건, 제품 배포 전 실제 네트워크 증거 요구를 정책/설계/로드맵에 일치시켰다.
- 자동 보안/비용 감사: 작업 트리·index·로컬 refs 이력의 정적 검사 통과, 11개 회귀 테스트 통과. 테스트 tarball은 합성 자료이며 실제 제품 tarball 검증을 대신하지 않는다.
- 미검증: SDK 설치/실행 요청, Web·Android·iOS 화면/네트워크, 원격 계정 결제 설정. 제품 구현 없이 이 조건을 통과 처리하지 않는다.

명령과 탐지 범위/한계는 [비용 감사](../cost-audit.md)에 기록했다. 모든 최종 변경에 문서 검사·감사·회귀 테스트·staged diff 검사를 재적용한 후 커밋한다.
