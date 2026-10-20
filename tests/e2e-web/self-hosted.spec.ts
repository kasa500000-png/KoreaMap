import { expect, test } from '@playwright/test';

test('self-hosted map is disconnected by default and waits for explicit operator consent', async ({
  page,
  context,
}) => {
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
  await page.goto('/tiles/');
  await expect(page.getByTestId('tiles-status')).toHaveAttribute('data-state', 'disconnected');
  await expect(page.getByRole('textbox', { name: '지도 스타일 URL' })).toHaveValue('');
  const consent = page.getByRole('checkbox');
  await expect(consent).not.toBeChecked();
  await expect(page.getByRole('button', { name: '지도 연결', exact: true })).toBeDisabled();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page
    .getByRole('textbox', { name: '지도 스타일 URL' })
    .fill('https://tiles.example.invalid/styles/standard.json');
  await expect(page.getByRole('button', { name: '지도 연결', exact: true })).toBeDisabled();
  await consent.check();
  await expect(page.getByRole('button', { name: '지도 연결', exact: true })).toBeEnabled();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page
    .getByRole('textbox', { name: '지도 스타일 URL' })
    .fill('https://tiles.example.invalid/styles/dark.json');
  await expect(consent).not.toBeChecked();
  await expect(page.getByRole('button', { name: '지도 연결', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '지역으로 이동' })).toBeDisabled();
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('disconnect during a pending style request prevents a late renderer mount', async ({
  page,
}) => {
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/pending-style.json', async (route) => {
    requested = true;
    await pending;
    // The consumer intentionally aborts this request before releasing the response.
    await route
      .fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ version: 8, sources: {}, layers: [] }),
      })
      .catch(() => {});
  });
  await page.goto('/tiles/');
  await page
    .getByRole('textbox', { name: '지도 스타일 URL' })
    .fill('http://127.0.0.1:4173/pending-style.json');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '지도 연결', exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  await page.getByRole('button', { name: '연결 해제', exact: true }).click();
  release();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await expect(page.getByTestId('tiles-status')).toHaveAttribute('data-state', 'disconnected');
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('unsafe and invalid style URLs fail before a provider request or renderer is created', async ({
  page,
  context,
}) => {
  const providerRequests: string[] = [];
  const errors: string[] = [];
  context.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== 'http://127.0.0.1:4173') providerRequests.push(url.origin);
  });
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === 'http://127.0.0.1:4173'
      ? route.continue()
      : route.abort(),
  );
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/tiles/');
  for (const value of [
    'not-a-style-url',
    'http://tiles.example.invalid/styles/standard.json',
    'file:///unavailable/style.json',
  ]) {
    await page.getByRole('textbox', { name: '지도 스타일 URL' }).fill(value);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: '지도 연결', exact: true }).click();
    await expect(page.getByTestId('tiles-status')).toHaveAttribute('data-state', 'error');
    await expect(page.locator('main [role="alert"]')).toContainText('스타일 주소');
    await expect(page.locator('canvas')).toHaveCount(0);
  }
  expect(providerRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('explicit local synthetic style can connect and consent withdrawal cleans up the map', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/operator-background.json', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        version: 8,
        sources: {},
        layers: [
          { id: 'own-background', type: 'background', paint: { 'background-color': '#e8eee9' } },
        ],
      }),
    }),
  );
  await page.goto('/tiles/');
  await page
    .getByRole('textbox', { name: '지도 스타일 URL' })
    .fill('http://127.0.0.1:4173/operator-background.json');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '지도 연결', exact: true }).click();
  await expect(page.getByTestId('tiles-status')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.maplibregl-ctrl-attrib')).toBeVisible();
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap contributors');
  await page.getByRole('combobox', { name: '이동할 지역' }).selectOption('ulsan');
  await page.getByRole('button', { name: '지역으로 이동' }).click();
  await expect(page.getByTestId('tiles-camera')).toContainText('129.31140, 35.53840');
  await expect(page.getByTestId('tiles-rendered')).toContainText('도로 0개');
  await page.getByRole('checkbox').uncheck();
  await expect(page.getByTestId('tiles-status')).toHaveAttribute('data-state', 'disconnected');
  await expect(page.locator('canvas, .kmk-place-selector, .maplibregl-ctrl')).toHaveCount(0);
  expect(errors).toEqual([]);
});
