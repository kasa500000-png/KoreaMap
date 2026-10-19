# 자주 발생하는 오류

| 증상 | 확인 및 조치 |
| --- | --- |
| npm 404 | 후보는 미발행입니다. 로컬 tarball을 사용하세요. 발행 후에도 정확한 이름/버전과 소유자를 확인하세요. |
| default branch에 SDK가 없음 | 저장소 기본 브랜치가 `chore/project-policy`입니다. 승인된 후보 소스를 체크아웃하세요. 후보는 승인 전 원격에 업로드하지 않습니다. |
| window/document SSR 오류 | client effect에서 초기화하고 client wrapper의 dynamic import에 ssr:false를 적용하세요. |
| 빈 지도 | 컨테이너 높이, MapLibre CSS, 로컬 worker, ready 오류와 CSP를 확인하세요. 합성 fixture는 실제 전국 지도가 아닙니다. |
| provider 설정 오류 | 명시적 mode, style, origin, 출처와 비용 인지 값을 확인하세요. 자동 fallback은 없습니다. |
| 타일/한글 누락 | 실제 source-layer schema, name:ko fallback, glyph 범위/URL, fontstack, sprite, CORS를 확인하세요. Native 폰트는 별도 검증이 필요합니다. |
| strict Web NodeNext TS2834 | 알려진 upstream 선언 제약입니다. 지원 범위인 Bundler 해석을 사용하세요. core NodeNext와 구분하세요. |
| Expo Go에서 지도 모듈 없음 | config plugin을 적용한 Development Build를 생성하세요. JS export는 APK/IPA 검증이 아닙니다. |
| GPS permission denied | 명시적 사용자 동의와 OS 권한을 확인하세요. background 지속 수집은 지원하지 않습니다. |
| 검색/라우팅 unavailable | 운영자 서비스 상태/설정을 확인하세요. 검색 빈 결과와 네트워크 오류를 구분하며 직선을 도로 경로로 반환하지 않습니다. |
| pnpm offline metadata 오류 | 최초 설치/새 소비 앱 lock 생성은 registry 메타데이터가 필요할 수 있습니다. 온라인 frozen install로 준비 후 offline 검사를 실행하세요. |
| audit high 오류 | 알려진 차단 사항을 숨기지 마세요. 검증된 수정 버전/대체 그래프 검토 후 전체 회귀 검사를 실행하세요. |
| 릴리스 워크플로가 skipped | 기본 발행 비활성화 상태입니다. 승인/소유권/보호 환경/OIDC/정확한 커밋 설정을 먼저 검토하세요. |

재현 로그에 키, 개인 GPS 좌표, 내부 주소가 들어가지 않게 하세요. 보안 신고는 [SECURITY.md](../SECURITY.md)를 따르세요.
