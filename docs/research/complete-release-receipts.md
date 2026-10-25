# 릴리스 사전검사의 소비 증거 누락 차단

확인일: 2026-10-25 KST. 기준 main `96ab2ff76deeb8e33f616970ab95dc059e1649d5`.

## 현재 차단과 선택한 작업

[main CI40100554083](https://github.com/kasa500000-png/KoreaMap/actions/runs/40100554083)를 다시 확인했다. 기능6 성공/기존 릴리스3 실패다. 새 dependency audit도 node-forge·Zod high2/exit1이다. 공식 npm metadata의 forge1.4.0, Expo CLI58.1.15의 forge `^1.4.0`/Zod `^3.25.76`, geojson-vt6.3.0, vt-pbf4.3.2, RN0.88.0은 [기존 조사](windows-license-review.md)와 동일하다. 지원되는 수정 graph를 확인하지 못해 의존성을 변경하지 않았다.

이번 `node --use-env-proxy scripts/verify-real-poi.mjs probe`는 2026-10-25 15:25 KST경 기존 공식 상세 페이지3곳 모두 HTTP200/text-html, exit0이었다. 과거 executor의 HTTP503을 현재 상태로 재사용하지 않는다. 결과는 `page-only-not-original-csv`이며 CSV 원본/SHA/header/독립 기준점·실제 DB 수락을 확보한 것은 아니다. 본문이나 공공 레코드를 Git/npm에 저장하지 않았다. 근거는 ignored `artifacts/toolchain/oct25-poi.log`다.

현재 로컬에서 재현 가능한 릴리스 판정 결함을 우선 수정했다. 소비 verifier에는 이미 Web 레이어 타입, Native SDK strict Bundler/NodeNext, registry lock 준비 검사가 있지만 preflight에는 이 네 필드가 누락돼 있었다. 상위 PASS와 기존 필드가 정상인 불완전한 증거가 준비 완료로 오인될 수 있었다. 실제 npm workflow는 독립 verifier를 계속 실행하므로 이 발견을 발행 우회나 실제 배포 발생으로 표현하지 않는다.

## 변경과 증거 계약

`web-consumer`는 `checks.webLayerTypes`를 다른 strict probe와 같은 정상 완료 조건으로 검사한다. `native-consumer`는 `checks.publicSdkBundlerDeclarations`, `checks.publicSdkNodeNextDeclarations`도 검사하고 `checks.registryLockPreparation`은 정확한 문자열 PASS만 허용한다. 필드 누락/NOT_RUN/FAIL·미완료·비정상 exit/signal/실행 오류를 모두 차단한다.

기존 source SHA/dirty·24시간 freshness·tarball hash·상위 상태·보안 감사·수동 발행 정책은 유지한다. report schema 번호를 바꾸지 않고 현재 verifier가 이미 생성하는 필드를 필수로 확인한다. 예전의 불완전한 receipt는 수정해서 재사용하지 말고 해당 검사를 실제 재실행해야 한다. 모든 조건이 통과해도 `READY_FOR_REVIEW`일 뿐 `publicationAuthorized:false`이며 사용자 발행 승인을 대신하지 않는다.

## 실제 검증

먼저 새 회귀만 추가해 이전 구현에서 Web 누락 probe와 Native registry 준비 누락이 PASS로 잘못 인정되는 두 테스트 실패를 확인했다. 이는 기존 high/type 오류와 별개의 새로 발견한 결함이다. 구현 후 `pnpm test:release`33/33 PASS이며 기존 완전한 합성 receipt는 검토 준비 상태를 유지한다. 이 합성 양성 fixture는 실제 출시 성공 증거가 아니다.

실제 `pnpm release:preflight`는 증거 누락·변경 중 소스에 대해 BLOCKED/exit1을 유지했다. 관련 전체 검사와 최종 staged 결과는 [진행 기록](../progress.md)을 따른다. UI 변경이 없어 새로운 실화면 QA는 NOT_RUN이다. Android/iOS 기기·실제 자료·성능·고지·발행 차단은 해제하지 않았다.

재현: `pnpm test:release`, `pnpm release:preflight`, `pnpm check`, `pnpm pack:check`, `pnpm check:data --staged`를 각각 독립 실행한다. 실제 preflight의 exit1은 예상된 준비 미완료 판정이며 프로그램 회귀 테스트 실패와 구분한다. SDK·dependency/lockfile·Provider·workflow·과금 설정·외부 payload는 변경하지 않는다.
