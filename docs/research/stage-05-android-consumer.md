# Stage 05 — 독립 tarball Android 빌드 검증

기준 커밋: `469bb3c5958b00e639c5d0f0df9c3f4c93d822d2`. 확인일: 2026-10-20 UTC. 작업 브랜치: `test/stage-05-android-consumer`.

## 1. 구현 범위

선택형 로컬 QA 도구가 최신 `korea-map-core`, `korea-map-native`, `korea-map-styles` tarball 세 개를 독립 Expo 앱에 오프라인 설치한 뒤 실제 Android debug APK를 생성·검사한다. SDK runtime, 공개 API, 기본 설치, 지도 provider 설정은 변경하지 않는다.

기존 독립 Native consumer의 공개 선언 Bundler/NodeNext 검사, 앱 strict 타입 검사, 전체 RN 선언 검사, Expo config plugin 검사, Android/iOS JS export를 유지한다. export 이후 동기 hook으로만 prebuild·APK 검사를 연결한다. async 함수와 thenable 반환은 거부해 완료 전 PASS·임시 앱 삭제를 막는다.

`expo prebuild --platform android --no-install` 후 생성된 앱의 `react` 블록에서 `debuggableVariants = []`로 설정해 Metro 연결 없이 JS를 APK에 포함한다. Gradle stable `9.4.1`, JDK 21, Android build-tools `37.0.0`, x86_64를 검사하며 `--offline --no-daemon --max-workers=2`로 빌드한다. Expo telemetry·dotenv·OTA 업데이트·background 위치 수집은 비활성 상태를 유지한다.

`aapt`의 앱 ID `org.koreamapkit.consumer`, x86_64, 정확한 foreground 위치 권한명을 확인한다. Python stdlib 도구가 APK를 추출하지 않고 ZIP 중복 이름·경로·암호화·entry/총 팽창 크기·전체 CRC를 검사한다. 선언된 길이에서 출력을 자르는 ZIP reader에 의존하지 않고, raw local header·STORED 실제 길이·DEFLATE 실제 출력/EOF/남은 압축 바이트·CRC·descriptor·entry 중첩을 검사한다. APK의 실제 `assets/index.android.bundle`과 해당 임시 앱의 Gradle 생성 bundle을 크기·SHA로 비교하며, UTF-8 JS와 Hermes bytecode를 지원한다. MapLibre 라이브러리의 실제 바이트·SHA, ELF64/little-endian/shared-object/x86_64, program/section table과 segment 경계를 검사한다. 최종 APK는 검사한 snapshot에서 복사한다.

자식 명령은 shell을 사용하지 않는다. supervisor가 프로세스 그룹과 PID·시작시각으로 관찰한 소유 자손을 추적한다. 별도 세션에 생성된 JVM도 관찰되면 timeout·출력 초과·명령 실패 시 정리 대상으로 삼으며 PID가 재사용되면 해당 프로세스에는 신호를 보내지 않는다. 다만 100ms PPID polling 전에 즉시 재부모화한 자손까지 발견했음을 보장하지 않는다. 실패 시 `TRACKED_PROCESSES_SIGNALED`는 관찰한 PID에 신호를 보냈다는 뜻이며 `descendantCoverage:UNKNOWN`을 유지한다. 모든 임의 자손의 정리 완료로 표시하지 않는다. 이 선택형 도구는 Linux에서 실검증하며 macOS의 실행은 미검증이다. Windows `.bat` launcher는 지원으로 주장하지 않고 `ANDROID_QA_HOST_NOT_AVAILABLE`로 실패한다. SDK의 Web/Android/iOS 및 기본 모노레포 운영체제 지원 목표를 축소하는 정책이 아니다.

## 2. 생성·수정 파일

- `scripts/verify-native-android.mjs`: 명시적 도구 설정, 오프라인 빌드, aapt·APK 검사와 분리된 보고서.
- `scripts/native-android-process.mjs`: bounded 명령 실행과 소유 자손 정리.
- `scripts/verify-native-apk.py`: Python stdlib ZIP·bundle·ELF 검사.
- `scripts/verify-native-consumer.mjs`: 기존 STEP 02 probe를 보존한 동기 export hook.
- `tests/native-android.test.mjs`, `tests/native-android-apk.test.py`: hook·프로세스·가짜 APK 음성 테스트.
- 이 문서. package·lockfile·SDK·공급자·출처 원장은 변경하지 않는다.

## 3. 실행한 검사와 결과

- `node --test tests/native-android.test.mjs tests/native-consumer.test.mjs`: Node **17개 통과**, 실패·건너뜀 0. 이 실행에 Python 가짜 APK 검사 **9개**가 포함된다.
- 가짜 ZIP 검사는 JS/Hermes 실제 SHA 일치, 서로 다른 bundle·빈 파일 거부, 중복/위험 경로/심볼릭 링크 거부, 비필수 entry CRC 손상, 크기 제한, 잘못된 ELF 아키텍처·경계를 검사한다. 짧은 prefix CRC에 맞춘 거짓 STORED/DEFLATE 길이, 미완료 deflate EOF, 압축 stream 뒤 추가 바이트도 거부한다.
- supervisor 테스트는 특수문자가 포함된 인자를 shell 해석 없이 전달하는지, 관찰한 별도 세션 자식을 timeout·출력 초과 시 종료하는지 검사한다. 단명 parent·즉시 재부모화 반례는 정리 범위가 UNKNOWN으로 남는지 검사하며 해당 테스트가 만든 자식은 별도로 종료한다. 종료 관찰은 bounded polling으로 zombie와 ESRCH를 구분한다. Windows에서 이 실제 process-group 테스트 2개는 명시적으로 건너뛴다.
- 수정된 JS 파일의 ESLint·Prettier와 `git diff --check`는 통과했다.
- `pnpm build:sdk`: 통과. `pnpm pack:check`: 5개 SDK tarball 정적 정책·출처·비밀정보 검사 통과. 이는 APK 실행 또는 동적 네트워크 검증은 아니다.
- 실제 독립 앱의 공개 SDK Bundler/NodeNext 선언 검사와 앱 strict/config plugin/Android·iOS JS export는 통과했다. 전체 RN 선언 검사는 기존 **TS2411·TS2344·TS2416 실패**를 유지하며 release gate를 해제하지 않는다.
- 첫 실제 오프라인 Gradle 빌드는 **174,128ms / 335 actionable tasks 모두 실행**으로 성공했다. 후속 payload 검사가 구 RN 생성 경로 가정 때문에 실패해 전체 시도는 FAIL로 기록했다. RN 0.88의 실제 출력 경로 `android/app/build/generated/assets/react/debug/index.android.bundle`로 수정한 두 번째 빌드와 payload 검증은 **PASS_BUILD_ONLY**다.
- 두 번째 검증은 2026-10-20 **22:46:17.676–22:49:14.751 UTC / 전체 hook 177,075ms**, Gradle assemble **174,343ms / 335 tasks 모두 실행**이었다. 실제 APK의 identity·권한·내장 JS·Native library 검사가 통과했다. 전체 consumer는 RN 선언 오류 때문에 **PARTIAL_PASS / releaseBlocked:true / CLI exit 1**을 유지한다.
- APK는 **83,969,186B**, SHA-256 `219e48a5dd5030702420124ad953df65885613057448f9d5ca9ad6dce6de96b6`다. 실제 Hermes bundle **1,871,700B**의 SHA-256 `c1f14dfba7b6c7f1dbe222e50b1e5fb76e8ee8e94800833eb81147f5599e7af7`가 생성 bundle과 일치했다.
- `lib/x86_64/libmaplibre.so`는 **11,207,424B**, SHA-256 `55175bf2dfb64aa31a555cf8df5846c1c736c10a4946162c175ae948ad189774`이며 ELF64/little-endian/x86_64/3개 LOAD segment 경계 검사가 통과했다. ZIP **1,330 entries / 117,875,352B**의 전체 CRC와 경계 검사도 통과했다.
- 독립 리뷰 후 raw ZIP stream 검사만 보강해 **22:54:15 UTC inspector-only 재검증 PASS**를 확인했다. 세 번째 Gradle 빌드는 하지 않았다. `reinspection.json`이 inspector SHA `b961f3c180209b2234505fc711a29597fc2934f9499e980fba56a10ded131298`, 원본 빌드 보고서 보존과 최종 APK/snapshot SHA 일치를 별도로 기록한다. 원래 빌드 기록을 새 빌드 성공으로 덮어쓰지 않았다.

tarball SHA-256은 다음과 같다.

| tarball | SHA-256 |
| --- | --- |
| korea-map-core-0.1.0.tgz | `064a6a65a06cc261ab1c025b13d1ef2d94f5613c7f324b1bd4426dddf326c5b9` |
| korea-map-native-0.1.0.tgz | `a5a7c4d7d318cc3f103d3a8588ba770d20dcd6f49df58218e8b91bf1b8f78b23` |
| korea-map-styles-0.1.0.tgz | `fb8b73d4cc181499f835d76c2a86501af3a7cb28b5785ba73bd945d83da17947` |

## 4. 실화면 QA 결과

이 단계는 APK 컴파일·내장 payload 검사다. Android emulator/실기기 설치·실행, 한글 glyph, 터치·회전·권한 UX·복귀·메모리·OS 네트워크, iOS Development Build는 **미실행**이다. 연결된 외부 Android 기기는 없고 이 환경에 KVM이 없어 emulator 가속 검사는 실패한 상태다. Expo Go 또는 JS export를 기기 QA 통과로 표시하지 않는다.

## 5. 라이선스·보안·비용

새 코드와 합성 fixture는 프로젝트 MIT다. 새 외부 의존성, 지도·font·icon payload, API 키, 제작자 endpoint, 유료 runner는 추가하지 않는다. APK·debug 서명·Gradle 생성물·실제 bundle·로그는 ignored `artifacts/qa/native-android/`에만 보존한다. APK에 포함된 제3자 바이너리 고지의 최종 적합성은 별도 검토 대상이며 `binaryNotices:NOT_RUN`을 유지한다.

공식 도구와 템플릿의 기존 로컬 캐시로 오프라인 빌드했으며 다운로드 옵션을 켜지 않았다. `--offline`은 OS 전체 네트워크 무요청 증거가 아니므로 `osNetwork:NOT_RUN`을 유지한다. 실제 위치를 수집하거나 기록하지 않고 합성 위치만 사용한다.

## 6. 남은 작업·차단 요인

실제 재빌드의 최종 APK payload 검증은 통과했고, 전체 통합 검사 및 변경된 스크립트의 최종 리뷰가 남아 있다. 보고서의 `sourceDirty:true`는 작업 트리 검증이라는 뜻이며 최종 커밋과 무변경 상태까지 증명하지 않는다. 전체 RN 선언 오류는 공개 릴리스 차단 요인이다. APK 컴파일 성공으로 선언 오류·기기 QA·iOS·PMTiles·binary notice·OS 네트워크 문제를 해결했다고 주장하지 않는다.

로컬 보고서는 `artifacts/qa/native-android/report.json`, 명령별 결과는 `commands.json`·각 `.log`, 단위 검사 로그는 `unit-tests.log`, 보강 후 재검사는 `reinspection.json`, Native consumer 상세는 `artifacts/qa/native-consumer.json`이다. 새 시도 전 상태를 NOT_RUN으로 초기화하며 실패 후 이전 PASS를 재사용하지 않는다. 실제 APK·generated bundle은 ignored `attempts/1792536377676/`에 분리해 실패를 조사할 수 있게 한다.

## 7. Git 상태

브랜치는 `test/stage-05-android-consumer`, 기준은 위 `469bb3c`다. 아직 커밋·스테이징·push를 수행하지 않았다. 통합 담당자가 최종 검사 후 커밋을 만든다. 해당 커밋은 `git log --oneline -- docs/research/stage-05-android-consumer.md`로 식별할 수 있다.

## 8. 다음 단계와 재현

성공한 검사만 다음 단계의 근거로 사용한다. 현재 공개 릴리스와 실제 기기 지원 완료 승인은 불가하며, 다른 독립 개발 작업은 진행 가능하다. 실행 예시는 선택형 Linux QA 도구의 명시적 경로를 요구한다.

```sh
pnpm build:sdk
pnpm pack:check
pnpm exec node scripts/verify-native-android.mjs --android-sdk=/absolute/android-sdk --jdk=/absolute/jdk-21 --gradle=/absolute/gradle-9.4.1/bin/gradle --gradle-cache=/absolute/gradle-cache
```

APK 검사가 성공해 `PASS_BUILD_ONLY`가 기록되더라도 전체 RN 선언 검사 실패가 남으면 프로세스는 **exit 1**로 끝난다. 이를 운영 배포·GitHub Public·npm 발행·GitHub Release 승인으로 해석하지 않는다.
