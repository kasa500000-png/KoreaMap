#!/usr/bin/env python3
"""Operator-only offline SDF glyph builder. Original code; fonts keep their licenses.

The optional image/scientific tools are imported only while generating glyphs.
Importing this module, building the SDK or installing packages never downloads fonts.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
import hashlib
import importlib
import json
from pathlib import Path
import re
import shutil
import sys
import tempfile

FONT_SIZE = 24
BORDER = 3
SCALE = 4
RADIUS = 8
CUTOFF = 0.25
TOOL_VERSIONS = {
    'PIL': '12.3.0', 'numpy': '2.3.5', 'scipy': '1.17.0', 'fontTools': '4.61.1'
}
MAX_FONT_BYTES = 64 * 1024 * 1024
REQUIRED = set(range(0x20, 0x7f)) | set(range(0x1100, 0x1200)) | set(range(0x3131, 0x318f)) | set(range(0xac00, 0xd7a4))
# Entire requested blocks are generated where the reviewed font has a glyph.
BASE_BLOCKS = [(0x20, 0x100), (0x1100, 0x1200), (0x2000, 0x2070),
               (0x3000, 0x3040), (0x3130, 0x3190), (0xac00, 0xd800)]
CJK_BLOCK = (0x4e00, 0xa000)


class GlyphError(ValueError):
    """Stable non-sensitive code; do not attach local source paths or font data."""


def require(condition, code):
    if not condition:
        raise GlyphError(code)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def varint(value):
    require(type(value) is int and 0 <= value <= 0xffffffffffffffff, 'INVALID_PROTOBUF_INTEGER')
    output = bytearray()
    while value >= 128:
        output.append((value & 127) | 128)
        value >>= 7
    output.append(value)
    return bytes(output)


def uint_field(tag, value):
    return varint(tag << 3) + varint(value)


def sint_field(tag, value):
    require(type(value) is int and -(2 ** 31) <= value < 2 ** 31, 'INVALID_GLYPH_METRIC')
    return uint_field(tag, value * 2 if value >= 0 else -value * 2 - 1)


def bytes_field(tag, value):
    return varint((tag << 3) | 2) + varint(len(value)) + value


def encode_glyph(codepoint, bitmap, width, height, left, top, advance):
    require(type(codepoint) is int and 0 <= codepoint <= 0x10ffff, 'INVALID_CODEPOINT')
    require(all(type(v) is int and 0 <= v <= 128 for v in (width, height, advance)), 'INVALID_GLYPH_METRIC')
    require(len(bitmap) == (width + 2 * BORDER) * (height + 2 * BORDER), 'INVALID_BITMAP_LENGTH')
    return (uint_field(1, codepoint) + bytes_field(2, bitmap) + uint_field(3, width)
            + uint_field(4, height) + sint_field(5, left) + sint_field(6, top)
            + uint_field(7, advance))


def encode_range(fontstack, range_name, glyphs):
    validate_fontstack(fontstack)
    require(re.fullmatch(r'\d+-\d+', range_name) is not None, 'INVALID_RANGE')
    start, end = map(int, range_name.split('-'))
    require(start % 256 == 0 and end == start + 255 and end <= 0x10ffff, 'INVALID_RANGE')
    font = bytes_field(1, fontstack.encode('utf-8')) + bytes_field(2, range_name.encode('ascii'))
    for glyph in glyphs:
        font += bytes_field(3, glyph)
    return bytes_field(1, font)


def validate_fontstack(value):
    require(isinstance(value, str) and re.fullmatch(r'[A-Za-z][A-Za-z0-9 _-]{0,63}', value) is not None,
            'INVALID_FONTSTACK')


def read_reviewed_file(path, expected_sha, limit, code):
    require(re.fullmatch(r'[0-9a-f]{64}', expected_sha or '') is not None, 'INVALID_SHA256')
    require(path.is_file() and not path.is_symlink(), code)
    require(0 < path.stat().st_size <= limit, code)
    data = path.read_bytes()
    require(sha256(data) == expected_sha, 'SHA256_MISMATCH')
    return data


def validate_output(output):
    require(not output.is_symlink(), 'UNSAFE_OUTPUT')
    root = Path(__file__).resolve().parents[3]
    resolved = output.resolve()
    # Project payloads belong only in ignored artifacts; an operator may use external storage.
    if resolved == root or root in resolved.parents:
        artifacts = root / 'artifacts'
        require(resolved != artifacts and artifacts in resolved.parents, 'OUTPUT_MUST_BE_OPERATOR_STORAGE')
    require(not output.exists() or (output.is_dir() and not any(output.iterdir())), 'OUTPUT_EXISTS')


def optional_tools():
    tools = {}
    try:
        for module, version in TOOL_VERSIONS.items():
            loaded = importlib.import_module(module)
            require(loaded.__version__ == version, 'OPTIONAL_TOOL_VERSION_MISMATCH')
            tools[module] = loaded
        tools['Image'] = importlib.import_module('PIL.Image')
        tools['ImageDraw'] = importlib.import_module('PIL.ImageDraw')
        tools['ImageFont'] = importlib.import_module('PIL.ImageFont')
        tools['ndimage'] = importlib.import_module('scipy.ndimage')
        tools['TTFont'] = importlib.import_module('fontTools.ttLib').TTFont
    except ImportError as error:
        raise GlyphError('OPTIONAL_GLYPH_TOOLS_REQUIRED') from error
    return tools


def rasterize(font, codepoint, tools):
    """Render four-times sampled glyph, then encode signed distance at 24 px/em.

    Metrics exclude the three-pixel PBF border. The top metric uses the same
    25 px baseline convention as the official MapLibre Font Maker at 24 px/em.
    The independent distance transform is performed on a supersampled mask;
    no upstream rasterizer or SDF implementation is copied into this project.
    """
    import math
    np = tools['numpy']
    letter = chr(codepoint)
    x0, y0, x1, y1 = font.getbbox(letter, anchor='ls')
    left = math.floor(x0 / SCALE)
    top_edge = math.floor(y0 / SCALE)
    right = math.ceil(x1 / SCALE)
    bottom = math.ceil(y1 / SCALE)
    width, height = max(0, right - left), max(0, bottom - top_edge)
    advance = round(font.getlength(letter) / SCALE)
    if not width or not height:
        # Whitespace is non-inking, but its advance remains significant.
        width = height = 0
        bitmap = bytes((2 * BORDER) ** 2)
        return encode_glyph(codepoint, bitmap, width, height, 0, -25, advance)
    require(width <= 128 and height <= 128, 'GLYPH_TOO_LARGE')
    canvas = tools['Image'].new('L', ((width + 2 * BORDER) * SCALE, (height + 2 * BORDER) * SCALE))
    draw = tools['ImageDraw'].Draw(canvas)
    draw.text(((BORDER - left) * SCALE, (BORDER - top_edge) * SCALE), letter,
              font=font, fill=255, anchor='ls')
    mask = np.asarray(canvas) >= 128
    require(bool(mask.any()), 'EMPTY_REQUIRED_GLYPH')
    distance = (tools['ndimage'].distance_transform_edt(mask)
                - tools['ndimage'].distance_transform_edt(~mask)) / SCALE
    # Sample the center of each output pixel. The buffer lies within the SDF;
    # the GPU's separate atlas padding prevents glyph-to-glyph bleed.
    sampled = distance[SCALE // 2::SCALE, SCALE // 2::SCALE]
    encoded = np.rint(np.clip(255 * (1 - CUTOFF + sampled / RADIUS), 0, 255)).astype(np.uint8)
    return encode_glyph(codepoint, encoded.tobytes(), width, height, left, -top_edge - 25, advance)


def selected_codepoints(cmap, *, include_cjk=False, include_bmp=False):
    """Select supported Unicode scalars; never turn .notdef into coverage."""
    supported = {cp for cp, name in cmap.items()
                 if type(cp) is int and 0 <= cp <= 0x10ffff
                 and not 0xd800 <= cp <= 0xdfff
                 and isinstance(name, str) and name and name != '.notdef'}
    if include_bmp:
        return sorted(cp for cp in supported if cp <= 0xffff)
    blocks = BASE_BLOCKS + ([CJK_BLOCK] if include_cjk else [])
    return sorted(cp for cp in supported if any(start <= cp < end for start, end in blocks))


def grouped_ranges(codepoints, *, include_bmp=False):
    """Complete BMP endpoints include valid empty messages for unsupported blocks."""
    groups = defaultdict(list)
    if include_bmp:
        for start in range(0, 0x10000, 256):
            groups[start] = []
    for cp in codepoints:
        groups[(cp // 256) * 256].append(cp)
    return groups


def build_pack(*, font_path, font_sha, face, output, fontstack, license_id, license_file,
               operator_opt_in, include_cjk=False, include_bmp=False):
    require(operator_opt_in is True, 'OPERATOR_OPT_IN_REQUIRED')
    validate_fontstack(fontstack)
    require(license_id == 'OFL-1.1', 'UNREVIEWED_FONT_LICENSE')
    require(type(face) is int and 0 <= face <= 32, 'INVALID_FONT_FACE')
    read_reviewed_file(font_path, font_sha, MAX_FONT_BYTES, 'INVALID_FONT_FILE')
    require(license_file.is_file() and not license_file.is_symlink()
            and 0 < license_file.stat().st_size <= 128 * 1024, 'LICENSE_NOTICE_REQUIRED')
    notice = license_file.read_bytes()
    require(b'SIL OPEN FONT LICENSE' in notice and b'Version 1.1' in notice,
            'OFL_NOTICE_REQUIRED')
    validate_output(output)
    tools = optional_tools()
    try:
        metadata = tools['TTFont'](font_path, fontNumber=face, lazy=False)
        cmap = metadata.getBestCmap() or {}
        records = metadata['name'].names
        copyrights = sorted({n.toUnicode() for n in records if n.nameID == 0})
        license_metadata = [n.toUnicode() for n in records if n.nameID == 13]
        require(copyrights, 'FONT_COPYRIGHT_REQUIRED')
        require(any('Open Font License' in value and 'Version 1.1' in value
                    for value in license_metadata), 'FONT_LICENSE_METADATA_REQUIRED')
        face_names = sorted({n.toUnicode() for n in records if n.nameID == 1})
        font_versions = sorted({n.toUnicode() for n in records if n.nameID == 5})
        metadata.close()
        missing = REQUIRED.difference(selected_codepoints(cmap, include_bmp=True))
        require(not missing, 'REQUIRED_GLYPH_MISSING')
        font = tools['ImageFont'].truetype(str(font_path), FONT_SIZE * SCALE, index=face)
    except GlyphError:
        raise
    except Exception as error:
        raise GlyphError('FONT_PARSE_FAILED') from error
    codepoints = selected_codepoints(cmap, include_cjk=include_cjk, include_bmp=include_bmp)
    require(REQUIRED.issubset(codepoints), 'REQUIRED_GLYPH_MISSING')
    groups = grouped_ranges(codepoints, include_bmp=include_bmp)
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix='.glyphs-', dir=output.parent))
    try:
        stack_dir = staging / fontstack
        stack_dir.mkdir()
        records = []
        for start, ids in sorted(groups.items()):
            name = f'{start}-{start + 255}'
            data = encode_range(fontstack, name, [rasterize(font, cp, tools) for cp in ids])
            (stack_dir / f'{name}.pbf').write_bytes(data)
            records.append({'file': f'{fontstack}/{name}.pbf', 'sha256': sha256(data),
                            'bytes': len(data), 'glyphCount': len(ids), 'range': name})
        distribution_notice = ('\n'.join(copyrights).encode('utf-8')
                               + b'\n\n' + notice)
        (staging / 'LICENSE.txt').write_bytes(distribution_notice)
        manifest = {
            'schemaVersion': 1, 'format': 'maplibre-glyph-pbf', 'fontstack': fontstack,
            'fontSha256': font_sha, 'face': face, 'license': license_id,
            'licenseSha256': sha256(distribution_notice), 'licenseFile': 'LICENSE.txt',
            'fontCopyright': copyrights, 'fontFaceNames': face_names, 'fontVersions': font_versions,
            'fontSize': FONT_SIZE, 'border': BORDER, 'sdfRadius': RADIUS, 'sdfCutoff': CUTOFF,
            'supersampling': SCALE, 'tools': TOOL_VERSIONS,
            'coverage': {'requiredCount': len(REQUIRED), 'glyphCount': len(codepoints),
                         'modernHangulCount': 11172, 'requiredMissing': [],
                         'includeCjk': include_cjk or include_bmp, 'includeBmp': include_bmp,
                         'emptyRangeCount': sum(not ids for ids in groups.values()),
                         'bmpGlyphCount': sum(cp <= 0xffff for cp in codepoints),
                         'bmpMissingCount': 0x10000 - 0x800 - len(codepoints) if include_bmp else None,
                         'cjkGlyphCount': sum(CJK_BLOCK[0] <= cp < CJK_BLOCK[1] for cp in codepoints),
                         'cjkMissingCount': len(set(range(*CJK_BLOCK)).difference(codepoints)) if include_cjk or include_bmp else None},
            'codepoints': codepoints, 'files': records,
            'limitations': 'Codepoint glyphs, not a shaping engine; old Hangul/emoji/complex scripts and every CJK character are not guaranteed.'
        }
        (staging / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
        # Revalidate before replacing an empty output directory to avoid clobbering a pack.
        validate_output(output)
        if output.exists():
            output.rmdir()
        staging.rename(output)
        return manifest
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--font', required=True, type=Path)
    parser.add_argument('--sha256', required=True)
    parser.add_argument('--face', type=int, default=0)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--fontstack', required=True)
    parser.add_argument('--license', required=True, dest='license_id')
    parser.add_argument('--license-file', required=True, type=Path)
    parser.add_argument('--operator-opt-in', action='store_true')
    parser.add_argument('--include-cjk', action='store_true')
    parser.add_argument('--include-bmp', action='store_true')
    args = parser.parse_args()
    manifest = build_pack(font_path=args.font, font_sha=args.sha256, face=args.face,
                          output=args.output, fontstack=args.fontstack, license_id=args.license_id,
                          license_file=args.license_file, operator_opt_in=args.operator_opt_in,
                          include_cjk=args.include_cjk, include_bmp=args.include_bmp)
    print(json.dumps({'status': 'GENERATED_LOCAL_ONLY', 'fontstack': manifest['fontstack'],
                      'fontSha256': manifest['fontSha256'], 'coverage': manifest['coverage'],
                      'ranges': len(manifest['files']), 'nativeRenderingVerified': False}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (GlyphError, OSError) as error:
        print(json.dumps({'status': 'FAIL', 'code': str(error) if isinstance(error, GlyphError) else 'GLYPH_IO_FAILED'}), file=sys.stderr)
        sys.exit(1)
