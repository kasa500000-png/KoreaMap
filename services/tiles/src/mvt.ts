import { invariant } from './config.js';

/** Original bounded protobuf/MVT structure checks; no renderer or third-party decoder dependency. */
class Reader {
  offset = 0;
  constructor(readonly bytes: Uint8Array) {}
  get done(): boolean {
    return this.offset === this.bytes.length;
  }
  uint32(): number {
    let value = 0,
      factor = 1;
    for (let i = 0; i < 5; i++) {
      invariant(this.offset < this.bytes.length, 'TRUNCATED_MVT');
      const byte = this.bytes[this.offset++]!;
      invariant(i < 4 || byte <= 15, 'INVALID_MVT_VARINT');
      value += (byte & 127) * factor;
      if (byte < 128) return value;
      factor *= 128;
    }
    throw new Error('INVALID_MVT_VARINT');
  }
  uint64(): void {
    for (let i = 0; i < 10; i++) {
      invariant(this.offset < this.bytes.length, 'TRUNCATED_MVT');
      const byte = this.bytes[this.offset++]!;
      invariant(i < 9 || byte <= 1, 'INVALID_MVT_VARINT');
      if (byte < 128) return;
    }
    throw new Error('INVALID_MVT_VARINT');
  }
  fixed(length: number): Uint8Array {
    invariant(length <= this.bytes.length - this.offset, 'TRUNCATED_MVT');
    const result = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }
  message(): Uint8Array {
    return this.fixed(this.uint32());
  }
  tag(): [number, number] {
    const tag = this.uint32(),
      field = tag >>> 3,
      wire = tag & 7;
    invariant(field > 0, 'INVALID_MVT_FIELD');
    invariant(wire === 0 || wire === 1 || wire === 2 || wire === 5, 'INVALID_MVT_WIRE');
    return [field, wire];
  }
  skip(wire: number): void {
    if (wire === 0) this.uint64();
    else if (wire === 1) this.fixed(8);
    else if (wire === 2) this.message();
    else if (wire === 5) this.fixed(4);
    else throw new Error('INVALID_MVT_WIRE');
  }
}
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
function text(bytes: Uint8Array): string {
  try {
    return utf8.decode(bytes);
  } catch {
    throw new Error('INVALID_MVT_UTF8');
  }
}
function wireIs(wire: number, expected: number): void {
  invariant(wire === expected, 'INVALID_MVT_WIRE');
}
function value(bytes: Uint8Array): void {
  const reader = new Reader(bytes);
  let values = 0;
  while (!reader.done) {
    const [field, wire] = reader.tag();
    if (field === 1) {
      wireIs(wire, 2);
      text(reader.message());
      values++;
    } else if (field === 2 || field === 3) {
      wireIs(wire, field === 2 ? 5 : 1);
      const bytes = reader.fixed(field === 2 ? 4 : 8);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      invariant(
        Number.isFinite(field === 2 ? view.getFloat32(0, true) : view.getFloat64(0, true)),
        'INVALID_MVT_VALUE',
      );
      values++;
    } else if (field >= 4 && field <= 6) {
      wireIs(wire, 0);
      reader.uint64();
      values++;
    } else if (field === 7) {
      wireIs(wire, 0);
      invariant(reader.uint32() <= 1, 'INVALID_MVT_VALUE');
      values++;
    } else reader.skip(wire);
  }
  invariant(values === 1, 'INVALID_MVT_VALUE');
}
function* tokens(parts: Array<Uint8Array | number>): Generator<number> {
  for (const part of parts) {
    if (typeof part === 'number') yield part;
    else {
      const reader = new Reader(part);
      while (!reader.done) yield reader.uint32();
    }
  }
}
function geometry(type: number, parts: Array<Uint8Array | number>): void {
  const input = tokens(parts);
  const next = () => {
    const item = input.next();
    invariant(!item.done, 'TRUNCATED_MVT_GEOMETRY');
    return item.value;
  };
  let started = false,
    closed = false,
    points = 0,
    x = 0,
    y = 0;
  const complete = () =>
    invariant(type === 1 ? started : type === 2 ? points >= 2 : closed, 'INVALID_MVT_GEOMETRY');
  for (let command = input.next(); !command.done; command = input.next()) {
    const id = command.value & 7,
      count = command.value >>> 3;
    invariant(count > 0, 'INVALID_MVT_GEOMETRY');
    if (id === 1) {
      if (started) complete();
      invariant(type === 1 || count === 1, 'INVALID_MVT_GEOMETRY');
      started = true;
      closed = false;
      points = 0;
    } else if (id === 2) invariant(type !== 1 && started && !closed, 'INVALID_MVT_GEOMETRY');
    else if (id === 7) {
      invariant(
        type === 3 && started && !closed && points >= 3 && count === 1,
        'INVALID_MVT_GEOMETRY',
      );
      closed = true;
      continue;
    } else throw new Error('INVALID_MVT_GEOMETRY');
    for (let i = 0; i < count; i++) {
      const dx = next(),
        dy = next();
      x += dx % 2 ? -(dx + 1) / 2 : dx / 2;
      y += dy % 2 ? -(dy + 1) / 2 : dy / 2;
      invariant(
        x >= -2147483648 && x <= 2147483647 && y >= -2147483648 && y <= 2147483647,
        'INVALID_MVT_GEOMETRY',
      );
      points++;
    }
  }
  complete();
}
function feature(bytes: Uint8Array, keys: number, values: number): void {
  const reader = new Reader(bytes),
    tags: number[] = [],
    shape: Array<Uint8Array | number> = [];
  let type = 0,
    typeSeen = false;
  while (!reader.done) {
    const [field, wire] = reader.tag();
    if (field === 1) {
      wireIs(wire, 0);
      reader.uint64();
    } else if (field === 2) {
      invariant(wire === 0 || wire === 2, 'INVALID_MVT_WIRE');
      const input = wire === 0 ? [reader.uint32()] : tokens([reader.message()]);
      for (const tag of input) {
        invariant(tags.length < 4096, 'OVERSIZE_MVT_TAGS');
        tags.push(tag);
      }
    } else if (field === 3) {
      wireIs(wire, 0);
      invariant(!typeSeen, 'DUPLICATE_MVT_FIELD');
      type = reader.uint32();
      typeSeen = true;
    } else if (field === 4) {
      invariant(wire === 0 || wire === 2, 'INVALID_MVT_WIRE');
      invariant(shape.length < 4096, 'OVERSIZE_MVT_GEOMETRY_PARTS');
      shape.push(wire === 0 ? reader.uint32() : reader.message());
    } else reader.skip(wire);
  }
  invariant(type >= 1 && type <= 3, 'INVALID_MVT_GEOMETRY_TYPE');
  invariant(tags.length % 2 === 0, 'INVALID_MVT_TAGS');
  for (let i = 0; i < tags.length; i += 2)
    invariant(tags[i]! < keys && tags[i + 1]! < values, 'INVALID_MVT_TAG_INDEX');
  geometry(type, shape);
}
function layer(bytes: Uint8Array, declared: ReadonlySet<string>, known: Set<string>): void {
  const reader = new Reader(bytes),
    features: Uint8Array[] = [];
  let name: string | undefined,
    version = 0,
    versionSeen = false,
    extentSeen = false,
    keys = 0,
    values = 0;
  while (!reader.done) {
    const [field, wire] = reader.tag();
    if (field === 1) {
      wireIs(wire, 2);
      invariant(name === undefined, 'DUPLICATE_MVT_FIELD');
      name = text(reader.message());
    } else if (field === 2) {
      wireIs(wire, 2);
      invariant(features.length < 200000, 'OVERSIZE_MVT_FEATURES');
      features.push(reader.message());
    } else if (field === 3) {
      wireIs(wire, 2);
      text(reader.message());
      keys++;
    } else if (field === 4) {
      wireIs(wire, 2);
      value(reader.message());
      values++;
    } else if (field === 5) {
      wireIs(wire, 0);
      invariant(!extentSeen && reader.uint32() > 0, 'INVALID_MVT_EXTENT');
      extentSeen = true;
    } else if (field === 15) {
      wireIs(wire, 0);
      invariant(!versionSeen, 'DUPLICATE_MVT_FIELD');
      version = reader.uint32();
      versionSeen = true;
    } else reader.skip(wire);
  }
  invariant(name && declared.has(name) && !known.has(name), 'UNDECLARED_MVT_LAYER');
  invariant(version === 1 || version === 2, 'INVALID_MVT_VERSION');
  known.add(name);
  for (const bytes of features) feature(bytes, keys, values);
}
export function validateMvt(bytes: Uint8Array, declaredLayers: ReadonlySet<string>): void {
  const reader = new Reader(bytes),
    known = new Set<string>();
  while (!reader.done) {
    const [field, wire] = reader.tag();
    if (field === 3) {
      wireIs(wire, 2);
      invariant(known.size < 64, 'OVERSIZE_MVT_LAYERS');
      layer(reader.message(), declaredLayers, known);
    } else reader.skip(wire);
  }
  invariant(known.size > 0, 'EMPTY_MVT_TILE');
}
