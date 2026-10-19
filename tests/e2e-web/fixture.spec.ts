import { expect, test } from '@playwright/test';
import { createFixtureStyle } from '@korea-map-kit/styles';
test('real renderer: camera, 100/1000 markers, selection, resize, disposal and recovery', async ({
  page,
  context,
}, testInfo) => {
  const external: string[] = [];
  const errors: string[] = [];
  context.on('request', (request) => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== 'http://127.0.0.1:4173')
      external.push(url.origin);
  });
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === 'http://127.0.0.1:4173'
      ? route.continue()
      : route.abort(),
  );
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const counters = { workers: 0, observers: 0 };
    Object.assign(window, { kmkLifecycle: counters });
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      private live = true;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        counters.workers++;
      }
      override terminate() {
        if (this.live) {
          counters.workers--;
          this.live = false;
        }
        super.terminate();
      }
    };
    const OriginalObserver = window.ResizeObserver;
    window.ResizeObserver = class extends OriginalObserver {
      private live = false;
      override observe(target: Element, options?: ResizeObserverOptions) {
        if (!this.live) {
          this.live = true;
          counters.observers++;
        }
        super.observe(target, options);
      }
      override disconnect() {
        if (this.live) {
          this.live = false;
          counters.observers--;
        }
        super.disconnect();
      }
    };
  });
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveText('ready');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByTestId('rendered')).toHaveText('화면 마커: 100');
  await page.getByRole('button', { name: '마커 1000개', exact: true }).click();
  await expect(page.getByTestId('rendered')).toHaveText('화면 마커: 1000');
  await page.locator('canvas').click({ position: { x: 430, y: 300 } });
  await expect(page.getByRole('article', { name: '장소 카드' })).toBeVisible();
  await page.getByRole('button', { name: 'Close popup' }).click();
  await page.getByRole('combobox', { name: '지도 장소 선택' }).selectOption('place-500');
  await expect(page.getByRole('article', { name: '장소 카드' })).toContainText('합성 장소 501');
  await page.getByRole('button', { name: 'Close popup' }).click();
  await expect(page.getByRole('combobox')).toBeFocused();
  await page.getByRole('button', { name: '확대', exact: true }).click();
  await expect(page.getByTestId('camera')).toContainText('/ 14.00 /');
  await page.getByRole('button', { name: '이동', exact: true }).click();
  await expect(page.getByTestId('camera')).toContainText('126.98200,37.57000');
  await page.getByRole('button', { name: '회전', exact: true }).click();
  await expect(page.getByTestId('camera')).toContainText('/ 45.0');
  await page.getByRole('button', { name: '카메라 초기화' }).click();
  const keyboardBefore = await page.getByTestId('camera').textContent();
  await page.locator('canvas').focus();
  await page.locator('canvas').press('ArrowRight');
  await expect(page.getByTestId('camera')).not.toHaveText(keyboardBefore!);
  await page.getByRole('button', { name: '카메라 초기화' }).click();
  const before = await page.getByTestId('camera').textContent();
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw Error('canvas');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByTestId('camera')).not.toHaveText(before!);
  await page.getByRole('button', { name: '카메라 초기화' }).click();
  await page.getByRole('button', { name: '지도 크기 변경' }).click();
  await expect.poll(async () => (await canvas.boundingBox())?.height).toBe(380);
  await page.getByRole('button', { name: '첫 장소 선택' }).click();
  await page.screenshot({ path: testInfo.outputPath('web-sdk.png'), fullPage: true });
  const cdp = await context.newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage');
  const baseline = await cdp.send('Runtime.getHeapUsage');
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: '지도 종료' }).click();
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(page.locator('.maplibregl-popup, .kmk-place-selector')).toHaveCount(0);
    await expect(page.getByTestId('cleanup')).toHaveText(
      '{"status":"destroyed","listeners":0,"observing":false,"renderedMarkers":0}',
    );
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as Window & { kmkLifecycle: { workers: number; observers: number } })
              .kmkLifecycle,
        ),
      )
      .toEqual({ workers: 1, observers: 0 });
    await page.getByRole('button', { name: '지도 시작' }).click();
    await expect(page.getByTestId('status')).toHaveText('ready');
    await expect(page.locator('canvas')).toHaveCount(1);
    await expect(page.getByRole('combobox')).toHaveValue('place-0');
  }
  await cdp.send('HeapProfiler.collectGarbage');
  const after = await cdp.send('Runtime.getHeapUsage');
  expect(after.usedSize - baseline.usedSize).toBeLessThan(8 * 1024 * 1024);
  console.log(
    'HEAP_SAMPLE',
    JSON.stringify({ before: baseline.usedSize, after: after.usedSize, cycles: 5 }),
  );
  await testInfo.attach('heap-sample', {
    body: JSON.stringify({ before: baseline.usedSize, after: after.usedSize, cycles: 5 }),
    contentType: 'application/json',
  });
  await page.getByRole('button', { name: '오류 재현' }).click();
  await expect(page.getByTestId('status')).toHaveText('error');
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByRole('button', { name: '지도 복구' }).click();
  await expect(page.getByTestId('status')).toHaveText('ready');
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
test('mobile touch drag and pinch work with a responsive canvas', async ({ browser }, testInfo) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    baseURL: 'http://127.0.0.1:4173',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveText('ready');
  await page.locator('canvas').scrollIntoViewIfNeeded();
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw Error('canvas');
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 8; i++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + i * 7, y: y + i * 3 }],
    });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByTestId('camera')).not.toHaveText('');
  const before = await page.getByTestId('camera').textContent();
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { id: 0, x: x - 25, y },
      { id: 1, x: x + 25, y },
    ],
  });
  for (let i = 1; i <= 8; i++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { id: 0, x: x - 25 - i * 5, y },
        { id: 1, x: x + 25 + i * 5, y },
      ],
    });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByTestId('camera')).not.toHaveText(before!);
  await page.screenshot({ path: testInfo.outputPath('mobile-sdk.png'), fullPage: true });
  await context.close();
});

test('explicit operator style works locally and blocks an undeclared resource origin', async ({
  page,
  context,
}) => {
  const external: string[] = [];
  context.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== 'http://127.0.0.1:4173') external.push(url.origin);
  });
  let blocked = false;
  await page.route('**/missing-style.json', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        blocked
          ? {
              version: 8,
              sources: {
                remote: { type: 'geojson', data: 'https://tiles.example.invalid/data.geojson' },
              },
              layers: [{ id: 'remote', type: 'circle', source: 'remote' }],
            }
          : createFixtureStyle({ mode: 'local-fixture', fixtureId: 'synthetic-v1' }),
      ),
    }),
  );
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveText('ready');
  await page.getByRole('button', { name: '오류 재현' }).click();
  await expect(page.getByTestId('status')).toHaveText('ready');
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('합성 오류 테스트');
  await page.getByRole('button', { name: '지도 복구' }).click();
  await expect(page.getByTestId('status')).toHaveText('ready');
  blocked = true;
  await page.getByRole('button', { name: '오류 재현' }).click();
  await expect(page.getByTestId('status')).toHaveText('error');
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(external).toEqual([]);
});

test('operator reserved layer collision fails cleanly', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/missing-style.json', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        version: 8,
        sources: {},
        layers: [{ id: 'kmk-markers', type: 'background' }],
      }),
    }),
  );
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveText('ready');
  await page.getByRole('button', { name: '오류 재현' }).click();
  await expect(page.getByTestId('status')).toHaveText('error');
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});
