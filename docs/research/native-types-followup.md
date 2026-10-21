# Native 선언 오류 재확인

확인일: 2026-10-21 07:10–07:15 UTC. 기준: `main`의 `ce8e8e1ad797f9a0780d6bc5e782b66505c7ab23`.

**BLOCKED 유지.** 최신 공식 배포 정보를 확인하고 동일한 RN 의존 그래프를 두 compiler로 검사했으나 TS2411·TS2344·TS2416이 그대로 남았다. SDK 자체의 GeoJSON 참조 수정과 공개 SDK 경계 검사는 [Stage 02](stage-02-public-types.md)에 기록돼 있다. 이번 최소 재현은 그 전체 tarball 소비 앱 검사를 다시 실행한 결과가 아니다.

## 공식 버전과 지원 근거

| 패키지 | 현재 고정 | 확인 시 공식 latest | 판단 |
| --- | --- | --- | --- |
| React Native | 0.88.0 | 0.88.0 | 새 안정 수정 버전 없음 |
| Expo | 58.0.14 | 58.0.16 | 최신 patch의 공식 매핑도 RN 0.88.0 / React 19.3.0 |
| React | 19.3.0 | 19.3.1 | runtime patch만으로 RN 선언 모순을 해결한다는 근거 없음 |
| `@types/react` | 19.3.0 | 19.3.0 | 현재와 동일 |
| MapLibre RN | 11.5.0 | 11.5.0 | 현재와 동일 |
| TypeScript | 6.0.3 | 7.0.2 | 선언 비교에서도 동일 오류; 프로젝트에 도입하지 않음 |

RN v0.88.0 공식 저장소의 개발 의존성은 TypeScript `^6.0.3`, Expo 58.0.16은 `^6.0.2`다. RN의 peer 범위는 React `^19.3.0`, React 타입 `^19.1.1`이고 MapLibre RN은 RN `>=0.80.0`을 선언한다. 이 범위를 만족한다는 사실이 `skipLibCheck:false` 선언 검사의 성공을 보장하지는 않는다. TypeScript 7을 Expo 58/RN 0.88의 검증된 대체 조합으로 채택하지 않았다.

## 실제 최소 재현

검토된 현재 설치 그래프를 읽는 별도 최소 소비 폴더에서 아래 타입만 import했다. SDK source alias·선언 수정·추가 ambient shim은 없다. 의존성은 읽기 전용 symlink로 연결했으므로 독립 npm 설치나 앱 실행의 증거로 확대하지 않는다.

```ts
import type { ViewProps } from 'react-native';
export type NativeViewProps = ViewProps;
```

설정은 `strict:true`, `skipLibCheck:false`, `module:ESNext`, `moduleResolution:Bundler`, `target:ES2022`, `jsx:react-jsx`, `types:["react","react-native"]`, `lib:["ES2022"]`, `noEmit:true`다. DOM lib를 주입하지 않았다.

| compiler | 실행 시각 UTC | 종료 | 결과 |
| --- | --- | --- | --- |
| 현재 TypeScript 6.0.3 | 07:13:40–07:13:41; 상세 진단 07:15:38–07:15:40 | 2 | FAIL; 세 오류 동일 |
| 공식 TypeScript 7.0.2 Linux x64 | 07:15:40 | 1 | FAIL; 세 오류 동일 |

| RN 0.88.0 배포 선언 | 진단 | 확인한 원인 |
| --- | --- | --- |
| `types_generated/Libraries/Animated/nodes/AnimatedProps.d.ts:19` | TS2411 | 선택적 `style`은 `undefined`를 포함하지만 문자열 index signature에는 포함되지 않음 |
| `types_generated/Libraries/Lists/VirtualizedList.d.ts:17` | TS2344 | `React.ComponentRef`의 component constraint와 static `getDerivedStateFromProps` 인자 타입이 불일치. `Readonly<any>`는 필수 `getItem`·`getItemCount`를 충족하지 못함 |
| `types_generated/src/private/webapis/dom/nodes/ReactNativeDocument.d.ts:29` | TS2416 | 자식 `textContent` getter는 `null`, 부모 `ReadOnlyNode`는 `string` |

TypeScript 7은 공식 registry의 wrapper·Linux x64 tarball 두 개만 내려받아 SHA-512 `dist.integrity`를 대조했다. 압축 합계 10,034,946B, 확장 합계 30,443,488B이며 Apache-2.0 고지를 함께 보존했다. install/lifecycle hook·manifest·lockfile 변경 없이 ignored 조사 폴더에서만 실행했다. 다른 플랫폼의 compiler 검증이나 전체 TypeScript 7 업그레이드 검증은 하지 않았다.

로컬 근거는 ignored `artifacts/native-types/`의 `official-latest-summary.json`, `official-source-summary.json`, `typescript-6.0.3-minimal-probe.json`, `compiler-comparison.json`, 두 `typescript-*-diagnostics.txt`, `typescript-7.0.2-downloads.json`이다. 공식 GitHub tag에는 npm 생성 선언 경로가 없어 HTTP 404였고, 생성 선언 진단은 실제 설치된 RN 배포본에서 확인했다. 이를 GitHub 원본 선언 접근 성공으로 기록하지 않는다.

## 유지하는 차단과 다음 검증

SDK/API·의존성 그래프·기존 소비 검사·CI gate는 변경하지 않았다. `skipLibCheck`, legacy 타입 전환, shim, `node_modules` patch, override, API 제거로 통과시키지 않는다. 새 진단 도구나 중복 테스트도 추가하지 않았다.

공식 RN 생성 선언 또는 지원되는 React 타입 조합의 수정 릴리스가 나오면 정확한 버전·Expo 매핑을 확인한 뒤 기존 tarball 소비 검사의 공개 SDK Bundler/NodeNext와 전체 RN 선언을 모두 재실행한다. 이번에는 최소 선언 재현만 실행했으며 APK/IPA·Android 실기기·iOS·실화면 QA는 실행하지 않았다. 원본 데이터·키·endpoint·유료 계정·발행 경로도 추가하지 않았다.

문서 검사는 Markdown 91개·상대 링크 486개와 `git diff --check`가 통과했다. 비용·비밀정보 정적 검사는 `PASS_STATIC_ONLY`, findings 0이며 실제 실행 네트워크나 계정 과금 상태의 검증을 대신하지 않는다.

## 공식 출처

- [RN latest metadata](https://registry.npmjs.org/react-native/latest), [Expo latest metadata](https://registry.npmjs.org/expo/latest), [React latest metadata](https://registry.npmjs.org/react/latest), [React 타입 latest metadata](https://registry.npmjs.org/@types%2freact/latest), [MapLibre RN latest metadata](https://registry.npmjs.org/@maplibre%2fmaplibre-react-native/latest)
- [Expo 58.0.16 bundledNativeModules](https://raw.githubusercontent.com/expo/expo/expo%4058.0.16/packages/expo/bundledNativeModules.json), [Expo 공식 개발 의존성](https://raw.githubusercontent.com/expo/expo/expo%4058.0.16/package.json)
- [RN v0.88.0 공식 개발 의존성](https://raw.githubusercontent.com/facebook/react-native/v0.88.0/package.json), [RN 공식 TypeScript 설정](https://raw.githubusercontent.com/facebook/react-native/v0.88.0/packages/typescript-config/tsconfig.json)
- [TypeScript 7.0.2 metadata](https://registry.npmjs.org/typescript/7.0.2), [공식 Linux x64 배포 metadata](https://registry.npmjs.org/@typescript%2ftypescript-linux-x64/7.0.2)
