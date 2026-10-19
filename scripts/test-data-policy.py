#!/usr/bin/env python3
"""Synthetic mutation tests only; never download third-party data."""
import copy
from datetime import date
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from data_policy import (validate_catalog, select_source, check_file, check_inventory,
                         check_repository, check_tarball)

ROOT = Path(__file__).resolve().parents[1]
TODAY = date(2026, 10, 19)

class DataPolicyTest(unittest.TestCase):
    def setUp(self):
        self.catalog = json.loads((ROOT / 'data/sources.json').read_text(encoding='utf-8'))

    def test_real_catalog(self):
        validate_catalog(self.catalog, TODAY)
        self.assertEqual(len(self.catalog['sources']), 16)

    def test_default_no_selection(self):
        with self.assertRaisesRegex(ValueError, 'opt-in'):
            select_source(self.catalog, 'osm-geofabrik-kr', 'collect', today=TODAY)

    def test_a_only_and_unknown_fail_closed(self):
        for s in self.catalog['sources']:
            with self.subTest(source=s['id']):
                if s['grade'] == 'A':
                    result = select_source(self.catalog, s['id'], 'collect', operator_opt_in=True, today=TODAY)
                    self.assertEqual(result['id'], s['id'])
                    self.assertIsNot(result, s)
                else:
                    with self.assertRaises(ValueError):
                        select_source(self.catalog, s['id'], 'collect', operator_opt_in=True, today=TODAY)
        with self.assertRaises(ValueError):
            select_source(self.catalog, 'unknown', 'collect', operator_opt_in=True, today=TODAY)

    def test_c_d_excluded_even_external_api(self):
        for s in self.catalog['sources']:
            if s['grade'] in {'C', 'D'}:
                with self.assertRaises(ValueError):
                    select_source(self.catalog, s['id'], 'external-api', operator_opt_in=True, today=TODAY)

    def test_b_api_only_synthetic_policy_branch(self):
        # Synthetic altered policy for branch testing, not a legal finding.
        s = self.catalog['sources'][0]
        s['grade'] = 'B'; s['collectionEligible'] = False
        s['rights']['store'] = s['rights']['redistribute'] = 'prohibited'
        select_source(self.catalog, s['id'], 'external-api', operator_opt_in=True, today=TODAY)
        with self.assertRaisesRegex(ValueError, 'Only A'):
            select_source(self.catalog, s['id'], 'collect', operator_opt_in=True, today=TODAY)
        s['rights']['store'] = 'unknown'
        with self.assertRaisesRegex(ValueError, 'B requires'):
            validate_catalog(self.catalog, TODAY)

    def test_a_rights_and_license_required(self):
        for field in ('commercial', 'store', 'modify', 'redistribute'):
            c = copy.deepcopy(self.catalog); c['sources'][0]['rights'][field] = 'unknown'
            with self.assertRaises(ValueError): validate_catalog(c, TODAY)
        self.catalog['sources'][0]['license'] = 'MIT'
        with self.assertRaises(ValueError): validate_catalog(self.catalog, TODAY)

    def test_evidence_unavailable_not_permission(self):
        for e in self.catalog['sources'][0]['evidence']: e['status'] = 'unavailable'
        with self.assertRaises(ValueError): validate_catalog(self.catalog, TODAY)

    def test_duplicate_and_missing_attribution(self):
        self.catalog['sources'].append(copy.deepcopy(self.catalog['sources'][0]))
        with self.assertRaises(ValueError): validate_catalog(self.catalog, TODAY)
        self.catalog['sources'].pop(); self.catalog['sources'][0]['attribution'] = ''
        with self.assertRaises(ValueError): validate_catalog(self.catalog, TODAY)

    def test_unknown_url_credentials_and_future_date(self):
        for url in ('https://example.invalid/data', 'https' + '://' + 'operator@www.data.go.kr/data', 'https' + '://' + 'www.data.go.kr/?token=placeholder'):
            c = copy.deepcopy(self.catalog); c['sources'][0]['sourceUrl'] = url
            with self.assertRaises(ValueError): validate_catalog(c, TODAY)
        self.catalog['sources'][0]['metadataModified'] = '2099-01-01'
        with self.assertRaises(ValueError): validate_catalog(self.catalog, TODAY)

    def test_malformed_timestamp(self):
        self.catalog['sources'][0]['dataAsOf'] = '2026-10-18T99:99:99Z'
        with self.assertRaises(ValueError): validate_catalog(self.catalog, TODAY)

    def test_expired_unknown_schema_and_default_network(self):
        with self.assertRaises(ValueError): validate_catalog(self.catalog, date(2027, 1, 18))
        for mutation in ('unknown', 'network', 'collection'):
            c = copy.deepcopy(self.catalog)
            if mutation == 'unknown': c['sources'][0]['endpoint'] = 'unreviewed'
            if mutation == 'network': c['policy']['defaultNetwork'] = True
            if mutation == 'collection': c['sources'][2]['collectionEligible'] = True
            with self.assertRaises(ValueError): validate_catalog(c, TODAY)

    def test_raw_data_asset_and_renamed_geojson(self):
        for path in ('docs/raw.CSV', 'packages/web/src/photo.jpg', 'data/extra.json', 'maps/demo.pmtiles'):
            with self.assertRaises(ValueError): check_file(path, b'{}')
        for value in (b'\x00binary', b'{"nested":[{"type":"FeatureCollection","features":[]}]}'):
            with self.assertRaises(ValueError): check_file('examples/web/app/renamed.json', value)

    def test_unknown_changed_and_deleted_runtime_code(self):
        files = {'packages/core/src/index.ts': b'export const x = 1;\n'}
        inv = {'schemaVersion':1, 'reviewedAt':'2026-10-19', 'thirdPartyPayloads':[], 'runtimeSources':{
            p:dict(sha256=hashlib.sha256(b).hexdigest(), origin='project-authored', license='MIT') for p,b in files.items()}}
        check_inventory(files, inv)
        for changed in ({}, dict(files, **{'packages/core/src/new.ts':b'// new'}), {'packages/core/src/index.ts':b'// unreviewed data'}):
            with self.assertRaises(ValueError): check_inventory(changed, inv)

    def test_git_index_cannot_hide_forced_payload(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            subprocess.run(['git', 'init', '-q', str(root)], check=True)
            (root / '.gitignore').write_text('*.csv\n')
            (root / 'raw.csv').write_text('synthetic,only\n')
            subprocess.run(['git','-C',tmp,'add','-f','raw.csv'], check=True)
            (root / 'raw.csv').unlink()  # index still contains data, despite deletion in worktree
            with self.assertRaisesRegex(ValueError, 'payload forbidden'):
                check_repository(root, staged=True)

    def test_tarball_manifest_cannot_smuggle_extra_fields(self):
        manifest = {'name': '@korea-map-kit/core', 'license': 'MIT',
                    'files': ['dist/**/*.js', 'dist/**/*.d.ts', 'dist/LICENSE', 'README.md']}
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'package.tgz'
            for changed in (False, True):
                value = dict(manifest)
                if changed: value['copiedDataset'] = ['synthetic rejected payload']
                data = json.dumps(value).encode()
                with tarfile.open(path, 'w:gz') as tar:
                    member = tarfile.TarInfo('package/package.json'); member.size = len(data)
                    tar.addfile(member, io.BytesIO(data))
                if changed:
                    with self.assertRaisesRegex(ValueError, 'manifest differs'):
                        check_tarball(path, {'package/package.json':manifest}, 'core')
                else: check_tarball(path, {'package/package.json':manifest}, 'core')

    def test_tarball_exact_members_and_bytes(self):
        expected = {'package/dist/index.js': b'export const fixture = true;\n'}
        def archive(rows):
            tmp = tempfile.NamedTemporaryFile(suffix='.tgz', delete=False); tmp.close()
            path = Path(tmp.name)
            with tarfile.open(path, 'w:gz') as tar:
                for name, data, kind in rows:
                    member=tarfile.TarInfo(name); member.type=kind; member.size=len(data)
                    tar.addfile(member, io.BytesIO(data))
            self.addCleanup(path.unlink)
            return path
        clean=[('package/dist/index.js', expected['package/dist/index.js'], tarfile.REGTYPE)]
        check_tarball(archive(clean), expected, 'core')
        for rows in (clean+clean, clean+[('package/raw.csv',b'x',tarfile.REGTYPE)],
                     [('package/dist/index.js', b'embedded copied data', tarfile.REGTYPE)],
                     [('package/dist/index.js', b'', tarfile.SYMTYPE)],
                     [('../escape',b'x',tarfile.REGTYPE)], []):
            with self.assertRaises(ValueError): check_tarball(archive(rows), expected, 'core')

if __name__ == '__main__': unittest.main()
