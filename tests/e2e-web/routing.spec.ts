import { test, expect } from '@playwright/test';
test('routing works without a service; modes, via, no-path, missing provider and attribution', async ({
  page,
  context,
}) => {
  const external: string[] = [],
    errors: string[] = [];
  context.on('request', (r) => {
    if (new URL(r.url()).origin !== 'http://127.0.0.1:4173') external.push(r.url());
  });
  await context.route('**/*', (r) =>
    new URL(r.request().url()).origin === 'http://127.0.0.1:4173' ? r.continue() : r.abort(),
  );
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/routing/');
  await expect(page.getByTestId('routing-status')).toHaveText('준비 완료');
  for (const mode of ['driving', 'walking', 'cycling']) {
    await page.getByRole('combobox', { name: '이동 수단' }).selectOption(mode);
    await page.getByRole('button', { name: '합성 경로 표시' }).click();
    await expect(page.getByTestId('routing-status')).toHaveText('합성 도로 경로 표시');
    await expect(page.getByTestId('routing-summary')).toContainText(
      mode === 'walking' ? '418 m' : '576 m',
    );
    await expect(page.getByTestId('routing-rendered')).not.toHaveText('렌더링된 선 0개');
  }
  await page.getByRole('combobox', { name: '테스트 구간' }).selectOption('via');
  await page.getByRole('button', { name: '합성 경로 표시' }).click();
  await expect(page.getByTestId('routing-summary')).toContainText('3개 지점');
  await expect(
    page.getByText('Korea Map Kit 자체 합성 도로망 · MIT', { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/routing.png', fullPage: true });
  await page.getByRole('combobox', { name: '테스트 구간' }).selectOption('island');
  await page.getByRole('button', { name: '합성 경로 표시' }).click();
  await expect(page.getByTestId('routing-status')).toHaveText('ROUTE_NOT_FOUND');
  await expect(page.getByTestId('routing-summary')).toHaveText('표시 경로 없음');
  await expect(page.getByTestId('routing-rendered')).toHaveText('렌더링된 선 0개');
  await page.getByRole('button', { name: '공급자 미설정 확인' }).click();
  await expect(page.getByTestId('routing-status')).toHaveText('ROUTING_PROVIDER_REQUIRED');
  await expect(page.locator('canvas')).toBeVisible();
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
