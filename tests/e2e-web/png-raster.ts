import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';

/** Counts screenshot colors independently of SDK feature/state diagnostics. */
export function pngOpaqueColors(png: Buffer): number {
  assert(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
  const width = png.readUInt32BE(16),
    height = png.readUInt32BE(20);
  assert(width > 0 && height > 0 && width * height <= 4_000_000);
  assert(png[24] === 8 && [2, 6].includes(png[25]!) && png[28] === 0);
  const channels = png[25] === 6 ? 4 : 3,
    chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    assert(offset + length + 12 <= png.length);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT')
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const stride = width * channels;
  const data = inflateSync(Buffer.concat(chunks), { maxOutputLength: (stride + 1) * height });
  assert.equal(data.length, (stride + 1) * height);
  let previous = Buffer.alloc(stride),
    position = 0;
  const colors = new Set<number>();
  for (let y = 0; y < height; y++) {
    const filter = data[position++]!,
      row = Buffer.alloc(stride);
    assert(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? row[x - channels]! : 0,
        up = previous[x]!,
        upperLeft = x >= channels ? previous[x - channels]! : 0;
      let prediction = 0;
      if (filter === 1) prediction = left;
      if (filter === 2) prediction = up;
      if (filter === 3) prediction = Math.floor((left + up) / 2);
      if (filter === 4) {
        const p = left + up - upperLeft,
          a = Math.abs(p - left),
          b = Math.abs(p - up),
          c = Math.abs(p - upperLeft);
        prediction = a <= b && a <= c ? left : b <= c ? up : upperLeft;
      }
      row[x] = (data[position++]! + prediction) & 255;
    }
    for (let x = 0; x < stride; x += channels)
      if (channels === 3 || row[x + 3]! > 0)
        colors.add((row[x]! << 16) | (row[x + 1]! << 8) | row[x + 2]!);
    previous = row;
  }
  return colors.size;
}
