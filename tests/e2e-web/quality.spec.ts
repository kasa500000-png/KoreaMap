import { expect, test } from '@playwright/test';
import { themeNames } from '@korea-map-kit/styles';

for (const width of [390, 768, 1440]) {
  test(`quality matrix ${width}px: renderer, large markers, camera, themes, recovery`, async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 900 });
    const external: string[] = [],
      tileRequests: string[] = [],
      errors: string[] = [];
    context.on('request', (request) => {
      const url = new URL(request.url());
      if (['http:', 'https:'].includes(url.protocol) && url.origin !== 'http://127.0.0.1:4173')
        external.push(url.origin);
      if (/\.(pbf|mvt|pmtiles)(\?|$)|\/tiles\//.test(url.pathname)) tileRequests.push(url.pathname);
    });
    await context.route('**/*', (route) =>
      new URL(route.request().url()).origin === 'http://127.0.0.1:4173'
        ? route.continue()
        : route.abort(),
    );
    page.on('pageerror', (error) => errors.push(error.message));
    const started = Date.now();
    await page.goto('/');
    await expect(page.getByTestId('status')).toHaveText('ready');
    await expect(page.getByTestId('rendered')).toHaveText('화면 마커: 100');
    const readyMs = Date.now() - started;
    const markerStart = Date.now();
    await page.getByRole('button', { name: '마커 1000개', exact: true }).click();
    await expect(page.getByTestId('rendered')).toHaveText('화면 마커: 1000');
    const markersMs = Date.now() - markerStart;
    await page.getByRole('combobox', { name: '지도 장소 선택' }).selectOption('place-500');
    await expect(page.getByRole('article', { name: '장소 카드' })).toContainText('합성 장소 501');
    await page.getByRole('button', { name: 'Close popup' }).click();
    await page.evaluate(() => {
      const selector = document.querySelector('.kmk-place-selector');
      if (!selector) throw Error('Missing marker selector');
      const sample = { mutations: 0 };
      const observer = new MutationObserver((records) => {
        sample.mutations += records.length;
      });
      observer.observe(selector, { childList: true, subtree: true });
      Object.assign(window, { qualitySample: sample, qualityObserver: observer });
    });
    const panStart = Date.now();
    await page.getByRole('button', { name: '이동', exact: true }).click();
    await expect(page.getByTestId('camera')).toContainText('126.98200,37.57000');
    await page.getByRole('button', { name: '확대', exact: true }).click();
    await expect(page.getByTestId('camera')).toContainText('/ 14.00 /');
    const cameraMs = Date.now() - panStart;
    const mutations = await page.evaluate(() => {
      const state = window as unknown as Window & {
        qualitySample: { mutations: number };
        qualityObserver: MutationObserver;
      };
      state.qualityObserver.disconnect();
      return state.qualitySample.mutations;
    });
    expect(mutations).toBe(0);
    expect(readyMs).toBeLessThan(10_000);
    expect(markersMs).toBeLessThan(5_000);
    expect(cameraMs).toBeLessThan(5_000);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page.locator('.maplibregl-ctrl-attrib')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`map-${width}.png`), fullPage: true });
    await page.route('**/missing-style.json', (route) =>
      route.fulfill({ status: 503, body: 'Synthetic service unavailable' }),
    );
    await page.getByRole('button', { name: '오류 재현' }).click();
    await expect(page.getByTestId('status')).toHaveText('error');
    await expect(page.locator('canvas')).toHaveCount(0);
    await page.getByRole('button', { name: '지도 복구' }).click();
    await expect(page.getByTestId('status')).toHaveText('ready');
    await page.goto('/themes/');
    for (const theme of themeNames) {
      await expect(page.getByTestId(`status-${theme}`)).toHaveText('ready');
      await expect(page.getByTestId(`layers-${theme}`)).toHaveText(
        /라벨 [1-9]\d*개 \/ 아이콘 [1-9]\d*개/,
      );
      await expect(
        page.getByTestId(`theme-${theme}`).locator('.maplibregl-ctrl-attrib'),
      ).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath(`themes-${width}.png`), fullPage: true });
    expect(external).toEqual([]);
    expect(tileRequests).toEqual([]);
    expect(errors).toEqual([]);
    const measurements = {
      width,
      readyMs,
      markersMs,
      cameraMs,
      markerDomMutationsDuringCamera: mutations,
      tileRequests: tileRequests.length,
      externalRequests: external.length,
    };
    console.log('QUALITY_SAMPLE', JSON.stringify(measurements));
    await testInfo.attach('quality-sample', {
      body: JSON.stringify(measurements),
      contentType: 'application/json',
    });
  });
}
