# OSM land-polygons 공식 조건 검토

확인일: 2026-10-20 KST. 공식 HTML 두 문서만 읽었다. 전 지구 ZIP·SHP·지도 payload는 다운로드하지 않았고, 데이터 원장을 변경하거나 자동 수집·landmask/ocean capability를 활성화하지 않았다.

| 항목 | 확인 내용 |
| --- | --- |
| 공식 설명 | <https://osmdata.openstreetmap.de/data/land-polygons.html> — HTTP 200, HTML 6,274 bytes |
| 공식 이용허락 | <https://osmdata.openstreetmap.de/info/license.html> — HTTP 200 |
| 원천·내용 | OpenStreetMap의 `natural=coastline` way를 polygon으로 조립하고 일부 오류를 수리한 대륙·섬의 육지 영역 |
| 제공 형식·CRS | Shapefile, WGS84 및 Mercator. 실제 선택 파일의 PRJ·축 순서·geometry는 미검증 |
| 권리 근거 | 설명 페이지는 OpenStreetMap contributors 저작권과 ODbL을 명시. 라이선스 페이지는 원본 OSM 기반 파일에 원본과 같은 Open Database License를 적용한다고 명시 |
| 상업·가공·재배포 | ODbL 조건을 이행하는 범위. SDK 코드 MIT로 재허가하지 않으며 파생 DB·지도 Produced Work의 의무를 구분해야 함 |
| 추가 표기 | 해당 사이트 언급/링크는 환영하지만 필수는 아니라고 안내. OSM 자체 출처·ODbL 의무를 면제하는 문구가 아님 |
| 최신성 한계 | 자동 수리할 수 없는 OSM coastline 오류가 있으면 출력 갱신이 중단될 수 있다고 명시. 파일의 현재 기준일·SHA·크기·갱신 지연은 미확인 |
| 현재 사용 상태 | 새 공급원 원장 검토와 정확한 파일 선택·품질 검증 미완료. 이 조사만으로 자동 수집 허용 또는 실제 연안 정합 통과로 처리하지 않음 |

공식 페이지에는 full/split WGS84·Mercator 변형과 `simplified-land-polygons-complete-3857.zip` 선택자가 있다. 마지막 자료는 zoom 0–9용 simplified polygon이라고 설명한다. 이 설명을 고배율 한국 해안선 정확도 보장으로 확대하지 않는다. 파일 크기를 확인하지 않은 채 전 지구 자료를 자동 다운로드하거나 CI의 기본 입력으로 추가하지 않는다.

도입하려면 root 데이터 원장 관리자가 다음 조건을 검토해야 한다.

1. 정확한 선택 파일/범위·권리 근거·출처·검토기한·기준일을 등록한다. 현재 OSM/Geofabrik 승인에 별도 제공자의 가공 산출물이 자동 포함된다고 가정하지 않는다.
2. 운영자 opt-in과 자원 예산 아래 원본 hash·파일 크기·압축 해제 상한·라이선스 고지를 고정한다. ZIP 경로 이탈·symlink·불필요 원본 파일의 배포를 차단한다.
3. 실제 CRS를 검증하고 한국/시범 bbox와 충분한 버퍼로 clip한다. polygon 유효성·섬/구멍·이음새·국경·bbox 바깥 영역과 실제 OSM 타일 세대의 시점 차이를 검사한다.
4. 소형·저배율 context와 고배율 상세 육지 영역의 지원 범위를 구분한다. 부분 coverage를 전 지역 landmask로 표시하지 않는다.
5. 실제 archive/원본 manifest·출처와 HTTP/renderer QA를 통과한 경우에만 `landmask`와 `ocean` capability를 검증해 켠다. 그 전에는 기존 내륙 수역 범위를 유지하고 별도 해양 완성으로 표시하지 않는다.

HTML 관찰의 안전한 메타데이터는 ignored `artifacts/coastline-review/`에 있다. 이 기록은 실제 SHP 취득·한국 clip·전국 coverage·신규 데이터의 Git/npm 배포 허가를 증명하지 않는다.
