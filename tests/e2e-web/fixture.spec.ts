import { expect, test } from '@playwright/test';
test('renders, pans, searches and reloads using only local requests', async ({
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
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return ['http:', 'https:'].includes(url.protocol) && url.origin !== 'http://127.0.0.1:4173'
      ? route.abort()
      : route.continue();
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('로컬 지도 준비 완료');
  await expect(page.getByRole('region', { name: '합성 지도' })).toHaveAttribute(
    'data-motion',
    'idle',
  );
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const before = await page.screenshot();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas missing');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 50, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByRole('region', { name: '합성 지도' })).toHaveAttribute(
    'data-motion',
    'idle',
  );
  expect((await page.screenshot()).equals(before)).toBe(false);
  await page.getByRole('button', { name: '합성 지점 찾기' }).click();
  await expect(page.locator('[aria-live="polite"]')).toHaveText('합성 지점');
  await page.screenshot({ path: testInfo.outputPath('local-fixture.png'), fullPage: true });
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('로컬 지도 준비 완료');
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
