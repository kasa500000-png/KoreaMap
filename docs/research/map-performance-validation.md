# 후속 2단계 지도 조작 성능 검증

기준일: 2026-10-20 KST. 브랜치 `perf/map-interactions`, 기반은 [1단계 PR 15](https://github.com/kasa500000-png/KoreaMap/pull/15)의 보안·타입 게이트 수정과 macOS 경로 회귀다. 전체 성능 목표와 공개 수락은 부분 최적화의 구현과 구분한다.

현재 소스 통합 상태: 이후 사용자가 clone을 위한 미완료 preview 병합을 명시적으로 요청해 PR15/16을 main에 통합했다. 아래의 당시 병합 보류 문구는 역사적 판단이며, 성능 실패·보안/타입·기기 미검증과 발행 차단은 그대로다. [최신 clone 기록](clone-validation.md)을 따른다.

## 고정 조건과 기존 결과

서울 Standard/balanced design-v2, z14,390×800px,DPR1, 실제 개별 마커1,000개, 완료한1초 왕복 이동5회, 최소30 RAF delta, p95 목표33ms를 유지한다. source generation은 `1792488349559-c91461a3`, 원본 OSM SHA는 `57e3ffd07e104d5b9ec511ac2b11cf784936b8982f0b4f30e6f5324928fc9f5e`, glyph manifest SHA는 `dc7c51fd0c45fbecff7f176aa3730d12ca2bb4d1fe09c281c77a3cc07c196c2b`다. 구체 archive/폰트/실지도 검증은 [기존 품질 기록](map-quality-validation.md)을 따른다. 데이터·폰트·스타일·클러스터 상한·카메라 경로·목표를 줄이지 않았다.

수정 전 공식 unprofiled 관측은56표본/p95 **116.7ms/FAIL**이다. 현재 호스트의 Chromium154/SwiftShader software WebGL 결과이며 실제 Android/iOS GPU 결과가 아니다. 기존30cold/warm 로딩 p95 2,934/1,493ms는 당시 호스트 결과로 보존하고 이번 조작 최적화의 새 로딩 통과로 재사용하지 않는다.

## 실제 병목 진단

수정 전 동일 프로토콜에 CPU profile·Chrome trace·변경 없는 WebGL draw 계수기를 추가한 진단은53표본/p95 133.4ms였다. 계측 오버헤드가 있으므로 **NON_ACCEPTANCE**이며 공식 성능 표본에 섞지 않는다. ignored `artifacts/qa/performance-diagnosis`에 원본/해시·환경을 보존했다.

- 7.44초 capture에서 JavaScript ScriptDuration은0.334초, Layout/Recalc는0이고 GC는약34.7ms였다.
- renderer의 `GLES2::ReadPixels`는73회/6.818초, 최대153.7ms였다. GPU command wait도 길었다. 이 중첩 시간들을 더해 전체 소요 시간으로 표현하지 않는다.
- 마커1,000개는 이미 프레임당 circle draw1회/약6,000 indices로 일괄 렌더링됐다. 나머지 지도는 약270 draw/120만 indices였다. CPU profile의 native `(program)` 비율만으로 원인을 단정하지 않고 trace의 GPU/readback 대기와 함께 해석한다.
- canonical 소비 화면은 React가 없는 production HTML이며, 마커/source/selector는 측정 전 한 번 만든다. 측정 중 매 프레임1,000개 DOM 재생성·명시 diagnostics 조회가 발생한다는 가설은 확인되지 않았다.

소프트웨어 전체 지도 렌더링과 readback 대기가 지배적이라는 관측이다. GPU/브라우저/호스트별 차이와 실제 장치 QA가 남는다. 도로42개 stroke를 단순6pass로 합치면 등급별 casing/교차로 순서가 바뀌므로 적용하지 않았다. 건물의 사용자 지정0.8px outline을 고정1px fill outline으로 바꾸지도 않았다.

## 구현과 회귀 범위

실제 발견한 불필요 비용을 제거했다. 공통 Web API의 준비 상태 확인은 공개 `diagnostics()`의 전체 rendered-marker query를 호출하지 않고 내부 status를 읽는다. 기존4인자 내부 bridge/custom 호출의 fallback과 공개 API를 보존한다. 같은1,000마커·각100개 카메라 명령의 회귀에서 query는100→0, 이동·camera 이벤트는각100으로 유지됐다. 이 결과는 호출 수 검증이며 GPU FPS 개선 수치가 아니다.

selector의1,001개 option을 fragment에 만든 뒤 한 번 교체한다. 순서·placeholder·선택·접근성 카드·스타일 복원은 유지한다. picking은 전체 후보를 처리한 뒤 기존 우선순위/거리/중복·상한8 규칙을 적용하며, 마커 배열을 key로 하는 WeakMap ID 인덱스를 재사용한다. 배열을 강하게 붙잡지 않고 최신 label/삭제·카메라 변경의 캐시 재사용을 검사한다. 명시 diagnostics는 계속 실제 화면을 조회한다.

기본 지도·검색 예제의 좌표 텍스트는 idle에서 최신 snapshot을 읽는다. SDK camera 이벤트의 전달 빈도는 줄이지 않는다. 외부 provider·새 의존성·상용 에셋·키·telemetry·유료 인프라는 추가하지 않았다. runtime5개는 기존 자체MIT 코드의 수정으로 각각 출처·SHA를 검토했다.

## 재현

```sh
pnpm check
pnpm test:web
pnpm pack:check
pnpm verify:packages
pnpm verify:map-frames --operator-opt-in --store=/operator/tiles --glyphs=/operator/glyphs
pnpm verify:map-frames --operator-opt-in --store=/operator/tiles --glyphs=/operator/glyphs --profile
```

앞선 [1단계](security-types-validation.md)의 Web/Native 전체 선언·high2 차단은 유지되므로 `verify:packages`의 전체 종료 코드1을 성공으로 해석하지 않는다. profile 명령은 별도 report와 최대64MiB의 ignored CPU/trace만 쓰며, 계측 결과는 `NON_ACCEPTANCE`, 정상 수집 종료 코드2다. 기본 acceptance report·임계값을 바꾸지 않는다. timeout/손실·크기 초과·중단 시 partial 산출물/CDP를 정리한다. 실제 optional profile 수집 및 최종 unprofiled/브라우저 결과는 아래 최종 실행 절에 별도로 기록한다.

## 최종 실행

| 검사 | 결과 | 범위 |
| --- | --- | --- |
| `pnpm check` | PASS | strict·경계·lint·라이선스645·출처·문서·Next/Expo JS·Vitest181/18파일·release12·타일34·map-quality12·Native consumer6 |
| `pnpm test:web` | PASS,25/25 | 실제 Chromium renderer,390/768/1440px·터치 모의·마커/카드·취소·테마·검색·오류 복구·종료 |
| 실제100명령/1,000마커 회귀 | PASS | feature query0/source write0/selector mutation0,기존 option identity·실제 표시1,000개·camera100회 유지 |
| `pnpm pack:check` | PASS | 5개 실제 tarball·비밀/비용·출처 검사 |
| 독립 Web 소비·재현 빌드 | PARTIAL_PASS/exit1 | 5tarball byte 동일; Bundler/core/SSR/browser PASS·외부 요청0; upstream NodeNext TS2834 FAIL |
| 독립 Native 소비 재검증 | PARTIAL_PASS/exit1 | offline 설치·strict 앱/API·plugin·양OS JS export PASS; 상위 RN TS2411/TS2344/TS2416 FAIL. 기기 실행 아님 |
| 고정 unprofiled frame | **FAIL/exit1** | 5회 이동/54유효 delta,p95 **116.7ms**,목표33ms. source/실제 표시/화면 범위/완료 모두 충족 |
| 선택형 실제 profile | NON_ACCEPTANCE/exit2 | 60delta,p95116.7ms는진단전용; CPU6,095 samples·trace59,350events,총12,476,748B<64MiB |

수정 전56개 표본/p95116.7ms와 최종54개/p95116.7ms를 보존했다. API 호출 수 감소는 검증됐지만 canonical GPU frame 개선이나33ms 목표 달성은 관측하지 못했다. 두 검사 모두 같은 OSM/glyph 세대와 기본 protocol을 사용했고, 브라우저·서버의 예상 밖 origin/HTTP/request/page/map 오류는0이었다. 종료 시 listeners0/observerfalse를 확인했다. 기본 소비 HTML은 변경하지 않았고 profiling 중 다른 빌드·JVM·브라우저 검사를 실행하지 않았다.

기본 report SHA는 `7050e9b51bfd2d8db99edfbb5b6d87caca3263145995a62879f58b5838bfaf0f`이며 profile 실행 후에도 byte 동일했다. 별도 profile report SHA는 `87beed351f710b4cd277f24a063bad655def83f72afc2ee968a7caa403c41f13`이다. CPU/trace는 ignored `artifacts/qa/map-quality/frame-profile-x3nN0p`에만 있다. 새 trace도 renderer ReadPixels87회/7.079초와 GPU 대기를 보였으며 중첩 시간을 합산하지 않는다.

재현 tarball 중 Web은19,672B/SHA `bf47fb832ed02530172a69c0c24e9819ee84d591534d3d30c506d911e4c1dd85`이며 나머지4개는1단계와 동일하다. 검증 report는 기반 `0390182482a1c2b2da26eea353971ae603080e7b`/dirty 작업 트리를 명시하고 verifier/bundle·데이터·glyph SHA를 기록한다. 최종 단계 커밋은 `git log -1 --format='%H %s' --grep='^perf: avoid redundant work during map interactions$'`로 식별한다. 자기 자신의 commit hash를 같은 문서에 소급 기록하지 않는다.

실화면은 자동25개 외에390px 기본 지도와4테마 이미지를 직접 열어 한글·출처·선택 목록/좌표 표시를 확인했다. screenshot은 ignored다. 기본/검색 예제의 idle 좌표 갱신도 E2E를 통과했다. 이번 변경에서 실제4지역240행렬·30cold/warm은 다시 실행하지 않았으며 이전 수치를 현재 코드의 새 수락으로 표시하지 않는다. Native 실기기/iOS·Firefox/WebKit·장기 누수·실제 회선 품질도 미검증이다.

1단계 원격 [CI21](https://github.com/kasa500000-png/KoreaMap/actions/runs/39412549894)은 Windows/macOS 기능 검사 성공, Dependency audit high2 실패, Linux 공개 NodeNext 검사 실패다. macOS tmp 별칭 기대 경로는 `0390182`에서 수정·실제 CI 재검증했다. `perf/map-interactions`는 이 수정 위에 놓인 별도 단계이며, 두 PR의 병합 차단은 유지된다.

## 남은 수락 조건

실제 GPU/Android·Mac/iOS, 고정 조건 frame 목표, 장치별 로딩 여유·장기 메모리·네트워크/부하, 승인 landmask/전국 자료는 남는다. 이 단계의 API/DOM 비용 감소를 frame 목표 통과·전체 Q4 또는 상용 지도 서비스 동등성으로 표현하지 않는다. main 병합은 보안·공개 타입 등 실제 CI 게이트가 충족돼야 하며 npm/Release/운영 배포는 별도 승인 대상이다.
