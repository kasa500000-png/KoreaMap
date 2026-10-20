# 남은 작업 실행 계획

기준일: 2026-10-20 KST. 사용자가 승인한 실행 계획을 `feat/korean-map-completion`에서 구현한다. 시작점은 릴리스 후보 `76b379b9dd2abbb6393e90f789a78ac2fd352762`다. 이 문서의 계획과 기존 증거는 새 구현의 통과 결과를 대신하지 않는다. 실제 결과·커밋·차단 항목은 [진행 기록](progress.md), [비용 감사](cost-audit.md), [릴리스 보고서](releases/v0.1.0.md)에 남긴다.

## 목표와 범위

최종 목표는 Web·Android·iOS 및 core/web/native/styles/data-adapters 5개 패키지다. Web Alpha는 중간 검증 단계이며 Native 패키지를 발행 목록에서 암묵적으로 제외하지 않는다. 모든 기본 설치·빌드·테스트는 제작자 계정·유료 지도 키·DB 없이 실행한다. 실제 타일·검색·라우팅은 운영자가 명시적으로 선택한 별도 인프라다.

SDK 자체 코드와 합성 fixture는 MIT, OSM은 ODbL, 폰트·glyph·아이콘·도구는 각각의 조건을 유지한다. 실제 PBF·타일·공공파일·폰트·glyph·지도 캡처·기기 기록은 ignored 운영자 저장소에 보관한다. Git/npm에는 도구·설정·직접 작성한 코드·문서만 포함한다. 기존 합성 4종 스크린샷의 제한된 허용 규칙은 확대하지 않는다.

## 작업과 완료 조건

| 작업 | 범위와 산출물 | 선행 조건 | 완료 기준 | 현재 상태 / 남은 게이트 |
| --- | --- | --- | --- | --- |
| A. 현재 문서·수락 기준 | requirements/roadmap/ADR/API·지원 상태를 실제 구현과 맞추고 본 계획을 연결 | 기존 검토 | R/Z 식별자와 추적성 보존, 과거 증거/새 실행 구분, 링크 검사 통과 | 문서/요구사항/ADR 정합성 수정; 최종 통합 검사 대기 |
| B. 보안·CI | node-forge/braces 공식 경로 재확인, 안전한 호환 그래프 조사, 일반 CI 및 발행 게이트 보강 | A, 공식 metadata | 전체 audit high/critical 0 및 회귀 통과; 안전한 경로가 없으면 보안 BLOCKED 유지 | 일반 CI dependency audit·발행 전 전체 Web QA 보강 구현; 공식 미패치 high 2로 보안 BLOCKED |
| C. 서울 실제 지도 | private services/tiles, PBF 검증·Planetiler profile·MVT archive·HTTP XYZ·스타일·한글 glyph | A, 데이터 권리·도구 pin·자원 확인 | 새 체크아웃에서 실제 도로/건물/공원/수역/지명, 한글 fallback·출처·HTTP 오류 복구 실행 | 서울 MBTiles·BMP256 glyph 및 실제 4테마/3화면폭 HTTP·한글 검증 통과; 전체 플랫폼은 별도 게이트 |
| D. 확대·갱신 | 울산·부산·제주, 입력/출력 manifest, immutable 세대·수동 전환·롤백, 전국 생성 명령 | C | 4지역 실제 타일 검사, 실패 시 기존본 유지와 rollback 실행; 전국 실행은 별도 실측 | 4지역 생성·Standard 화면 통과, 서울 실제 두 세대 activate/rollback 및 실패 pointer 보존 통과; 전국 실제 명령은 디스크 게이트 차단 |
| E. 공공 POI·검색·경로 | A 등급 실파일 1종부터 취득→검증→DB→검색→지도, 기존 Valhalla와 실제 지도 연결 | A, 공식 파일 접근; 화면은 C | 실제 원본 권리·헤더·CRS 기준점·DB/API·출처·실도로 표본 확인 | 실제 Valhalla 4경로→서울 지도 2화면·6오류·출처·정리 통과; 공식 8주소 HTTP503·원본 CSV URL 미확보로 실제 POI 적재 미검증 |
| F. Native 소비·기기 | workspace 밖 tarball 설치, APK/iOS 개발 빌드, 실제 XYZ·glyph·GPS·테마·수명·고지 | C, Android 실기기·macOS/iOS 환경 | 아래 기기 행렬 통과, 실제 OS 네트워크 및 binary notices 확인 | 격리 tarball 설치·strict 앱 코드·plugin·양 OS JS export 통과, 상위 RN 선언 probe 3건 실패로 PARTIAL_PASS; 실기기/iOS 빌드 미검증 |
| G. 통합·릴리스 | 14개 stacked PR inventory와 로컬 통합 예행, 5개 tarball·문서·권한·승인 자료 | B~F 필수 범위 | 최종 SHA의 전체 회귀·무결성·지원 범위 확인, 승인된 외부 작업과 발행 후 registry 설치 | 로컬 준비만 허용 |

타일 명령·실제 4지역 archive·경로 통합 수치와 범위는 [타일 가이드](tiles.md), 9화면 검증은 [실지도 기록](research/real-tiles-validation.md), glyph 검증은 [별도 기록](research/tile-glyph-validation.md), 실파일 차단은 [실자료 기록](research/real-poi-validation.md), 독립 Native의 부분 성공/선언 오류는 [소비 검증](research/native-consumer-validation.md)을 따른다. 기존 단위/JS export 결과로 남은 실화면·원본·기기 게이트를 닫지 않는다.

A 후 B와 C를 병행한다. C가 통과하면 D/E/F를 독립적으로 진행한다. 보안 수정 경로·실파일·기기 환경을 확보하지 못해도 다른 준비는 진행할 수 있지만 해당 게이트는 닫아 둔다. 날짜 경과나 사용자 승인 자체가 실패·미검증을 통과로 바꾸지는 않는다.

## C/D — 실제 타일 파이프라인

1. 데이터 원장의 개별 OSM 권리·기한·ODbL과 원본 기준일을 확인한다. 기존 검증 PBF를 재사용할 때도 SHA-256과 출처를 대조한다. 공개 타일 서버를 수집 원본·기본 fallback으로 사용하지 않는다.
2. CPU/RAM/디스크와 입력·중간 산출물·현재/직전 성공본의 동시 보관 용량을 확인한다. 사용자 데이터나 성공 세대를 자동 삭제하지 않는다. 저장 공간 부족 시 명시적 지역·zoom 범위를 축소하고 실제 적용값을 기록한다.
3. 공식 Planetiler/JDK 요구와 정확한 artifact hash를 고정한다. profile은 프로젝트 자체 작성 코드다. `services/tiles`는 private 운영 도구이며 SDK의 dependency/install/build 경로에 Java·Docker·다운로드를 연결하지 않는다.
4. `design-v1`의 `kind`/`class`/`poi`/`name:ko`/`name`/`name:en`과 출력 source-layer 대응표를 한 곳에서 관리한다. 한국어는 NFC 정규화와 `name:ko → name → name:en` fallback을 사용한다. 임의 OpenMapTiles schema와 자동 호환을 약속하지 않는다.
5. 첫 지역은 서울 소형 bbox, 최대 z14다. 이후 동일 profile로 울산·부산·제주를 생성한다. 전국 생성 명령 제공과 실제 전국 생성 통과를 구분한다. 전국 고배율·일일 증분·여러 타일 엔진은 초기 범위에 넣지 않는다.
6. 공통 경로는 직접 HTTP XYZ MVT와 명시적 style/glyph다. archive 산출물 선택과 클라이언트 PMTiles 직접 접근은 별개다. Native에는 지원되는 inline style와 direct XYZ를 제공하며 remote TileJSON 지원을 추정하지 않는다.
7. 원본·profile·도구·폰트·출력 hash, bbox/zoom, schema, 기준일과 라이선스를 manifest로 보존한다. 새 세대는 검증 후 명시적으로 전환하고 실패하면 이전 성공본을 유지한다. 실제 update/rollback을 실행한다.
8. 실지도 QA 캡처와 자료는 ignored 결과로 보관한다. 기존 fixture 데모는 외부 자료를 자동으로 불러오지 않는다. 공개 demo에 제작자 타일 서버를 추가하지 않는다.

## E — 실자료 검증

현재 CSV 프로파일은 `yongsan-parking`, `mois-animal-hospitals`, `bukgu-walking`이다. A6은 저장/배포 권리 후보 수이며 실수집 성공 수가 아니다. 공식 접근이 실패하면 HTTP 상태·관찰일과 재실행 방법을 남기고 실제 적재는 미검증으로 유지한다. 우회 수집·미확인 대체 데이터·합성 파일의 실제 원본 표시는 허용하지 않는다.

검색은 적재된 POI 이름/주소와 공간·카테고리 검색부터 검증한다. `reverseNearby`는 가까운 POI의 주소이며 정확한 전국 주소 역지오코더가 아니다. 전체 주소 GeocodingProvider는 별도 선택 기능이다. 공개 Nominatim을 기본 검색이나 자동완성에 연결하지 않는다.

Valhalla와 서울 지도는 같은 검토된 OSM SHA를 사용해 실제 세 모드와 경유지 4경로를 연결했다. Chromium 1440/390px에서 경로 4개·경유점 마커 3개·한글·출처를 확인했고, 세 모드의 섬 단절/거리 제한 6오류가 fallback 없이 반환됐다. 실제 tile/glyph HTTP와 지도 종료 정리도 통과했다. [타일 가이드](tiles.md)의 명시적 입력 재현 명령을 따른다. 이 결과는 실제 POI 적재·전국 경로 정확도·현장 안전·실시간 교통·Native 검증을 대신하지 않는다.

## F — 플랫폼별 검증

| 대상 | 환경 | 필수 검증 |
| --- | --- | --- |
| Web | Chromium/Firefox/WebKit 및 고정 장비 | 390/768/1440px, 실제 타일·한글·마커/경로·4테마·키보드·오류 복구·종료 |
| Android | 고정 emulator와 최소 ARM64 실기기 1대 | 현재 RC tarball 소비 앱 APK 설치, cold start, 권한·센서·제스처·회전·복귀·메모리·TalkBack |
| iOS | macOS/Xcode/CocoaPods, simulator와 최소 실기기 1대 | 현재 RC의 개발 빌드·설치와 같은 공통 시나리오, VoiceOver·native profiling |

실제 앱 빌드는 공개 SDK dist만 사용하며 workspace alias로 해결하지 않는다. Expo Go·prebuild·JS export는 APK/iOS 빌드 성공이나 화면 QA 증거가 아니다. 이전 Android x86_64 emulator의 제한적 성공은 당시 커밋의 증거로 유지한다.

고정 절차는 회전 5회, background 왕복 10회, 지도 진입/종료 20회, 4테마 각 5회 전환, 10분 조작이다. crash·검은 화면·중복 이벤트·ANR를 확인한다. 동의 전 위치 요청/구독 0, 거절/허용/설정 철회·timeout·삭제·종료·명시적 재개를 시험한다. 현재 GPS는 foreground 전용이다.

장비/OS/빌드/데이터를 고정하고 cold/warm 준비 시간·frame time·JS/native/GPU 메모리를 기록한다. [아키텍처](architecture.md)의 성능 목표는 실측 게이트다. MapLibre의 유지되는 공유 worker는 알려진 제약이며 원래 잔여 worker 0 목표를 통과한 것으로 바꾸지 않는다. 지도별 listener/view 정리와 반복 생성 중 worker 비증가를 별도 관측한다.

기본 앱의 제작자 endpoint 요청은 0이어야 한다. operator 앱의 요청은 명시한 자산과 개발 통신으로 구분한다. 정적 URL 검사와 실제 앱 egress는 별도 증거다. 개인 좌표·토큰·기기 로그는 Git/공개 보고서에 넣지 않는다. PMTiles는 XYZ 통과 이후 별도 선택 실험이며 미검증 상태로 기본 경로가 되지 않는다.

## G — 통합과 승인

5개 패키지 fixed group을 유지한다. 기존 14개 PR의 base/head SHA·Draft·CI·ancestry를 확인하고 로컬 임시 통합 브랜치에서 중복 replay·누락·충돌과 최종 tree를 검증한다. 승인 전 main·공개 원격·기본 브랜치를 변경하지 않는다. 실제 결과가 있는 통합안과 정확한 후보 커밋을 먼저 준비한다.

외부 작업 순서는 공개 업로드/main 통합 승인 → 승인된 통합과 최종 SHA의 3 OS CI → npm 소유권/이름/2FA/OIDC·보호 환경과 tarball 발행 승인 → 5개 발행 → registry exact-version 소비 설치·SRI/소유자/provenance 확인 → 승인된 tag/GitHub Release 생성이다. 신규 이름의 최초 인증 발행과 이후 OIDC 발행을 구분하며 같은 버전을 다시 발행하지 않는다. 이름 예약용 빈 패키지도 발행 승인 없이 만들지 않는다.

[릴리스 절차](releases/process.md)를 적용한다. 일부만 발행된 실패는 성공 버전과 integrity를 기록한 뒤 승인된 나머지만 복구하며 자동 unpublish하지 않는다. 실제 registry 설치는 발행 후 실행하므로 사전 통과로 표시하지 않는다.

## 공통 검사와 보고

변경에 맞춰 `pnpm check`, `pnpm audit:dependencies`, `pnpm pack:check`, `pnpm verify:packages`, `pnpm test:web`, `pnpm test:geo`, `pnpm test:routing`, `pnpm offline:check`, `pnpm check:data --staged`를 실행한다. 새로운 타일·실자료·독립 Native 소비 검사도 해당 구현의 실제 명령과 결과를 기록한다. 기본 CI에 대형 OSM 다운로드·전국 build·정기 수집·artifact 업로드·유료 runner를 넣지 않는다.

매 단계는 구현 기능, 변경 파일, 실행 테스트, 실화면, 라이선스/보안, 잔여/차단, 브랜치/커밋, 다음 단계 가능 여부 8개 항목을 보고한다. 실행 불가·실패를 skip 성공으로 처리하지 않는다. 일정은 서울 생성 실측과 기기 환경 확보 후 산정한다.

고급 검색·전국 주소 DB·background 지속 GPS·오프라인·증분 갱신·실시간 교통·대중교통·고급 내비게이션·스타일 GUI는 후속이다. Supabase는 선택형이며 이 계획이 cloud 계정·배포·과금 기능 활성화를 승인하지 않는다.
