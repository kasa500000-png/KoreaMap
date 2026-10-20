# 빠른 설치 / Quick start

v0.1.0은 미발행 후보입니다. 현재 `npm install korea-map-web`이 성공한다고 주장하지 않습니다. 이름 선점 방지를 위해 공개 발행 직전 가용성과 소유권을 다시 확인해야 합니다.

## 후보 소스와 로컬 패키지

후보 체크아웃에서 Node 24.19.0 / pnpm 12.14.0 / Python 3으로 실행합니다. 기본 브랜치는 후보 브랜치가 아니며, 새 후보의 공개 push는 승인 전 수행하지 않습니다.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm pack:check
pnpm verify:packages
pnpm dev:web
```

마지막 명령은 `http://localhost:3000`의 독립 로컬 Next.js 데모입니다. API 키, DB, Docker, Supabase 없이 합성 지도를 실행합니다. 서비스 통합 테스트만 Docker가 필요합니다. 설치 시 공개 npm 메타데이터를 조회할 수 있으며 `pnpm offline:check`는 이미 준비된 store의 오프라인 재설치 검사입니다.

실제 npm 형식 tarball은 `artifacts/korea-map-{core,styles,web,native,data-adapters}-0.1.0.tgz`에 생성됩니다. `pnpm verify:packages`는 별도 임시 소비 앱에 Web 관련 4개 tarball을 설치하고 strict 타입·SSR·실제 브라우저·외부 요청을 검증합니다. workspace symlink를 사용하지 않습니다. Native tarball의 독립 APK/IPA 설치 검증은 아직 미완료입니다.

수동 소비 앱에서도 로컬 tarball을 dependencies에 지정하세요. 미발행 형제 의존성이 레지스트리로 해석되지 않도록 `pnpm-workspace.yaml`의 overrides에 각 tarball의 **사용자 로컬 절대 경로**를 지정하고 `ignoreScripts: true`를 유지합니다. 재현 가능한 전체 소비 앱 생성 과정은 [검증 스크립트](../scripts/verify-packages.mjs)를 따릅니다.

## 승인된 npm 발행 이후에만

```sh
npm install --save-exact korea-map-core@0.1.0 korea-map-styles@0.1.0 korea-map-web@0.1.0 maplibre-gl@6.14.0
```

이 명령은 현재 검증된 레지스트리 설치 결과가 아닙니다. 발행 후 새 빈 디렉터리에서 실행하고, 실제 registry integrity/소유자/provenance를 확인한 뒤 설치 검증 상태를 변경해야 합니다.

Web은 MapLibre CSS, 같은 origin의 로컬 worker 파일과 LICENSE, 높이가 있는 컨테이너가 필요합니다. [Web 가이드](web-guide.md)와 [Expo 설치 가이드](native-sdk.md)를 참고하세요. 앱 빌드에 들어가는 값은 공개되므로 비밀 키를 전달하지 마세요.
