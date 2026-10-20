# 10단계 06 — 공공 POI 수집 입력 경계와 원본 재검증

공식 HTTP 재조회: 2026-10-20 22:14:00–05 UTC / 2026-10-21 07:14:00–05 KST. 기존 source 원장 A 등급 3종만 대상으로 했으며, 실제 CSV 취득·좌표 기준점·PostGIS 실자료 적재·지도 화면은 계속 **BLOCKED / NOT_RUN**이다. 아래 합성 입력 보호 검사와 기존 합성 DB 통과를 실제 공공데이터 통합 완료로 해석하지 않는다.

## 1. 구현 완료 기능

일반 `geo` CLI의 설정/CSV 입력은 이전에 `data/raw` 경로를 문자열로만 검사하고 파일 스트림이 symlink를 따랐다. 이로 인해 저장소 안 경로가 저장소 밖 파일을 가리킬 수 있었다. 새 private [입력 reader](../../services/geo-data/src/operator-files.ts)를 [CLI](../../services/geo-data/src/cli.ts)에 연결했다.

- workspace root만 canonical 경로로 변환해 macOS 임시 경로 별칭을 처리한다. `data`, `raw`, 하위 디렉터리와 파일의 symlink/junction은 거부한다.
- regular file과 canonical 저장소 경계, open 전후 descriptor의 파일 정체성을 검사한다. 설정은 64KiB, CSV는 10MiB 상한이며 파일이 읽는 중 커져도 상한을 적용한다.
- POSIX는 `O_NOFOLLOW`/`O_NONBLOCK`을 사용하고 Windows는 지원되는 open flag와 경로/descriptor 검사를 사용한다. 하나의 descriptor로 읽고 성공·실패 모두 닫는다.
- filesystem 오류는 경로가 포함된 원문 대신 안정된 오류 코드로 전달한다. SQL·DB 권한·CSV 권리/해시/CRS 규칙·Provider·기본 네트워크는 변경하지 않는다.

이는 운영자 입력 경계를 강화한 것이며, 권한 있는 프로세스가 filesystem을 임의로 바꿀 수 있는 환경의 OS 격리 기능을 제공한다는 뜻은 아니다. 링크를 입력으로 사용하던 운영자는 ignored `data/raw` 아래 실제 파일을 준비해야 한다.

## 2. 생성·수정 파일

`services/geo-data/src/operator-files.ts`, `services/geo-data/src/cli.ts`, `tests/unit/operator-files.test.ts`, 이 문서다. root 의존성·lockfile·SDK 공개 API·데이터 source 등급·수집 자격은 변경하지 않는다. runtime 두 경로의 출처 SHA는 상위 통합 단계에서 개별 검토 후 갱신해야 한다.

## 3. 실행한 검사와 결과

| 검사 | 결과·범위 |
| --- | --- |
| 신규 입력 경계 Vitest | Linux 7/7 PASS. exact bytes/빈 파일/상한·잘못된 limit/경로 이탈·sibling prefix/디렉터리·link ancestor/저장소 link/file link/별칭 workspace root/오류 경로 비노출 |
| 기존 CSV ingestion Vitest | 7/7 PASS. 원장 admission·권리/기한·해시·CRS/필드·개인정보 제외·중복·다운로드 보호 유지 |
| `pnpm test` | PASS, 전체188/19파일. 신규7개 포함 |
| `pnpm build:sdk`, 경계·관련 ESLint·Prettier·문서 링크/diff | PASS. private geo 서비스 TypeScript와439개 상대 링크 포함 |
| 실제 compiled CLI 입력 probe | 3/3 PASS. linked config의 download/import, linked CSV의 import가 exit1/`OPERATOR_LINK_NOT_ALLOWED`; 원본/DB/네트워크 연결 없이 자체 작성 테스트 파일로 실행 |
| `pnpm test:geo` | PASS, 임시 Docker PostGIS·검색 19개. fixture 데이터이며 실제 공공 CSV 아님. 무작위 이름의 전용 container/volume/network만 생성·정리 |
| 기존 공식 8주소 HTTP 재조회 | 모두 HTTP503. proxy/TLS 유지, 인증/쿠키/redirect 미사용, 본문·시설/연락처 레코드 보관 없음 |

CLI probe의 최초 기대값은 `KitError.message`의 기존 `INVALID_ARGUMENT:` 접두사를 빠뜨려 assertion이 실패했다. 실제 오류는 이미 link 거부였으며, probe 기대값을 기존 메시지 형식에 맞춘 뒤 같은 3경로를 재실행해 통과했다. 런타임 오류를 완화한 수정은 아니다.

Windows/macOS의 새 reader 실제 실행은 이 Linux 검사로 대신하지 않는다. Windows에서 관리자 권한이 필요할 수 있는 직접 파일 symlink 테스트는 조건부 제외하고 디렉터리 junction·workspace alias 검사는 유지한다. 최종 전체 `pnpm check`·출처·pack·비밀/비용 검사는 상위 단계의 출처 원장 반영 후 실행한다.

## 4. 실화면 QA

이 단계는 private 수집 CLI의 파일 입력 변경이다. renderer 변경과 실화면 QA는 수행하지 않았다. 실제 공공 POI 지도 화면도 원본 미확보로 NOT_RUN이다. 이전 합성 Web 화면 통과는 새 실자료 성공의 근거가 아니다.

## 5. 라이선스·보안·비용

새 코드는 자체 MIT다. 실제 CSV·시설 레코드·연락처·키·DB 암호를 Git/npm에 추가하지 않는다. runtime에 endpoint·자동 수집·제작자 계정·유료 서비스·새 의존성을 추가하지 않았다. DB 검사는 기존 local Docker의 전용 합성 시험 DB만 사용했다.

브라우징 도구로 [용산 주차장 공식 원본 안내](https://www.data.go.kr/data/3077854/fileData.do)와 [북구 산책로 안내](https://www.data.go.kr/data/15088391/fileData.do), [동물병원 안내](https://www.data.go.kr/data/15045050/fileData.do)의 CSV·무료·이용허락범위 제한 없음·기준일/CRS를 재확인했다. 이는 executor HTTP503과 별도의 관측이다. 상세/catalog 읽기 성공은 CSV 취득이 아니며, 동물병원 연결 안내는 브라우징에서도403이었다. 정확한 직접 CSV 링크는 확보하지 못했고 추측 경로·제3자 미러·공용 테스트 API 키는 사용하지 않았다.

공식 접근 메타데이터는 상위 작업 폴더의 ignored `artifacts/ten-stages/stage06/`, 합성 CLI/DB 결과는 이 worktree의 ignored `artifacts/stage-06/`에 있다. 일반 SDK 설치·빌드는 이러한 원본·도구·DB를 요구하지 않는다.

## 6. 남은 작업과 차단

허가된 원본 CSV URL·파일 바이트/SHA·exact header·독립 좌표 기준점 확보 → 기존 `verify:real-poi validate`/`smoke` → SDK/검색/지도 실자료 회귀가 남는다. [기존 원본 검증 조건](real-poi-validation.md)을 유지한다. A라는 사실만으로 기본 수집을 켜거나 실제 시설 위치를 추정하지 않는다. 검색100질의/경로30구간의 독립 정답 평가도 별도 07단계다. 기존 보안 high2·상위 공개 타입 오류·Web 성능 및 기기 릴리스 차단은 이 수정으로 해결되지 않는다.

## 7. Git

브랜치 `fix/stage-06-poi-ingestion`, 조사 기준 `259d75e116a2de456f546c736014d50197774a4d`. 위임 작업은 staging/commit/push/PR/병합을 하지 않는다. 상위 에이전트가 파일과 개별 runtime SHA를 검토하고 전체 검사를 통과한 뒤 단계별 커밋·PR·main 반영을 수행한다. 최종 SHA·PR은 완료 보고에 연결한다.

## 8. 다음 단계

검증된 CLI 입력 보호를 소스에 반영하고 07단계 평가 도구를 독립적으로 진행할 수 있다. 실제 공공 POI 통합은 원본 확보 전 완료로 표시하지 않는다. npm 발행·공개 서버 배포·기존 DB 변경은 이 단계에서 수행하지 않는다.
