# 남은 작업 구현·검증 보고

기준일: 2026-10-20 KST. 대상 브랜치 `feat/korean-map-completion`, 기반 커밋 `76b379b9dd2abbb6393e90f789a78ac2fd352762`. [실행 계획](../execution-plan.md)의 실제 결과다. 구현 커밋은 `git log -1 --format='%H %s' --grep='^feat: add verified operator tiles and completion gates$'`로 식별한다. 이 보고서는 최종 공개·발행 승인이 아니다.

## 구현 범위

- private `services/tiles`: SHA·OSM 원장·기준일 검증, 정확한 Planetiler 0.10.2 artifact pin, 직접 작성한 `design-v1` profile, MBTiles 검사, immutable 세대·전환·롤백, read-only loopback HTTP XYZ와 4테마.
- 선택형 offline Glyph 생성: 검토한 OFL 폰트·라이선스·해시·도구 버전 요구. 기본 SDK 설치·빌드·테스트에 Java/Python 이미지 도구·실제 데이터 다운로드를 요구하지 않는다.
- `/tiles/` Web 예제: 빈 URL·미동의 상태는 지도 요청 0, 운영자 연결 뒤 실제 타일·한글 PBF·4테마·지역 이동, 연결 취소·정리. Web에 선택적 `useLocalIdeographs: false`를 추가했다.
- 독립 Native tarball 소비 검증과 A 등급 실공공파일의 취득/검증/DB smoke 도구. 실패·미실행을 통과로 바꾸지 않는다.
- CI 전체 의존성 감사 job, 정확한 승인 SHA/main ancestry 및 발행 전 Web QA, tarball 경로 검증을 보강했다.

새 SDK/예제/운영 도구 코드는 직접 작성한 MIT다. OSM PBF·MBTiles·OFL 폰트·생성 glyph·실지도 screenshot은 ignored `artifacts/`에만 보관한다. 외부 자료를 SDK/Git payload로 승인하지 않았다.

## 실제 한국 지도

[타일 가이드](../tiles.md)의 bbox 4개를 실제 Geofabrik 한국 PBF로 생성했다. 원본 SHA-256 `57e3ffd07e104d5b9ec511ac2b11cf784936b8982f0b4f30e6f5324928fc9f5e`, OSMHeader 기준일 `2026-10-18T20:25:06.000Z`다. 기존 로컬 검증 원본을 다시 확인했으며 이번 실행에서 한국 PBF를 재다운로드하지 않았다.

| 지역 | z0–14 tile 수 | archive bytes | 전체 생성 ms |
| --- | ---: | ---: | ---: |
| 서울 | 48 | 8,679,424 | 38,373 |
| 울산 | 52 | 3,760,128 | 35,267 |
| 부산 | 60 | 4,476,928 | 35,130 |
| 제주 | 52 | 2,088,960 | 33,577 |

9개 source-layer를 각각 확인했다. 도시 전체 coverage가 아니라 명시한 bbox 표본이다. 원본 profile은 해양/coastline polygon·철도 cartography를 제공하지 않으며 실제 전국 지도 완성으로 표현하지 않는다.

첫 서울 생성의 1536MiB heap은 전체 원본 node cache에서 OOM이었다. 4096MiB로 다시 생성해 통과했고 CLI 기본 heap을 4096MiB로 고쳤다. canonical Planetiler MBTiles `tiles` view를 정확한 허용 SQL 및 backing table 검증으로 지원했다. 임의 SQL view를 허용하지 않는다.

전국 명령은 실제 실행했으나 `INSUFFICIENT_TILE_DISK`/exit 1로 작업 시작 전에 차단됐다. 여유 약 4.7GiB, 전국 최소 8GiB 게이트다. 전국 z14 성공·운영 용량·증분 갱신은 미검증이다.

[Glyph 검증](tile-glyph-validation.md): BMP pack은 256 range, 실제 glyph 42,220개, 유효한 빈 range 75개, PBF 합계 36,834,573B다. 현대 한글 11,172자 누락 0이며 실제 MapLibre decoder가 전체 range를 읽었다. 최초 CJK pack의 FE00 범위 HTTP404를 발견해 BMP pack으로 보완했다. 미지원 BMP 21,268자는 조작해 넣지 않았으며 복잡한 shaping·emoji 전체 지원을 주장하지 않는다.

같은 입력과 profile로 서울을 다시 생성한 B(`1792468553996-b20f1aa1`, 40,268ms)는 A와 archive SHA가 바이트 동일했다. 실제 CLI로 B 활성화→A rollback을 실행했다. 잘못된 MIT-for-OSM license와 archive bitflip 후보는 각각 거부됐고 active pointer는 바이트 동일하게 보존됐다. 동일 host/input/tool의 재현 표본이며 모든 OS/향후 데이터 재현성을 보장하지 않는다.

Chromium 실제 지도 **9개 화면**: 서울 4테마/1440px, Standard 390/768px, 울산·부산·제주 Standard/1440px가 통과했다. 모든 화면에 실제 도로·건물·한글 라벨과 출처가 보였다. 생성 스타일은 클릭 가능한 OSM copyright/ODbL 링크를 제공하며 실제 DOM의 링크 대상도 검사한다. 실제 성공 응답은 스타일 12·타일 66·glyph 353, HTTP 오류 0·예상 밖 외부 origin 0·pageerror 0·서버 오류 0이었다. 연결 해제 후 지도 DOM/컨트롤이 제거됐고 가로 넘침이 없었다. 서울 dark/pastel/outdoor 및 390px screenshot도 직접 열어 한글·도로·건물·출처를 확인했다. 단회 준비 관찰값은 성능 SLA가 아니며 공유 worker의 완전 종료/장기 누수 부재를 주장하지 않는다.

증거는 ignored `artifacts/qa/real-tiles/report.json`·PNG 9개와 `artifacts/tiles/qa/rollback.json`이다. 처음 QA는 정상적인 이전 타일 취소를 오류로 분류해 중단됐으며, 취소를 별도 기록하도록 고친 뒤 전체 행렬을 다시 통과했다. 최종 실행의 취소 tile 수도 0이었다.

추가로 실제 Valhalla 한국 graph의 차량·도보·자전거·경유지 4경로를 동일 서울 타일에 공통 `api.showRoute`/`addMarker`로 표시했다. 1440/390px에서 4경로 레이어·3마커·한글·출처, HTTP 스타일 1/타일 20/glyph 52 성공, 외부·HTTP·페이지·SDK 오류 0을 확인했다. 섬·거리 제한 오류 6개는 fallback 없이 반환됐다. 종료 상태 destroyed·listeners 0·observer false·canvas 0이었다. 모바일 캡처의 경로 잘림을 직접 발견해 viewport/canvas 크기 갱신을 기다린 뒤 fitBounds하도록 검사 도구를 고쳤다. 최종 두 화면 모두 전체 경로 좌표가 실제 visible bounds 안에 있고 실제 waypoint 마커3개가 렌더링되는 것을 재확인했다. SDK 수정이 필요한 문제는 아니었다. 이 도구는 workspace 공개 dist를 소비하며 별도 격리 npm 소비 검사를 대신하지 않는다. 명령은 `pnpm verify:real-routing-map`이며 모든 운영자 설정과 `--operator-opt-in`을 요구한다. 증거는 ignored `artifacts/tiles/qa/routing-map/report.json`이다. 현장 통행 가능성·보행 안전·실시간 교통은 검증하지 않는다.

## 검사 결과

| 검사 | 실제 결과 |
| --- | --- |
| pnpm check | 통과: strict/lint/format/API/문서/빌드·정책·Changesets; 보안 audit 성공을 의미하지 않음 |
| Vitest / 독립 core | 101개 / 1개 통과 |
| 데이터 / 비용 회귀 | 20개 / 19개 통과 |
| 타일 / 릴리스 보호 | 17개 / 6개 통과 |
| 새 verifier 회귀 | 실제타일/경로 3개·실POI 3개·Native 소비 3개 통과 |
| Next.js production / Expo export | 통과; Expo는 Android/iOS JS export이며 APK/IPA 아님 |
| pnpm test:web | Chromium 19개 통과, skip/retry 0 |
| 실제 PostGIS / Valhalla | 합성 통합 19개 / 8개 통과 |
| 한국 실제 OSM 라우팅 | 5개 통과: 서울 세 모드·경유지·섬/단절·거리 제한 |
| pnpm pack:check / verify:packages | 5개 tarball 감사·동일 Linux 재빌드 바이트 일치; 격리 Web 4패키지 strict Bundler/SSR/browser 통과, 외부 요청 0 |
| pnpm offline:check | 준비한 store에서 13개 manifest·29개 workspace link 설치 통과, hook 없음 |
| Planetiler profile | 40개 직접 검사 + 실제 PBF→MBTiles 19tiles/87features/9layers 통과 |
| Glyph | Python 10개 통과, 실제 MapLibre 6.14.0 decoder 256 ranges 통과 |
| 전국 자원 gate | 예상 차단 확인; 실제 전국 생성 미실행 |
| 전체 의존성 감사 | **실패 high 2 / critical 0 / exit 1**, 안전한 공식 patch 미확인 |
| Native 독립 소비 | **PARTIAL_PASS**: 앱 strict/Bundler 지원 모드·plugin·양 OS JS export 통과, skipLibCheck:false 상위 RN 선언 3건 실패 |
| 실공공 POI | 공식 8주소 HTTP503, 원본 CSV 미확보; 실제 ETL→DB→검색 미검증 |

보안 세부는 [의존성 재조사](security-remediation.md), Native는 [독립 소비 기록](native-consumer-validation.md), 실자료는 [접근/검증 기록](real-poi-validation.md)을 따른다.

### 패키지 무결성

아래 0.1.0 tarball은 발행되지 않았다. peer 엔진·앱·지도/폰트 데이터 크기는 포함하지 않는다. 상세 기록은 ignored `artifacts/qa/packages.json` 및 release integrity다.

| 패키지 | gzip bytes | SHA-256 |
| --- | ---: | --- |
| core | 25,334 | `8869b2f3cbee9e2d61977431f5a6a6eff07cf448493d04311edde04520bee70b` |
| web | 14,003 | `21c7fac5782da52795d7cf05143912d52dfac8188537f015bf4a97e3541f0b89` |
| native | 9,862 | `67c09f20ae1bde22bd7b4f5fadde412c455b0e5d9a9c4be108c3d6e9d4d38d18` |
| styles | 13,874 | `cb6f3dd7aada96ec80916784c8adf0a06ff61452a86280dd5880e7805f4c4da7` |
| data-adapters | 6,913 | `c220eaa0fa044ca3ce77b836a35e1a948ead78d0e5dc8535d9a621773afdb337` |

최초 소비 검사는 캐시된 Playwright browser가 없어 중단됐고, 시스템 Chromium 경로를 명시해 다시 통과했다. 실제 한국 라우팅 검사는 병렬 clean SDK 재빌드 도중 일시적으로 dist를 찾지 못했으며 재빌드 종료 후 같은 5개를 모두 통과했다. 최종 소비/라우팅 성공과 최초 실패를 구분한다.

[GitHub 커넥터 통합 예행](integration-rehearsal.md): PR 14개 head는 모두 baseline의 조상이고 main→baseline은 22커밋 fast-forward 관계였다. 기존 PR #3~14의 36개 OS check-run 성공은 이번 새 커밋의 원격 CI가 아니다. 현재 기본 브랜치/메인에는 SDK가 통합되지 않았으며 새 원격 쓰기를 하지 않았다.

### Android 추가 빌드

현재 생성 워크스페이스 Android 프로젝트도 offline Gradle 9.4.1/JDK21/x86_64 `assembleDebug`를 재실행해 **37.86초/exit0**으로 통과했다. 기존 캐시를 재사용한 355 tasks 중 13개 실행/342개 up-to-date다. 현재 plugin/app 설정 7개와 실제 APK의 foreground 위치 권한·background 위치 권한 미포함을 확인했다. APK 83,382,858B, SHA-256 `f1592806b73c2b13e635383a45f1df41129a14f5bbbe97cef91b565e60545bb2`다. 증거는 ignored `artifacts/native-current-workspace/`다.

이 APK는 Metro 연결형 debug이며 현재 JS 내장 배포물·독립 tarball APK·설치/실행·실기기·iOS·Native glyph/PMTiles·OS egress·binary notices는 검증하지 않았다. 연결 ADB 기기는0대, Xcode/xcrun은 없다. [Native 소비 기록](native-consumer-validation.md)의 구분을 따른다.

## 남은 공개 게이트

1. 공식 보안 수정 그래프 및 전체 high/critical 0. 임의 override·감사 제외·Native 제거로 우회하지 않는다.
2. 실제 공공 원본 1종 이상 확보 후 권리·헤더·CRS 기준점·ETL/PostGIS/검색/지도 통합. 현재 공식 접근 실패를 합성 fixture로 대체 완료하지 않는다.
3. Android ARM64 실제 기기와 macOS/Xcode/iOS Development Build·실기기. 새 RC의 Native XYZ/glyph/PMTiles·권한/GPS·제스처·복귀·메모리·OS egress·binary notices.
4. Web strict NodeNext 상위 선언 문제, Native skipLibCheck:false 상위 선언 문제, Firefox/WebKit·물리 모바일 및 장시간 성능. 기존 제한적 Android emulator 결과는 과거 커밋 증거다.
5. 전국 및 운영 인프라 용량·지속 갱신/복구 검증. 지역 archive 성공은 공개 타일 서비스 SLA가 아니다.
6. 승인된 최종 SHA의 3 OS 원격 CI·보호 설정·npm 이름/소유권/인증·발행 후 registry 설치·별도 tag/Release 승인.

현재는 로컬 개발·추가 검증을 계속할 수 있다. 공개 업로드/main 통합·배포·npm 발행·GitHub Release는 진행하지 않았다. 구현 테스트 통과와 전체 출시 가능 판정을 분리하며 **공개 발행 차단 유지**다.
