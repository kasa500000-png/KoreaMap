# Web 공개 선언 호환성 후속 검증

2026-10-21 07:09–07:19 UTC, 기준 `ce8e8e1`. [기존 공개 타입 차단 기록](security-types-validation.md)의 NodeNext 오류를 재확인했다. 공식 안정 릴리스만으로 해결할 후보는 확인하지 못했으며 **Web 전체 선언 검증과 발행은 계속 BLOCKED**다.

| 공식 npm 원본 | 현재 latest | 확인 결과 |
| --- | --- | --- |
| [maplibre-gl](https://registry.npmjs.org/maplibre-gl/latest) | 6.15.0 | 의존 조건 `@maplibre/geojson-vt ^6.3.0`, `@maplibre/vt-pbf ^4.3.2` 유지 |
| [@maplibre/geojson-vt](https://registry.npmjs.org/@maplibre%2Fgeojson-vt/latest) | 6.3.0 | 실제 배포 `dist/index.d.ts`의 상대 import 7개에 확장자 없음 |
| [@maplibre/vt-pbf](https://registry.npmjs.org/@maplibre%2Fvt-pbf/latest) | 4.3.2 | 실제 배포 `dist/index.d.ts`의 상대 import 2개에 확장자 없음 |

두 하위 패키지의 공식 tarball을 새로 받아 registry `dist.integrity` SHA-512와 실제 바이트를 비교했다. 각각 132,793B와 8,107B이며 SHA-256은 `504ff00fedc73ab6d6aa359cea8c52242766fed013cd3b8d96277eb0d15fea45`, `837fe7a668cd0280af6a38b8e9ed81e299dd51f4571d4eb9f6f9de859e9f13f7`이다. 다운로드·원문 선언·metadata는 ignored `artifacts/recommended/web-types`에만 보존했다. SDK/Git/npm에 제3자 원문 payload를 추가하지 않았다.

공식 upstream HEAD도 확인했다. [geojson-vt `9de5942`](https://github.com/maplibre/geojson-vt/commit/9de5942a15ddd9fd19cd5f173e925814b96fb75a)의 `src/index.ts`는 같은 상대 import를 사용하고 tsconfig는 Bundler 해석을 사용한다. [vt-pbf `d530f7b`](https://github.com/maplibre/vt-pbf/commit/d530f7bb256fd014fcda512340518145b79e976f)는 배포 gitHead와 같고 원문 import 및 Bundler 선언 생성 설정이 유지된다. 미출시 HEAD를 설치하거나 수정 패키지로 대체하지 않았다. MapLibre 6.15.0 전체 설치·플랫폼 호환성은 이번 검사의 범위 밖이며, 이전의 실제 6.15.0 선언 probe 실패는 기존 문서를 따른다. 현재 정확히 고정한 6.14.0 peer와 TypeScript 6.0.3·lockfile은 변경하지 않았다.

## API를 유지하는 실제 소비 검사 추가

`tests/fixtures/web-layer-consumer.ts`를 `verify:packages`의 격리된 소비 앱에 복사해 **실제 npm tarball과 설치한 MapLibre peer**를 대상으로 컴파일한다. workspace source alias·수동 선언·shim 없이 `strict`, `skipLibCheck:false`, Bundler로 별도 `webLayerTypes` 결과를 기록한다. 같은 fixture를 전체 NodeNext 검사에도 포함했다.

검사는 기존 `addLayer()`가 공식 `LayerSpecification | CustomLayerInterface` 전체를 받고, `onAdd`의 receiver가 완전한 `MapLibre.Map`이며 untyped 값으로 약화되지 않는지 확인한다. Map·WebGL2 메서드 호출, 현재 6.14.0 선언의 `render(gl, options)` 콜백, 일반 style layer 및 inline style도 사용한다. 잘못된 receiver·존재하지 않는 메서드/옵션·render 누락·숫자 insertion anchor·문자 radius의 일곱 오류 입력은 `@ts-expect-error`로 실제 compiler 거부를 요구한다. 정상 사용을 거부하거나 잘못된 사용을 허용하면 소비 검사가 실패한다. 이 주석은 합성 오류 입력에만 있으며 upstream 선언 오류에는 적용하지 않는다.

공개 선언은 `MapHandle.addLayer`, inline style의 `WebMapConfig`, public interaction options와 같은 파일의 내부 adapter 선언을 통해 MapLibre 타입 그래프를 참조한다. 일반 style 타입을 공식 style-spec로 옮기는 것만으로 모든 경로를 제거할 수 없다. 최소 SDK bridge로 custom callback의 Map 타입을 바꾸면 inline 사용자의 renderer 메서드 접근과 API 계약을 약화시킬 수 있다. 별도 adapter와 버전 정책을 설계하기 전까지 기존 API를 유지하며, 타입 오류 통과를 위해 이 경계를 다시 쓰지 않는다.

## 실제 실행

| 검사 | 결과 |
| --- | --- |
| frozen offline install·SDK 빌드 | PASS |
| 집중 strict Bundler fixture | PASS, `skipLibCheck:false` |
| 실제 격리 tarball `webLayerTypes` | PASS, 전체 layer union·callback·오류 입력 검증 |
| `pnpm pack:check` | PASS, SDK 5개 및 비용·데이터 정적 검사 |
| `pnpm test:release` | PASS, 30/30, skip/retry 0 |
| `pnpm verify:packages` | **exit 1, PARTIAL_PASS, blocked=true** |
| 위 소비 검사의 재현 빌드·Bundler·core NodeNext·SSR | PASS, SDK tarball 5개 byte 동일 |
| 위 소비 검사의 Chromium 실화면 | PASS, 표시·선택·종료, 외부 요청 0·pageerror 0 |
| 전체 Web NodeNext | **FAIL, compiler exit 2, TS2834**, 두 upstream 선언의 상대 import 9개 |

실화면 결과는 기존 격리 소비 smoke이며 브라우저 전체 25개·모바일 기기 회귀를 이번 도구 변경 목적으로 반복한 결과는 아니다. 오류를 숨기는 compiler 설정·패치·override·API 제거는 적용하지 않았다. 전체 명령의 실패를 새 계약 검사의 통과로 대체하지 않는다. 세부 보고서는 작업 트리의 ignored `artifacts/qa/packages.json`이다.

재현은 `pnpm build:sdk`, `pnpm pack:check`, `pnpm verify:packages`이며 Chromium 설치가 필요하다. 이 환경은 운영자가 지정한 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`을 사용했다. 공식 수정 릴리스가 나오면 실제 tarball의 import 확장자와 strict NodeNext 소비 검사를 다시 확인하고, 기존 custom/style fixture로 API 호환성도 함께 검증한다. 소스·의존성 버전 선택과 NodeNext 오류 해결은 별도 수락 사항이다.

변경 파일은 `scripts/verify-packages.mjs`, `tests/fixtures/web-layer-consumer.ts`, 본 문서다. 라이선스·네트워크 provider·위치 정보·SDK runtime은 변경하지 않았다. 브랜치 `fix/recommended-web-public-types`, 기준 `ce8e8e1`, 커밋 전이며 단계 커밋 식별은 `git log -1 --format=%H -- docs/research/web-declaration-compatibility.md`를 사용한다. 계약 검증 개선은 통합 검토 가능하나 upstream NodeNext 실패·기존 보안/Native 차단이 해소되기 전 발행할 수 없다.
