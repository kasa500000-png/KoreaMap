// Original MIT protobuf writer for small synthetic MVT fixtures; no imported map geometry.
export function mvtInteger(input) {
  let value = BigInt(input);
  const bytes = [];
  do {
    bytes.push(Number(value & 127n) | (value > 127n ? 128 : 0));
    value >>= 7n;
  } while (value);
  return Buffer.from(bytes);
}
export const mvtScalar = (field, value) =>
  Buffer.concat([mvtInteger(field * 8), mvtInteger(value)]);
export const mvtBytes = (field, value) =>
  Buffer.concat([mvtInteger(field * 8 + 2), mvtInteger(value.length), value]);
export const mvtPacked = (field, values) => mvtBytes(field, Buffer.concat(values.map(mvtInteger)));
export function authoredMvt(label = 'Authored fixture', schema = 'design-v1', layer = 'road') {
  const attrs = {
    kind: layer,
    name: label,
    ...(schema === 'design-v2'
      ? { fid: 'way/123', subclass: 'primary', rank: 20, minzoom: 0 }
      : { class: 'major' }),
  };
  const entries = Object.entries(attrs);
  const value = (input) =>
    typeof input === 'number' ? mvtScalar(4, input) : mvtBytes(1, Buffer.from(input));
  const feature = Buffer.concat([
    mvtScalar(1, 123),
    mvtPacked(
      2,
      entries.flatMap((_, i) => [i, i]),
    ),
    mvtScalar(3, 2),
    mvtPacked(4, [9, 0, 0, 10, 32, 32]),
  ]);
  return mvtBytes(
    3,
    Buffer.concat([
      mvtBytes(1, Buffer.from(layer)),
      mvtBytes(2, feature),
      ...entries.map(([key]) => mvtBytes(3, Buffer.from(key))),
      ...entries.map(([, input]) => mvtBytes(4, value(input))),
      mvtScalar(5, 4096),
      mvtScalar(15, 2),
    ]),
  );
}
