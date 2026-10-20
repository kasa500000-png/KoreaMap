import { expect, test } from '@playwright/test';
test('common API: camera/bounds, overlays and markers survive style replacement; cancel and dispose', async ({
  page,
  context,
}) => {
  const external: string[] = [],
    errors: string[] = [];
  context.on('request', (request) => {
    if (new URL(request.url()).origin !== 'http://127.0.0.1:4173') external.push(request.url());
  });
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === 'http://127.0.0.1:4173'
      ? route.continue()
      : route.abort(),
  );
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/api/');
  await expect(page.getByTestId('api-status')).toHaveText('ready');
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: '공통 API 실행', exact: true }).click();
    await expect(page.getByTestId('api-status')).toHaveText('passed');
    await expect(page.getByTestId('api-rendered')).toHaveText('1 / 3');
    await expect(page.locator('.maplibregl-ctrl-attrib')).toHaveCount(1);
    await expect(page.locator('.maplibregl-ctrl-attrib')).toBeVisible();
    await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText(
      '자체 합성 공통 API 예제 · MIT',
    );
    const bounds = JSON.parse(await page.getByTestId('api-result').innerText()) as {
      west: number;
      east: number;
      south: number;
      north: number;
    };
    expect(bounds.west).toBeLessThan(126.97);
    expect(bounds.east).toBeGreaterThan(126.99);
    expect(bounds.south).toBeLessThan(37.56);
    expect(bounds.north).toBeGreaterThan(37.58);
  }
  await page.getByRole('combobox', { name: '지도 장소 선택' }).selectOption('one');
  await expect(page.getByTestId('api-selection')).toHaveText('공통 API 장소');
  await expect(page.getByRole('article', { name: '장소 카드' })).toContainText('공통 API 장소');
  await page.screenshot({ path: 'test-results/public-api.png', fullPage: true });
  await page.getByRole('button', { name: '취소 확인' }).click();
  await expect(page.getByTestId('api-result')).toHaveText('ABORTED');
  await page.getByRole('button', { name: '지도 종료', exact: true }).click();
  await expect(page.getByTestId('api-result')).toHaveText('MAP_DESTROYED');
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('.maplibregl-popup')).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
