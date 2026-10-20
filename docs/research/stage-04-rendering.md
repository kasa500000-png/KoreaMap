# Stage 04 — 렌더링 성능 진단과 실행 환경 증거

기준 커밋: `259d75e116a2de456f546c736014d50197774a4d`. 확인일: 2026-10-20 UTC.

이 단계에서는 SDK 실행 설정을 바꾸지 않고, 선택형 프레임 QA 보고서가 실제 브라우저·WebGL 실행 환경을 기록하도록 보강했다. **1,000개 실제 표시 마커에서 p95 33ms 목표는 여전히 실패**다. 이 문서는 성능 목표 달성 보고서가 아니다.

## 구현 범위

- `scripts/frame-renderer-metadata.mjs`는 전달받은 canvas와 환경값에서 실제 컨텍스트 속성을 읽는 외부 의존성 없는 QA 함수다. SDK 또는 공개 API에 포함하지 않는다.
- 기존 요약 필드에 브라우저 버전, 실제 viewport/DPR, canvas 크기, OS 플랫폼·논리 CPU 수·브라우저가 공개하는 메모리 값을 추가한다. 제공되지 않는 환경값은 `null`이다.
- 실제 `desynchronized`, `preserveDrawingBuffer`, `antialias`, `alpha`, `depth`, `stencil`, `premultipliedAlpha`, `powerPreference`, `failIfMajorPerformanceCaveat`, `xrCompatible` 값을 기록한다. 요청값이나 MapLibre 기본값으로 대체하지 않는다.
- WebGL 버전, masked/unmasked renderer와 vendor, debug extension 지원 여부를 분리한다. 미지원·읽기 실패·컨텍스트 손실은 `NOT_AVAILABLE`, 일부 속성 누락은 `PARTIAL`로 표시하며 오류 메시지는 수집하지 않는다.
- `softwareRendering.status`는 renderer 문자열에 SwiftShader·llvmpipe 등의 증거가 있을 때만 `DETECTED`다. 증거가 없으면 `UNCONFIRMED`이며 하드웨어 가속을 증명하지 않는다. renderer 자체를 읽지 못하면 `NOT_AVAILABLE`이다.

이 정보는 운영자가 명시적으로 실행한 로컬 QA 보고서에만 저장한다. 외부 전송이나 새 공급자 요청은 추가하지 않는다. 실제 기기 정보가 들어갈 수 있으므로 보고서는 기존과 같이 ignored `artifacts` 아래에 둔다.

## 타이밍과 보고서 분리

메타데이터는 고정된 5회 카메라 전환이 모두 끝나고, 선택한 경우 CPU/Chrome trace profiler까지 정지한 뒤 수집한다. 측정 중 프레임별 속성 읽기·픽셀 readback·추가 렌더링은 넣지 않았다.

기존 조건인 1,000개 실제 표시 마커, 5회 × 1,000ms 이동, 390 × 800 canvas, DPR 1, 최소 30개 유효 RAF 간격, p95 33ms 목표와 가시 범위·이동 완료 검증을 유지한다. renderer 정보는 통과 판정의 입력이 아니다. 기본 실행은 `frames-report.json`, 명시적 `--profile` 실행은 `frames-profile-report.json`과 `acceptanceEligible:false`를 유지한다. 프로파일링 결과를 성능 통과로 사용하지 않는다.

## 실제 진단 실험

기존 trace에서 `GLES2::ReadPixels`는 Chromium renderer/compositor의 commit·update-layer 작업 안에 관찰됐다. SDK 또는 MapLibre의 프레임별 `readPixels` 호출은 확인하지 못했다. 중첩 이벤트의 소요 시간을 독립적인 벽시계 시간처럼 합산하지 않는다. MapLibre는 이미 `preserveDrawingBuffer:false`, `antialias:false`, 강제 repaint 비활성 기본값과 repaint 요청 병합을 사용한다. 기존 QA의 피처 조회는 타이밍 구간 밖이다.

격리 worktree에서 `desynchronized:true` 한 줄만 임시로 적용해 같은 실제 서울 타일·glyph·스타일·마커 수·측정 프로토콜로 직렬 A/B를 수행했다. 시스템 Chromium 154 / ANGLE Vulkan SwiftShader에서 실제 컨텍스트 값이 `false`에서 `true`로 바뀐 것을 확인했다.

| 실행 | p95 | 유효 RAF 간격 | 33ms 판정 |
| --- | --- | --- | --- |
| 기존 설정 | 116.7ms | 57 | FAIL |
| 임시 desynchronized 설정 | 100.0ms | 66 | FAIL |

두 실행 모두 5회 이동이 완료됐고 매번 1,000개 마커가 실제 표시됐다. 최종 카메라·가시 범위, 도로 2,303개·건물 4,715개·라벨 43개가 일치했다. 최종 PNG 두 장을 직접 확인했으며 파일 SHA-256도 `007ecc94cf6f0d914d57dac8276d55b9b4cda674c5a1f4498fe4192c15a1fbeb`로 같았다. 한글·도로·건물·마커·출처 표시를 확인했다. 이 캡처는 마지막 측정 구간이 끝난 후 수행했다.

이는 같은 호스트의 단일 직렬 비교다. 16.7ms 차이가 반복 가능한 효과인지, 매 RAF마다 새 프레임이 표시됐는지는 입증하지 않는다. 순서를 바꾼 반복 실험과 별도의 compositor freshness 검증은 미실행이다. 실효성을 확정할 수 없어 임시 설정을 제거했고, 원본 SDK 소스와 빌드를 복구했다. 기존 main의 정식 프레임 보고서도 변경하지 않았다.

로컬 근거는 `artifacts/ten-stages/stage04/`의 `context-ab.json`, 단계별 `*-canonical-report.json`, `*-final.png`, `diagnosis.json`, `context-probe.json`, `result.md`다. 실제 지도·glyph·PNG payload는 Git/npm에 넣지 않는다.

## 검증과 남은 작업

가짜 컨텍스트 테스트는 실제 속성 변경 반영, 속성 미지원, debug extension 부재, 접근 실패, 컨텍스트 손실, self-contained 브라우저 직렬화와 renderer 정보에 따른 성능 판정 완화 방지를 검사한다. 기존 고정 프로토콜·프로파일 분리·소비 앱 빌드 회귀 검사도 유지한다.

- `node --test tests/map-quality.test.mjs tests/quality-consumer.test.mjs`: **19개 통과**, 실패·건너뜀 0.
- `pnpm exec eslint scripts/frame-renderer-metadata.mjs scripts/verify-map-frames.mjs tests/map-quality.test.mjs --max-warnings 0`: 통과.
- 기준 커밋과 옵션/보고서 정책, profiler, evaluator, 브라우저 타이밍 함수, 고정 프로토콜, 5회 측정 루프를 각각 비교해 **6개 구간 byte 동일**을 확인했다. 근거는 ignored `artifacts/ten-stages/stage04/protocol-invariance.json`이다.
- 전체 `pnpm check`와 새 보고서의 실제 브라우저 재실행은 후속 통합 검사 대상이다.

새 메타데이터를 포함한 실제 지도 보고서 재실행은 통합 담당자의 후속 검증 대상이다. 가짜 컨텍스트 테스트나 기존 A/B 화면을 새 보고서의 실화면 검증으로 대신하지 않는다. 하드웨어 WebGL 환경, Firefox/WebKit, 장시간 메모리, 물리 Android와 iOS 성능을 검증했다고 주장하지 않는다.

수정 파일은 QA helper·프레임 runner·단위 테스트·이 문서다. 새 의존성, 데이터/폰트/아이콘 payload, 유료 인프라, API 키, 외부 endpoint는 없다. 브랜치는 `perf/stage-04-rendering`이며 커밋과 PR은 통합 담당자가 검증 후 수행한다. 성능 목표 자체는 후속 개선과 검증이 필요하다.

통합 루트 재검사에서 전체 `pnpm check`와 관련19개 회귀를 통과했다. 새 helper로 실제 동일 프로토콜을 실행해58개 RAF 간격, p95 116.6ms **FAIL/exit1**을 얻었다. 5회 모두1000개 실제 표시·이동 완료, 외부origin/HTTP/page/map 오류0, destroy 후listener0·observer종료를 확인했다. 메타데이터는 실제desynchronized:false/antialias:false/preserveDrawingBuffer:false 및SwiftShader를 기록했다. 이 재실행은 성능 통과가 아니라 새 보고서 수집 동작의 실검증이다.
