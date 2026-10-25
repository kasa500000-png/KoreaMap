import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, rm, readFile, writeFile, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import {
  readOperatorFile,
  validateEvidence,
  validateSmokeDatabase,
  probeOfficialSourcePage,
  main,
} from '../scripts/verify-real-poi.mjs';

const catalog = JSON.parse(readFileSync('data/sources.json', 'utf8'));
const now = new Date('2026-10-20T00:00:00.000Z');
function config() {
  const source = catalog.sources.find((value) => value.id === 'yongsan-parking');
  const original = new URL(source.sourceUrl);
  original.pathname = '/operator-reviewed-original.csv';
  return {
    sourceId: source.id,
    operatorOptIn: true,
    realSourceAcknowledged: true,
    sourcePageUrl: source.sourceUrl,
    reviewedLicense: source.license,
    expectedRows: 1,
    originalUrl: original.href,
    expectedHeader: ['합성명칭', '합성주소', '합성경도', '합성위도'],
    retrievedAt: '2026-10-19T00:00:00.000Z',
    sourceFile: 'artifacts/real-poi/operator-original.csv',
    controlPoints: [
      {
        source_id: 'authored-test-only',
        wgs84: [127, 37.5],
        toleranceMeters: 10,
        referenceNote: 'Authored test control only; not a real facility verification.',
      },
    ],
  };
}
test('actual-file evidence requires exact source/license/header and independently reviewed location controls', () => {
  assert.equal(validateEvidence(config(), catalog, now).profile.srid, 4326);
  const keyedOriginal = new URL(config().originalUrl);
  keyedOriginal.searchParams.set('secret', '<test-only>');
  for (const change of [
    { sourceId: 'parks-standard' },
    { realSourceAcknowledged: false },
    { operatorOptIn: false },
    { sourcePageUrl: catalog.sources[0].sourceUrl },
    { reviewedLicense: 'MIT' },
    ...[undefined, null, '7', 0, -1, 1.5, 100001].map((expectedRows) => ({ expectedRows })),
    { expectedHeader: [] },
    { expectedHeader: ['name', 'name'] },
    { retrievedAt: '2026-10-21T00:00:00Z' },
    { originalUrl: catalog.sources.find((value) => value.id === 'yongsan-parking').sourceUrl },
    { originalUrl: 'https://unapproved.invalid/file.csv' },
    { originalUrl: keyedOriginal.href },
    { controlPoints: [] },
    { controlPoints: [{ ...config().controlPoints[0], toleranceMeters: 31 }] },
    { controlPoints: [{ ...config().controlPoints[0], wgs84: [37.5, 127] }] },
  ])
    assert.throws(() => validateEvidence({ ...config(), ...change }, catalog, now));
});

const officialSource = catalog.sources.find((value) => value.id === 'yongsan-parking');
function metadataResponse(status, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new globalThis.Headers({ 'content-type': 'text/html; charset=utf-8', ...headers }),
    body: { async cancel() {} },
    async text() {
      throw new Error('Metadata probe must never consume a response body');
    },
  };
}
test('metadata probes default to one exact official request without reading a body or claiming CSV success', async () => {
  const calls = [];
  let cancellations = 0;
  const response = metadataResponse(503);
  response.body.cancel = async () => {
    cancellations++;
  };
  const result = await probeOfficialSourcePage(officialSource, {
    fetcher: async (...args) => {
      calls.push(args);
      return response;
    },
    wait: async () => assert.fail('Default probe must not back off or retry'),
    now: () => now,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], officialSource.sourceUrl);
  assert.equal(calls[0][1].redirect, 'error');
  assert.equal(calls[0][1].credentials, 'omit');
  assert.deepEqual(calls[0][1].headers, { Accept: 'text/html' });
  assert.equal(cancellations, 1);
  assert.equal(result.status, 503);
  assert.equal(result.retryOnce, false);
  assert.equal(result.attempts[0].retryDecision, 'not-requested');
  assert.equal(result.contentType, 'text/html');
  const page = await probeOfficialSourcePage(officialSource, {
    fetcher: async () => metadataResponse(200),
  });
  assert.equal(page.result, 'page-only-not-original-csv');
  await assert.rejects(
    probeOfficialSourcePage({ ...officialSource, sourceUrl: 'https://unapproved.invalid/' }),
    /EXACT_OFFICIAL_POI_PAGE_REQUIRED/,
  );
});
test('explicit retries honor seconds and HTTP-date Retry-After within a two-request limit', async () => {
  for (const [header, expected] of [
    [null, 1000],
    ['0', 1000],
    ['2', 2000],
    ['5', 5000],
    ['Tue, 20 Oct 2026 00:00:03 GMT', 3000],
  ]) {
    let count = 0;
    const pauses = [];
    const result = await probeOfficialSourcePage(officialSource, {
      retryOnce: true,
      now: () => now,
      fetcher: async () => {
        count++;
        return metadataResponse(503, header === null ? {} : { 'retry-after': header });
      },
      wait: async (milliseconds) => pauses.push(milliseconds),
    });
    assert.equal(count, 2);
    assert.deepEqual(pauses, [expected]);
    assert.equal(result.attempts.length, 2);
    assert.equal(result.attempts[0].retryDecision, 'retry-scheduled');
    assert.equal(result.attempts[1].retryDecision, 'retry-limit-reached');
    assert.equal(result.result, 'http-error');
  }
  for (const status of [429, 502, 503, 504]) {
    let count = 0;
    const result = await probeOfficialSourcePage(officialSource, {
      retryOnce: true,
      fetcher: async () => metadataResponse(count++ === 0 ? status : 200),
      wait: async () => {},
    });
    assert.equal(count, 2);
    assert.equal(result.status, 200);
    assert.equal(result.result, 'page-only-not-original-csv');
  }
});
test('invalid or over-budget Retry-After avoids a second request and never prints its raw value', async () => {
  for (const header of [
    '',
    '-1',
    '1.5',
    'operator-private-looking-text',
    '6',
    '999999999999999999999999999999999999999999',
    'Tue, 20 Oct 2026 00:00:06 GMT',
  ]) {
    let count = 0;
    const result = await probeOfficialSourcePage(officialSource, {
      retryOnce: true,
      now: () => now,
      fetcher: async () => {
        count++;
        return metadataResponse(503, { 'retry-after': header });
      },
      wait: async () => assert.fail('Unusable Retry-After must not schedule another request'),
    });
    assert.equal(count, 1);
    assert.match(result.attempts[0].retryDecision, /^retry-after-(?:invalid|over-budget)$/);
    assert(!JSON.stringify(result).includes('operator-private-looking-text'));
    assert.equal(result.result, 'http-error');
  }
});
test('authorization failures, redirects and network exceptions never trigger retry or expose response errors', async () => {
  for (const status of [301, 302, 307, 401, 403, 404, 500]) {
    let count = 0;
    const result = await probeOfficialSourcePage(officialSource, {
      retryOnce: true,
      fetcher: async () => {
        count++;
        return metadataResponse(status);
      },
      wait: async () => assert.fail('Non-transient status must not retry'),
    });
    assert.equal(count, 1);
    assert.equal(result.attempts[0].retryDecision, 'not-retriable');
  }
  let count = 0;
  const result = await probeOfficialSourcePage(officialSource, {
    retryOnce: true,
    fetcher: async () => {
      count++;
      throw new Error('private-body-path-token');
    },
    wait: async () => assert.fail('A network/redirect error must not be retried'),
  });
  assert.equal(count, 1);
  assert.equal(result.result, 'network-timeout-or-redirect-error');
  assert(!JSON.stringify(result).includes('private-body-path-token'));
});
test('cancellation before a probe, during fetch and during backoff prevents subsequent requests', async () => {
  const before = new globalThis.AbortController();
  before.abort();
  assert.equal(
    (
      await probeOfficialSourcePage(officialSource, {
        signal: before.signal,
        fetcher: async () => assert.fail('Pre-cancelled probe must not fetch'),
      })
    ).attempts.length,
    0,
  );
  for (const phase of ['fetch', 'backoff']) {
    const controller = new globalThis.AbortController();
    let count = 0;
    let waiting;
    const waitStarted = new Promise((resolveStarted) => {
      waiting = resolveStarted;
    });
    const resultPromise = probeOfficialSourcePage(officialSource, {
      retryOnce: true,
      signal: controller.signal,
      fetcher: async (_url, options) => {
        count++;
        if (phase === 'fetch') {
          controller.abort();
          options.signal.throwIfAborted();
        }
        return metadataResponse(503);
      },
      wait: async (milliseconds, options) => {
        assert.equal(milliseconds, 1000);
        waiting();
        await new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(options.signal.reason), {
            once: true,
          });
        });
      },
    });
    if (phase === 'backoff') {
      await waitStarted;
      controller.abort();
    }
    const result = await resultPromise;
    assert.equal(count, 1);
    assert.equal(result.result, 'cancelled');
  }
  const controller = new globalThis.AbortController();
  let requests = 0;
  const productionWait = probeOfficialSourcePage(officialSource, {
    retryOnce: true,
    signal: controller.signal,
    fetcher: async () => {
      requests++;
      return metadataResponse(503);
    },
  });
  globalThis.setImmediate(() => controller.abort());
  assert.equal((await productionWait).result, 'cancelled');
  assert.equal(requests, 1);
});
test('per-attempt timeout still aborts a stalled fetch without retrying', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let count = 0;
  const resultPromise = probeOfficialSourcePage(officialSource, {
    retryOnce: true,
    fetcher: async (_url, options) => {
      count++;
      await new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), {
          once: true,
        });
      });
    },
    wait: async () => assert.fail('Timeout must not be retried'),
  });
  t.mock.timers.tick(25000);
  assert.equal((await resultPromise).result, 'network-timeout-or-redirect-error');
  assert.equal(count, 1);
});
test('a real ReadableStream with stalled cancellation cannot outlive the attempt deadline or trigger retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let notifyCancel;
  const cancelStarted = new Promise((resolveStarted) => {
    notifyCancel = resolveStarted;
  });
  let requests = 0;
  const body = new globalThis.ReadableStream({
    cancel() {
      notifyCancel();
      return new Promise(() => {});
    },
  });
  const pending = probeOfficialSourcePage(officialSource, {
    retryOnce: true,
    fetcher: async () => {
      requests++;
      return new globalThis.Response(body, { status: 200 });
    },
    wait: async () => assert.fail('A body-cleanup timeout must not retry'),
  });
  await cancelStarted;
  t.mock.timers.tick(25000);
  const result = await pending;
  assert.equal(requests, 1);
  assert.equal(result.status, 200);
  assert.equal(result.result, 'network-timeout-or-redirect-error');
  assert.equal(result.attempts[0].retryDecision, 'not-retriable');
  t.mock.timers.tick(100000);
  assert.equal(requests, 1);
});
test('external cancellation interrupts a real stalled body cleanup and cancels a scheduled retry', async () => {
  const controller = new globalThis.AbortController();
  let notifyCancel;
  const cancelStarted = new Promise((resolveStarted) => {
    notifyCancel = resolveStarted;
  });
  const body = new globalThis.ReadableStream({
    cancel() {
      notifyCancel();
      return new Promise(() => {});
    },
  });
  let requests = 0;
  const pending = probeOfficialSourcePage(officialSource, {
    retryOnce: true,
    signal: controller.signal,
    fetcher: async () => {
      requests++;
      return new globalThis.Response(body, { status: 503 });
    },
    wait: async () => assert.fail('Cancelled cleanup must not enter retry backoff'),
  });
  await cancelStarted;
  controller.abort();
  assert.equal((await pending).result, 'cancelled');
  assert.equal(requests, 1);
});
test('real stream cancel rejection or throw is a cleanup failure and cannot retry or report HTTP 200 success', async () => {
  for (const status of [200, 503]) {
    for (const rejection of ['throw', 'reject']) {
      let requests = 0;
      const body = new globalThis.ReadableStream({
        cancel() {
          const error = new Error('private-cleanup-error-body');
          if (rejection === 'throw') throw error;
          return Promise.reject(error);
        },
      });
      const result = await probeOfficialSourcePage(officialSource, {
        retryOnce: true,
        fetcher: async () => {
          requests++;
          return new globalThis.Response(body, { status });
        },
        wait: async () => assert.fail('A failed body cleanup must not retry'),
      });
      assert.equal(requests, 1);
      assert.equal(result.status, status);
      assert.equal(result.result, 'body-cleanup-failed');
      assert.equal(result.attempts[0].retryDecision, 'not-retriable');
      assert(!JSON.stringify(result).includes('private-cleanup-error-body'));
    }
  }
});
test('remote Content-Type is reduced to known MIME classes and never copies private-looking header text', async () => {
  for (const [header, expected] of [
    ['TEXT/HTML; charset=utf-8; private-looking-value', 'text/html'],
    ['text/plain; operator-private-looking-value', 'text/plain'],
    ['application/json', 'application/json'],
    ['operator-private-looking-value', 'UNKNOWN'],
    ['text/x-operator-private-looking-value', 'UNKNOWN'],
    ['', 'UNKNOWN'],
  ]) {
    const result = await probeOfficialSourcePage(officialSource, {
      fetcher: async () => metadataResponse(503, { 'content-type': header }),
    });
    assert.equal(result.contentType, expected);
    assert.equal(result.attempts[0].contentType, expected);
    assert(!JSON.stringify(result).includes('private-looking-value'));
  }
});
test('CLI accepts no implicit retry arguments or duplicate retry flags', async () => {
  for (const args of [
    ['probe', '--retry'],
    ['probe', '--retry-once', '--retry-once'],
    ['probe', '--url=https://unapproved.invalid/'],
  ])
    await assert.rejects(main(args));
});
test('database smoke cannot use a remote, ordinary, credential-less or unacknowledged database', () => {
  const url = new URL('postgresql://127.0.0.1/kmk_real_poi');
  url.username = 'operator';
  url.password = randomBytes(16).toString('hex');
  validateSmokeDatabase(url.href, 'disposable-real-poi');
  for (const change of [
    { hostname: 'db.unapproved.invalid' },
    { pathname: '/kmk' },
    { pathname: '/postgres' },
    { search: '?sslmode=disable' },
    { password: '' },
  ]) {
    const changed = new URL(url);
    for (const [key, value] of Object.entries(change)) changed[key] = value;
    assert.throws(() => validateSmokeDatabase(changed.href, 'disposable-real-poi'));
  }
  assert.throws(() => validateSmokeDatabase(url.href));
});

test('file validation accounts for original rows and duplicates without inferring trail coordinates', async () => {
  await mkdir('artifacts/real-poi', { recursive: true });
  const directory = await mkdtemp(resolve('artifacts/real-poi/row-count-'));
  const source = catalog.sources.find((value) => value.id === 'bukgu-walking');
  // Authored data only; quoted newlines must count as one CSV record.
  const bytes = Buffer.from(
    'name,address,note\r\nauthored-trail,authored-address,"authored\nnote"\r\nauthored-trail,authored-address,"authored\nnote"\r\n',
  );
  const file = resolve(directory, 'authored.csv');
  const path = resolve(directory, 'config.json');
  const input = {
    ...config(),
    sourceId: source.id,
    sourcePageUrl: source.sourceUrl,
    expectedHeader: ['name', 'address', 'note'],
    expectedRows: 2,
    sourceFile: file,
    controlPoints: [],
    encoding: 'utf-8',
    snapshotUpdatedAt: '2025-11-20T00:00:00.000Z',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    columns: { name: 'name', address: 'address' },
  };
  const output = resolve('artifacts/real-poi/verification.json');
  const previousReport = await readFile(output).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  const originalLog = console.log;
  const logs = [];
  console.log = (value) => logs.push(value);
  try {
    await writeFile(file, bytes);
    await writeFile(path, JSON.stringify(input));
    await main(['validate', path]);
    const report = JSON.parse(readFileSync(output, 'utf8'));
    assert.equal(report.originalRows, 2);
    assert.equal(report.rows, 1);
    assert.equal(report.duplicateRows, 1);
    assert.equal(report.rowsWithoutCoordinates, 1);
    assert.equal(report.rowCount, 'exact-operator-reviewed-match');
    assert.equal(report.database, 'not-executed');
    assert.equal(report.sdkSearch, 'not-executed');
    assert(!logs.join('').includes('authored-address'));
    for (const expectedRows of [1, 3]) {
      await writeFile(path, JSON.stringify({ ...input, expectedRows }));
      await assert.rejects(main(['validate', path]), /ORIGINAL_ROW_COUNT_MISMATCH/);
      assert.equal(JSON.parse(readFileSync(output, 'utf8')).status, 'failed');
    }
  } finally {
    console.log = originalLog;
    if (previousReport === null) await rm(output, { force: true });
    else await writeFile(output, previousReport);
    await rm(directory, { recursive: true, force: true });
  }
});
test('raw-file verifier bounds reads and refuses paths or links outside ignored operator storage', async () => {
  await mkdir('artifacts/real-poi', { recursive: true });
  const directory = await mkdtemp(resolve('artifacts/real-poi/check-'));
  const outside = `${directory}-outside-authored-test.txt`;
  try {
    const file = resolve(directory, 'authored-only.csv');
    await writeFile(file, 'authored test bytes');
    assert.equal((await readOperatorFile(file, 100, directory)).toString(), 'authored test bytes');
    await assert.rejects(readOperatorFile(file, 2, directory), /OPERATOR_FILE_TOO_LARGE/u);
    await writeFile(outside, 'authored outside bytes');
    await assert.rejects(
      readOperatorFile(outside, 100, directory),
      /USE_IGNORED_REAL_POI_STORAGE/u,
    );
    if (process.platform !== 'win32') {
      const link = resolve(directory, 'symlink.csv');
      await symlink(outside, link);
      await assert.rejects(
        readOperatorFile(link, 100, directory),
        /REGULAR_OPERATOR_FILE_REQUIRED/u,
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(outside, { force: true });
  }
});
