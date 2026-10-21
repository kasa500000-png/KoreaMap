# Native 소비 앱 metadata cache 수정

확인일: 2026-10-21. `pnpm verify:native-consumer`의 새 임시 앱은 저장소의 frozen install과
다른 importer다. pnpm 12.14.0에서 패키지 파일이 캐시되어 있어도 새 lock 해석에 필요한
registry metadata가 없으면 `--offline --lockfile-only`는 `ERR_PNPM_NO_OFFLINE_META`로
타입 검사 전에 실패한다. 실제 Native CI에서 `@types/react@19.3.0` 해석 중 확인한 문제다.

검증기는 저장소 lock을 복사하고 소비 앱 내부에 매번 새 빈 `cacheDir`를 만든다.
먼저 공개 `https://registry.npmjs.org/`의 metadata로 `--lockfile-only --no-frozen-lockfile
--ignore-scripts`를 수행한 뒤, 같은 패키지 저장소에서 `--offline --frozen-lockfile
--ignore-scripts`로 설치한다. 전체 절차를 오프라인으로 표현하지 않는다.
`registryLockPreparation`과 `offlineTarballInstall`을 따로 보고하며 실패를 재시도하거나
온라인 설치로 대체하지 않는다. 전역 metadata cache는 읽기 전제로 사용하거나 삭제하지 않는다.

정확한 peer 버전, strict peer 검사, `xcode>uuid: 11.1.1`, `minimumReleaseAge: 1440`,
설치 hook 차단과 hardlink를 유지한다. 설치 후 기존 검토 그래프 밖 버전과 SDK 소스/외부 경로를
계속 거부한다. SDK·manifest·저장소 lock·CI 설정은 바꾸지 않는다.
공개 registry metadata 준비는 private 검증 도구의 의존성 확인이며 SDK 지도 요청이나
제작자 소유 과금 서비스 경로를 추가하지 않는다.

## 재현과 검증

```sh
pnpm test:native-consumer
pnpm verify:native-consumer
```

회귀 검사는 명령 순서, 서로 다른 소비 앱의 빈 cache, 공유 package store,
각 단계의 hook 차단과 실패 즉시 전파를 확인한다. 실제 소비 검증 결과는 ignored
`artifacts/qa/native-consumer.json`, 실행 로그는
`artifacts/native-consumer-cache-verification.log`에 기록한다.

2026-10-21 실제 빈 metadata cache 검증에서 registry lock 준비·frozen offline 설치·strict 앱/API·
SDK Bundler/NodeNext 전체 선언·plugin introspection·Android/iOS JS export가 통과했다.
명령은 알려진 React Native 선언 3건 때문에 `PARTIAL_PASS`, `releaseBlocked: true`, exit 1로 끝났다.
Native 소비 회귀 10/10, Android 검증 도구 회귀 9/9와 대상 ESLint·Prettier·문서 검사를 통과했다.

전체 React Native 의존성 선언의 TS2411/TS2344/TS2416은 별도 릴리스 차단이다.
SDK Bundler/NodeNext 전체 선언, strict 앱/API, plugin introspection과 Android/iOS JS export가
성공해도 이 오류를 숨기거나 발행 게이트를 통과시키지 않는다. JS export는 APK/IPA·기기 QA가 아니다.
