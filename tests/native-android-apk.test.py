import importlib.util
import hashlib
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch
import warnings
import zipfile
import zlib

spec = importlib.util.spec_from_file_location('apk_verifier', Path(__file__).resolve().parents[1] / 'scripts/verify-native-apk.py')
apk_verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(apk_verifier)


def elf():
    value = bytearray(128)
    value[:7] = b'\x7fELF\x02\x01\x01'
    struct.pack_into('<HHI', value, 16, 3, 62, 1)
    struct.pack_into('<QQ', value, 32, 64, 0)
    struct.pack_into('<HHHHH', value, 52, 64, 56, 1, 64, 0)
    struct.pack_into('<IIQQQQQQ', value, 64, 1, 5, 0, 0, 0, 128, 128, 4096)
    return bytes(value)


class ApkTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name)
        self.apk = self.directory / 'synthetic.apk'
        self.generated = self.directory / 'index.android.bundle'
        self.bundle = b'"use strict"; globalThis.synthetic = true;\n'

    def tearDown(self):
        self.temp.cleanup()

    def archive(self, extra=(), bundle=None, library=None, compression=zipfile.ZIP_STORED):
        self.generated.write_bytes(self.bundle if bundle is None else bundle)
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', UserWarning)
            with zipfile.ZipFile(self.apk, 'w', compression=compression) as archive:
                archive.writestr('assets/index.android.bundle', self.bundle if bundle is None else bundle)
                archive.writestr('lib/x86_64/libmaplibre.so', elf() if library is None else library)
                for name, data in extra:
                    # ZipInfo normalizes backslashes on Windows. Preserve malicious fixture
                    # names explicitly so the verifier sees the same raw ZIP on every OS.
                    info = zipfile.ZipInfo(name)
                    info.filename = name
                    info.orig_filename = name
                    info.compress_type = compression
                    archive.writestr(info, data)

    def verify(self):
        return apk_verifier.verify_apk(self.apk, self.generated)

    def test_js_and_hermes_match_generated_bytes_and_report_native_identity(self):
        for bundle in [self.bundle, apk_verifier.HERMES_MAGIC + bytes(128)]:
            self.archive(bundle=bundle)
            result = self.verify()
            self.assertEqual(result['status'], 'PASS')
            self.assertEqual(result['bundle']['sha256'], hashlib.sha256(bundle).hexdigest())
            self.assertEqual(result['bundle']['generatedSha256'], result['bundle']['sha256'])
            self.assertEqual(result['libraries'][0]['machine'], 'x86_64')
            self.assertEqual(result['libraries'][0]['bytes'], 128)
            self.assertTrue(result['zip']['crcVerified'])

    def test_mismatched_or_empty_bundle_cannot_pass(self):
        self.archive()
        self.generated.write_bytes(b'globalThis.differentGeneration = true;')
        with self.assertRaisesRegex(ValueError, 'BUNDLE_GENERATION_MISMATCH'):
            self.verify()
        self.archive(bundle=b'')
        with self.assertRaises(ValueError):
            self.verify()

    def test_binary_inventory_is_not_license_approval_even_with_a_misleading_notice(self):
        notice = b'Authored synthetic notice fixture; not actual license permission.'
        model = b'authored model fixture'
        self.archive(extra=[('assets/THIRD_PARTY_NOTICES.txt', notice), ('assets/model.tflite', model), ('lib/x86_64/libanother.so', b'authored candidate, not ELF proof')])
        result = self.verify()
        inventory = result['binaryNoticeInventory']
        self.assertEqual(result['status'], 'PASS')  # Payload verification only.
        self.assertFalse(inventory['complete'])
        self.assertFalse(inventory['distributionReady'])
        self.assertEqual(inventory['licenseCompliance'], 'NOT_EVALUATED')
        self.assertEqual(inventory['dependencyGraph'], 'NOT_PROVIDED')
        self.assertEqual(inventory['candidateCounts'], {'notices': 1, 'nativeLibraries': 2, 'modelAssets': 1})
        candidate = inventory['noticeCandidates'][0]
        self.assertEqual(candidate, {'file': 'assets/THIRD_PARTY_NOTICES.txt', 'bytes': len(notice), 'sha256': hashlib.sha256(notice).hexdigest(), 'textStatus': 'UTF8_TEXT_CANDIDATE'})
        self.assertNotIn(notice.decode(), str(inventory))
        self.assertEqual(inventory['modelAssetCandidates'][0]['sha256'], hashlib.sha256(model).hexdigest())

    def test_empty_binary_and_oversize_notice_candidates_do_not_become_license_text(self):
        self.archive(extra=[('META-INF/LICENSE.empty', b''), ('META-INF/NOTICE.binary', b'\xff\x00'), ('META-INF/NOTICE.large', b'authored fixture' * 4)])
        with patch.object(apk_verifier, 'MAX_NOTICE_TEXT', 32):
            inventory = self.verify()['binaryNoticeInventory']
        self.assertEqual([entry['textStatus'] for entry in inventory['noticeCandidates']], ['EMPTY', 'NON_UTF8_CANDIDATE', 'OVERSIZE_NOT_ANALYZED'])
        self.assertFalse(inventory['distributionReady'])

    def test_inventory_metadata_is_bounded_without_skipping_crc_verification(self):
        self.archive(extra=[('assets/LICENSE.first', b'first'), ('assets/NOTICE.second', b'late-notice-payload')])
        with patch.object(apk_verifier, 'MAX_INVENTORY_ITEMS', 1):
            inventory = self.verify()['binaryNoticeInventory']
            self.assertEqual(inventory['candidateCounts']['notices'], 2)
            self.assertEqual(len(inventory['noticeCandidates']), 1)
            self.assertTrue(inventory['metadataTruncated'])
            self.apk.write_bytes(self.apk.read_bytes().replace(b'late-notice-payload', b'LATE-notice-payload', 1))
            with self.assertRaisesRegex(ValueError, 'CRC'):
                self.verify()

    def test_absent_notice_candidates_and_extra_metadata_never_change_release_readiness(self):
        self.archive()
        inventory = self.verify()['binaryNoticeInventory']
        self.assertEqual(inventory['noticeCandidates'], [])
        self.assertEqual(inventory['candidateCounts']['notices'], 0)
        self.assertEqual(inventory['licenseCompliance'], 'NOT_EVALUATED')
        self.assertFalse(inventory['complete'])

    def test_duplicate_entries_and_unsafe_paths_are_rejected_without_extraction(self):
        for name in ['assets/index.android.bundle', '../escape', '/absolute', 'lib\\escape', 'C:/drive', 'a//b', 'a/./b']:
            with self.subTest(name=name):
                self.archive(extra=[(name, b'synthetic')])
                with self.assertRaisesRegex(ValueError, 'ZIP_DUPLICATE_ENTRY|ZIP_PATH_INVALID'):
                    self.verify()
        self.assertEqual(sorted(path.name for path in self.directory.iterdir()), ['index.android.bundle', 'synthetic.apk'])

    def test_symlink_entries_are_not_accepted(self):
        self.archive()
        info = zipfile.ZipInfo('link')
        info.create_system = 3
        info.external_attr = 0o120777 << 16
        with zipfile.ZipFile(self.apk, 'a') as archive:
            archive.writestr(info, '../outside')
        with self.assertRaisesRegex(ValueError, 'ZIP_FILE_TYPE_INVALID'):
            self.verify()

    def test_crc_is_verified_for_non_required_entries_too(self):
        self.archive(extra=[('assets/synthetic.txt', b'crc-test-marker')])
        self.apk.write_bytes(self.apk.read_bytes().replace(b'crc-test-marker', b'crc-FAIL-marker', 1))
        with self.assertRaisesRegex(ValueError, 'CRC'):
            self.verify()

    def change_sizes(self, name, *, packed=None, expanded=None, crc=None):
        with zipfile.ZipFile(self.apk) as archive:
            info = archive.getinfo(name)
        raw = bytearray(self.apk.read_bytes())
        position = raw.index(b'PK\x01\x02')
        while True:
            name_size, extra_size, comment_size = struct.unpack_from('<HHH', raw, position + 28)
            if raw[position + 46:position + 46 + name_size].decode() == name:
                break
            position += 46 + name_size + extra_size + comment_size
        for value, local_offset, central_offset in [(crc, 14, 16), (packed, 18, 20), (expanded, 22, 24)]:
            if value is not None:
                struct.pack_into('<I', raw, info.header_offset + local_offset, value)
                struct.pack_into('<I', raw, position + central_offset, value)
        self.apk.write_bytes(raw)

    def test_stored_bytes_cannot_hide_trailing_data_behind_a_short_prefix_crc(self):
        marker = b'prefix-extra-raw-bytes'
        self.archive(extra=[('assets/size.txt', marker)])
        self.change_sizes('assets/size.txt', expanded=6, crc=zlib.crc32(marker[:6]))
        with self.assertRaisesRegex(ValueError, 'ZIP_STORED_SIZE_MISMATCH'):
            self.verify()

    def test_deflate_requires_true_output_size_and_stream_eof(self):
        self.archive(compression=zipfile.ZIP_DEFLATED)
        self.assertEqual(self.verify()['status'], 'PASS')
        marker = b'prefix-hidden-expanded-bytes' * 4
        self.archive(extra=[('assets/size.txt', marker)], compression=zipfile.ZIP_DEFLATED)
        self.change_sizes('assets/size.txt', expanded=6, crc=zlib.crc32(marker[:6]))
        with self.assertRaisesRegex(ValueError, 'ZIP_ACTUAL_SIZE_MISMATCH'):
            self.verify()
        self.archive(extra=[('assets/size.txt', marker)], compression=zipfile.ZIP_DEFLATED)
        with zipfile.ZipFile(self.apk) as archive:
            packed = archive.getinfo('assets/size.txt').compress_size
        self.change_sizes('assets/size.txt', packed=packed - 1)
        with self.assertRaisesRegex(ValueError, 'ZIP_DEFLATE_INCOMPLETE'):
            self.verify()
        self.archive(extra=[('assets/size.txt', marker)], compression=zipfile.ZIP_DEFLATED)
        with zipfile.ZipFile(self.apk) as archive:
            info = archive.getinfo('assets/size.txt')
            central_start = archive.start_dir
        raw = bytearray(self.apk.read_bytes())
        # Last entry ends immediately before the central directory; insert junk into its raw stream.
        raw[central_start:central_start] = b'JUNK'
        end_record = raw.rfind(b'PK\x05\x06')
        struct.pack_into('<I', raw, end_record + 16, central_start + 4)
        self.apk.write_bytes(raw)
        self.change_sizes('assets/size.txt', packed=info.compress_size + 4)
        with self.assertRaisesRegex(ValueError, 'ZIP_DEFLATE_TRAILING_DATA'):
            self.verify()

    def test_archive_and_expanded_entry_limits_are_enforced(self):
        self.archive()
        for key, limit, expected in [('MAX_APK', 32, 'FILE_SIZE_INVALID'), ('MAX_ENTRY', 64, 'ZIP_ENTRY_SIZE_LIMIT'), ('MAX_TOTAL', 64, 'ZIP_TOTAL_SIZE_LIMIT')]:
            with self.subTest(key=key), patch.object(apk_verifier, key, limit):
                with self.assertRaisesRegex(ValueError, expected):
                    self.verify()

    def test_empty_wrong_architecture_and_out_of_bounds_elf_cannot_pass(self):
        wrong_arch = bytearray(elf())
        struct.pack_into('<H', wrong_arch, 18, 183)
        wrong_bounds = bytearray(elf())
        struct.pack_into('<Q', wrong_bounds, 32, 4096)
        wrong_segment = bytearray(elf())
        struct.pack_into('<Q', wrong_segment, 64 + 32, 4096)
        for library in [b'', b'not an ELF', bytes(wrong_arch), bytes(wrong_bounds), bytes(wrong_segment)]:
            with self.subTest(length=len(library)):
                self.archive(library=library)
                with self.assertRaises(ValueError):
                    self.verify()


if __name__ == '__main__':
    unittest.main()
