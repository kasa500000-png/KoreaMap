# 독립 소비 검증의 실행 환경 근거

확인일: 2026-10-24 KST. 기준 main `f374226c1acb211794379f5c81a62dbc375c777a`.

## 병합 CI와 우선순위

[병합 main CI](https://github.com/kasa500000-png/KoreaMap/actions/runs/40091649871)는 Linux/Windows/macOS 및 Chromium/Firefox/WebKit 기능 6개가 성공했다. 실패 job 로그를 각각 확인했다. Dependency audit는 high2, Web consumer는 TS2834, Native consumer는 TS2411/TS2344/TS2416으로 기존 릴리스 차단과 같다. 새 기능 실패는 없다.

공식 npm metadata를 다시 조회했다. node-forge latest 1.4.0, Expo 58.0.19/CLI 58.1.15의 forge `^1.4.0`·Zod `^3.25.76`, MapLibre GL 6.15.0의 geojson-vt `^6.3.0`·vt-pbf `^4.3.2`, RN 0.88.0은 앞선 [Windows 조사](windows-license-review.md)와 같다. 지원되는 수정 graph를 확인하지 못해 의존성을 변경하지 않았다. 실제 CSV/독립 정답·Native 기기 자료도 새로 제공되지 않았다.

현재 환경에서 재현한 보고서 오류를 다음 구현 대상으로 선택했다. `verify:packages`는 Windows 실행에서도 재현성 설명을 `same Linux host`로 기록했다. 이는 다른 OS의 새 실행 결과를 구분해야 하는 정책에 맞지 않는다.

## 변경과 한계

Web/Native 독립 소비 보고서에 실제 `process.platform`, `process.arch`, Node 버전과 해당 verifier가 호출하는 pnpm의 `--version` 결과를 기록한다. pnpm 버전은 성공한 실행의 stable 버전 문자열만 수락하며 오염된 출력은 저장하지 않고 실패한다. OS 사용자명·hostname·경로·환경변수는 수집하지 않는다.

`startedAt`/`finishedAt`는 이 검증 시도의 검사 구간이며 cleanup 성공이나 전체 gate 통과를 뜻하지 않는다. 기존 source commit/dirty, 검사별 상태·오류 및 exit1 계약을 유지한다. 추가 필드는 기존 schema에 부가하며 release preflight 판정을 바꾸지 않는다. Web 재현성 설명은 같은 호스트의 clean SDK rebuild/5개 tarball byte 비교 범위만 주장한다. 교차 OS 재현성·Android/iOS 실행·독립 서명 증거가 아니다.

## 재현

Node 24.19.0, pnpm 12.14.0, Python 3.12+와 기존 lockfile 설치를 준비한 뒤 각 명령을 독립 실행한다.

```sh
pnpm test:release
pnpm check
pnpm pack:check
pnpm verify:packages
pnpm verify:native-consumer
pnpm check:data --staged
```

Web 검사는 공식 Playwright Chromium과 로컬 Noto CJK KR가 필요하다. 결과는 ignored `artifacts/qa/packages.json`, `artifacts/qa/native-consumer.json`에 기록된다. 두 소비 검사의 기존 선언 실패는 계속 exit1이어야 한다. 실제 결과와 미실행 항목은 [진행 기록](../progress.md)의 해당 단계를 따른다.
