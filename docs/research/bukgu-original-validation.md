# 북구 산책로 실제 원본 파일 검증

2026-10-25 KST, 기준 main `7c000cb345e966ef105b735bf4789c9f82a88acc`. 사용자 지시에 따라 기존 CI 차단 수정은 보류하고 실제 공공 POI 원본 검증을 진행했다.

## 실제 취득과 검토

[공식 상세 페이지](https://www.data.go.kr/data/15088391/fileData.do)의 다운로드 버튼에서 CSV를 취득했다. 제공기관 부산광역시 북구, 파일 기준일 2025-11-20, metadata 수정일 2025-12-23, 무료, 이용허락범위 제한 없음, 공시 전체 행 7을 확인했다. 기존 A 원장의 개별 파일 범위와 일치한다. 페이지는 로그인 없이 파일 다운로드 가능하다고 안내한다. 이번 브라우저는 기존 세션 상태를 사용했으므로 비로그인 다운로드 자체를 검증했다고 주장하지 않는다. API 활용신청·키 발급은 하지 않았다.

다운로드는 공식 `www.data.go.kr`의 `/cmm/cmm/fileDownload.do`에서 발생했다. 정확한 다운로드 URL과 취득시각은 ignored `artifacts/real-poi/bukgu-download.json`, 원본은 `bukgu-20251120.csv`, 검토 설정은 `bukgu-config.json`에 보존했다. 파일은 865 bytes, EUC-KR이며 UTF-8 strict decode는 실패했다. 원본 SHA-256은 `cbdb5dc69f549fe264b23d72559d3f0a504ca5974a3d0e873f58082016d5c4ad`다.

정확한 헤더는 `길명`, `구간`, `시작점 주소`, `세부구간`, `거리(킬로미터)`, `소요시간`이다. 이름은 길명, 주소는 시작점 주소로 기존 프로파일에 명시적으로 매핑했다. 일 단위 기준일은 설정에서 `2025-11-20T00:00:00.000Z`로 표현하며 실제 관측 시간을 뜻하지 않는다. 원본 7행/고유 7행/중복 0행, 좌표 없는 행 7개를 검증했다. 주소로 위치나 경로를 추정하지 않았고 실제 지도 마커·routing graph를 생성하지 않았다.

## 구현과 검증 범위

private 원본 검증기는 이제 운영자가 검토한 `expectedRows`를 필수로 받는다. `prepareCsv`의 고유 행과 중복 수의 합이 공시 행 수와 다르면 실패한다. CSV의 quoted newline을 물리적 줄 수로 잘못 세지 않는다. 결과에 원본/중복/무좌표 행 수·인코딩·기준시각을 추가하고 무위치 프로파일은 모든 좌표 null을 확인한다. SDK·ETL 정규화·SQL·네트워크 경로·의존성은 변경하지 않았다.

원본 파일 검증은 실제 파일로 수행했고 보호 회귀는 자체 합성 입력만 사용한다. 최초 회귀의 이름 필드에 넣은 개행은 기존 POI 필드 정책에 거부됐으며, 필드 정책을 유지한 채 미사용 설명 열의 quoted newline으로 수정했다. 누락/문자열/음수/분수/범위 초과 행 수, 중복 포함 합계, 예상보다 적거나 많은 행, 실패 시 이전 PASS 덮어쓰기 및 원문 미출력을 검사한다.

```sh
pnpm build:sdk
pnpm test:real-poi
node scripts/verify-real-poi.mjs validate artifacts/real-poi/bukgu-config.json
```

원본과 설정은 clone되지 않는다. 재현자는 같은 공식 파일을 별도로 취득·검토하고 설정해야 한다. 검증 보고서의 `operator-attested-original-file-not-independent-download-proof`를 유지한다. 행 수 일치와 SHA는 권리·내용·독립 위치 정확성 전체의 증명이 아니다.

## 남은 차단과 비용

Docker 명령이 없어 실제 전용 PostGIS `smoke`와 SDK 검색은 **NOT_RUN**이다. 준비 후 [기존 절차](real-poi-validation.md)의 전용 빈 loopback DB 및 환경 파일을 사용해 `node --env-file=artifacts/real-poi/database.env scripts/verify-real-poi.mjs smoke artifacts/real-poi/bukgu-config.json`을 실행한다. 산책로는 좌표가 없으므로 독립 위치 기준점은 해당 없음이며 실제 DB에서의 null 보존은 아직 미검증이다. 용산 주차장·동물병원 원본/독립 기준점, 검색·경로 정답, 지도 성능, Native 실행·고지, 발행 운영 조건은 남는다.

기준 main CI40176852051은 기능 6 PASS/기존 release 3 FAIL이었다. node-forge/Zod high2, Web TS2834, Native TS2411/TS2344/TS2416 해결과 재실행은 사용자 요청으로 보류했다. 보류는 차단 해제를 뜻하지 않는다. 새 실패는 최종 검사 결과와 별도로 보고한다.

외부 원본·설정·로그는 ignored 운영자 저장소에만 보관하며 Git/npm에는 헤더·해시·검토 사실만 기록한다. 데이터는 기존 개별 이용허락, 자체 도구는 MIT로 구분한다. 제작자 endpoint·키·유료 계정·기본 네트워크 요청·CI 예외는 추가하지 않는다. 브라우저는 Ego Lite 0.6.0.22이며 업데이트 알림이 있었으나 도구 업그레이드는 하지 않았다.

최종 전체 검사·커밋/PR과 8개 종료 보고는 [진행 기록](../progress.md)의 해당 절을 따른다. 이번 변경은 화면 동작 변경이 아니며 Web 지도·Android/iOS 실화면 QA는 NOT_RUN이다.
