# 10단계 07 — 검색·라우팅 오프라인 품질 평가

확인일: 2026-10-20 22:32 UTC / 2026-10-21 07:32 KST. 독립 검토 보완: 2026-10-20 22:43 UTC / 2026-10-21 07:43 KST. 실제 독립 정답셋과 실제 서비스 관측 파일은 아직 확보하지 못했다. 실제 품질 판정은 **NOT_RUN**이며, 아래 자체 작성 입력 회귀 성공을 실제 한국 검색·도로 품질 성공으로 바꾸지 않는다.

## 1. 구현 완료 기능

private [평가 도구](../../scripts/service-quality.mjs)는 운영자가 준비한 reference와 observation 파일을 **오프라인으로만** 평가한다. Provider 생성·HTTP·DB 연결·자동 수집은 하지 않는다. core/SDK의 공개 API와 검색/라우팅 구현을 변경하지 않는다.

- 검색은 NFC·ASCII case·공백 정규화 후 고유한 **최소100개 한국어 질의**와 그 안의 도로명/지번/시설/동명이소/없는 주소 5종을 요구한다. Hangul script의 실제 문자 포함 여부로 한국어 표본을 구분하며 보이지 않는 Hangul filler는 제외한다. NFD 한글·한영 혼합은 인정하고 영문 등 추가 표본은 허용하지만 최소 한국어 표본을 대신하지 못한다. 문자 검사는 자연스러운 한국어 질의나 독립 정답의 의미적 적합성을 증명하지 않는다.
- 정답 ID의 top-5 micro recall과 질의별 hit rate, 정답 없음 정확도·오류 수·latency p95를 전체 및 `search.korean`으로 나누어 보고한다. `koreanQueries`·`otherQueries`와 한국어 5종 coverage도 집계한다. Recall 목표0.9와 정답 없음 정확도1을 전체와 한국어 각각에 적용해 영문 추가 표본으로 낮은 한국어 recall을 희석하지 못하게 한다. TIMEOUT도 실행·지연·오류 분모에서 빼지 않는다.
- 라우팅은 mode+waypoints를 좌표 소수6자리로 정규화한 최소30개 고유 구간을 요구한다. walking/cycling/driving 각각 성공 reference가 있어야 하며 connected/oneway/disconnected/island/mode-restriction/via/snap-limit 표본도 모두 필요하다.
- 성공 route의 이동 모드·독립 거리/시간 허용 범위·스냅(최대100m)·geometry endpoint·경유점 순서·독립 checkpoint 순서를 검사한다. checkpoint는 한국 WGS84 경로 선분에 대한 거리/진행률로 평가하므로 같은 선분 안의 역순도 검출한다. 명시 거리와 geometry 길이는 20% 또는5m 중 큰 값 이내의 내부 정합성을 요구한다.
- 단절·섬·스냅 실패 reference는 정확한 NOT_FOUND와 route 부재를 요구한다. 다른 오류나 직선/다른 이동 모드 결과가 붙은 fallback으로 통과시키지 않는다. 이 검사는 참고 경로와의 일치이며 실제 도로망·현장 통행·보행 안전을 독립적으로 증명하지 않는다.
- 검색/라우팅 각각 dataset 출처·기준일·SHA와 exact reference 파일 SHA, 관측 시점·소스 커밋·Provider 버전을 결합한다. 실자료는 기존 원장 A의 exact source URL/license·상업/저장/수정/재배포 권리·검토 기한과 운영자의 독립 reference 검토 진술을 요구한다. 진술이 실제 독립 검증의 증거가 되는 것은 아니다.

## 2. 생성·수정 파일

`scripts/service-quality.mjs`, `tests/service-quality.test.mjs`, 이 문서다. 전역 package/task·CI 명령 연결과 최종 전체 검사는 상위 통합 단계가 담당한다. 신규 외부 의존성·runtime source·원장 A 승격·SDK 버전 변경은 없다.

## 3. 실행한 검사와 결과

`node --test tests/service-quality.test.mjs` **14/14 PASS**. 자체 작성100질의/30구간의 정상 집계, 표본 수/종류/성공 모드 누락, 공백/NFD 중복·미세 좌표 중복, top5 순위·micro recall 분모·빈 정답 오탐, timeout, 출처/기간/해시/시각 위반, 중복/미확인 관측, 모드·스냅·endpoint·거리/시간·checkpoint/경유 순서·fallback, 실제 CLI의 무입력/합성/실패·UTF-8/opt-in/link 거부와 privacy를 검사했다. 추가 검토 회귀는 합성 sourceId의 개인 식별자 형태가 보고서/stdout에 남지 않는지, 영문/CJK/emoji/filler만 있는100개·99한국어+1영문·한국어 특정 종류 누락이 NOT_RUN인지, NFD 혼합문자·영문 추가 표본을 분리하고 한국어 recall 실패를 전체 평균으로 숨기지 않는지 검사한다. 실제 Provider를 실행한 결과가 아니다.

관련 ESLint·Prettier와 문서 링크/diff 검사를 실행한다. SDK·서비스 런타임 변경이 없어 DB·라우팅 Docker·브라우저·Native 빌드는 이 단계에서 반복하지 않는다. 상위 전체 `pnpm check`에는 이 회귀 명령을 연결하되, 실제 자료가 필요한 선택형 평가 명령 자체를 기본 build/test 요구조건으로 만들지 않는다.

현재 worktree에서 실제로 `node scripts/service-quality.mjs`를 실행했다. 운영자 설정이 없으므로 **exit2 / NOT_RUN / IGNORED_OPERATOR_CONFIG_REQUIRED**, `releaseAcceptance:false`를 기록했다. 최초 확인시각은 `2026-10-20T22:32:56.911Z`, 독립 검토 보완 뒤 재실행은 `2026-10-20T22:44:33.309Z`이며 동일한 NOT_RUN이다. ignored `artifacts/service-quality/report.json`과 `artifacts/stage-07/no-reference.log`, `no-reference-after-review.log`에 결과가 있으며 실제 검색·경로 정답 평가 성공이 아니다.

## 4. 실화면 QA

offline 집계 도구만 추가했으며 renderer·예제 UI는 변경하지 않았다. 실화면 QA를 실행하지 않았다. 기존 지도/검색/경로 화면 결과를 새로운 실제 품질 평가 결과로 재사용하지 않는다.

## 5. 라이선스·보안·비용

도구와 테스트는 자체 MIT다. 실제 reference·관측의 검색어·주소·시설 ID·좌표·원본 응답은 운영자가 ignored `artifacts/service-quality/`에만 보관한다. Git/npm에는 추가하지 않는다. 결과는 집계·표준 enum·공개 원장 source ID/URL/license·시점/hash만 포함하며 질의/후보 ID·좌표·서비스 endpoint·raw 오류·개인 식별자를 출력하지 않는다. 합성 dataset의 임의 sourceId도 개인 정보로 취급해 결과에서는 고정 `authored-synthetic` 표식으로 대체한다. 실제 서비스 응답을 캡처할 때의 동의·권한·저장 정책은 별도 운영자 책임이다.

파일 읽기는 기존 bounded operator-file reader를 재사용한다. config64KiB/reference2MiB/observations10MiB 상한, regular file·ignored 저장소 경계·직접 symlink 거부, strict UTF-8 및 JSON 검사를 적용한다. 새 endpoint·공유 키·계정·telemetry·배포·정기 평가가 없다. 기본 명령과 테스트는 외부 API 키·유료 서비스 없이 실행한다.

## 6. 판정·운영자 입력과 남은 차단

| 판정 | 의미·종료 코드 |
| --- | --- |
| NOT_RUN | 설정 없음, 최소100개 고유 한국어 질의/한국어5종·경로30구간/종류/성공 모드 부족, 미실행/누락 관측. exit2 |
| NON_ACCEPTANCE | 자체 합성 데이터의 평가 계산은 통과. 실자료 수락 불가. exit2 |
| FAIL | 입력/출처/해시 위반 또는 평가 실패. exit1. 합성 입력의 실패도 숨기지 않음 |
| PASS | 운영자가 real로 진술한 reference/관측의 오프라인 평가만 통과. exit0. 실제 원본·독립 정답·현장·전국 정확도·릴리스 승인을 증명하지 않으며 `releaseAcceptance:false` 유지 |

정상 I/O 상태에서 실패·NOT_RUN 보고서를 다시 써 이전 PASS가 최신 시도로 남지 않게 한다. 보고서 쓰기 자체가 실패하면 별도 `QUALITY_REPORT_WRITE_FAILED`/exit1이며 기존 파일을 새 성공으로 해석하면 안 된다.

실제 독립 정답셋·Provider 관측은 **미확보**다. [요구사항](../requirements.md)의 검색100질의/경로30구간 조건과 [실제 POI 원본 조건](real-poi-validation.md)을 유지한다. 아래는 repo root에서 실행하며 파일은 운영자가 직접 준비해야 한다. 자동 truth 생성이나 기본 API 연결은 없다.

```sh
node scripts/service-quality.mjs
node --test tests/service-quality.test.mjs
node scripts/service-quality.mjs artifacts/service-quality/config.json
```

config는 `operatorOptIn:true`, ignored 저장소 안의 `referenceFile`·`observationsFile` 절대 경로를 지정한다. OS 경로 별칭이 있다면 실제 canonical 경로를 사용한다. 형식은 다음과 같으며 실제 원본·정답을 가장하는 예제 레코드는 제공하지 않는다.

| 파일·영역 | 필수 내용 |
| --- | --- |
| reference | `schemaVersion:1`, `search:{dataset,cases}`, `routing:{dataset,cases}` |
| 각 dataset | `kind:real/synthetic`, `sourceId`, `sourceUrl`(synthetic는null), `sha256`, `license`, `attribution`, `dataAsOf`(exact UTC ISO). real은 `independentReferenceAcknowledged:true`, `reviewMethod`, `reviewedAt`, `reviewBy` 추가 |
| search case | 고유slug `id`, `kind`, `text`, `expectedIds`(최대5, ambiguous는2개 이상, not-found만빈배열). 한국어 고유질의100개/5종은 필수이며 영문 등 추가 표본 허용. 이름/주소를 report에 복사하지 않음 |
| routing case | 고유slug `id`, `kind`, `mode`, 한국 WGS84 `waypoints`(2–10, via는3개 이상), `expected` |
| route expected | 성공은 `outcome:route`, 거리/시간 `{min,max}`, `maxSnapMeters`, `orderedCheckpoints:[{coordinate,toleranceMeters}]`. oneway는checkpoint3개 이상. 실패는 `outcome:error`, `code:NOT_FOUND` |
| observations | `schemaVersion:1`, exact reference **바이트**의 `referenceSha256`, `observedAt`, 실제 측정 코드의 `sourceCommit`, `search/routing:{datasetSha256,provider:{name,version},results}` |
| 각 result | reference와 연결된 `caseId`, `status:ok/error/not-run`, 실행했으면 `elapsedMs`. search 성공은 고유 `resultIds`(최대50), routing 성공은 RoadRoute형 `route`의 kind/mode/coordinates/matchedWaypoints/distanceMeters/durationSeconds. 오류는 정규화된 `code`만 |

latency p95는 **운영자가 기록한 관측**의 집계다. 이 도구가 요청을 보내거나 측정 장비를 검증하지 않는다. case 종류·ground truth·기간·원본 대응이 잘못 진술됐는지도 단순 schema/hash 검사로 증명할 수 없다. 소량 합성 데이터나 동일한 reference로 학습/생성한 답을 실제 품질 성공으로 공개하지 않는다.

## 7. Git

브랜치 `test/stage-07-service-quality`, 조사 기준 `259d75e116a2de456f546c736014d50197774a4d`. 위임 단계는 staging/commit/push/PR/main 병합을 수행하지 않았다. 상위 에이전트가 전체 회귀·보안/출처/비용과 자동 검사 연결을 검토한 뒤 단계 커밋·PR·반영 SHA를 완료 보고에 연결한다.

## 8. 다음 단계

평가 도구와 합성 회귀는 소스에 반영할 수 있다. 실제 독립 reference·관측 확보 뒤 검색/경로별 지표를 새로 실행해야 하며, 현재 실제 품질 게이트를 완료 처리할 수 없다. 기존 보안·상위 타입·프레임·기기/릴리스 차단은 유지한다. 다음 독립 타일·운영·릴리스 준비 단계는 진행할 수 있다.
