# Stage 02 — 공개 SDK 타입 경계

확인일: 2026-10-20. 기준 커밋: `259d75e116a2de456f546c736014d50197774a4d`.

Native SDK가 사용하는 GeoJSON ambient namespace를 공개 선언에서 명시하고, 해당 타입을 실제 설치 의존성으로 제공한다. 전체 React Native 앱의 상위 선언 오류와 Web NodeNext 오류는 여전히 별도 릴리스 차단 항목이다.

## 수정 범위

- `packages/native/src/index.tsx`에 `/// <reference types="geojson" preserve="true" />`를 추가했다. TypeScript의 공식 declaration emit 방식이며, 공개 `dist/index.d.ts`에 실제 보존된다.
- Native의 기존 `@types/geojson@7946.0.16`을 개발 의존성에서 설치 의존성으로 이동했다. lockfile은 Native importer의 역할만 이동하며 버전·package snapshot을 추가하지 않는다.
- 소비 앱 자체가 `@types/geojson`을 직접 선언하지 않도록 했다. 설치된 Native tarball의 manifest와 보존 참조도 검증한다.
- 독립 ESM 소비 앱에서 `publicSdkBundlerDeclarations`, `publicSdkNodeNextDeclarations`를 각각 실행한다. 두 검사 모두 `strict:true`, `skipLibCheck:false`, `types:["react"]`, `lib:["ES2022"]`이며 RN 앱·DOM ambient 타입을 주입하지 않는다. 실제 SDK import, JSX props/ref, 공통 API 및 잘못된 입력의 타입 오류를 검사한다.
- 기존 전체 RN 앱 검사, plugin introspection, Android/iOS JS export를 유지한다. 모든 결과를 기록·정리한 후 공개 SDK 검사나 전체 RN 선언 검사 중 하나라도 실패·미완료이면 CLI는 0이 아닌 종료 코드를 반환한다.

JavaScript 실행문과 공개 함수·props 시그니처는 바꾸지 않는다. 빌드 출력은 추가된 참조/설명 주석을 제외하면 기준 출력과 동일하다. 모듈 참조를 `any`로 바꾸거나 shim, legacy 타입 전환, `skipLibCheck` 완화, `node_modules` 수정으로 오류를 숨기지 않는다.

## 검증 결과

실제 tarball 소비 앱 검증은 2026-10-20 22:25:50–22:25:58 UTC에 실행했다. 결과는 이 표와 ignored `artifacts/qa/native-consumer.json`에 기록했다. 보고서의 기준 커밋은 위 base이며 미커밋 변경이 있으므로 `sourceDirty:true`다. JS export는 APK/IPA 컴파일이나 기기 QA가 아니다.

| 검사 | 결과 |
| --- | --- |
| SDK build | PASS |
| Native 소비 앱 정책/선언 gate 단위 테스트 | PASS, 8개 |
| 수정 대상 ESLint / Prettier / `git diff --check` | PASS |
| 실제 tarball의 오프라인 독립 설치 | PASS; workspace/source alias 없이 설치 |
| SDK 선언 — Bundler / NodeNext, `skipLibCheck:false` | 두 모드 PASS; 타입 오류 0 |
| 전체 RN 앱 선언, `skipLibCheck:false` | FAIL; TS2411 / TS2344 / TS2416 유지 |
| Expo plugin introspection / Android·iOS JS export | PASS; 기존 strict 앱 코드 검사도 PASS |
| 소비 검증 최종 gate | `PARTIAL_PASS`, `releaseBlocked:true`, CLI exit 1; 결과 저장·임시 소비 앱 정리 후 실패 |
| `pack:check` | FAIL; 두 신규 공식 문서 host가 비용 감사의 검토 목록에 아직 없음; root 리뷰 필요 |
| 별도 `check-data.py --artifacts` | FAIL; Native `src/index.tsx`의 출처 검토 SHA 불일치; root의 실제 diff 리뷰·원장 갱신 대기 |
| APK/IPA, Android/iOS 실기기, 터치·한글·메모리·OS egress | NOT_RUN; 이 타입 변경의 검증 범위 밖 |

재현 명령:

```sh
pnpm build:sdk
pnpm test:native-consumer
pnpm pack:check
pnpm verify:native-consumer
```

`pack:check`는 22:25:23–22:25:29 UTC에 SDK tarball 5개를 생성한 뒤 비용 감사에서 `www.typescriptlang.org`와 `reactnative.dev`의 신규 공식 근거 URL을 `UNREVIEWED_DOCUMENTATION_URL`로 차단했다. 검사나 URL을 숨기지 않았으며 host 허용 목록을 임의로 확대하지 않았다. 이번 Native tarball SHA-256은 `a5a7c4d7d318cc3f103d3a8588ba770d20dcd6f49df58218e8b91bf1b8f78b23`이다.

runtime source의 출처 원장도 별도 리뷰 후 갱신해야 한다. 이번 소비 결과는 `pack:check` 전체 통과를 대신하지 않는다. root 통합 시 공식 URL 검토·출처 원장·최종 tarball 검사도 통과해야 한다.

## 남은 상위 선언 문제와 지원 경로

2026-10-20 공식 npm metadata와 공식 저장소를 확인했다. 아래 후보를 lockfile에 도입하지 않았으며 실제 설치 버전의 호환성을 임의로 바꾸지 않는다.

| 항목 | 확인한 공식 버전 | 결론 |
| --- | --- | --- |
| React Native | `0.88.0` | 현재 버전과 동일. 전체 RN 앱의 generated declarations에서 TS2411 / TS2344 / TS2416이 재현된다. |
| MapLibre React Native | `11.5.0` | 현재 버전과 동일. 새 지원 릴리스로 RN 오류를 해결할 수 있는 경로를 확인하지 못했다. |
| Expo | `58.0.16` | 공식 bundledNativeModules도 RN `0.88.0` / React `19.3.0`을 지정한다. Expo patch만으로 해당 RN 선언을 고친다는 근거가 없다. |
| MapLibre GL JS | `6.15.0` | 공식 배포 선언으로 별도 NodeNext probe를 실행했으나 기존 `@maplibre/geojson-vt@6.3.0` / `@maplibre/vt-pbf@4.3.2`의 확장자 없는 ESM 상대 import 때문에 TS2834 9개가 남는다. |

RN의 세 오류는 `AnimatedPropsAllowlist`의 선택적 `style`과 index signature, `VirtualizedList`의 React component constraint, `ReactNativeDocument.textContent`와 부모 노드의 nullability 불일치다. SDK의 GeoJSON 참조 수정은 이 선언을 변경하지 않는다. 공식 수정이 나오면 현재 고정된 peer 조합과 두 SDK probe, 전체 RN 앱 probe를 다시 실행해야 한다.

Web의 엔진 선언을 자체 파일로 복사해 묶는 연구도 수행했다. 외부 engine import를 남기면 NodeNext 문제가 유지되고, 전체 선언을 복사하면 `Map`/`CustomLayerInterface`가 참조하는 엔진 클래스의 private 타입 정체성이 분리되어 기존 사용자 객체와 TS2322가 발생했다. 따라서 이 방식은 호환성 있는 해결책으로 채택하지 않았다. 연구 파일은 ignored `artifacts/ten-stages/stage02`에만 두며 SDK에 배포하지 않는다.

공식 React Native 문서의 `skipLibCheck` 권장이나 legacy 타입 opt-out을 전체 선언 통과로 처리하지 않는다. SDK 경계 두 검사가 통과해도 Web NodeNext 및 전체 RN 앱 선언은 수정된 상위 릴리스와 실제 재검증 전까지 미해결이다.

## 라이선스·비용·보안

자체 수정은 기존 MIT 범위다. `@types/geojson`은 이미 검토·설치된 동일 버전의 MIT 타입 패키지이며 새 데이터·폰트·이미지를 추가하지 않는다. 배포 타입 검증 외에 API 요청·키·기본 endpoint·설치 hook·유료 빌드 경로를 추가하지 않는다. 검증은 로컬 캐시와 실제 tarball로 수행하며 npm 발행이나 원격 배포를 하지 않는다.

## 공식 근거

- [TypeScript 5.5: declaration emit의 preserve 참조](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-5.html)
- [React Native strict TypeScript API](https://reactnative.dev/docs/strict-typescript-api)
- [React Native 0.88.0 릴리스](https://github.com/react/react-native/releases/tag/v0.88.0)
- [Expo 58.0.16 공식 bundledNativeModules](https://raw.githubusercontent.com/expo/expo/expo%4058.0.16/packages/expo/bundledNativeModules.json)
- [React Native 공식 npm metadata](https://registry.npmjs.org/react-native/latest)
- [Expo 공식 npm metadata](https://registry.npmjs.org/expo/latest)
- [MapLibre RN 공식 npm metadata](https://registry.npmjs.org/@maplibre%2fmaplibre-react-native/latest)
- [MapLibre GL JS 공식 npm metadata](https://registry.npmjs.org/maplibre-gl/latest)
- [GeoJSON VT 공식 npm metadata](https://registry.npmjs.org/@maplibre%2fgeojson-vt/latest)
- [VT PBF 공식 npm metadata](https://registry.npmjs.org/@maplibre%2fvt-pbf/latest)

Expo 웹 문서 일부는 이 환경에서 HTTP 403이므로 접근 성공으로 기록하지 않았다. 위 공식 저장소의 버전 고정 매핑을 확인했다.

## 단계 인계

루트 통합 추가 검증: 공식 문서 host 두 개를 docs-only로 개별 검토하고 runtime URL 거부 회귀를 추가했다. Native sourceSHA1개를 실제 diff 검토 후 갱신했다. frozen offline install·전체 `pnpm check`·5개 실제 `pack:check`가 통과했다. 미추적 Changeset으로 최초 마지막 버전 검사가 실패한 이력은 보존하고 index 추가 후 전체 검사를 재실행했다. 루트 actual Native 소비에서도 SDK Bundler/NodeNext skipLibCheck:false 두 검사가 PASS, 앱/plugin/양OS JS PASS, 전체 RN 선언3건은 PARTIAL_PASS/exit1로 확인했다. Native tarball SHA는 `a5a7c4d7d318cc3f103d3a8588ba770d20dcd6f49df58218e8b91bf1b8f78b23`다. 통합 브랜치는 `fix/stage-02-public-types`이며 기존 담당 worktree와 구분한다.

1. 구현: Native 공개 GeoJSON 참조·설치 의존성과 두 엄격한 SDK 소비 검사. 전체 RN 앱 실패 gate 유지.
2. 변경: Native `src/index.tsx`, `package.json`, lockfile Native importer, 소비 검증 스크립트·테스트, 이 문서, patch Changeset.
3. 검사: 위 결과표와 ignored 실행 로그 참조. SDK 경계는 통과했지만 전체 RN 앱 선언과 최종 배포 검사는 통과하지 않았다.
4. 실화면 QA: 이번 타입 변경에서 미실행. Web·Android·iOS 실화면 성공으로 표시하지 않는다.
5. 라이선스·보안: 새 데이터·자격 증명·유료 endpoint 없음. 공식 문서 URL과 runtime source 원장 리뷰가 root 통합 전 필요하다.
6. 남은 작업: 상위 RN 선언 및 Web NodeNext 수정·재검증, root의 원장/URL 리뷰 및 최종 검증. 강제 override나 선언 검사 완화로 대체하지 않는다.
7. 브랜치: `fix/stage-02-native-public-types`, base `259d75e116a2de456f546c736014d50197774a4d`. 담당 에이전트는 stage/commit/push하지 않았다.
8. 다음 단계: 이 수정의 root 리뷰·통합은 가능하다. 이 단계 전체 타입 문제 해결이나 공개 릴리스 가능 상태로 승인하지 않는다.
