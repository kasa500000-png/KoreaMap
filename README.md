# Korea Map Kit

한국에 특화된 MapLibre 기반 무료 오픈소스 지도 SDK입니다. 현재는 **모노레포와 로컬 합성 지도 기반 구현**이며, 완성된 한국 지도 SDK 또는 발행된 npm 제품이 아닙니다. 자체 작성 SDK 코드와 합성 fixture는 [MIT](LICENSE), 외부 라이브러리·실제 지도 데이터·폰트는 각각의 라이선스를 따릅니다.

## 시작하기

Node.js **24.19.0**, pnpm **12.14.0**, 문서/감사용 Python **3.12+** 및 Git을 사용합니다. API 키, 클라우드 계정, `.env` 복사 없이 빌드와 기본 테스트가 실행됩니다. 최초 설치에는 공개 패키지 레지스트리 접속이 필요합니다.

```sh
npm install --global pnpm@12.14.0 --ignore-scripts --no-audit --no-fund
pnpm install --frozen-lockfile
pnpm check
pnpm dev:web
```

| 명령                                       | 실행 범위                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| `pnpm build:sdk`                           | SDK 5개와 서비스 경계 TypeScript 빌드, 타입 선언·MIT 고지 생성             |
| `pnpm typecheck`                           | SDK·서비스·Web·Expo·테스트 strict 검사                                     |
| `pnpm test`                                | 외부 API 없는 Vitest 단위 테스트                                           |
| `pnpm lint` / `pnpm format:check`          | ESLint / Prettier 검사                                                     |
| `pnpm build`                               | SDK·서비스 + Next.js 정적 출력 + Android/iOS JavaScript 번들               |
| `pnpm check`                               | 경계·lint·format·types·unit·build·문서·정적 감사·감사 회귀·Changesets 검사 |
| `pnpm test:web`                            | 빌드된 Web의 Playwright 화면/외부 요청 검사; 로컬 Chromium 필요            |
| `pnpm pack:check`                          | 빌드된 SDK 5개 tarball 생성 및 검사; npm 발행 안 함                        |
| `pnpm offline:check`                       | 최초 설치로 채운 pnpm 저장소에서 새 임시 workspace 오프라인 설치           |
| `pnpm dev:expo`                            | Expo offline/localhost 개발 서버; Expo Go 미지원                           |
| `pnpm changeset` / `pnpm changeset:status` | 버전 변경 계획 작성 / 확인; 자동 발행 없음                                 |
| `pnpm clean`                               | 알려진 로컬 빌드 산출물 정리                                               |

Playwright 브라우저는 `pnpm exec playwright install chromium`으로 준비합니다. OS별 전제조건, native 로컬 빌드, worker, 서비스 범위는 [개발 가이드](docs/development.md)를 따릅니다. **Expo JS export는 APK/IPA 빌드나 Android/iOS 실화면 QA가 아닙니다.** 의존성 보안 미해결 사항은 [비용·보안 감사](docs/cost-audit.md)에 기록하며 제품 출시는 차단합니다.

## 모노레포

```text
packages/       core · web · native · styles · data-adapters (SDK)
examples/       web (Next.js) · expo (비공개 소비 앱)
services/       geo-data · search · routing (비공개 서비스 경계, 엔진 미구현)
docs/           설계 · 요구사항 · 로드맵 · 진행 · 감사
scripts/        Windows/macOS/Linux 공통 Node/Python 개발 명령
tests/          단위 계약 · Web 화면/네트워크
```

`core`는 외부 runtime/dev 의존성 없이 ES 표준 라이브러리만 사용합니다. DOM·React·React Native·Supabase·서버 의존성은 금지하며 manifest/AST/ESLint/TypeScript로 경계를 검사합니다. 백엔드 엔진, 데이터 수집 및 외부 HTTP provider는 후속 단계입니다. 현재 지원 모드는 **명시적 `local-fixture`**뿐이며 미지원 모드는 실패합니다.

## Zero Publisher Cost

제작자 API 키·DB·타일·백엔드 계정을 기본 연결하지 않습니다. 설정 누락 시 renderer 생성 전에 실패하며 공용 OSM/Nominatim 등의 숨겨진 fallback도 없습니다. Web 예제의 worker도 설치된 MapLibre에서 복사한 same-origin 자산입니다. 기본 테스트는 별도 허가된 합성 데이터만 사용합니다.

| 구분                                | 비용과 책임                                                                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| SDK 코드 제공                       | 무료 오픈소스입니다. GitHub/npm 코드 배포 한도·빌드 장비는 유지관리 영역이며 지도 서비스 사용료와 별개입니다.                       |
| 지도·타일·글리프·스프라이트         | 운영자가 자료와 호스팅을 선택하고 저장·전송·갱신 비용 및 라이선스 의무를 부담합니다.                                                |
| 검색·지오코딩·라우팅·공공데이터 API | 선택형입니다. 서비스를 설정한 운영자가 계정·사용료·한도·키를 관리합니다.                                                            |
| 자체 호스팅                         | 유료 클라우드 없이 로컬 장비를 사용할 수 있습니다. 장비·전력·네트워크 비용까지 0원이라는 뜻은 아닙니다.                             |
| 데모                                | 로컬 fixture와 정적 자산만 사용합니다. 제작자 유료 API를 호출하지 않습니다. 실제 호스팅과 무료 한도는 배포 승인 시 별도 확인합니다. |
| GitHub Actions                      | 공개 저장소의 무료 표준 runner 3종만 구성합니다. cache·artifact 업로드·배포·유료 runner를 활성화하지 않습니다.                      |

브라우저 `NEXT_PUBLIC_*`, Expo `EXPO_PUBLIC_*`, 앱 bundle·소스맵의 값은 공개 정보입니다. 비공개 키는 운영자 서버에만 두고 개인 endpoint·토큰·결제 설정을 Git/npm/예제에 넣지 않습니다. `.env.example`은 필수 값이 없는 안전한 템플릿이며 SDK는 환경변수에서 provider를 자동 탐색하지 않습니다.

## 문서와 배포

- [아키텍처](docs/architecture.md), [요구사항](docs/requirements.md), [로드맵](docs/roadmap.md), [진행 기록](docs/progress.md)
- [개발 가이드](docs/development.md), [도구 버전 근거](docs/research/monorepo-toolchain.md)
- [Zero Publisher Cost ADR](docs/decisions/009-zero-publisher-cost.md), [비용·보안 감사](docs/cost-audit.md), [프로젝트 정책](AGENTS.md)

main 병합·운영 배포·공개 전환·npm 발행에는 각각 명시적 승인이 필요합니다. npm scope 소유권, Native 실제 빌드/화면 및 잔여 보안 감사가 완료되기 전 제품 발행을 진행하지 않습니다.

## 데이터 공급원과 라이선스

[공급원 조사](docs/data-sources.md), [데이터 라이선스](docs/data-licenses.md), [출처 표시](docs/attribution.md), [기계 판독 원장](data/sources.json)을 참고하세요. A 후보만 운영자 선택 후 수집 자격을 얻으며, B는 선택형 API, C/D는 제외합니다. 실제 외부 데이터는 Git/npm에 포함하지 않습니다. `pnpm check:data`, `pnpm test:data`, `pnpm pack:check`로 권리 메타데이터와 공개 산출물을 검사합니다.

Web 지도 API와 Next 클라이언트 사용법은 [Web SDK 가이드](packages/web/README.md)를 참고하세요. 카메라·배치 마커·장소 카드·GeoJSON/경로 표시·사용자 레이어를 지원하며, 운영자 스타일은 명시적 URL/허용 origin/비용동의를 요구합니다. [실행 검증과 제한](docs/research/web-sdk-validation.md)에 Chromium 결과와 전역 worker 유지·실기기 미검증 사항을 기록합니다.

Standard·Dark·Pastel·Outdoor의 [지도 디자인 시스템과 비교 화면](docs/design-system.md), [폰트·아이콘 라이선스 및 플랫폼 검증](docs/font-icon-licenses.md)을 제공합니다. `pnpm dev:web` 실행 후 `/themes/`에서 토큰 색상과 확대 레벨을 비교할 수 있습니다. 글꼴 파일과 실제 지도 데이터는 패키지에 포함하지 않습니다.

공통 SDK API: [계약·사용 예제·Web/Native 기능 동등성](docs/public-api.md), [생성 API 참조](docs/api/core.md). Web `MapHandle.api`와 Native `MapView` ref가 같은 `MapController`를 사용합니다. `pnpm dev:web` 후 `/api/`에서 외부 키 없는 예제를 실행할 수 있습니다. Native 실기기 QA는 아직 미검증입니다.

## 공공 POI 데이터 서비스

선택형 PostGIS ETL과 공통 `getNearbyPlaces()` / `getPlacesInBounds()` /
`getPlacesByCategory()`를 추가했다. [실행·설정 가이드](docs/public-data-etl.md)와
[검증 결과](docs/research/poi-etl-validation.md)를 따른다. A 등급 중 지원 프로파일만
운영자 opt-in으로 수집하며 기본값은 네트워크가 없는 자체 합성 샘플이다.
원본 파일 접근 실패로 실제 공공데이터 적재는 미검증이다.

SDK 소스·패키지 제공 비용과 데이터 다운로드·DB·타일·검색·라우팅 서버 운영 비용은
별개다. 서비스 운영자는 자신의 DB/계정/트래픽 비용을 부담하며 SDK 사용자의 증가가
제작자 소유 서비스 호출로 이어지는 기본 경로는 없다. Supabase는 선택 사항이다.

한국 장소명·POI 주소 검색은 [검색 가이드](docs/search.md)를 따른다. `services/search`의 선택형 자체
PostGIS/pg_trgm 서비스와 `/search/` 합성 Web 데모를 제공한다. SDK 검색에는 제작자 endpoint나
API 키가 없으며 실제 DB·검색 서비스 운영 비용은 해당 운영자에게 있다. 전국 도로명주소 변환은 별도 Provider다.

[GPS·이동 경로 가이드](docs/gps-tracks.md): Web `/gps/`와 Expo **GPS 경로 예제**에서 동의 후 위치 조회·기록,
GeoJSON/GPX 교환과 리플레이를 제공한다. 기본 외부 전송·장기 저장은 없다. 전경 수집만 지원하며
Android/iOS 실제 기기·백그라운드 검증은 미완료다. 장기 저장/서버 운영 비용과 정책은 소비 앱 책임이다.
