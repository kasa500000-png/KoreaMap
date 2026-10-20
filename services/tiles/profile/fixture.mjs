// Original compact OSM-format tile fixture, MIT. No imported map data or surveyed place.
// Minimal protobuf encoding is based on the project's authored routing fixture writer.
function varint(input) {
  let value = BigInt(input);
  const out = [];
  while (value > 127n) {
    out.push(Number(value & 127n) | 128);
    value >>= 7n;
  }
  out.push(Number(value));
  return Buffer.from(out);
}
const concat = (...parts) => Buffer.concat(parts.flat());
const scalar = (field, value) => concat(varint(field * 8), varint(value));
const bytes = (field, value) => concat(varint(field * 8 + 2), varint(value.length), value);
const zig = (value) => {
  const integer = BigInt(value);
  return integer < 0n ? -2n * integer - 1n : 2n * integer;
};
const packed = (field, values) => bytes(field, concat(values.map(varint)));
function block(type, raw) {
  const blob = bytes(1, raw);
  const header = concat(bytes(1, Buffer.from(type)), scalar(3, blob.length));
  const size = Buffer.alloc(4);
  size.writeUInt32BE(header.length);
  return concat(size, header, blob);
}
const deltas = (values) => {
  let previous = 0;
  return values.map((value) => {
    const delta = value - previous;
    previous = value;
    return zig(delta);
  });
};
export const tileFixtureBounds = [126.99, 37.49, 127.04, 37.54];
export function tileFixturePbf(v2 = false) {
  const strings = [''];
  const index = (value) => {
    if (!strings.includes(value)) strings.push(value);
    return strings.indexOf(value);
  };
  const tags = (value) =>
    concat(packed(2, Object.keys(value).map(index)), packed(3, Object.values(value).map(index)));
  const nodes = [];
  const ways = [];
  function node(lon, lat, values = {}) {
    const id = nodes.length + 1;
    nodes.push(
      bytes(
        1,
        concat(
          scalar(1, zig(id)),
          tags(values),
          scalar(8, zig(Math.round(lat * 1e7))),
          scalar(9, zig(Math.round(lon * 1e7))),
        ),
      ),
    );
    return id;
  }
  function way(coordinates, values = {}, closed = false) {
    const refs = coordinates.map(([lon, lat]) => node(lon, lat));
    if (closed) refs.push(refs[0]);
    const id = ways.length + 100;
    ways.push(bytes(3, concat(scalar(1, id), tags(values), packed(8, deltas(refs)))));
    return id;
  }
  const ring = (x, y, size) => [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
  ];
  way(ring(127, 37.5, 0.003), { landuse: 'residential' }, true);
  way(
    ring(127.005, 37.5, 0.003),
    { leisure: 'park', 'name:ko': '합성공원', name: 'Authored Park' },
    true,
  );
  const waterOuter = way(ring(127.01, 37.5, 0.008), {}, true);
  const waterInner = way(ring(127.012, 37.502, 0.002), {}, true);
  way(
    ring(127.02, 37.5, 0.003),
    { building: 'yes', amenity: 'hospital', 'name:ko': '합성시설' },
    true,
  );
  way(
    [
      [127, 37.51],
      [127.02, 37.51],
    ],
    { highway: 'primary', 'name:ko': '합성큰길' },
  );
  way(
    [
      [127, 37.512],
      [127.02, 37.512],
    ],
    { highway: 'residential', name: 'Authored Minor' },
  );
  way(
    [
      [127, 37.514],
      [127.02, 37.514],
    ],
    { highway: 'footway', 'name:ko': '합성산책로' },
  );
  way(
    [
      [127, 37.516],
      [127.02, 37.516],
    ],
    { boundary: 'administrative', admin_level: '8' },
  );
  node(127.01, 37.52, {
    place: 'city',
    'name:ko': '합성시',
    name: 'Authored City',
    'name:en': 'Authored City English',
  });
  node(127.012, 37.522, { amenity: 'parking', 'name:ko': '합성주차장' });
  if (v2) {
    // All four labels deliberately share one low-zoom grid cell. IDs put the small city first.
    node(127.010001, 37.520001, { place: 'province', 'name:ko': '합성도' });
    node(127.010002, 37.520002, { place: 'city', 'name:ko': '합성소도시', population: '10000' });
    node(127.010003, 37.520003, { place: 'city', 'name:ko': '합성큰도시', population: '2000000' });
    node(127.010004, 37.520004, {
      place: 'city',
      'name:ko': '합성수도',
      capital: 'yes',
      population: '10000000',
    });
    way(
      [
        [127, 37.518],
        [127.02, 37.518],
      ],
      {
        highway: 'motorway',
        bridge: 'yes',
        layer: '1',
        ref: '7',
        'name:ko': '합성고속도로',
      },
    );
    way(
      [
        [127, 37.519],
        [127.02, 37.519],
      ],
      {
        railway: 'rail',
        tunnel: 'yes',
        layer: '-1',
        'name:ko': '합성철도',
      },
    );
    way(
      [
        [127.025, 37.5],
        [127.025, 37.52],
      ],
      { waterway: 'river', 'name:ko': '합성하천' },
    );
    node(127.025, 37.525, { railway: 'station', 'name:ko': '합성역' });
    // Deliberately clustered competitors exercise ranking/grid suppression through z16.
    node(127.025001, 37.525001, { railway: 'station', 'name:ko': '합성역후보' });
    node(127.012001, 37.522001, { amenity: 'parking', 'name:ko': '합성주차후보' });
    node(127.013, 37.523, { amenity: 'parking' });
  }
  const relation = bytes(
    4,
    concat(
      scalar(1, 200),
      tags({ type: 'multipolygon', natural: 'water', 'name:ko': '합성물' }),
      packed(8, ['outer', 'inner'].map(index)),
      packed(9, deltas([waterOuter, waterInner])),
      packed(10, [1, 1]),
    ),
  );
  return concat(
    block(
      'OSMHeader',
      concat(
        bytes(4, Buffer.from('OsmSchema-V0.6')),
        scalar(32, Math.floor(Date.parse('2026-10-18T00:00:00Z') / 1000)),
      ),
    ),
    block(
      'OSMData',
      concat(
        bytes(1, concat(strings.map((value) => bytes(1, Buffer.from(value))))),
        bytes(2, concat(nodes, ways, relation)),
      ),
    ),
  );
}
