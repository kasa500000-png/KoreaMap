import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { themeNames } from 'korea-map-styles';
import { pngOpaqueColors } from './png-raster';
import { openMapDemo } from './map-startup';

type LifecycleCounters = { workers: number; observers: number; createdWorkers: number };
type LifecycleWindow = Window & { kmkExtendedLifecycle: LifecycleCounters };
const networkViolations = new WeakMap<Page, string[]>();

test.beforeEach(async ({ context, page }) => {
  const violations: string[] = [];
  networkViolations.set(page, violations);
  context.on('request', (request) => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== 'http://127.0.0.1:4173')
      violations.push('UNEXPECTED_ORIGIN');
  });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.origin === 'http://127.0.0.1:4173' ? route.continue() : route.abort();
  });
  page.on('pageerror', () => violations.push('PAGE_ERROR'));
  await page.addInitScript(() => {
    const counters = { workers: 0, observers: 0, createdWorkers: 0 };
    Object.assign(window, { kmkExtendedLifecycle: counters });
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      private live = true;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        counters.workers++;
        counters.createdWorkers++;
      }
      override terminate() {
        if (this.live) counters.workers--;
        this.live = false;
        super.terminate();
      }
    };
    const OriginalObserver = window.ResizeObserver;
    window.ResizeObserver = class extends OriginalObserver {
      private live = false;
      override observe(target: Element, options?: ResizeObserverOptions) {
        if (!this.live) counters.observers++;
        this.live = true;
        super.observe(target, options);
      }
      override disconnect() {
        if (this.live) counters.observers--;
        this.live = false;
        super.disconnect();
      }
    };
  });
});
test.afterEach(async ({ page }) => {
  if (!page.isClosed()) await page.goto('about:blank');
  expect(networkViolations.get(page)).toEqual([]);
});

for (const width of [390, 768, 1440]) {
  test(`shared browser smoke ${width}px: Korean themes, selection, routes, recovery and cleanup`, async ({
    page,
    browserName,
  }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    await openMapDemo(page, testInfo);
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByTestId('rendered')).toHaveText('화면 마커: 100');
    await page.getByRole('combobox', { name: '지도 장소 선택' }).selectOption('place-50');
    await expect(page.getByRole('article', { name: '장소 카드' })).toContainText('합성 장소 51');
    await page.getByRole('button', { name: 'Close popup' }).click();
    await expect(page.getByRole('combobox')).toBeFocused();
    await page.getByRole('button', { name: '확대', exact: true }).click();
    await expect(page.getByTestId('camera')).toContainText('/ 14.00 /');
    await page.getByRole('button', { name: '이동', exact: true }).click();
    await expect(page.getByTestId('camera')).toContainText('126.98200,37.57000');
    await page.route('**/missing-style.json', (route) =>
      route.fulfill({ status: 503, body: 'Synthetic service unavailable' }),
    );
    await page.getByRole('button', { name: '오류 재현' }).click();
    await expect(page.getByTestId('status')).toHaveText('error');
    await expect(page.locator('canvas')).toHaveCount(0);
    await page.getByRole('button', { name: '지도 복구' }).click();
    await expect(page.getByTestId('status')).toHaveText('ready');
    await page.getByRole('button', { name: '지도 종료' }).click();
    await expect(page.getByTestId('cleanup')).toHaveText(
      '{"status":"destroyed","listeners":0,"observing":false,"renderedMarkers":0}',
    );
    await expect(page.locator('canvas, .maplibregl-popup, .kmk-place-selector')).toHaveCount(0);
    await page.goto('/themes/');
    for (const theme of themeNames) {
      await expect(page.getByTestId(`status-${theme}`)).toHaveText('ready');
      await expect(page.getByTestId(`layers-${theme}`)).toHaveText(
        /라벨 [1-9]\d*개 \/ 아이콘 [1-9]\d*개/,
      );
      await expect(
        page.getByTestId(`theme-${theme}`).locator('.maplibregl-ctrl-attrib'),
      ).toContainText('Korea Map Kit authored design fixture (MIT)');
      const card = page.getByTestId(`theme-${theme}`);
      await card.scrollIntoViewIfNeeded();
      await page.evaluate(
        () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
      );
      const raster = await card.locator('canvas').screenshot();
      expect(
        pngOpaqueColors(raster),
        `${theme} must have an actual nonblank map raster`,
      ).toBeGreaterThan(8);
      await card.screenshot({ path: testInfo.outputPath(`${theme}-${width}.png`) });
    }
    const koreanRaster = await page.evaluate(async () => {
      await document.fonts.ready;
      const c = document.createElement('canvas');
      c.width = 80;
      c.height = 80;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      const raster = (text: string) => {
        ctx.clearRect(0, 0, 80, 80);
        ctx.font = '40px "Noto Sans CJK KR"';
        ctx.fillText(text, 2, 50);
        return Array.from(ctx.getImageData(0, 0, 80, 80).data).join(',');
      };
      const missing = raster(String.fromCodePoint(0x10ffff));
      return ['한', '글', '힣', 'ㄱ'].map((char) => ({
        char,
        different: raster(char) !== missing,
      }));
    });
    expect(koreanRaster.every((glyph) => glyph.different)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath(`themes-${width}.png`), fullPage: true });
    await page.goto('/routing/');
    await expect(page.getByTestId('routing-status')).toHaveText('준비 완료');
    for (const mode of ['walking', 'cycling', 'driving']) {
      await page.getByRole('combobox', { name: '이동 수단' }).selectOption(mode);
      await page.getByRole('button', { name: '합성 경로 표시' }).click();
      await expect(page.getByTestId('routing-status')).toHaveText('합성 도로 경로 표시');
      await expect(page.getByTestId('routing-rendered')).not.toHaveText('렌더링된 선 0개');
    }
    await page.getByRole('combobox', { name: '테스트 구간' }).selectOption('island');
    await page.getByRole('button', { name: '합성 경로 표시' }).click();
    await expect(page.getByTestId('routing-status')).toHaveText('ROUTE_NOT_FOUND');
    await expect(page.getByTestId('routing-rendered')).toHaveText('렌더링된 선 0개');
    await expect(page.locator('canvas')).toBeVisible();
    await testInfo.attach('browser-capabilities', {
      body: JSON.stringify({ browserName, width, koreanRaster, safariDeviceVerified: false }),
      contentType: 'application/json',
    });
  });
}

test('20 mount/use/destroy cycles retain a bounded worker pool and release observers, cards and engine listeners', async ({
  page,
  context,
  browserName,
}, testInfo) => {
  test.setTimeout(180_000);
  await openMapDemo(page, testInfo);
  let cdp: CDPSession | undefined;
  const heaps: number[] = [];
  const samples: Array<{ cycle: number; resources: LifecycleCounters; heap?: number }> = [];
  const counters = () =>
    page.evaluate(() => ({ ...(window as unknown as LifecycleWindow).kmkExtendedLifecycle }));
  const stop = async () => {
    await page.getByRole('button', { name: '지도 종료' }).click();
    await expect(page.locator('canvas, .maplibregl-popup, .kmk-place-selector')).toHaveCount(0);
    await expect(page.getByTestId('cleanup')).toHaveText(
      '{"status":"destroyed","listeners":0,"observing":false,"renderedMarkers":0}',
    );
    await expect.poll(async () => (await counters()).observers).toBe(0);
  };
  const start = async () => {
    await page.getByRole('button', { name: '지도 시작' }).click();
    await expect(page.getByTestId('status')).toHaveText('ready');
    await expect(page.locator('canvas')).toHaveCount(1);
  };
  try {
    if (browserName === 'chromium') cdp = await context.newCDPSession(page);
    for (let warmup = 0; warmup < 3; warmup++) {
      await stop();
      await start();
    }
    await stop();
    const baseline = await counters();
    const collectHeap = async () => {
      if (!cdp) return undefined;
      await cdp.send('HeapProfiler.collectGarbage');
      const { usedSize } = await cdp.send('Runtime.getHeapUsage');
      heaps.push(usedSize);
      return usedSize;
    };
    const initialHeap = await collectHeap();
    samples.push({ cycle: 0, resources: baseline, ...(initialHeap ? { heap: initialHeap } : {}) });
    for (let cycle = 1; cycle <= 20; cycle++) {
      await start();
      await page.getByRole('button', { name: '마커 1000개', exact: true }).click();
      await expect(page.getByTestId('rendered')).toHaveText('화면 마커: 1000');
      await page.getByRole('combobox', { name: '지도 장소 선택' }).selectOption('place-500');
      await expect(page.getByRole('article', { name: '장소 카드' })).toContainText('합성 장소 501');
      await page.getByRole('button', { name: 'Close popup' }).click();
      await page.getByRole('button', { name: '이동', exact: true }).click();
      await expect(page.getByTestId('camera')).toContainText('126.98200,37.57000');
      await stop();
      const resources = await counters();
      expect(resources.workers).toBe(baseline.workers);
      expect(resources.observers).toBe(0);
      const heap = cycle % 5 === 0 ? await collectHeap() : undefined;
      samples.push({ cycle, resources, ...(heap ? { heap } : {}) });
    }
    if (initialHeap !== undefined) {
      expect(heaps).toHaveLength(5);
      for (const heap of heaps.slice(1)) expect(heap - initialHeap).toBeLessThan(8 * 1024 * 1024);
    }
    await testInfo.attach('lifecycle-samples', {
      body: JSON.stringify({
        browserName,
        warmupCycles: 3,
        measuredCycles: 20,
        heapCapability: cdp ? 'CDP main-thread heap after GC' : 'UNAVAILABLE: browser has no CDP',
        workerGpuMemoryVerified: false,
        retainedWorkerPool: baseline.workers,
        samples,
      }),
      contentType: 'application/json',
    });
  } finally {
    await cdp?.detach();
  }
});

test('a delayed actual map module attaches before the unchanged map-ready assertion starts', async ({
  page,
}, testInfo) => {
  const manifest = JSON.parse(
    await readFile('examples/web/.next/react-loadable-manifest.json', 'utf8'),
  );
  const files: unknown = manifest['app/map-client.tsx -> ./map-demo']?.files;
  expect(Array.isArray(files)).toBe(true);
  const candidates = files as string[];
  expect(candidates.length).toBeLessThanOrEqual(8);
  const mapChunks: string[] = [];
  for (const file of candidates) {
    expect(file).toMatch(/^static\/chunks\/[\w./-]+\.js$/);
    expect(file).not.toContain('..');
    const path = resolve('examples/web/out/_next', file);
    expect((await stat(path)).size).toBeLessThan(10 * 1024 * 1024);
    if ((await readFile(path, 'utf8')).includes('직접 만든 테스트 지점입니다.'))
      mapChunks.push(`/_next/${file}`);
  }
  expect(mapChunks).toHaveLength(1);
  let releaseChunk!: () => void;
  const chunkHeld = new Promise<void>((resolve) => (releaseChunk = resolve));
  let notifyRequest!: () => void;
  const chunkRequested = new Promise<void>((resolve) => (notifyRequest = resolve));
  await page.route(`**${mapChunks[0]}`, async (route) => {
    notifyRequest();
    await chunkHeld;
    await route.continue();
  });
  const opening = openMapDemo(page, testInfo);
  try {
    await chunkRequested;
    await expect(page.getByRole('status')).toHaveText('지도 모듈 준비 중');
    const heldAt = Date.now();
    let originalAssertionFailure: unknown;
    try {
      await expect(page.getByTestId('status')).toHaveText('ready');
    } catch (error) {
      originalAssertionFailure = error;
    }
    expect(originalAssertionFailure).toBeInstanceOf(Error);
    expect((originalAssertionFailure as Error).message).toContain('5000ms');
    await expect(page.getByTestId('status')).toHaveCount(0);
    const heldMs = Date.now() - heldAt;
    expect(heldMs).toBeGreaterThanOrEqual(5_000);
    releaseChunk();
    await opening;
    await expect(page.locator('canvas')).toBeVisible();
    await testInfo.attach('map-module-delay-regression', {
      body: JSON.stringify({ diagnosticOnly: true, heldMs, chunk: mapChunks[0] }),
      contentType: 'application/json',
    });
  } finally {
    releaseChunk();
    await opening.catch(() => {});
  }
});
