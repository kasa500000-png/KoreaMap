# Android APK binary notice 조사

확인일: 2026-10-21 KST. 소스 기준 `ce8e8e1ad797f9a0780d6bc5e782b66505c7ab23`. **APK 내용 목록 검증을 개선했으며 binary 라이선스 적합성은 UNKNOWN/BLOCKED다.** SDK의 MIT나 Maven의 license 이름을 APK 전체에 적용하지 않는다. Android 물리 기기·iOS·새 Gradle 빌드·다운로드·원격 쓰기는 이번 범위가 아니다.

## 1. 구현 완료 기능

기존 `verify-native-apk.py`의 ZIP 경로·타입·크기·raw deflate·CRC 검사 루프를 재사용해 `binaryNoticeInventory`를 추가했다. 이름에 LICENSE/LICENCE/NOTICE/COPYRIGHT/THIRD_PARTY가 있는 후보, 모든 `lib/<ABI>/*.so`, `assets/`의 model 확장자 후보에 bytes/SHA-256을 기록한다. 이름·확장자는 후보 판별이며 실제 의존성/권리/ABI의 증명이 아니다.

각 종류의 메타데이터는 최대 256개, notice 본문 분류는 후보당 64 KiB까지만 보관한다. UTF-8·binary·빈 파일·초과 크기를 구분하고 원문은 출력하지 않는다. 한도를 넘겨도 전체 ZIP CRC/크기 검사를 건너뛰지 않는다. 새 ZIP parser·외부 의존성·추출 디렉터리를 만들지 않았다. Android build 보고서에도 이 inventory를 전달한다.

inventory는 항상 `INVENTORY_ONLY`, `complete:false`, `dependencyGraph:NOT_PROVIDED`, `licenseCompliance:NOT_EVALUATED`, `distributionReady:false`다. 기존 payload 검증의 `PASS`/exit 0은 bundle·ELF·ZIP 검증만 뜻한다. 이 값을 라이선스 수락으로 사용하지 않는다. `binaryNotices:NOT_RUN`과 릴리스 차단도 유지한다.

## 2. 생성·수정 파일

- `scripts/verify-native-apk.py`: 기존 bounded ZIP 루프의 inventory 확장.
- `scripts/verify-native-android.mjs`: 실제 build 보고서에 inventory 전달.
- `tests/native-android-apk.test.py`: 4개 의미 회귀 추가.
- `docs/research/native-binary-notices.md`: 실제 APK·선택 cache 근거와 미완료 조건.

SDK·패키지/lockfile·CI·발행 조건을 수정하지 않았다. 실제 APK/AAR/POM/model·라이선스 본문은 Git/npm에 추가하지 않는다.

## 3. 실행한 테스트와 결과

Python 단위 **13/13 PASS**다. 가짜 notice 제목만으로 legal PASS가 되지 않음, 원문 미출력, 빈/binary/초과 본문, 메타데이터 cap 이후 entry의 CRC 손상 거부를 추가했다. 기존 ZIP traversal·symlink·중복·raw deflate 경계·bundle 동일성·ELF 검사를 유지한다. 초기 CRC 음성 fixture가 payload 대신 같은 문자열의 파일명을 손상시킨 실패를 수정한 뒤 재실행했다.

기존 Stage 05 APK를 새 scanner로 실제 재검사했다. archive 1,330 entry/117,875,352 uncompressed bytes와 생성 Hermes bundle·필수 MapLibre ELF의 기존 검증이 PASS다. 이는 새 build가 아니다.

| 실제 APK | 값 |
| --- | --- |
| 종류 | 기존 isolated tarball Expo Development Build, debug/x86_64 |
| 크기 | 83,969,186 bytes |
| SHA-256 | `219e48a5dd5030702420124ad953df65885613057448f9d5ca9ad6dce6de96b6` |
| Notice 이름 후보 | 5개, 모두 UTF8_TEXT_CANDIDATE, metadata 누락/절단 없음 |
| Native `.so` 이름 후보 | 19개 |
| Model asset 이름 후보 | 3개 TFLite, 880,888 bytes 합계 |

notice 후보는 AndroidX annotation/collection-ktx/collection/lifecycle-common의 `LICENSE.txt` 4개(각 10,175 bytes)와 `okhttp3/internal/publicsuffix/NOTICE` 1개(218 bytes)다. 제목·UTF-8·존재만으로 copyright/원문/전달 의무 충족을 증명하지 않는다. MapLibre·Hermes·React Native·Expo·Fresco·C++·zstd·모델의 전체 notice 결합을 이 5개로 완료 처리하지 않는다.

ignored `artifacts/recommended/native-notices/`의 `actual-apk-inventory.json`, `selected-cache-metadata.json`, `selected-byte-matches.json`에 출처/해시 근거를 보존한다. 원 APK는 Stage 05 worktree의 `artifacts/qa/native-android/app-debug.apk`이며 bundle은 같은 attempt의 생성본을 사용했다. APK/모델을 새로 복사·추출하지 않았다.

## 4. 실화면 QA 결과

실화면·기기·에뮬레이터·iOS를 실행하지 않았다. 기존 APK의 bytes 조사만으로 앱 실행·카메라/위치 권한·OS network·사용자에게 notice를 제공하는 화면을 통과로 표시하지 않는다.

## 5. 라이선스·보안·비용 근거

기존 `/workspace/gradle-kmk/caches/modules-2/files-2.1`에서 선택한 POM과 AAR만 읽었다. POM의 license declaration은 원문 약관/허락/전체 resolved graph가 아니다. cache에 `common`의 두 버전처럼 미사용일 수 있는 항목도 있어 모든 cached dependency를 APK에 포함됐다고 판단하지 않는다. 이 단계에서 약관 URL을 조회하거나 최신 이용 조건을 확인하지 않았다.

아래 6개 APK entry는 선택 cached AAR entry와 SHA-256이 정확히 같았다. 이 일치는 해당 bytes의 연결 근거이며 전체 transitive graph·법적 적합성의 증명이 아니다.

| Cached coordinate | 실제 bytes 일치 | POM 선언 관측 |
| --- | --- | --- |
| `org.maplibre.gl:android-sdk-opengl:13.6.1` | `libmaplibre.so` | `BSD`, BSD-2-Clause URL. Web GL의 BSD-3-Clause와 구분 |
| `com.facebook.hermes:hermes-android:260318099.0.4` | `libhermesvm.so` | MIT License 이름/HEAD URL, 정확 버전의 전체 원문·bundled 고지는 별도 확인 필요 |
| `com.google.mlkit:barcode-scanning:17.3.0` | `libbarhopper_v3.so`와 TFLite 3개 | `ML Kit Terms of Service`, MIT로 바꾸거나 자유 재배포를 추정할 수 없음 |

MLKit는 이 debug/dev-client APK에서 실제 관측한 자산이다. SDK npm tarball에 모델이 들어 있다는 뜻이 아니며 운영용 release APK도 같은 구성이라고 단정하지 않는다. 운영자가 배포할 정확한 variant/configuration으로 실제 의존성과 배포 조건을 검토해야 한다. 특정 약관을 읽지 않은 상태에서 사용 금지·상업 이용 허용 같은 결론도 내리지 않는다.

출력은 파일명·크기·해시·분류만 포함한다. credential·사용자 위치·본문을 출력하거나 제작자 backend/계정/키로 연결하지 않는다. 비용·SDK 데이터 라이선스 경계와 기존 security/타입 게이트는 변하지 않는다.

## 6. 남은 작업·차단 요인

1. 기존 isolated consumer의 생성 Gradle 프로젝트는 검증 후 정리되어 해당 build의 완전한 resolved runtime dependency/variant graph와 merge/strip 연결 근거가 보존되지 않았다. cache/POM 목록을 이 graph로 대체할 수 없다. 다음 승인된 build에서 exact configuration graph, source/binary package hashes, Gradle/NDK/JS dependency 근거를 함께 보존해야 한다.
2. 실제 `.so`·Hermes JS bundle·모델과 해당 원저작권/정확 버전 LICENSE/NOTICE·변형/재배포/source 제공 의무를 연결하고 검토해야 한다. `libc++`, Hermes/RN/Expo/Fresco/MapLibre의 bundled code와 MLKit 조건을 SDK MIT로 덮지 않는다.
3. 필요한 원문과 공급자 고지를 운영자 APK 안의 실제 notice 경로/접근 방법에 포함한 뒤 최종 variant를 다시 검사해야 한다. 이 조사에서는 새 APK를 만들거나 법적 고지를 임의로 삽입하지 않았다.
4. 그 증거가 생길 때까지 binary license compliance는 UNKNOWN/BLOCKED다. 현재 도구의 payload PASS나 읽기 목록 생성 성공을 수락 증거로 올리지 않는다.

재현은 기존 APK와 생성 bundle의 **명시적 로컬 경로**를 사용한다.

```sh
python3 tests/native-android-apk.test.py
node scripts/python.mjs scripts/verify-native-apk.py --apk <local-apk> --generated-bundle <same-attempt-bundle>
```

SDK 기본 build/test에 Gradle·Android·cache·실제 APK를 새 필수 조건으로 넣지 않았다.

## 7. Git 브랜치·커밋

`chore/recommended-native-notices`, 기준 `ce8e8e1ad797f9a0780d6bc5e782b66505c7ab23`. 작업자는 stage·commit·push·원격 변경을 하지 않았다. 통합 담당자의 최종 검사/커밋/PR은 별도다.

## 8. 다음 단계 진행 가능 여부

inventory 개선과 독립 cloud 작업의 통합 검토는 가능하다. binary notice 적합성 수락은 불가하며 실제 플랫폼 검증·발행·배포 승인도 부여하지 않는다. 새로운 upstream 수정 버전이 없어도 수행 가능한 증거 보존 개선을 완료한 범위로만 보고한다.
