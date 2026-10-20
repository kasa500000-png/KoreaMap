import { expect, test } from '@playwright/test';
test('Korean search: IME, autocomplete, three cities, camera, filters, pagination, reverse and empty results', async ({
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
  await page.goto('/search/');
  await expect(page.getByTestId('search-status')).toHaveText('검색 준비 완료');
  const input = page.getByRole('textbox', { name: '검색어' });
  const results = page.getByRole('list', { name: '검색 결과', exact: true });
  const autocomplete = page.getByRole('list', { name: '자동완성' });
  const submit = page.getByRole('button', { name: '검색', exact: true });
  await input.dispatchEvent('compositionstart');
  await input.fill('서울');
  await expect(submit).toBeDisabled();
  await expect(autocomplete.getByRole('button')).toHaveCount(0);
  await input.dispatchEvent('compositionend');
  await expect(autocomplete.getByRole('button')).toHaveCount(2);
  for (const [text, name, longitude] of [
    ['서울 합성공원', '서울 합성공원', 127],
    ['울산 합성산책공원', '울산 합성산책공원', 129.3],
    ['제주 합성공원', '제주 합성공원', 126.5],
  ] as const) {
    await input.fill(text);
    await submit.click();
    await results.getByRole('button', { name, exact: true }).click();
    await expect(page.getByTestId('search-status')).toHaveText(`선택: ${name}`);
    await expect
      .poll(async () => Number((await page.getByTestId('search-camera').innerText()).split(',')[0]))
      .toBeCloseTo(longitude, 3);
    await expect(page.getByRole('combobox', { name: '지도 장소 선택' })).toContainText(name);
  }
  await page.getByRole('button', { name: '지도 중심 주변 POI 주소' }).click();
  await expect(page.getByTestId('search-reverse')).toContainText('제주 가상길 301');
  await input.fill('합성');
  await submit.click();
  await expect(results.getByRole('listitem')).toHaveCount(2);
  await page.getByRole('button', { name: '더 보기' }).click();
  await expect(results.getByRole('listitem')).toHaveCount(4);
  await page.getByRole('checkbox', { name: '현재 지도 영역' }).check();
  await page.getByRole('checkbox', { name: '지도 중심 5km 이내' }).check();
  await page.getByRole('combobox', { name: '카테고리' }).selectOption('park');
  await submit.click();
  await expect(results.getByRole('button')).toHaveText(['제주 합성공원']);
  await page.screenshot({ path: 'test-results/korean-search.png', fullPage: true });
  await page.getByRole('checkbox', { name: '현재 지도 영역' }).uncheck();
  await page.getByRole('checkbox', { name: '지도 중심 5km 이내' }).uncheck();
  await page.getByRole('combobox', { name: '카테고리' }).selectOption('');
  for (const text of ['서 울 합성 공원', '서울합성공언', '서울 가상로 101']) {
    await input.fill(text);
    await submit.click();
    await expect(results.getByRole('button', { name: '서울 합성공원', exact: true })).toBeVisible();
  }
  await input.fill('zzzzzz');
  await submit.click();
  await expect(page.getByTestId('search-status')).toHaveText('검색 결과 없음');
  await expect(results.getByRole('listitem')).toHaveCount(0);
  await page.goto('/api/');
  await expect(page.getByTestId('api-status')).toHaveText('ready');
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
