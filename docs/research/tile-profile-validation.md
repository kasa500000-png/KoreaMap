# 한국 벡터 타일 profile 검증

확인일: 2026-10-20 (KST). 이 문서는 직접 작성한 Java profile과 소형 합성 OSM 입력의 실제 Planetiler 처리 결과를 기록한다. 실제 한국 지역의 화면·glyph·Native 검증은 통합 타일 검증 기록에서 별도로 판정한다.

## 버전과 공식 근거

- Planetiler **0.10.2**, 공식 안정 release asset `planetiler.jar`: 93,278,824 bytes.
- SHA-256: `f310bd0413e2e4512b27f4046d418664e8e1d3bf31603c2a70e23de06c167e4d`. 공식 GitHub release asset digest와 실제 다운로드 바이트를 대조했다.
- 실행한 JDK: OpenJDK 21.0.12.1. v0.10.2 README는 Java 21+를 요구한다. 현재 main README의 Java 25 요구를 이 고정 release와 혼동하지 않는다.
- profile과 fixture/test는 프로젝트 자체 작성 MIT 코드다. Planetiler 및 그 의존성은 별도 라이선스를 유지하고 SDK npm에 번들하지 않는다. 생성된 실제 OSM 타일의 데이터 라이선스는 ODbL-1.0이다.

공식 자료:

- [v0.10.2 release](https://github.com/onthegomap/planetiler/releases/tag/v0.10.2)
- [v0.10.2 README와 Java profile API 사용](https://github.com/onthegomap/planetiler/blob/v0.10.2/README.md)
- [고정 release Profile API](https://github.com/onthegomap/planetiler/blob/v0.10.2/planetiler-core/src/main/java/com/onthegomap/planetiler/Profile.java)
- [고정 release FeatureCollector API](https://github.com/onthegomap/planetiler/blob/v0.10.2/planetiler-core/src/main/java/com/onthegomap/planetiler/FeatureCollector.java)

## 출력 계약

source-layer는 `land`, `park`, `water`, `building`, `boundary`, `road`, `trail`, `place`, `poi` 9종이다. 각 feature의 `kind`는 source-layer와 같다. 따라서 기존 `createThemeStyle`의 `sourceLayers`에 같은 이름을 연결한다.

속성은 `kind`, `class`, `poi`, `name:ko`, `name`, `name:en`만 출력한다. `road.class`는 `major` 또는 `minor`; `poi.poi`는 기존 자체 아이콘의 `park`, `parking`, `trail`, `facility`다. 전화·이메일·주소·운영자 contact tag나 원본 tags 전체를 복사하지 않는다. 이름은 NFC, 제어문자 제거, 최대 160 코드포인트로 정규화하며 한국어 fallback 선택은 SDK 스타일 expression이 수행한다.

도로·산책로는 선, 건물·토지·공원·내수면은 폴리곤, 지명·POI는 점으로 생성한다. 폴리곤 시설은 point-on-surface를 사용한다. 행정 경계는 원본이 선이면 선으로, 면이면 면을 유지하고 style의 line layer가 외곽을 그린다. multipolygon 관계와 inner ring 조립은 실제 Planetiler OSM reader가 처리한다.

profile은 0~14 범위의 표시 규칙을 가지며 CLI의 실제 생성 maxzoom은 별도 제한을 따른다. 출력은 새 경로를 기본으로 사용하고 profile이 입력 다운로드나 기존 archive 덮어쓰기를 기본 활성화하지 않는다.

## 실행한 검사

다음 명령은 프로젝트 루트에서 **명시적으로 준비한 JAR/JDK**를 사용한다. Java가 PATH에 있으면 `--java`/`--javac`는 생략 가능하다. 기본 SDK build/test에서 이 바이너리를 다운로드하지 않는다.

```sh
node services/tiles/profile/verify-profile.mjs --jar=artifacts/tiles/tools/planetiler-0.10.2.jar --java=/workspace/kmk-jdk/jdk-21.0.12.1+1/bin/java --javac=/workspace/kmk-jdk/jdk-21.0.12.1+1/bin/javac
```

- `javac -proc:none`: 고정 JAR의 API로 세 Java 파일을 새 임시 디렉터리에 컴파일한다. fat JAR에 포함된 annotation processor가 암묵적으로 실행되지 않게 한다.
- **40개 자체 profile 검사 통과**: 도로 class·zoom, 산책로, area 도로 제외, water hole, 토지·공원·건물, building=no 제외, 행정 경계, 지명 zoom·이름 없음, POI 분류·면의 label 점, 속성 whitelist, NFC/control/코드포인트 상한, 출처 고지.
- 직접 작성한 1,258-byte OSM PBF를 실제 Planetiler로 생성했다. 원본 지도에서 복사하지 않은 소형 node/way/multipolygon 관계다.
- 실제 MBTiles를 read-only JDBC로 읽고 gzip을 풀어 MVT feature를 decode했다. **19개 tile / 87개 feature**, 9개 layer, major/minor, 한글·영문 fallback, parking 아이콘 분류, multipolygon hole 보존을 확인했다.
- 고정 JAR의 해시가 다르면 실행 전 거부한다. 테스트 임시 데이터·class·archive는 성공/실패 시 정리하고 결과 manifest만 ignored `artifacts/tiles/profile-validation.json`에 남긴다.
- 변경한 `.mjs`에 ESLint·Prettier를 실행했다. 전체 저장소 게이트와 타일 CLI 통합 검사는 최종 진행 기록을 따른다.

최초 검증 runner가 upstream ANSI 색상 prefix 때문에 통과 summary를 인식하지 못한 문제를 찾았다. 실제 하위 검사는 통과했지만 runner는 실패로 반환했다. Node의 ANSI 제어문자 제거 함수로 수정하고 전체 compile/PBF/archive 검사를 재실행해 통과했다.

## 범위와 잔여 제약

이 profile은 원본 OSM에 포함된 내수면 폴리곤을 처리하며 별도 ocean/coastline polygon 데이터나 철도 스타일을 제공하지 않는다. 해안 바깥 물·완전한 전국 cartography 품질을 보장하지 않는다. 원본에 없는 POI·지명을 생성하거나 직선 도로를 보충하지 않는다.

작은 fixture의 성공을 실제 서울/울산/부산/제주·전국 생성, Native/실기기 한글 또는 성능 합격으로 사용하지 않는다. 실제 자료·폰트·타일·class/JAR는 ignored 운영자 저장소에만 두고 Git/npm payload를 허용하지 않는다. 선택형 operator 도구이며 core에 Java/Planetiler 의존성이나 publisher endpoint를 추가하지 않는다.

## 후속 실제 서울 재생성·전환·롤백

통합 pipeline의 실제 Geofabrik 한국 입력으로 서울 bbox `[126.94,37.53,127.03,37.61]`, maxzoom 14, JVM heap 4096MiB를 다시 생성했다. 이 검증은 앞의 합성 fixture 검사와 별도로 실행했다.

- 기존 A: `1792467802360-66258505`; 새 B: `1792468553996-b20f1aa1`.
- 새 세대 생성 소요 40,268ms. 단일 Linux 장비의 관측값이며 처리 시간 보장이 아니다.
- A와 B의 실제 MBTiles는 바이트 동일했다. SHA-256: `cf6feee8b494160748e637da1044f826f8d2c79f78fdd7f7755a238e565fac3c`. 입력·profile이 같은 두 번의 해당 지역 생성에 대한 재현성 증거이며 OS 간 재현성은 아니다.
- 생성 작업만 실행했을 때 기존 A 활성 상태가 유지됨을 확인했다.
- 실제 CLI `activate`로 B를 선택한 뒤 `rollback`으로 A에 복귀했다. 두 명령의 종료 코드는 0이었다.
- 자체 임시 후보의 OSM license를 MIT로 변조하면 `UNREVIEWED_GENERATION`/exit 1로 거부했다. 같은 임시 후보의 archive 바이트를 변조하면 `ARCHIVE_CHECKSUM_MISMATCH`/exit 1로 거부했다. 두 실패 후 active pointer가 바이트 그대로 유지됐다.
- 임시 오염 후보만 제거했고, 성공한 A/B와 운영자 원본은 보존했다. 최종 active는 A, previous는 B다.

명령·원본/새 manifest·해시와 판정은 ignored `artifacts/tiles/qa/rollback-build.json`, `artifacts/tiles/qa/rollback.json`에 기록했다. 원본 PBF·실제 tile·archive·캡처는 Git/npm에 넣지 않았다. 이 결과는 실제 HTTP 지도 화면·한글 glyph·4지역 화면·Native OS 검증과 별도다.
