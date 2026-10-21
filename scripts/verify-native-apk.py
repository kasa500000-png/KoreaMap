"""Private bounded APK verification. Uses only Python stdlib; never extracts ZIP paths."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import struct
import zipfile
import zlib

MAX_APK = 256 * 1024**2
MAX_ENTRY = 128 * 1024**2
MAX_BUNDLE = 64 * 1024**2
MAX_TOTAL = 768 * 1024**2
MAX_INVENTORY_ITEMS = 256
MAX_NOTICE_TEXT = 64 * 1024
HERMES_MAGIC = bytes.fromhex('c61fbc03c103191f')


def require(value, code):
    if not value:
        raise ValueError(code)


def file_digest(path, limit):
    require(path.is_file() and 0 < path.stat().st_size <= limit, 'FILE_SIZE_INVALID')
    digest = hashlib.sha256()
    total = 0
    with path.open('rb') as source:
        while chunk := source.read(1024 * 1024):
            total += len(chunk)
            require(total <= limit, 'FILE_SIZE_LIMIT')
            digest.update(chunk)
    return total, digest.hexdigest()


def elf_identity(data):
    require(len(data) >= 64 and data[:4] == b'\x7fELF', 'ELF_HEADER_INVALID')
    require(data[4:7] == b'\x02\x01\x01', 'ELF_CLASS_ENDIAN_INVALID')
    kind, machine, version = struct.unpack_from('<HHI', data, 16)
    require(kind == 3 and machine == 62 and version == 1, 'ELF_X86_64_REQUIRED')
    phoff, shoff = struct.unpack_from('<QQ', data, 32)
    ehsize, phsize, phnum, shsize, shnum, shnames = struct.unpack_from('<HHHHHH', data, 52)
    require(ehsize == 64 and phsize == 56 and 0 < phnum < 65535, 'ELF_TABLE_INVALID')
    require(phoff >= 64 and phoff + phsize * phnum <= len(data), 'ELF_PROGRAM_BOUNDS')
    require((shnum == 0 and shoff == 0 and shnames == 0) or (shnum > 0 and shsize == 64 and shoff >= 64 and shoff + shsize * shnum <= len(data) and shnames < shnum), 'ELF_SECTION_BOUNDS')
    loads = 0
    for index in range(phnum):
        kind, _, offset, _, _, filesz, memsz, _ = struct.unpack_from('<IIQQQQQQ', data, phoff + index * phsize)
        require(offset + filesz <= len(data), 'ELF_SEGMENT_BOUNDS')
        if kind == 1:
            require(memsz >= filesz, 'ELF_LOAD_SIZE_INVALID')
            loads += 1
    require(loads > 0, 'ELF_LOAD_REQUIRED')
    return {'class': 'ELF64', 'endian': 'little', 'machine': 'x86_64', 'type': 'shared-object', 'loadSegments': loads}


def entry_chunks(source, info, limit):
    """Verify raw stored/deflated bytes, not ZipExtFile's declared-size-truncated output."""
    source.seek(info.header_offset)
    header = source.read(30)
    require(len(header) == 30, 'ZIP_LOCAL_HEADER_TRUNCATED')
    signature, _, flags, method, _, _, crc, packed, expanded, name_size, extra_size = struct.unpack('<IHHHHHIIIHH', header)
    require(signature == 0x04034B50 and flags == info.flag_bits and method == info.compress_type, 'ZIP_LOCAL_HEADER_MISMATCH')
    name = source.read(name_size)
    require(len(name) == name_size and name.decode('utf-8' if flags & 0x800 else 'cp437') == info.orig_filename, 'ZIP_LOCAL_NAME_MISMATCH')
    require(len(source.read(extra_size)) == extra_size, 'ZIP_EXTRA_TRUNCATED')
    data_start = source.tell()
    require(data_start + info.compress_size <= limit, 'ZIP_DATA_OVERLAP')
    if not flags & 8:
        require((crc, packed, expanded) == (info.CRC, info.compress_size, info.file_size), 'ZIP_LOCAL_SIZE_MISMATCH')
    if method == zipfile.ZIP_STORED:
        require(info.compress_size == info.file_size, 'ZIP_STORED_SIZE_MISMATCH')
    decoder = zlib.decompressobj(-zlib.MAX_WBITS) if method == zipfile.ZIP_DEFLATED else None
    remaining = info.compress_size
    actual = 0
    checksum = 0
    while remaining:
        chunk = source.read(min(65536, remaining))
        require(chunk, 'ZIP_COMPRESSED_DATA_TRUNCATED')
        remaining -= len(chunk)
        pending = chunk
        while pending:
            decoded = decoder.decompress(pending, min(1024 * 1024, info.file_size + 1 - actual)) if decoder else pending
            tail = decoder.unconsumed_tail if decoder else b''
            require(not decoder or not decoder.unused_data, 'ZIP_DEFLATE_TRAILING_DATA')
            require(decoded or tail != pending, 'ZIP_DEFLATE_NO_PROGRESS')
            actual += len(decoded)
            require(actual <= info.file_size and actual <= MAX_ENTRY, 'ZIP_ACTUAL_SIZE_MISMATCH')
            checksum = zlib.crc32(decoded, checksum)
            yield decoded
            pending = tail
        require(not decoder or not decoder.eof or remaining == 0, 'ZIP_DEFLATE_TRAILING_DATA')
    require(not decoder or decoder.eof, 'ZIP_DEFLATE_INCOMPLETE')
    require(actual == info.file_size and checksum & 0xFFFFFFFF == info.CRC, 'ZIP_ACTUAL_CRC_OR_SIZE_MISMATCH')
    if flags & 8:
        # Accept either standard 32-bit data descriptor form; ZIP64 is unnecessary for bounded APKs.
        require(source.tell() + 12 <= limit, 'ZIP_DESCRIPTOR_TRUNCATED')
        descriptor = source.read(min(16, limit - source.tell()))
        candidates = [struct.unpack('<III', descriptor[:12])]
        if len(descriptor) >= 16 and descriptor[:4] == b'PK\x07\x08':
            candidates.append(struct.unpack('<III', descriptor[4:16]))
        require((info.CRC, info.compress_size, info.file_size) in candidates, 'ZIP_DESCRIPTOR_MISMATCH')


def verify_apk(apk, generated_bundle):
    apk = Path(apk)
    generated_bundle = Path(generated_bundle)
    apk_bytes, apk_sha = file_digest(apk, MAX_APK)
    generated_bytes, generated_sha = file_digest(generated_bundle, MAX_BUNDLE)
    bundle = None
    libraries = []
    notice_candidates = []
    native_candidates = []
    model_candidates = []
    candidate_counts = {'notices': 0, 'nativeLibraries': 0, 'modelAssets': 0}
    total = 0
    with zipfile.ZipFile(apk) as archive, apk.open('rb') as raw:
        entries = archive.infolist()
        require(0 < len(entries) <= 50000, 'ZIP_ENTRY_COUNT')
        offsets = sorted(info.header_offset for info in entries)
        require(len(set(offsets)) == len(entries) and offsets[0] >= 0, 'ZIP_HEADER_OFFSETS_INVALID')
        limits = dict(zip(offsets, offsets[1:] + [archive.start_dir]))
        names = set()
        for info in entries:
            name = info.orig_filename
            parts = name.rstrip('/').split('/')
            require(name and '\x00' not in name and '\\' not in name and ':' not in name and not name.startswith('/') and all(part not in ('', '.', '..') for part in parts), 'ZIP_PATH_INVALID')
            require(str(PurePosixPath(name)) == name.rstrip('/'), 'ZIP_PATH_INVALID')
            require(name not in names, 'ZIP_DUPLICATE_ENTRY')
            names.add(name)
            mode = stat.S_IFMT(info.external_attr >> 16)
            require(mode in (0, stat.S_IFREG, stat.S_IFDIR), 'ZIP_FILE_TYPE_INVALID')
            require(not info.flag_bits & 1 and info.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED), 'ZIP_ENCODING_UNSUPPORTED')
            require(0 <= info.file_size <= MAX_ENTRY and 0 <= info.compress_size <= MAX_APK, 'ZIP_ENTRY_SIZE_LIMIT')
            total += info.file_size
            require(total <= MAX_TOTAL, 'ZIP_TOTAL_SIZE_LIMIT')
        for info in entries:
            is_bundle = info.filename == 'assets/index.android.bundle'
            is_library = bool(re.fullmatch(r'lib/x86_64/[^/]*maplibre[^/]*\.so', info.filename, re.IGNORECASE))
            is_notice = not info.is_dir() and bool(re.search(r'(?:license|licence|notice|copyright|third[-_]party)', info.filename, re.IGNORECASE))
            is_native = bool(re.fullmatch(r'lib/[^/]+/[^/]+\.so', info.filename))
            is_model = info.filename.startswith('assets/') and bool(re.search(r'\.(?:tflite|onnx|pt|pth|task|model)$', info.filename, re.IGNORECASE))
            for matched, key in [(is_notice, 'notices'), (is_native, 'nativeLibraries'), (is_model, 'modelAssets')]:
                if matched:
                    candidate_counts[key] += 1
            if is_bundle:
                require(0 < info.file_size <= MAX_BUNDLE, 'BUNDLE_SIZE_INVALID')
            digest = hashlib.sha256()
            size = 0
            data = [] if is_library or is_bundle else None
            notice_data = [] if is_notice and len(notice_candidates) < MAX_INVENTORY_ITEMS and 0 < info.file_size <= MAX_NOTICE_TEXT else None
            for chunk in entry_chunks(raw, info, limits[info.header_offset]):
                size += len(chunk)
                require(size <= info.file_size and size <= MAX_ENTRY, 'ZIP_DECODE_SIZE_LIMIT')
                digest.update(chunk)
                if data is not None:
                    data.append(chunk)
                if notice_data is not None:
                    notice_data.append(chunk)
            require(size == info.file_size, 'ZIP_DECODE_SIZE_MISMATCH')
            if is_bundle:
                require(size == generated_bytes and digest.hexdigest() == generated_sha, 'BUNDLE_GENERATION_MISMATCH')
                payload = b''.join(data)
                if payload.startswith(HERMES_MAGIC):
                    require(size >= 128, 'HERMES_HEADER_TRUNCATED')
                    kind = 'HERMES_BYTECODE'
                else:
                    require('\x00' not in payload.decode('utf-8-sig') and payload.strip(), 'BUNDLE_TEXT_INVALID')
                    kind = 'UTF8_JAVASCRIPT_TEXT'
                bundle = {'file': info.filename, 'bytes': size, 'sha256': digest.hexdigest(), 'generatedSha256': generated_sha, 'format': kind}
            if is_library:
                require(size > 0, 'ELF_EMPTY')
                libraries.append({'file': info.filename, 'bytes': size, 'sha256': digest.hexdigest(), **elf_identity(b''.join(data))})
            record = {'file': info.filename, 'bytes': size, 'sha256': digest.hexdigest()}
            if is_native and len(native_candidates) < MAX_INVENTORY_ITEMS:
                native_candidates.append(record)
            if is_model and len(model_candidates) < MAX_INVENTORY_ITEMS:
                model_candidates.append(record)
            if is_notice and len(notice_candidates) < MAX_INVENTORY_ITEMS:
                text_status = 'EMPTY' if not size else 'OVERSIZE_NOT_ANALYZED'
                if notice_data is not None:
                    try:
                        text = b''.join(notice_data).decode('utf-8-sig')
                        text_status = 'UTF8_TEXT_CANDIDATE' if '\x00' not in text else 'BINARY_CANDIDATE'
                    except UnicodeDecodeError:
                        text_status = 'NON_UTF8_CANDIDATE'
                notice_candidates.append({**record, 'textStatus': text_status})
    require(bundle is not None, 'BUNDLE_MISSING')
    require(libraries, 'MAPLIBRE_LIBRARY_MISSING')
    inventory = {
        'schemaVersion': 1, 'status': 'INVENTORY_ONLY', 'complete': False,
        'scope': 'APK filename candidates and verified bytes only; not an exact dependency or license graph',
        'dependencyGraph': 'NOT_PROVIDED', 'licenseCompliance': 'NOT_EVALUATED', 'distributionReady': False,
        'candidateCounts': candidate_counts,
        'noticeCandidates': notice_candidates, 'nativeLibraryCandidates': native_candidates, 'modelAssetCandidates': model_candidates,
        'metadataTruncated': any(count > MAX_INVENTORY_ITEMS for count in candidate_counts.values()),
        'limits': {'maxItemsPerKind': MAX_INVENTORY_ITEMS, 'maxNoticeTextBytes': MAX_NOTICE_TEXT},
    }
    return {'status': 'PASS', 'apk': {'bytes': apk_bytes, 'sha256': apk_sha}, 'bundle': bundle, 'libraries': libraries, 'zip': {'entries': len(entries), 'uncompressedBytes': total, 'crcVerified': True}, 'binaryNoticeInventory': inventory}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--apk', required=True)
    parser.add_argument('--generated-bundle', required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(verify_apk(args.apk, args.generated_bundle)))
    except ValueError as error:
        code = str(error) if re.fullmatch('[A-Z0-9_]+', str(error)) else 'PAYLOAD_FORMAT_INVALID'
        raise SystemExit(f'APK_VERIFICATION_FAILED: {code}')
    except (OSError, zipfile.BadZipFile, RuntimeError, zlib.error):
        raise SystemExit('APK_VERIFICATION_FAILED: FILE_OR_ZIP_READ_FAILED')
