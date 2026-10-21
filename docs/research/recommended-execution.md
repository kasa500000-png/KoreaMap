# 권장 후속 작업 실행 결과 — 2026-10-21

사용자의 권장 방안 진행 지시와 기존 단계별 commit/PR/main 병합 승인을 따라 작업했다. Android 실기기 및 macOS/Xcode iOS build/QA는 제외했다. 검증된 기능·도구 수정만 완료 처리했다. 아래는 소스 프리뷰의 개선이며 v0.1.0 공개 발행 수락은 **BLOCKED**다.

| 단계 | 실제 변경 | 커밋 | PR | main merge |
| --- | --- | --- | --- | --- |
| 1 | 정리 명령의 운영자 타일·설정·QA·worktree 보존 | `c1b64612789bf777b5dbc4bc67f0f9e46ce6eeea` | [28](https://github.com/kasa500000-png/KoreaMap/pull/28) | `1fb224ec0f8b415390dbafbd3b327138ea3288b2` |
| 2 | 실제 Web tarball의 Custom/Style Layer strict 타입 계약 | `554af96c4be05b54fe552df947318d617a2b5a37` | [29](https://github.com/kasa500000-png/KoreaMap/pull/29) | `527c68db677d6cd44cb343c46734f3502de894ad` |
| 3 | 공식 POI metadata probe의 제한된 재시도·취소·본문 정리·헤더 보호 | `f7144fb3a099e4343499ea8a63ab48440bdf98bd` | [30](https://github.com/kasa500000-png/KoreaMap/pull/30) | `9b9d66ad33e2f2c8a72675ed83d5978f18b09f8d` |
| 4 | 실제 기존 APK의 고지·네이티브·모델 후보 bytes/SHA 목록 | `b342f1f1fa1b419ec7dfca5cbefb00bd4c43b88d` | [31](https://github.com/kasa500000-png/KoreaMap/pull/31) | `a6e0923eca8cc79adeefbe44fc1ec53eddf63327` |
| 5 | 새 Runner의 Native registry 준비·offline 설치 분리 | `2835a7ecab1a3cc72dfd37c17600107e25acaf8a` | [32](https://github.com/kasa500000-png/KoreaMap/pull/32) | `c32ffb26e72f77fd1e890eda0a1e0cba158cd796` |
| 6 | 실제 Next 지도 모듈 부착 대기·지연 회귀 | `bde05438bee29d0a6fc78ee074c763ead0c98c37` | [33](https://github.com/kasa500000-png/KoreaMap/pull/33) | `a9b424ba4f40876e7f91e0dc80ce676dab72ca87` |

첫 네 PR의 기능 CI는 각각 Linux/Windows/macOS 및 Chromium/Firefox/WebKit 여섯 job을 통과했다. dependency audit와 Web/Native 소비 게이트 세 job의 실패는 전체 CI 성공으로 바꾸지 않았다. Native job 로그를 따로 확인한 결과 새 Runner가 타입 검사 전에 `ERR_PNPM_NO_OFFLINE_META`로 중단하는 검증 도구 문제도 발견했다. 추가 5단계에서는 [Native 새 캐시 재현성](native-consumer-cache.md)을 수정했다. 명시적 공식 registry lock 준비와 frozen/offline 설치를 분리하고 공백·작은따옴표 경로를 직렬화한다. 빈 캐시의 실제 검증이 strict gate까지 도달한 뒤 기존 RN 선언 세 오류로 PARTIAL_PASS/exit1을 반환하는 것을 확인했다. 수정 전 설치 중단과 상위 RN 선언 실패는 구분한다.

5단계 PR32의 실제 새 GitHub Runner에서도 metadata 준비와 offline 설치 뒤 strict gate에 도달했고 전체 RN 선언 세 오류만으로 PARTIAL_PASS/exit1을 확인했다. 기능 여섯 job은 PASS이며 별도 dependency audit/Web/Native gate 세 job은 FAIL이다. 이는 독립된 검증 도구 수정이며 SDK API 버전을 바꾸지 않는다.

병합 뒤 main CI [39566617312](https://github.com/kasa500000-png/KoreaMap/actions/runs/39566617312)는 Windows/macOS/Linux/Firefox/WebKit PASS, Chromium 390px 첫 화면의 상태 요소 미부착으로 FAIL이었다. 나머지 Chromium 세 검사는 PASS였으며 알려진 release gate 세 개도 FAIL을 유지했다. 이 새 실패를 통과로 처리하지 않고 [클라이언트 모듈 동기화](browser-startup-synchronization.md)를 추가 검증한다. 원래 CI 실패의 근본 원인은 해당 로그만으로 확정하지 않는다.

6단계 브랜치는 `test/browser-client-startup`이며 커밋은 `git log -1 --format='%H %s' --grep='^test: synchronize actual map client startup before readiness$'`로 식별한다. 실제 모듈 부착을 기다린 뒤 기존 5초 ready 검사를 시작한다. 테스트 상한·성능 기준을 유지하며 실제 chunk를 5초 이상 보류하는 회귀와 deadline/오류 전파 검사를 추가했다. 검사 작성 중 첫 로컬 오류도 기록했고 수정본 담당·루트 전체 check, 루트 pack·실제 Web 25/25·Chromium lifecycle 5/5는 PASS다. 최종 PR/main CI는 사용자 보고와 실제 원격 기록으로 제공한다.

PR33의 기능 6개 job은 PASS였지만 병합 main CI39569788795는 Chromium 첫 화면에서 부착 뒤에도 `loading`이 5초 지속돼 FAIL이었다. 나머지 4 lifecycle 검사와 OS 3종/Firefox/WebKit은 PASS다. 이 실패도 완료 처리하지 않고 [7단계의 기존 전체 10초 기능 상한·실패 진단](browser-startup-budget.md)으로 이어졌다. 실제 Worker를 6초 지연한 대조 실험은 같은 페이지가 5초 loading 뒤 약 6.6초에 ready·100마커가 되는 것을 확인했다. 원래 CI 원인과 별개이며 6단계의 기본 5초 assertion 정책은 명시한 전체 10초 기능 계약으로 대체한다. cold p95 3초·warm 1.5초·frame 33ms 등 실제 성능 기준은 바꾸지 않는다.

7단계 통합 브랜치는 `test/browser-readiness-budget`이고 커밋은 `git log -1 --format='%H %s' --grep='^test: enforce documented startup budget and retain diagnostics$'`로 식별한다. 담당/루트 check의 Vitest 203개와 독립 부정 검사 15개, 담당 공식 Chromium headed 6개 및 루트 headless 6개·pack이 PASS다. SDK tarball 5개는 byte 동일하다. 새 기능 상한은 navigation→ready→실제 100마커 전체 10초를 공유하고 실제 terminal error/destroyed는 즉시 실패시킨다. 당시 CI 원인을 해결했다거나 실제 지도 성능을 개선했다고 주장하지 않는다. 커밋/PR/main 결과는 최종 사용자 보고와 실제 원격 기록으로 제공한다.

## 실제 검증과 범위

- 1~5단계는 전체 `pnpm check`, 실제 `pnpm pack:check`, 문서/출처/staged diff 검사를 통과했다. Vitest 188개와 새 정리 3개, POI 14개, 비용 감사 22개, Python APK 13개·Native 소비 정책 10개 및 기존 정책 회귀를 포함한다. 6단계 전체 check는 새 부정 검사 5개를 포함해 Vitest 193개 PASS다. 초기 lint/감사 및 리뷰 지적 실패는 해당 단계 기록에 보존하고 수정 뒤 재실행했다.
- SDK tarball 5개는 기존 배포 후보와 byte 동일하다. SDK runtime·공개 API·dependency 버전·lockfile·npm 발행 workflow를 바꾸지 않았다. 새 Changeset이 필요한 SDK 기능 변경은 없다.
- 실제 Web tarball 소비의 새 레이어 계약·Bundler·core NodeNext·SSR·Chromium 표시/선택/종료는 PASS, 외부 요청/page error 0이다. 전체 Web NodeNext는 TS2834 9개로 PARTIAL_PASS/exit1이다.
- RN 최소 선언은 현재 TS6.0.3과 별도 SRI 검증 TS7.0.2 모두 TS2411/TS2344/TS2416을 재현했다. 이것은 앱 build·기기 화면의 성공 증거가 아니다.
- 기존 APK 83,969,186B의 실제 ZIP/bundle/ELF 재검사는 PASS다. 고지 이름 5개·native library 후보 19개·TFLite 3개를 확인했지만 법적 적합성은 NOT_EVALUATED/distributionReady:false다. 새 APK build나 기기 QA는 수행하지 않았다.
- 공식 POI 페이지는 실제 6회 opt-in 요청도 HTTP503이었다. 직접 CSV·exact header·독립 기준점이 없어 실제 공공자료 ETL/DB/검색 수락은 BLOCKED/NOT_RUN이다. metadata 열람·합성 회귀를 적재 성공으로 표시하지 않는다.

## 라이선스·비용·남은 차단

원장 A만 유지하고 실제 원본·타일·폰트·APK·모델·고지 원문은 Git/npm에 추가하지 않았다. 공개 SDK에 제작자 키·DB·기본 tile/search/routing endpoint·공유 proxy·유료 계정을 추가하지 않았다. 명시적 운영자 metadata probe와 개발용 npm registry 준비는 SDK 기본 요청과 구분한다.

보안 공식 수정 버전, MapLibre/RN 선언 수정, 실제 공공 CSV와 독립 기준점, 최종 APK의 완전한 dependency/notice 연결이 필요하다. 기존 1,000마커 p95 33ms 목표 실패, 실제 검색100/경로30 정답·부하, 승인 해안선/전국 자료, Native emulator/OS egress 등 미완료 품질 항목도 이 도구 변경으로 해결하지 않았다.

외부 데모 배포는 대상 미지정으로 NOT_RUN이다. GitHub 기본 브랜치/발행 환경 보호·npm 발행 주체 조건은 미해결이며 npm/tag/GitHub Release/visibility는 변경하지 않았다. 다른 컴퓨터에서는 아래와 같이 source preview를 받을 수 있다.

```sh
git clone --branch main https://github.com/kasa500000-png/KoreaMap.git
```

변경 파일·명령·플랫폼 QA·라이선스/보안·차단·branch/commit·다음 진행 여부의 여덟 항목은 [진행 기록](../progress.md)의 권장 후속 1~7에 각각 기록한다. 세부 근거는 [보안](security-followup.md), [Web 타입](web-declaration-compatibility.md), [Native 타입](native-types-followup.md), [POI](recommended-poi-acquisition.md), [APK](native-binary-notices.md), [브라우저 시작](browser-startup-synchronization.md), [전체 초기화 상한](browser-startup-budget.md)을 따른다.
