import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  parseRealTileOptions,
  renderedSummary,
  localResourceKind,
} from '../scripts/verify-real-tiles.mjs';
import { parseRealRoutingMapOptions } from '../scripts/verify-real-routing-map.mjs';

const flags = () => [
  '--operator-opt-in',
  `--store=${resolve('artifacts/tiles')}`,
  `--glyphs=${resolve('artifacts/tiles/glyphs-bmp')}`,
  '--web-origin=http://127.0.0.1:4173',
  '--port=8787',
];
test('request audit counts both legacy and immutable generation tile URLs', () => {
  assert.equal(localResourceKind('/tiles/14/13970/6346.pbf'), 'tiles');
  assert.equal(
    localResourceKind('/datasets/1792488349559-c91461a3/tiles/14/13970/6346.pbf'),
    'tiles',
  );
  assert.equal(localResourceKind('/datasets/unreviewed/tiles/14/1/1.pbf'), null);
  assert.equal(localResourceKind('/styles/standard.json'), 'styles');
  assert.equal(localResourceKind('/glyphs/pack/KoreaNoto/0-255.pbf'), 'glyphs');
  assert.equal(localResourceKind('/unrelated/tiles/foo'), null);
});
test('real tile QA requires explicit opt-in, absolute local inputs and exact loopback origin', () => {
  assert.equal(parseRealTileOptions(flags()).port, 8787);
  assert.throws(() => parseRealTileOptions(flags().slice(1)), /opt-in/);
  for (const value of [
    '--store=relative-input',
    '--web-origin=https://tiles.example.invalid',
    '--web-origin=http://127.0.0.1:4173/path',
    '--port=4173',
  ]) {
    const key = value.split('=')[0];
    assert.throws(() =>
      parseRealTileOptions([...flags().filter((flag) => !flag.startsWith(`${key}=`)), value]),
    );
  }
  assert.throws(() => parseRealTileOptions([...flags(), '--unexpected=1']));
  assert.throws(
    () =>
      parseRealTileOptions([
        ...flags().filter((flag) => !flag.startsWith('--web-origin=')),
        '--web-origin=untrusted-value',
      ]),
    (error) => /exact loopback/.test(error.message) && !Object.hasOwn(error, 'input'),
  );
});
test('real tile feature evidence cannot treat pending, missing or malformed summaries as counts', () => {
  assert.deepEqual(renderedSummary('화면 도로 12개 · 건물 34개 · 라벨 5개'), {
    roads: 12,
    buildings: 34,
    labels: 5,
  });
  assert.equal(renderedSummary('연결 전'), null);
  assert.equal(renderedSummary('화면 도로 NaN개 · 건물 34개 · 라벨 5개'), null);
  assert.equal(renderedSummary(null), null);
});

test('real routing-map QA needs explicit operator inputs and cannot silently select an endpoint', () => {
  const flags = [
    '--operator-opt-in',
    `--store=${resolve('artifacts/tiles')}`,
    `--glyphs=${resolve('artifacts/tiles/glyphs-bmp')}`,
    `--dataset-file=${resolve('artifacts/routing/korea/operator-manifest.json')}`,
    '--engine-url=http://127.0.0.1:8002',
  ];
  assert.equal(parseRealRoutingMapOptions(flags).endpoint, 'http://127.0.0.1:8002/route');
  assert.throws(() => parseRealRoutingMapOptions(flags.slice(1)), /opt-in/);
  assert.throws(() => parseRealRoutingMapOptions(flags.slice(0, -1)), /engine-url/);
  for (const endpoint of [
    'http://operator.example.invalid/route',
    'http://127.0.0.1:8002/other',
    'http://127.0.0.1:8002/route' + '?token=synthetic',
  ])
    assert.throws(() =>
      parseRealRoutingMapOptions([...flags.slice(0, -1), `--engine-url=${endpoint}`]),
    );
  assert.throws(() => parseRealRoutingMapOptions([...flags, '--unexpected=1']));
});
