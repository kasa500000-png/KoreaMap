// Original tiny OSM-format graph, MIT. Not surveyed roads or imported OSM content.
// A minimal uncompressed PBF writer avoids downloading data/tools in routing tests.
function varint(input) {
  let n = BigInt(input);
  const out = [];
  while (n > 127n) {
    out.push(Number(n & 127n) | 128);
    n >>= 7n;
  }
  out.push(Number(n));
  return Buffer.from(out);
}
const concat = (...parts) => Buffer.concat(parts.flat());
const scalar = (key, value) => concat(varint(key * 8), varint(value));
const bytes = (key, value) => concat(varint(key * 8 + 2), varint(value.length), value);
const zig = (value) => {
  const n = BigInt(value);
  return n < 0n ? -2n * n - 1n : 2n * n;
};
const packed = (key, values) => bytes(key, concat(values.map(varint)));
function block(type, raw) {
  const blob = bytes(1, raw);
  const header = concat(bytes(1, Buffer.from(type)), scalar(3, blob.length));
  const size = Buffer.alloc(4);
  size.writeUInt32BE(header.length);
  return concat(size, header, blob);
}
export const fixturePoints = {
  start: [127, 37.5],
  corner: [127, 37.502],
  finish: [127.004, 37.502],
  via: [127.004, 37.5],
  island: [127.02, 37.5],
  broken: [127.007, 37.502],
};
export function routingFixturePbf() {
  const coords = [
    fixturePoints.start,
    fixturePoints.corner,
    fixturePoints.finish,
    fixturePoints.via,
    [127.002, 37.501],
    fixturePoints.island,
    [127.022, 37.5],
    fixturePoints.broken,
    [127.009, 37.502],
  ];
  const strings = [''];
  const index = (s) => {
    if (!strings.includes(s)) strings.push(s);
    return strings.indexOf(s);
  };
  const ways = [
    [[1, 2, 3], { highway: 'residential', maxspeed: '30' }],
    [[1, 4, 3], { highway: 'residential', oneway: 'yes', maxspeed: '20' }],
    [[1, 5, 3], { highway: 'footway', foot: 'yes', bicycle: 'no', motor_vehicle: 'no' }],
    [[2, 4], { highway: 'cycleway', bicycle: 'yes', foot: 'no', motor_vehicle: 'no' }],
    [[6, 7], { highway: 'residential' }],
    [[8, 9], { highway: 'residential' }],
  ].map(([refs, tags], i) => {
    let last = 0;
    return bytes(
      3,
      concat(
        scalar(1, i + 100),
        packed(2, Object.keys(tags).map(index)),
        packed(3, Object.values(tags).map(index)),
        packed(
          8,
          refs.map((n) => {
            const delta = n - last;
            last = n;
            return zig(delta);
          }),
        ),
      ),
    );
  });
  const nodes = coords.map(([lon, lat], i) =>
    bytes(
      1,
      concat(
        scalar(1, zig(i + 1)),
        scalar(8, zig(Math.round(lat * 1e7))),
        scalar(9, zig(Math.round(lon * 1e7))),
      ),
    ),
  );
  return concat(
    block('OSMHeader', bytes(4, Buffer.from('OsmSchema-V0.6'))),
    block(
      'OSMData',
      concat(
        bytes(1, concat(strings.map((s) => bytes(1, Buffer.from(s))))),
        bytes(2, concat(nodes, ways)),
      ),
    ),
  );
}
