# ADR-004 — 스타일 자유도와 자체 한글 글리프

날짜: 2026-10-19. 상태: 설계 채택, 구현 검증 전. [전체 아키텍처](../architecture.md)

## 결정

MapLibre style JSON v8과 공통 지원 expression을 사용한다. 자체 light 스타일·색/라벨 토큰과 style 교체를 제공하며 glyph/sprite를 자체 호스팅한다. 기본 tileset schema 1에 맞는 6개 layer를 명시한다. 사용자 tileset/style 쌍도 허용한다.

## 이유와 대안

상용 서비스 style·폰트·아이콘 복제는 하지 않는다. Web 로컬 폰트는 Native 호환성을 보장하지 않아 공통 경로로 삼지 않는다. 처음부터 GUI style editor나 전체 명세 wrapper를 만드는 대신 upstream JSON과 validator를 활용한다.

## 결과와 제약

name_ko → name fallback, OFL 폰트의 정확한 파일·고지, 256 code point glyph range, sprite 1x/2x를 버전 관리한다. Noto glyph를 MIT로 재표시하지 않는다. 폰트/glyph 생성 도구·배포 hash는 M3에서 고정한다.

## 검증과 재검토

R07 R09. 세 플랫폼의 missing glyph, 자모/완성형, 복합 fontstack, source-layer 불일치, invalid expression, style 변경 후 overlay 복구를 검사한다. 한글 표시가 안 되는 상태를 MVP 완료로 처리하지 않는다.

## 근거

[Glyph 명세](https://maplibre.org/maplibre-style-spec/glyphs/), [Noto Sans OFL](https://github.com/notofonts/noto-cjk/blob/main/Sans/LICENSE), [MapLibre style spec](https://maplibre.org/maplibre-style-spec/).
