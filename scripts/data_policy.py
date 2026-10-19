"""Offline catalog and publication admission. No provider client or downloader."""
from datetime import date, datetime
from pathlib import PurePosixPath
from urllib.parse import urlsplit
import hashlib
import json
import re
import subprocess
import tarfile

OFFICIAL_HOSTS = {
    'download.geofabrik.de', 'www.openstreetmap.org', 'opendatacommons.org',
    'operations.osmfoundation.org', 'www.vworld.kr', 'map.ngii.go.kr',
    'www.law.go.kr', 'www.data.go.kr', 'business.juso.go.kr',
    'file.localdata.go.kr', 'www.kogl.or.kr', 'wiki.openstreetmap.org',
}
POLICY = dict(defaultNetwork=False, thirdPartyPayloadsInGit=False,
              thirdPartyPayloadsInNpm=False, automaticCollectionGrades=['A'],
              apiOnlyGrades=['B'], excludedGrades=['C', 'D'])
RIGHTS = {'commercial', 'store', 'modify', 'redistribute'}
FIELDS = {'id', 'name', 'agency', 'sourceUrl', 'grade', 'formats', 'crs',
          'metadataModified', 'dataAsOf', 'updateCycle', 'license', 'rights',
          'quotaAndCost', 'attribution', 'decision', 'evidence', 'notes',
          'reviewedAt', 'reviewBy', 'collectionEligible', 'defaultEnabled'}
A_LICENSES = {'ODbL-1.0', 'LicenseRef-DataGo-Unrestricted', 'LicenseRef-KOGL-Type-1'}
SDK = ('core', 'web', 'native', 'styles', 'data-adapters')
DATA_SUFFIXES = {'.pbf', '.osm', '.osc', '.pmtiles', '.mbtiles', '.shp', '.shx',
                 '.dbf', '.prj', '.gpkg', '.geojson', '.topojson', '.csv', '.tsv',
                 '.xlsx', '.xls', '.tif', '.tiff', '.sqlite', '.db', '.kml', '.gpx',
                 '.png', '.jpg', '.jpeg', '.webp', '.svg', '.woff', '.woff2',
                 '.ttf', '.otf', '.zip', '.gz', '.tgz', '.pdf', '.xml', '.rdf',
                 '.jsonl', '.ndjson', '.parquet', '.feather', '.sql'}
DATA_METADATA = {'data/sources.json', 'data/publication.json'}
# Exact reviewed configuration/research paths, never a general JSON data allowlist.
JSON_METADATA = DATA_METADATA | {
    '.changeset/config.json', '.prettierrc.json', 'package.json',
    'tsconfig.base.json', 'tsconfig.build.json', 'tests/tsconfig.json',
    'examples/expo/app.json', 'docs/research/dependency-snapshot.json',
    'docs/research/toolchain-snapshot.json', 'docs/research/ux-observations.json',
} | {f'{directory}/{name}' for directory in
     [*(f'packages/{name}' for name in SDK), 'examples/web', 'examples/expo',
      'services/geo-data', 'services/search', 'services/routing']
     for name in ('package.json', 'tsconfig.json')}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def official_url(value):
    require(isinstance(value, str), 'URL must be text')
    u = urlsplit(value)
    require(u.scheme == 'https' and u.hostname in OFFICIAL_HOSTS
            and not u.username and not u.password and not u.port, 'Unreviewed official URL')
    require(not re.search(r'(?i)(key|token|secret|signature)=', u.query), 'Credential in source URL')


def iso_date(value):
    require(isinstance(value, str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}', value), 'Invalid date')
    return date.fromisoformat(value)


def validate_catalog(catalog, today=None):
    today = today or date.today()
    require(set(catalog) == {'schemaVersion', 'reviewedAt', 'policy', 'sources'}, 'Unknown catalog fields')
    require(type(catalog['schemaVersion']) is int and catalog['schemaVersion'] == 1, 'Schema version')
    require(catalog['policy'] == POLICY, 'Data policy cannot enable default network or payload publication')
    require(iso_date(catalog['reviewedAt']) <= today, 'Future review')
    require(isinstance(catalog['sources'], list) and catalog['sources'], 'Empty catalog')
    ids = set()
    for s in catalog['sources']:
        require(set(s) == FIELDS, 'Missing or unknown source fields')
        require(isinstance(s['id'], str) and re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', s['id']), 'Invalid ID')
        require(s['id'] not in ids, 'Duplicate source ID')
        ids.add(s['id'])
        for field in ('name', 'agency', 'updateCycle', 'license', 'quotaAndCost', 'attribution', 'decision'):
            require(isinstance(s[field], str) and bool(s[field].strip()), 'Missing ' + field)
        official_url(s['sourceUrl'])
        require(s['grade'] in {'A', 'B', 'C', 'D'}, 'Unknown grade')
        require(s['defaultEnabled'] is False, 'Implicit provider forbidden')
        require(s['collectionEligible'] is (s['grade'] == 'A'), 'Collection grade mismatch')
        reviewed, expiry = iso_date(s['reviewedAt']), iso_date(s['reviewBy'])
        require(reviewed <= today <= expiry and 0 < (expiry - reviewed).days <= 90, 'Review expired/future/too long')
        require(s['reviewedAt'] == catalog['reviewedAt'], 'Review date mismatch')
        for key in ('metadataModified', 'dataAsOf'):
            if s[key] is not None:
                require(isinstance(s[key], str), 'Invalid update value')
                require(re.fullmatch(r'\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}Z)?', s[key]), 'Invalid update timestamp')
                require(iso_date(s[key][:10]) <= today, 'Future data date')
                if 'T' in s[key]: datetime.strptime(s[key], '%Y-%m-%dT%H:%M:%SZ')
        require(isinstance(s['formats'], list) and s['formats'] and all(isinstance(f, str) and f for f in s['formats']), 'Formats required')
        require(isinstance(s['notes'], list) and s['notes'] and all(isinstance(n, str) and n for n in s['notes']), 'Notes required')
        c = s['crs']
        require(set(c) == {'status', 'value', 'note'}, 'CRS fields')
        require(c['status'] in {'confirmed', 'unknown', 'not-applicable'} and isinstance(c['note'], str) and c['note'], 'CRS status/note')
        require((isinstance(c['value'], str) and c['value'].startswith('EPSG:')) if c['status'] == 'confirmed' else c['value'] is None, 'CRS value')
        require(set(s['rights']) == RIGHTS and all(v in {'allowed', 'prohibited', 'unknown'} for v in s['rights'].values()), 'Rights required')
        require(isinstance(s['evidence'], list) and s['evidence'], 'Evidence required')
        observed = []
        for e in s['evidence']:
            require(set(e) == {'url', 'status', 'summary'}, 'Evidence fields')
            official_url(e['url'])
            require(e['status'] in {'observed', 'unavailable'} and isinstance(e['summary'], str) and e['summary'], 'Evidence status/summary')
            if e['status'] == 'observed':
                observed.append(e)
        if s['grade'] == 'A':
            require(s['license'] in A_LICENSES and all(v == 'allowed' for v in s['rights'].values()), 'A requires commercial/storage/modification/redistribution rights')
            require(any(e['url'] == s['sourceUrl'] for e in observed), 'A requires observed exact source')
            require(any('제한 없음' in e['summary'] or 'ODbL' in e['summary'] or '제1유형' in e['summary'] for e in observed), 'A license evidence missing')
        if s['grade'] == 'B':
            require(observed and s['rights']['store'] == 'prohibited' and s['rights']['redistribute'] == 'prohibited', 'B requires verified API-only restrictions; unknown is C')
    return catalog


def select_source(catalog, source_id, purpose, *, operator_opt_in=False, today=None):
    validate_catalog(catalog, today)
    require(operator_opt_in is True, 'Explicit operator opt-in required')
    require(purpose in {'collect', 'external-api'}, 'Unknown purpose')
    source = next((s for s in catalog['sources'] if s['id'] == source_id), None)
    require(source is not None, 'Unknown source')
    if purpose == 'collect':
        require(source['grade'] == 'A', 'Only A may be collected')
    else:
        require(source['grade'] in {'A', 'B'}, 'C/D providers excluded')
    # Return a copy. This admission is not a download, credential or endpoint resolver.
    return json.loads(json.dumps(source))


def runtime_source(path):
    parts = PurePosixPath(path).parts
    return ((len(parts) >= 4 and parts[0] in {'packages', 'services'} and parts[2] == 'src')
            or path.startswith('examples/web/app/')
            or path in {'examples/expo/App.tsx', 'examples/expo/index.js'})


def check_file(path, data):
    p = PurePosixPath(path)
    require(not p.is_absolute() and '..' not in p.parts and '\\' not in path, 'Unsafe path')
    require(p.suffix.lower() not in DATA_SUFFIXES, 'Data/asset payload forbidden: ' + path)
    require(not path.startswith('data/') or path in DATA_METADATA, 'Only reviewed metadata in data/: ' + path)
    require(len(data) <= 8 * 1024 * 1024 and b'\0' not in data, 'Binary/oversize file requires review: ' + path)
    text = data.decode('utf-8')
    if p.suffix.lower() == '.json':
        require(path in JSON_METADATA, 'Unreviewed JSON metadata or payload: ' + path)
        obj = json.loads(text)
        def walk(value):
            if isinstance(value, dict):
                require(value.get('type') not in {'FeatureCollection', 'Feature', 'Point', 'Polygon', 'LineString', 'MultiPolygon', 'MultiPoint', 'MultiLineString', 'GeometryCollection'}, 'Embedded GeoJSON payload: ' + path)
                for v in value.values(): walk(v)
            elif isinstance(value, list):
                for v in value: walk(v)
        walk(obj)


def check_inventory(files, inventory):
    require(set(inventory) == {'schemaVersion', 'reviewedAt', 'thirdPartyPayloads', 'runtimeSources'}, 'Inventory schema')
    require(inventory['schemaVersion'] == 1 and inventory['thirdPartyPayloads'] == [], 'No third-party payload approval in this phase')
    iso_date(inventory['reviewedAt'])
    expected = inventory['runtimeSources']
    require(isinstance(expected, dict), 'Runtime inventory required')
    actual = {p for p in files if runtime_source(p)}
    require(set(expected) == actual, 'Unreviewed/deleted runtime source')
    for p in sorted(actual):
        r = expected[p]
        require(set(r) == {'sha256', 'origin', 'license'}, 'Source provenance fields')
        require(r['origin'] == 'project-authored' and r['license'] == 'MIT', 'Unapproved source origin')
        require(r['sha256'] == hashlib.sha256(files[p]).hexdigest(), 'Source review digest mismatch: ' + p)


def git_files(root, staged=False):
    def git(*args):
        return subprocess.check_output(['git', '-C', str(root), *args])
    files = {}
    if staged:
        for row in filter(None, git('ls-files', '--stage', '-z').decode().split('\0')):
            meta, name = row.split('\t', 1)
            mode, sha, stage = meta.split()
            require(mode in {'100644', '100755'} and stage == '0', 'Symlink/submodule/conflict in index')
            files[name] = git('cat-file', 'blob', sha)
    else:
        names = set(filter(None, git('ls-files', '--cached', '--others', '--exclude-standard', '-z').decode().split('\0')))
        for name in names:
            path = root / name
            require(not path.is_symlink(), 'Symlink forbidden: ' + name)
            if path.is_file(): files[name] = path.read_bytes()
    return files


def check_repository(root, staged=False):
    files = git_files(root, staged)
    for p, b in files.items(): check_file(p, b)
    require(DATA_METADATA <= files.keys(), 'Data policy files missing from selected scope')
    catalog = validate_catalog(json.loads(files['data/sources.json']))
    check_inventory(files, json.loads(files['data/publication.json']))
    return len(files), len(catalog['sources'])


def expected_package(root, name):
    base = root / 'packages' / name
    manifest = json.loads((base / 'package.json').read_text(encoding='utf-8'))
    for group in ('dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'):
        for dependency, version in manifest.get(group, {}).items():
            if version.startswith('workspace:'):
                require(version == 'workspace:*' and dependency.startswith('@korea-map-kit/'), 'Unreviewed workspace resolution')
                other = dependency.split('/')[-1]
                require(other in SDK, 'Unknown workspace package')
                manifest[group][dependency] = json.loads((root / 'packages' / other / 'package.json').read_text(encoding='utf-8'))['version']
    expected = {'package/package.json': manifest, 'package/README.md': (base / 'README.md').read_bytes(),
                'package/dist/LICENSE': (root / 'LICENSE').read_bytes()}
    for src in (base / 'src').rglob('*'):
        if src.suffix not in {'.ts', '.tsx'} or src.name.endswith('.d.ts'): continue
        rel = src.relative_to(base / 'src').with_suffix('')
        for suffix in ('.js', '.d.ts'):
            file = base / 'dist' / (str(rel) + suffix)
            expected['package/dist/' + rel.as_posix() + suffix] = file.read_bytes()
    return expected


def check_tarball(path, expected, name):
    seen = set()
    with tarfile.open(path, 'r:gz') as archive:
        total = 0
        for member in archive:
            total += member.size
            require(total <= 64 * 1024 * 1024 and len(seen) < 10000, 'Archive too large')
            require(member.isfile() and member.name in expected and member.name not in seen, 'Unexpected/duplicate/unsafe archive member')
            seen.add(member.name)
            data = archive.extractfile(member).read(8 * 1024 * 1024 + 1)
            require(len(data) <= 8 * 1024 * 1024, 'Oversized archive member')
            if member.name == 'package/package.json':
                package = json.loads(data)
                require(package == expected[member.name], 'Package manifest differs from reviewed workspace')
                require(package['name'] == '@korea-map-kit/' + name and package['license'] == 'MIT', 'Package identity/license')
                require(package.get('files') == ['dist/**/*.js', 'dist/**/*.d.ts', 'dist/LICENSE', 'README.md'], 'Publish allowlist changed')
                require(not any(h in package.get('scripts', {}) for h in ('preinstall', 'install', 'postinstall', 'prepare')), 'Package lifecycle hook')
            else:
                require(data == expected[member.name], 'Archive differs from reviewed build/source')
    require(seen == expected.keys(), 'Incomplete archive')
    return hashlib.sha256(path.read_bytes()).hexdigest()
