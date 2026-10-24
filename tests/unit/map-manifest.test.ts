import { expect, it } from 'vitest';
import { mapDemoChunkCandidates } from '../e2e-web/map-manifest';

it('finds the actual map module on Windows and POSIX without broadening module selection', () => {
  for (const key of ['app/map-client.tsx -> ./map-demo', 'app\\map-client.tsx -> ./map-demo']) {
    expect(
      mapDemoChunkCandidates({
        [key]: { files: ['static/chunks/123.hash.js'] },
        'app/other.tsx -> ./map-demo': { files: ['static/chunks/other.js'] },
      }),
    ).toEqual(['static/chunks/123.hash.js']);
  }
});

it('rejects missing, ambiguous or unsafe module metadata', () => {
  const key = 'app/map-client.tsx -> ./map-demo';
  for (const manifest of [null, [], {}, { [key]: null }, { [key]: {} }])
    expect(() => mapDemoChunkCandidates(manifest)).toThrow();
  expect(() =>
    mapDemoChunkCandidates({
      [key]: { files: ['static/chunks/one.js'] },
      'app\\map-client.tsx -> ./map-demo': { files: ['static/chunks/two.js'] },
    }),
  ).toThrow(/exactly one/);
  for (const files of [
    [],
    ['../escape.js'],
    ['static/chunks/../escape.js'],
    ['static\\chunks\\one.js'],
    ['static/chunks/one.css'],
    [null],
    Array.from({ length: 9 }, (_, i) => `static/chunks/${i}.js`),
  ])
    expect(() => mapDemoChunkCandidates({ [key]: { files } })).toThrow(/chunk paths/);
});
