#!/usr/bin/env python3
"""Render the reviewed metadata; --check fails if the human report drifts."""
import json
from pathlib import Path
import sys
root = Path(__file__).resolve().parents[1]
catalog = json.loads((root / 'data/sources.json').read_text(encoding='utf-8'))
counts = ' / '.join(g + ' ' + str(sum(s['grade'] == g for s in catalog['sources'])) for g in 'ABCD')
lines = ['# 한국 지도 데이터 공급원 검토', '',
f'확인일: {catalog["reviewedAt"]}. 자동 생성 부분의 원장은 [data/sources.json](../data/sources.json)이다. `pnpm docs:data`로 재생성한다.', '',
'## 판정과 범위', '',
f'A는 명시된 데이터 범위의 저장·가공·재배포가 확인된 후보, B는 API-only 조건이 확인된 후보, C는 추가 확인 필요, D는 명시한 용도에서 제외다. **{counts}**. API 제공 형식과 라이선스 등급은 다르다. 저장 권한을 모르면 B가 아니라 C다.', '',
'이 원장은 공식 페이지·약관의 검토와 수집 자격을 기록한다. 원본 파일의 실제 취득·검증 상태는 자료별 후속 기록을 따른다. 제3자 원본 데이터/사진은 공개 저장소·npm에 포함하지 않는다. A도 기본 비활성이고 운영자의 명시적 선택 후 수집 자격만 부여한다. 파일 검증을 DB 적재·검색 수락으로 대신하지 않는다. B 확정 자료가 없으므로 실제 B provider는 추가하지 않았다. 검사에는 합성 B 정책 분기 테스트가 있다.', '',
'`metadataModified`는 포털 수정일, `dataAsOf`는 파일/레코드 기준일, `reviewedAt`은 우리 확인일이다. null은 미확인이지 최신 데이터라는 뜻이 아니다. 페이지 열람 성공은 다운로드/실서비스 호출/원본 파일 QA 성공을 뜻하지 않는다. 공식 페이지는 검색 도구로 열람했으며 VWorld·주소정보·NGII 일부 페이지는 접근 실패했다. 실패를 우회하지 않았다.', '',
'조건과 라이선스 조합은 [data-licenses.md](data-licenses.md), 표시 방법은 [attribution.md](attribution.md)를 따른다. 권리 확인 유효기간은 최대 90일이며 만료 시 검사와 선택이 실패한다. 배포·수집 재개 직전 조건 변경 여부를 사람이 다시 확인한다.', '',
'## 목록', '', '| ID | 등급 | 데이터 | 포털 수정일 | 데이터 기준일 |', '| --- | --- | --- | --- | --- |']
for s in catalog['sources']:
 lines.append(f"| `{s['id']}` | {s['grade']} | [{s['name']}]({s['sourceUrl']}) | {s['metadataModified'] or '미확인'} | {s['dataAsOf'] or '미확인'} |")
labels={'allowed':'허용(조건 준수)', 'prohibited':'금지', 'unknown':'미확인'}
for s in catalog['sources']:
 lines += ['', '## '+s['id'], '', '**'+s['name']+' — '+s['grade']+'**', '', '| 검증 항목 | 결과 |', '| --- | --- |',
 f"| 원본 / 제공기관 | [공식 원본]({s['sourceUrl']}) / {s['agency']} |",
 f"| 형식 | {', '.join(s['formats'])} |",
 f"| 좌표계 | {s['crs']['value'] or s['crs']['status']} — {s['crs']['note']} |",
 f"| 최신성 | 포털 수정: {s['metadataModified'] or '미확인'}; 데이터 기준: {s['dataAsOf'] or '미확인'}; 주기: {s['updateCycle']} |",
 f"| 이용허락 | {s['license']} |",
 '| 상업 / 저장 / 수정 / 재배포 | '+' / '.join(labels[s['rights'][k]] for k in ('commercial','store','modify','redistribute'))+' |',
 f"| 출처 표시 | {s['attribution']} |", f"| 호출량 / 비용 | {s['quotaAndCost']} |", f"| 판정 / 충돌 검토 | {s['decision']} |", '', '**근거와 접근 상태**', '']
 for e in s['evidence']: lines.append(f"- [{e['status']}]({e['url']}): {e['summary']}")
 lines += ['', '**범위 및 후속 확인**', ''] + ['- '+n for n in s['notes']]
lines += ['', '## 우선순위', '',
'1. OSM/Geofabrik 공개 추출본과 용산구 주차장으로 운영자 자체 파이프라인을 먼저 검증한다. OSM 기반 보행로·공원 커버리지의 지역 편차는 별도 품질검사 대상이다.',
'2. 산책로·반려동물 시설은 확인된 구조화 속성만 추가한다. 주소만 있는 자료는 지오코딩 권리 검증 전 좌표를 만들지 않는다. 병원 좌표는 원본 CRS와 기준점 검증을 통과해야 한다.',
'3. 전국 공원/주차장 취합, VWorld, NGII, 주소 DB는 적힌 차단 사유를 해소한 개별 데이터부터 승격한다. TourAPI 키·쿼터·좌표 명세와 필드별 미디어 분리를 검증한 뒤 수집기를 구현한다.',
'4. 실제 운영 데이터는 SDK Git/npm과 분리한 운영자 저장소에 보관한다. 원본 SHA-256, 실제 취득 시각, 기준일, 권리 문서 버전, 변환 이력, 필터링·출처 명세를 배치별로 남긴다.', '']
output='\n'.join(lines)
target=root/'docs/data-sources.md'
if '--check' in sys.argv:
 if not target.exists() or target.read_text(encoding='utf-8') != output: raise SystemExit('FAIL: run pnpm docs:data; catalog/report drift')
 print('PASS: data source report matches catalog')
else: target.write_text(output, encoding='utf-8')
