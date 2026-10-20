import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const cityNames = { seoul: '서울', ulsan: '울산', busan: '부산', jeju: '제주' };
const themes = ['standard', 'dark', 'pastel', 'outdoor'];
export function parseRealTileOptions(args) {
  assert(args.includes('--operator-opt-in'), 'Explicit --operator-opt-in is required');
  const values = new Map();
  for (const value of args) {
    if (value === '--operator-opt-in') continue;
    const match = /^--(store|glyphs|web-origin|port)=(.+)$/.exec(value);
    assert(
      match && !values.has(match[1]),
      'Use unique --store, --glyphs, --web-origin and --port flags',
    );
    values.set(match[1], match[2]);
  }
  for (const name of ['store', 'glyphs'])
    assert(
      values.has(name) && isAbsolute(values.get(name)),
      'Explicit absolute local paths required',
    );
  const webOrigin = values.get('web-origin');
  assert(webOrigin, 'Explicit --web-origin is required');
  let web;
  try {
    web = new URL(webOrigin);
  } catch {
    throw new Error('QA Web origin must be one exact loopback HTTP origin');
  }
  assert(
    web.origin === webOrigin &&
      web.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(web.hostname) &&
      !web.username &&
      !web.password,
    'QA Web origin must be one exact loopback HTTP origin',
  );
  const port = Number(values.get('port'));
  assert(
    Number.isInteger(port) && port >= 1024 && port <= 65535,
    'Explicit unprivileged tile port required',
  );
  assert.notEqual(Number(web.port || 80), port, 'Web and tile servers need separate ports');
  return { store: values.get('store'), glyphs: values.get('glyphs'), webOrigin, port };
}

export function renderedSummary(text) {
  const match = /^화면 도로 (\d+)개 · 건물 (\d+)개 · 라벨 (\d+)개$/.exec(text ?? '');
  return match
    ? { roads: Number(match[1]), buildings: Number(match[2]), labels: Number(match[3]) }
    : null;
}
const redact = (value) => String(value).replace(/https?:\/\/[^\s"'<>]+/g, '[URL]');

async function verify(options) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  for (const name of ['store', 'glyphs']) {
    options[name] = realpathSync(options[name]);
    assert(statSync(options[name]).isDirectory(), 'Operator path must be a local directory');
  }
  const { startTileServer } = await import('../services/tiles/dist/server.js');
  const { sourceEligibility } = await import('../services/tiles/dist/config.js');
  sourceEligibility(root);
  const { chromium, expect } = await import('@playwright/test');
  const directory = resolve(root, 'artifacts/qa/real-tiles');
  mkdirSync(directory, { recursive: true });
  const glyphBytes = readFileSync(resolve(options.glyphs, 'manifest.json'));
  const glyph = JSON.parse(glyphBytes);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const report = {
    schemaVersion: 1,
    sourceCommit: git('rev-parse', 'HEAD'),
    sourceDirty: git('status', '--porcelain').length !== 0,
    renderer: 'Chromium software WebGL; actual operator OSM tiles and PBF glyphs',
    glyphPack: {
      manifestSha256: createHash('sha256').update(glyphBytes).digest('hex'),
      fontstack: glyph.fontstack,
      fontSha256: glyph.fontSha256,
      license: glyph.license,
    },
    regions: [],
    cases: [],
    limitations: [
      'Single-host observations, not an FPS, p95, field accuracy or memory-leak certification',
      'Android/iOS, physical mobile browsers, Safari/Firefox and nationwide generation not tested',
      'The MapLibre shared worker may remain after map disposal; zero-worker claim is not made',
    ],
    status: 'RUNNING',
  };
  let browser, server, context;
  try {
    browser = await chromium.launch({
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
      args: ['--enable-unsafe-swiftshader'],
    });
    for (const [region, name] of Object.entries(cityNames)) {
      server = await startTileServer({
        store: options.store,
        glyphs: options.glyphs,
        region,
        port: options.port,
        allowedOrigins: [options.webOrigin],
      });
      const statusResponse = await globalThis.fetch(`${server.origin}/status`, {
        signal: globalThis.AbortSignal.timeout(10000),
        redirect: 'error',
      });
      assert(statusResponse.ok, 'Local tile server status failed');
      const serverStatus = await statusResponse.json();
      assert.equal(serverStatus.region, region);
      const generation = serverStatus.generation;
      assert.match(generation, /^[0-9]{13}-[a-f0-9]{8}$/);
      const manifest = JSON.parse(
        readFileSync(resolve(options.store, region, 'generations', generation, 'manifest.json')),
      );
      console.log(`Actual tile QA: ${region}; generation ${generation}; server started`);
      const row = {
        region,
        generation,
        dataAsOf: manifest.source.dataAsOf,
        archiveSha256: manifest.archive.sha256,
        archiveTiles: manifest.archive.tileCount,
        unexpectedOrigins: [],
        httpFailures: [],
        requestFailures: [],
        pageErrors: [],
        uiNotices: [],
        consoleMessages: [],
        requests: { styles: 0, tiles: 0, glyphs: 0 },
        responses: { styles: 0, tiles: 0, glyphs: 0 },
        cleanup: 'NOT_RUN',
      };
      report.regions.push(row);
      context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        serviceWorkers: 'block',
      });
      const allowed = new Set([options.webOrigin, server.origin]);
      await context.route('**/*', (route) => {
        const url = new URL(route.request().url());
        if (['http:', 'https:'].includes(url.protocol) && !allowed.has(url.origin)) {
          row.unexpectedOrigins.push(url.origin);
          return route.abort();
        }
        return route.continue();
      });
      let disposing = false;
      const resourceKind = (url) => {
        if (url.origin !== server.origin) return null;
        return url.pathname.startsWith('/styles/')
          ? 'styles'
          : url.pathname.startsWith('/tiles/')
            ? 'tiles'
            : url.pathname.startsWith('/glyphs/')
              ? 'glyphs'
              : null;
      };
      context.on('request', (request) => {
        const kind = resourceKind(new URL(request.url()));
        if (kind) row.requests[kind]++;
      });
      context.on('response', (response) => {
        const url = new URL(response.url());
        if (response.status() >= 400)
          row.httpFailures.push({
            origin: url.origin,
            kind: resourceKind(url),
            status: response.status(),
          });
        const kind = resourceKind(url);
        if (kind && response.status() === 200) row.responses[kind]++;
      });
      context.on('requestfailed', (request) => {
        const failure = request.failure()?.errorText ?? 'UNKNOWN';
        row.requestFailures.push({
          kind: resourceKind(new URL(request.url())),
          failure,
          disposing,
        });
      });
      const page = await context.newPage();
      page.on('pageerror', (error) => row.pageErrors.push(redact(error.message)));
      page.on('console', (message) => {
        if (['warning', 'error'].includes(message.type()))
          row.consoleMessages.push({
            type: message.type(),
            text: redact(message.text()).slice(0, 500),
          });
      });
      await page.goto(`${options.webOrigin}/tiles/`);
      await expect(page.getByTestId('tiles-status')).toHaveAttribute('data-state', 'disconnected');
      await expect(page.getByRole('checkbox')).not.toBeChecked();
      assert.deepEqual(
        row.requests,
        { styles: 0, tiles: 0, glyphs: 0 },
        'Provider requested before consent',
      );
      await page
        .getByRole('textbox', { name: '지도 스타일 URL' })
        .fill(`${server.origin}/styles/standard.json`);
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: '지도 연결', exact: true }).click();
      await expect(page.getByTestId('tiles-status')).toHaveAttribute('data-state', 'ready', {
        timeout: 45000,
      });
      await page.getByRole('combobox', { name: '이동할 지역' }).selectOption(region);
      await page.getByRole('button', { name: '지역으로 이동' }).click();
      async function capture(theme, width) {
        const start = Date.now();
        await page.setViewportSize({ width, height: 1000 });
        await expect
          .poll(
            async () => {
              const visible = renderedSummary(
                await page.getByTestId('tiles-rendered').textContent(),
              );
              return Boolean(
                visible && visible.roads > 0 && visible.buildings > 0 && visible.labels > 0,
              );
            },
            { timeout: 45000 },
          )
          .toBe(true);
        await expect(page.getByTestId('tiles-labels')).toHaveText(/[가-힣]/, { timeout: 15000 });
        await expect(page.locator('.maplibregl-ctrl-attrib')).toBeVisible();
        await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText(
          'OpenStreetMap contributors',
        );
        const copyrightLink = page
          .locator('.maplibregl-ctrl-attrib a')
          .filter({ hasText: 'OpenStreetMap contributors' });
        await expect(copyrightLink).toBeVisible();
        await expect(copyrightLink).toHaveAttribute(
          'href',
          new URL('/copyright', 'https:' + '//www.openstreetmap.org').href,
        );
        row.uiNotices = await page.locator('main [role="alert"]').allTextContents();
        await expect(page.locator('main [role="alert"]')).toHaveCount(0);
        assert(
          await page.evaluate(
            () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth,
          ),
          'Horizontal overflow',
        );
        const screenshot = `${region}-${theme}-${width}.png`;
        await page.screenshot({ path: resolve(directory, screenshot), fullPage: true });
        const sample = {
          region,
          theme,
          width,
          status: 'PASS',
          features: renderedSummary(await page.getByTestId('tiles-rendered').textContent()),
          labels: await page.getByTestId('tiles-labels').textContent(),
          camera: await page.getByTestId('tiles-camera').textContent(),
          observedReadyMs: Date.now() - start,
          screenshot,
        };
        report.cases.push(sample);
        console.log(`PASS actual tiles: ${name} / ${theme} / ${width}px`);
      }
      await capture('standard', 1440);
      if (region === 'seoul') {
        for (const theme of themes.slice(1)) {
          await page.getByRole('button', { name: theme, exact: true }).click();
          await expect(page.getByTestId('tiles-status')).toHaveAttribute('data-state', 'ready', {
            timeout: 45000,
          });
          await capture(theme, 1440);
        }
        await page.getByRole('button', { name: 'standard', exact: true }).click();
        await expect(page.getByTestId('tiles-status')).toHaveAttribute('data-state', 'ready', {
          timeout: 45000,
        });
        await capture('standard', 390);
        await capture('standard', 768);
      }
      for (const kind of ['styles', 'tiles', 'glyphs'])
        assert(row.responses[kind] > 0, `No successful real ${kind} response`);
      disposing = true;
      await page.getByRole('button', { name: '연결 해제', exact: true }).click();
      await expect(page.getByTestId('tiles-status')).toHaveAttribute('data-state', 'disconnected');
      await expect(page.locator('canvas, .kmk-place-selector, .maplibregl-ctrl')).toHaveCount(0);
      row.cleanup = 'PASS';
      assert.deepEqual(row.unexpectedOrigins, [], 'Unexpected non-operator endpoint');
      assert.deepEqual(row.httpFailures, [], 'HTTP resource failures');
      assert.deepEqual(row.pageErrors, [], 'Browser page exceptions');
      // MapLibre cancels obsolete tile requests during the scripted camera/style/viewport changes.
      // Preserve their counts; successful tile/glyph responses and visible features are required above.
      row.cancelledTileRequests = row.requestFailures.filter(
        (failure) => failure.kind === 'tiles' && failure.failure === 'net::ERR_ABORTED',
      ).length;
      assert.deepEqual(
        row.requestFailures.filter(
          (failure) =>
            !failure.disposing &&
            !(failure.kind === 'tiles' && failure.failure === 'net::ERR_ABORTED'),
        ),
        [],
        'Unexpected active request failures',
      );
      assert.deepEqual(
        row.consoleMessages.filter((message) => message.type === 'error'),
        [],
        'Browser console errors',
      );
      row.serverCounts = { ...server.counts };
      assert.equal(row.serverCounts.errors, 0, 'Tile/glyph server recorded errors');
      await context.close();
      context = null;
      await server.close();
      server = null;
    }
    report.status = 'PASS';
    console.log(
      `PASS: ${report.cases.length} real tile cases; screenshots remain ignored local evidence`,
    );
  } catch (error) {
    report.status = 'FAIL';
    report.failure = redact(error.message);
    throw error;
  } finally {
    const cleanup = await Promise.allSettled([context?.close(), server?.close(), browser?.close()]);
    const cleanupFailures = cleanup.filter((result) => result.status === 'rejected');
    if (cleanupFailures.length) {
      report.status = 'FAIL';
      report.cleanupFailures = cleanupFailures.length;
    }
    writeFileSync(resolve(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    assert.equal(cleanupFailures.length, 0, 'QA resource cleanup failed');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await verify(parseRealTileOptions(process.argv.slice(2)));
