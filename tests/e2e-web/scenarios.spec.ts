import { test, expect } from '@playwright/test';

test('two apps share isolated synthetic persistence: live walk, replay, trip days/cards and reload', async ({
  page,
  context,
}) => {
  const external: string[] = [],
    errors: string[] = [];
  context.on('request', (r) => {
    if (new URL(r.url()).origin !== 'http://127.0.0.1:4173') external.push(r.url());
  });
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === 'http://127.0.0.1:4173'
      ? route.continue()
      : route.abort(),
  );
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/walk/');
  await expect(page.getByTestId('scenario-status')).toContainText('준비 완료');
  await page.getByRole('button', { name: '모의 현재 위치', exact: true }).click();
  await page.getByRole('button', { name: '산책 시작', exact: true }).click();
  await expect(page.getByTestId('scenario-metrics')).toContainText('4점', { timeout: 8000 });
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  const paused = await page.getByTestId('scenario-metrics').textContent();
  await page.waitForTimeout(1200);
  expect(await page.getByTestId('scenario-metrics').textContent()).toBe(paused);
  await page.getByRole('button', { name: 'Outdoor 테마' }).click();
  await expect(page.getByTestId('scenario-metrics')).toContainText('outdoor');
  await expect(page.locator('.maplibregl-ctrl-attrib')).toHaveCount(1);
  await expect(page.locator('.maplibregl-ctrl-attrib')).toBeVisible();
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText(
    '모든 장소·사용자·GPS는 가상',
  );
  await page.getByRole('button', { name: '산책 재개' }).click();
  await page.getByRole('button', { name: '산책 종료' }).click();
  await page.getByRole('button', { name: '산책 저장' }).click();
  await expect(page.getByTestId('scenario-metrics')).toContainText('저장 1개');
  await page.reload();
  await expect(page.getByRole('button', { name: '저장 산책 1 다시 보기' })).toBeEnabled();
  await page.getByRole('button', { name: '저장 산책 1 다시 보기' }).click();
  await expect(page.getByTestId('scenario-status')).toContainText('다시 보기 완료');
  await page.getByRole('button', { name: '구름 공원 (가상)', exact: true }).click();
  await expect(page.getByRole('region', { name: '장소 카드' })).toContainText('공원');
  await page.screenshot({ path: 'test-results/scenario-walk.png', fullPage: true });
  await page.goto('/trip/');
  await expect(page.getByTestId('scenario-status')).toContainText('준비 완료');
  await page.getByRole('textbox', { name: '방문 장소 검색' }).fill('공 원');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.getByTestId('scenario-status')).toContainText('1개 가상');
  await page.getByRole('button', { name: '구름 공원 (가상) 저장' }).click();
  await page.getByRole('textbox', { name: '방문 장소 검색' }).fill('박물관');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.getByRole('button', { name: '종이 박물관 (가상) 저장' }).click();
  await expect(page.getByTestId('scenario-metrics')).toContainText('1일차 · 저장 2곳');
  await page.getByRole('button', { name: '2일차 보기' }).click();
  await expect(page.getByTestId('scenario-metrics')).toContainText('2일차 · 저장 0곳');
  await page.getByRole('button', { name: '종이 박물관 (가상) 저장' }).click();
  await page.getByRole('button', { name: '1일차 보기' }).click();
  await page.reload();
  await expect(page.getByTestId('scenario-metrics')).toContainText('1일차 · 저장 2곳');
  await page.getByRole('textbox', { name: '방문 장소 검색' }).fill('없는가상장소');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.getByTestId('scenario-status')).toHaveText('검색 결과 없음');
  await page.getByRole('button', { name: '구름 공원 (가상)', exact: true }).click();
  await expect(page.getByRole('region', { name: '장소 카드' })).toBeVisible();
  await page.screenshot({ path: 'test-results/scenario-trip.png', fullPage: true });
  await page.getByRole('button', { name: '모든 데모 저장 자료 삭제' }).click();
  await expect(page.getByTestId('scenario-metrics')).toContainText('저장 0곳');
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('mobile web layout and repeated app transitions stay responsive without collecting geolocation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = () => {
      throw new Error('real GPS must not be used');
    };
  });
  const durations: number[] = [],
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (let i = 0; i < 4; i++) {
    const started = Date.now();
    await page.goto(i % 2 ? '/trip/' : '/walk/');
    await expect(page.getByTestId('scenario-status')).toContainText('준비 완료');
    durations.push(Date.now() - started);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expect(page.locator('canvas').first()).toBeVisible();
  }
  await page.getByRole('button', { name: '2일차 보기' }).click();
  await expect(page.getByTestId('scenario-metrics')).toContainText('2일차');
  await page.screenshot({ path: 'test-results/scenario-trip-mobile.png', fullPage: true });
  console.info('scenario ready timings ms:', durations.join(','));
  expect(Math.max(...durations)).toBeLessThan(8000);
  expect(errors).toEqual([]);
  await test.info().attach('scenario-ready-times-ms', {
    body: JSON.stringify(durations),
    contentType: 'application/json',
  });
});
