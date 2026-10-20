#!/usr/bin/env python3
"""Independent wire-format and admission tests; actual font tests need optional tools."""
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('glyphs', ROOT / 'services/tiles/src/glyphs.py')
glyphs = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(glyphs)
FONT = Path('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc')
HAS_TOOLS = all(importlib.util.find_spec(m) for m in ['PIL', 'scipy', 'numpy', 'fontTools'])


def fields(data):
    """Small independent protobuf reader to verify bytes, rather than roundtrip writer code."""
    pos, result = 0, []
    def integer():
        nonlocal pos
        value = shift = 0
        while True:
            if pos >= len(data) or shift >= 70:
                raise ValueError('invalid varint')
            byte = data[pos]
            pos += 1
            value |= (byte & 127) << shift
            if byte < 128:
                return value
            shift += 7
    while pos < len(data):
        key = integer()
        wire = key & 7
        if wire == 0:
            value = integer()
        elif wire == 2:
            size = integer()
            value = data[pos:pos + size]
            if len(value) != size:
                raise ValueError('truncated')
            pos += size
        else:
            raise ValueError('unreviewed wire')
        result.append((key >> 3, value))
    return result


def signed(value):
    return value // 2 if not value & 1 else -(value // 2) - 1


class GlyphTests(unittest.TestCase):
    def test_pbf_border_and_signed_metrics_match_maplibre_wire_contract(self):
        bitmap = bytes(range(72))
        encoded = glyphs.encode_glyph(0xd55c, bitmap, 2, 3, -2, -7, 23)
        value = dict(fields(encoded))
        self.assertEqual(value[1], 0xd55c)
        self.assertEqual(value[2], bitmap)
        self.assertEqual(len(value[2]), (value[3] + 6) * (value[4] + 6))
        self.assertEqual(signed(value[5]), -2)
        self.assertEqual(signed(value[6]), -7)
        self.assertEqual(value[7], 23)
        with self.assertRaisesRegex(glyphs.GlyphError, 'INVALID_BITMAP_LENGTH'):
            glyphs.encode_glyph(0xd55c, bytes(6), 2, 3, 0, 0, 20)

    def test_range_contains_stack_name_and_glyph_messages(self):
        raw = glyphs.encode_range('KoreaNoto', '54528-54783', [glyphs.encode_glyph(0xd55c, bytes(36), 0, 0, 0, -25, 22)])
        outer = fields(raw)
        self.assertEqual(outer[0][0], 1)
        stack = fields(outer[0][1])
        self.assertEqual(stack[0], (1, b'KoreaNoto'))
        self.assertEqual(stack[1], (2, b'54528-54783'))
        self.assertEqual(dict(fields(stack[2][1]))[1], 0xd55c)
        for invalid in ['1-256', '0-254', '../font', '65536-65790']:
            with self.assertRaises(glyphs.GlyphError):
                glyphs.encode_range('KoreaNoto', invalid, [])

    def test_empty_range_is_valid_without_fabricated_unsupported_glyph(self):
        raw = glyphs.encode_range('KoreaNoto', '65024-65279', [])
        font = fields(fields(raw)[0][1])
        self.assertEqual(font, [(1, b'KoreaNoto'), (2, b'65024-65279')])
        # A successful empty range is not a claim that variation selectors exist.
        self.assertEqual([value for tag, value in font if tag == 3], [])
        groups = glyphs.grouped_ranges([65], include_bmp=True)
        self.assertEqual(len(groups), 256)
        self.assertEqual(groups[0], [65])
        self.assertEqual(groups[65024], [])
        self.assertEqual(glyphs.grouped_ranges([65]), {0: [65]})

    def test_bmp_selection_excludes_notdef_surrogates_and_supplementary_points(self):
        cmap = {65: 'A', 0xfe0f: '.notdef', 0xfe10: 'vertical-comma',
                0xd800: 'surrogate', 0x10000: 'supplementary', 0x10400: ''}
        self.assertEqual(glyphs.selected_codepoints(cmap, include_bmp=True), [65, 0xfe10])
        self.assertEqual(glyphs.selected_codepoints(cmap), [65])
        self.assertNotIn(0xfe0f, glyphs.selected_codepoints(cmap, include_bmp=True))

    def test_fontstack_and_output_paths_cannot_escape_operator_storage(self):
        for name in ['../other', '/absolute', 'Korea/Noto', 'Korea,Noto', 'x\\y', '', 'x' * 65]:
            with self.assertRaises(glyphs.GlyphError):
                glyphs.validate_fontstack(name)
        with self.assertRaisesRegex(glyphs.GlyphError, 'OUTPUT_MUST_BE_OPERATOR_STORAGE'):
            glyphs.validate_output(ROOT / 'docs/generated-font')
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory)
            (p / 'sentinel').write_text('keep')
            with self.assertRaisesRegex(glyphs.GlyphError, 'OUTPUT_EXISTS'):
                glyphs.validate_output(p)
            self.assertEqual((p / 'sentinel').read_text(), 'keep')

    def test_sha_admission_does_not_trust_filename(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory) / 'reviewed.ttf'
            p.write_bytes(b'authored invalid font')
            with self.assertRaisesRegex(glyphs.GlyphError, 'SHA256_MISMATCH'):
                glyphs.read_reviewed_file(p, '0' * 64, 100, 'INVALID_FONT')
            self.assertEqual(glyphs.read_reviewed_file(p, hashlib.sha256(p.read_bytes()).hexdigest(), 100, 'INVALID_FONT'), p.read_bytes())

    def test_opt_in_and_license_fail_before_font_loading(self):
        with tempfile.TemporaryDirectory() as directory:
            args = dict(font_path=Path(directory) / 'missing.ttf', font_sha='0' * 64,
                        face=0, output=Path(directory) / 'out', fontstack='KoreaNoto',
                        license_id='OFL-1.1', license_file=Path(directory) / 'LICENSE.txt')
            with self.assertRaisesRegex(glyphs.GlyphError, 'OPERATOR_OPT_IN_REQUIRED'):
                glyphs.build_pack(**args, operator_opt_in=False)
            with self.assertRaisesRegex(glyphs.GlyphError, 'UNREVIEWED_FONT_LICENSE'):
                glyphs.build_pack(**{**args, 'license_id': 'MIT'}, operator_opt_in=True)
            self.assertFalse(args['output'].exists())

    def test_missing_required_hangul_is_rejected_before_rasterization(self):
        class Name:
            def __init__(self, number, value):
                self.nameID, self.value = number, value
            def toUnicode(self):
                return self.value
        class Metadata:
            def getBestCmap(self):
                return {65: 'authored-A'}
            def __getitem__(self, key):
                class Names:
                    names = [Name(0, 'Authored fixture copyright'),
                             Name(13, 'SIL Open Font License Version 1.1')]
                return Names()
            def close(self):
                pass
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory)
            font, notice = p / 'authored-font', p / 'notice'
            font.write_bytes(b'authored admission fixture')
            notice.write_text('SIL OPEN FONT LICENSE Version 1.1')
            with patch.object(glyphs, 'optional_tools', return_value={'TTFont': lambda *a, **k: Metadata()}):
                with self.assertRaisesRegex(glyphs.GlyphError, 'REQUIRED_GLYPH_MISSING'):
                    glyphs.build_pack(font_path=font, font_sha=hashlib.sha256(font.read_bytes()).hexdigest(),
                                      face=0, output=p / 'out', fontstack='KoreaNoto', license_id='OFL-1.1',
                                      license_file=notice, operator_opt_in=True)
            self.assertFalse((p / 'out').exists())

    @unittest.skipUnless(HAS_TOOLS and FONT.exists(), 'optional reviewed font/tool integration unavailable')
    def test_real_reviewed_font_has_all_required_hangul_and_nonempty_distinct_sdf(self):
        tools = glyphs.optional_tools()
        font_data = FONT.read_bytes()
        self.assertEqual(hashlib.sha256(font_data).hexdigest(), 'b76b0433203017ca80401b2ee0dd69350349871c4b19d504c34dbdd80541690a')
        metadata = tools['TTFont'](FONT, fontNumber=1)
        self.assertFalse(glyphs.REQUIRED.difference(metadata.getBestCmap()))
        metadata.close()
        font = tools['ImageFont'].truetype(str(FONT), 96, index=1)
        a, b = (dict(fields(glyphs.rasterize(font, ord(letter), tools))) for letter in ['한', '힣'])
        self.assertGreater(a[3], 10)
        self.assertGreater(a[4], 10)
        self.assertGreater(max(a[2]), 191)
        self.assertLess(min(a[2]), 128)
        self.assertNotEqual(a[2], b[2])
        space = dict(fields(glyphs.rasterize(font, 32, tools)))
        self.assertEqual((space[3], space[4], len(space[2])), (0, 0, 36))
        self.assertGreater(space[7], 0)

    @unittest.skipUnless(HAS_TOOLS, 'optional glyph tools unavailable')
    def test_corrupt_font_with_matching_hash_does_not_create_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            font = root / 'bad.ttf'
            font.write_bytes(b'authored nonfont')
            notice = root / 'LICENSE.txt'
            notice.write_text('SIL OPEN FONT LICENSE Version 1.1')
            with self.assertRaisesRegex(glyphs.GlyphError, 'FONT_PARSE_FAILED'):
                glyphs.build_pack(font_path=font, font_sha=hashlib.sha256(font.read_bytes()).hexdigest(),
                                  face=0, output=root / 'out', fontstack='KoreaNoto', license_id='OFL-1.1',
                                  license_file=notice, operator_opt_in=True)
            self.assertFalse((root / 'out').exists())


if __name__ == '__main__':
    unittest.main()
