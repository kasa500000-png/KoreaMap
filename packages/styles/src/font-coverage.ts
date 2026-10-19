import { KitError } from '@korea-map-kit/core';
import { requiredCodePoints, auditGlyphCoverage } from './labels.js';
/** Inspect Unicode cmap formats 4/12 in an operator-supplied OpenType/TrueType/TTC file.
 * No fonts are bundled or downloaded. WOFF/WOFF2 and bitmap glyph PBF are not accepted.
 */
export function inspectFontCoverage(bytes: Uint8Array, labels: readonly string[], faceIndex = 0) {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const u16 = (offset: number) => view.getUint16(offset, false);
    const u32 = (offset: number) => view.getUint32(offset, false);
    const check = (offset: number, length: number) => {
      if (
        !Number.isSafeInteger(offset) ||
        !Number.isSafeInteger(length) ||
        offset < 0 ||
        length < 0 ||
        offset + length > bytes.length
      )
        throw new Error('Bounds');
    };
    if (!Number.isInteger(faceIndex) || faceIndex < 0) throw new Error('Face');
    let start = 0;
    if (u32(0) === 0x74746366) {
      const count = u32(8);
      if (faceIndex >= count) throw new Error('Face');
      start = u32(12 + faceIndex * 4);
    } else if (faceIndex !== 0) throw new Error('Face');
    if (![0x00010000, 0x4f54544f, 0x74727565].includes(u32(start))) throw new Error('Format');
    const count = u16(start + 4);
    check(start + 12, count * 16);
    let cmap = -1,
      cmapLength = 0;
    for (let i = 0; i < count; i++) {
      const record = start + 12 + i * 16;
      if (u32(record) === 0x636d6170) {
        cmap = u32(record + 8);
        cmapLength = u32(record + 12);
      }
    }
    if (cmap < 0) throw new Error('Missing cmap');
    check(cmap, cmapLength);
    const records = u16(cmap + 2);
    if (4 + records * 8 > cmapLength) throw new Error('Records');
    const subtables: { offset: number; format: number; length: number }[] = [];
    for (let i = 0; i < records; i++) {
      const record = cmap + 4 + i * 8,
        platform = u16(record),
        encoding = u16(record + 2);
      if (platform !== 0 && !(platform === 3 && (encoding === 1 || encoding === 10))) continue;
      const offset = cmap + u32(record + 4);
      check(offset, 4);
      if (offset < cmap || offset + 4 > cmap + cmapLength) throw new Error('Subtable');
      const format = u16(offset);
      if (format !== 4 && format !== 12) continue;
      const length = format === 12 ? u32(offset + 4) : u16(offset + 2);
      if (offset + length > cmap + cmapLength) throw new Error('Length');
      check(offset, length);
      if (length < (format === 12 ? 16 : 16)) throw new Error('Length');
      subtables.push({ offset, format, length });
    }
    if (!subtables.length) throw new Error('Unsupported cmap');
    const covers = (code: number) =>
      subtables.some(({ offset, format, length }) => {
        if (format === 12) {
          const groups = u32(offset + 12);
          if (16 + groups * 12 > length) throw new Error('Groups');
          for (let i = 0; i < groups; i++) {
            const group = offset + 16 + i * 12,
              start = u32(group),
              end = u32(group + 4);
            if (code >= start && code <= end) return u32(group + 8) + code - start !== 0;
          }
          return false;
        }
        if (code > 0xffff) return false;
        const segments = u16(offset + 6) / 2;
        if (!Number.isInteger(segments) || !segments || 16 + segments * 8 > length)
          throw new Error('Segments');
        const ends = offset + 14,
          starts = ends + segments * 2 + 2,
          deltas = starts + segments * 2,
          ranges = deltas + segments * 2;
        for (let i = 0; i < segments; i++) {
          if (code > u16(ends + i * 2) || code < u16(starts + i * 2)) continue;
          const delta = u16(deltas + i * 2),
            range = u16(ranges + i * 2);
          if (!range) return ((code + delta) & 0xffff) !== 0;
          const position = ranges + i * 2 + range + (code - u16(starts + i * 2)) * 2;
          if (position < offset || position + 2 > offset + length) throw new Error('Glyph bounds');
          const glyph = u16(position);
          return glyph !== 0 && ((glyph + delta) & 0xffff) !== 0;
        }
        return false;
      });
    const required = requiredCodePoints(labels);
    return auditGlyphCoverage(labels, required.filter(covers));
  } catch {
    throw new KitError('INVALID_ARGUMENT', 'INVALID_OR_UNSUPPORTED_FONT');
  }
}
