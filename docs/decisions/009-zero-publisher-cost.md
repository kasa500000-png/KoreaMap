# ADR-009 — Zero Publisher Cost

날짜: 2026-10-19. 상태: 필수 정책 채택, 정적 감사 구현; SDK 런타임 검증 전. [전체 아키텍처](../architecture.md)

## 결정

지도·검색·경로·공공데이터 provider는 운영자 주입으로만 사용한다. 제작자 endpoint/키/계정 및 상위 라이브러리 demo URL을 기본값으로 두지 않는다. 필수 설정 누락은 renderer/요청 생성 전에 실패하고, 명시적 fixture 모드만 허가된 로컬 데이터를 사용한다. 공개 데모도 이 원칙을 따른다.

## 이유와 대안

제작자 공유 서버나 API 키를 숨겨 제공하면 SDK 이용자 증가가 제작자의 과금으로 이어진다. 무료 요금제·도메인 제한·클라이언트 난독화도 이 책임을 없애지 않는다. 외부 서비스를 사용할 운영자가 endpoint·자격 증명·사용료·한도를 선택하고 부담한다. 공용 OSM 서버로 비용을 전가하는 fallback도 사용하지 않는다.

## 결과와 제약

운영자 설정이 없는 상태의 네트워크 시도는 없어야 한다. style의 2차 참조, install hooks, telemetry, 원격 캐시도 포함한다. 클라이언트 환경변수는 공개 정보이며 비공개 키는 운영자 서버 밖으로 나가지 않는다. SDK 코드는 무료로 제공하되 데이터/서버 운영 비용, 일반 코드 배포 한도는 별도다.

Actions는 공개 저장소에서 무료 조건을 충족하는 표준 GitHub-hosted runner를 기본으로 한다. 과금 가능 기능은 별도 승인 후 감사한다. self-hosted runner가 Actions 분당 요금은 없더라도 장비 비용은 사라지지 않는다. 이번 변경은 workflow·배포·결제 설정을 활성화하지 않는다.

## 검증과 재검토

Z01 Z02 Z03 Z04 Z05 Z06 Z07 Z08 Z09 Z10 Z11 Z12. 정적 감사는 Git 파일·index·도달 가능한 이력의 자격 증명/endpoint/과금 설정과 선택 tarball을 검사한다. 실제 실행을 증명하지는 않는다. 기본 설치·import·지도 mount·테스트의 네트워크를 별도 기록하고 제작자 과금 endpoint 요청이 0인지 배포 전에 확인한다. [감사 기록](../cost-audit.md)이 미검증이면 제품 발행을 진행하지 않는다.

## 근거

[사용자 정책](../../AGENTS.md), [비용 구분](../../README.md), [GitHub Actions 과금](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [Next.js 환경값](https://nextjs.org/docs/app/guides/environment-variables), [Expo 환경값](https://docs.expo.dev/guides/environment-variables/).
