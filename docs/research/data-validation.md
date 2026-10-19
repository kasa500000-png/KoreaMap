# 데이터 정책 검증 기록

실행일: 2026-10-19. Linux 로컬 실행. 공식 원문 조사 결과와 미열람 항목은 [공급원 조사](../data-sources.md)에 분리 기록했다.

## 실제 검사

- `pnpm check`: 출처/라이선스 회귀16, Vitest16, 기존 audit 회귀11, 타입·빌드·문서·비용·Changesets 통과.
- `pnpm pack:check`: 아래 실제 tarball 5개 통과. 데이터 형식/미등록 파일·소스맵/중복/link·manifest 변조 및 빌드 바이트 불일치를 검사한다.
- `pnpm test:web`: Chromium 1개 E2E 통과; 로드/pan/검색/reload와 외부 HTTP 시도 0, pageerror 0 확인. screenshot 직접 관찰: 자체 합성 polygon/point와 한글 UI·MIT 출처 정상.
- `python scripts/check-data.py --select osm-geofabrik-kr --operator-opt-in`을 Linux strace network 필터로 실행: 네트워크 syscall 0. 출처 선택은 다운로드가 아니다.
- `pnpm check:data --staged`: 커밋 index 검사. CI에서도 같은 검사를 실행한다.

정책 회귀는 실제 수집 대신 합성 변조 입력을 사용한다. B 정책 분기도 합성 테스트이며 특정 공급원의 B 허가를 의미하지 않는다. 외부 URL live availability는 offline 테스트에서 호출하지 않는다. 원본 파일 QA·실 API quota·Native 실화면은 미검증이다. 원격 CI는 PR checks 및 progress 후속 기록을 따른다.

## SHA-256

| 산출물 | SHA-256 |
| --- | --- |
| data/sources.json | `1ff555297fd9150a130bfb205e5bb5221233927f29385b0adbec5207921cd539` |
| data/publication.json | `70384afb6fa66f49804776072da635c15f81adf1ca5963dca81e7d4f42436f77` |
| artifacts/korea-map-kit-core-0.1.0.tgz | `195b49ae4db2889fbe8ad4fd9e320a46965e9632578076a60344eb388e4ea481` |
| artifacts/korea-map-kit-data-adapters-0.1.0.tgz | `8a2052a82af5fa4c9ed3c8f4a80cdc8e2894da777144753aadfec76e145ab117` |
| artifacts/korea-map-kit-native-0.1.0.tgz | `5599d1217d2bdc56450b33b05a2544581b56d920255c928507db9bd2d09c9fe5` |
| artifacts/korea-map-kit-styles-0.1.0.tgz | `ce495e6de54ed7a07f741000718be7186221eef42bcf4f59fb5ad6ad3c520e0b` |
| artifacts/korea-map-kit-web-0.1.0.tgz | `ac13fae7cfaf33894f6e309033e7284049a3959f7e2ab9cfdcc6ace0e34fa716` |
| test-results/fixture-renders-pans-searc-4f16d-s-using-only-local-requests/local-fixture.png | `7b8b0d14f59662dee9408c205344a0bed9b855e00a7c91b3a4f2ef24a422e76f` |

tarball·원본 화면은 Git에 포함하지 않는다. SDK 소스·의존성은 이 단계에서 변경하지 않았다. 원장 hash는 검토 시점의 메타데이터를 고정하며 원격 사이트 원문의 hash가 아니다. pnpm pack은 발행하지 않는다.
