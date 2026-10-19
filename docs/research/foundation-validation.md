# Foundation 검증 기록

2026-10-19. 대상 `feat/monorepo-foundation`. 실제 결과는 [진행 기록](../progress.md)의 STEP 01과 [비용 감사](../cost-audit.md) 9절을 따른다. 이전 [설계 검사](design-validation.md)와 구분한다.

- 환경: Linux, Node24.19.0, pnpm12.14.0, Python3.12, Chromium 소프트웨어 WebGL. Windows/macOS는 GitHub Actions checks로 별도 확인한다.
- 기능 검사: pnpm check, Vitest16, Python 감사 회귀11, tarball5, Chromium E2E1. 제품 의존성 audit는 high2로 미통과다.
- Expo: Android/iOS Metro JavaScript export만 검증. 실제 APK/IPA·기기·시뮬레이터는 미검증.
- 테스트는 API 키/클라우드 계정/실제 데이터 다운로드 없이 실행했다. SDK/core import에는 browser/native/backend 모듈이 없다.
- 최초 pnpm 스크립트 실행·RN API·CSS 타입·mock 해석·worker 및 MIME·idle screenshot 오류를 수정해 관련 검사를 재실행했다. 합성 xcode smoke의 초기 빈 project 객체 오류도 fixture hash를 채워 수정했다.
- 의존성 override: xcode3.0.1+uuid11.1.1로 합성 빈 프로젝트에서 고유한 24자리 대문자 ID10개 생성 성공. 실제 pbxproj parsing/ios build 증명은 아니다.
- 네트워크 namespace 차단은 환경 권한 제한으로 불가. strace/브라우저 관측을 별도 증거로 남기며 sandbox 격리 통과라고 보고하지 않는다.
- 원격 CI 실행 결과는 PR 체크/실행 URL과 최종 사용자 보고에 남긴다. 후속 실행에도 해당 커밋을 기준으로 확인한다.

## 산출물

SDK tarball에는 각 5항목(JS, d.ts, LICENSE, package.json, README)만 포함한다. native 앱/데이터 backend는 pack하지 않는다. 아래 hash는 마지막 로컬 검사 산출물을 대상으로 갱신한다. 임시 tarball/screenshot은 Git에 커밋하거나 CI artifact로 업로드하지 않는다.

| 파일 | SHA256 |
| --- | --- |
| korea-map-kit-core-0.1.0.tgz | `195b49ae4db2889fbe8ad4fd9e320a46965e9632578076a60344eb388e4ea481` |
| korea-map-kit-data-adapters-0.1.0.tgz | `8a2052a82af5fa4c9ed3c8f4a80cdc8e2894da777144753aadfec76e145ab117` |
| korea-map-kit-native-0.1.0.tgz | `5599d1217d2bdc56450b33b05a2544581b56d920255c928507db9bd2d09c9fe5` |
| korea-map-kit-styles-0.1.0.tgz | `ce495e6de54ed7a07f741000718be7186221eef42bcf4f59fb5ad6ad3c520e0b` |
| korea-map-kit-web-0.1.0.tgz | `ac13fae7cfaf33894f6e309033e7284049a3959f7e2ab9cfdcc6ace0e34fa716` |

Web screenshot SHA256: `28e31f40b9a679bccbe488746e5431148ffcba1c28fdeacd736bf44ec9e04367`. 실제 이미지는 로컬 QA 산출물이다.

## Linux 네트워크 관측

최종 pnpm check를 `strace -f -e trace=network,execve`로 관측했다. 외부 TCP connect 0, 인터넷 목적지 UDP connect 1, AF_NETLINK 이외 sendto/sendmsg/sendmmsg 0이었다. 유일한 UDP connect는 Expo의 lan-network가 로컬 출발 주소를 고르기 위해 공개 resolver 주소에 연결 정보를 설정한 뒤 즉시 socket을 닫는 코드다. DNS 질의 payload 전송은 관측되지 않았다. SDK provider/제작자 서비스 접속은 아니다. 네트워크 probe까지 0건이라고 주장하지 않는다. 전체 wire packet capture 또는 Native OS 계측은 별도 미검증이다.

초기 Next 자동 upgrade 조회는 공식 agentUpgrade false로 제거했으며 수동 pnpm audit는 그대로 실행해 high2를 보고한다. 오프라인 새 설치는 connect 0건이었다. 초기 온라인 설치는 전체 syscall trace가 없으므로 같은 증거로 대체하지 않는다.

## 원격 CI 후속

[최초 실행](https://github.com/kasa500000-png/KoreaMap/actions/runs/39205075633)의 Windows는 통과했고 Linux/macOS는 기능 검사 후 Changesets의 로컬 main 참조 부재로 실패했다. status 비교를 origin/main으로 바꾸고 로컬 main이 없는 detached clone에서 재검증했다. PR #3의 후속 checks를 최종 실행 결과로 사용한다.

별도 소비 검증: 실제 core tarball을 새 임시 프로젝트에 offline/ignore-scripts로 설치하고 Node ESM import·좌표 검증·설정 누락 오류를 확인했다. SDK tarball 발행은 수행하지 않았다.
