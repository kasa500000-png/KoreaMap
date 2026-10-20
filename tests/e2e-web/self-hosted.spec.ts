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

test('operator UI picks overlapping synthetic POIs, deduplicates choices, focuses the place card and cleans up', async ({
  page,
  context,
}, testInfo) => {
  const failures: string[] = [];
  page.on('pageerror', () => failures.push('PAGE_ERROR'));
  await context.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === 'http://127.0.0.1:4173') return route.continue();
    failures.push('UNEXPECTED_NETWORK');
    return route.abort();
  });
  await page.route('**/operator-picking.json', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        version: 8,
        sources: {
          authored: {
            type: 'geojson',
            attribution: '자체 합성 POI · MIT',
            data: {
              type: 'FeatureCollection',
              features: ['one', 'two', 'one'].map((id) => ({
                type: 'Feature',
                properties: {
                  fid: `synthetic-${id}`,
                  'name:ko': id === 'one' ? '합성 한빛공원' : '합성 솔빛도서관',
                },
                geometry: { type: 'Point', coordinates: [126.978, 37.5665] },
              })),
            },
          },
        },
        layers: [
          { id: 'background', type: 'background', paint: { 'background-color': '#eef2ed' } },
          {
            id: 'korea-label-poi',
            source: 'authored',
            type: 'circle',
            paint: { 'circle-radius': 9, 'circle-color': '#0e7490' },
          },
        ],
      }),
    }),
  );
  await page.goto('/tiles/');
  await page
    .getByRole('textbox', { name: '지도 스타일 URL' })
    .fill('http://127.0.0.1:4173/operator-picking.json');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '지도 연결', exact: true }).click();
  await expect(page.getByTestId('tiles-status')).toHaveAttribute('data-state', 'ready');
  await expect(page.getByTestId('tiles-rendered')).toContainText('라벨 3개');
  const canvas = page.locator('canvas');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw Error('Canvas missing');
  await canvas.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
  const card = page.getByRole('region', { name: '선택한 장소' });
  await expect(card.getByRole('heading')).toHaveText('가까운 장소 선택');
  await expect(card.getByRole('listitem')).toHaveCount(2);
  await expect(card.getByRole('button', { name: '합성 한빛공원', exact: true })).toHaveCount(1);
  await card.getByRole('button', { name: '합성 한빛공원', exact: true }).click();
  const title = card.getByRole('heading', { name: '합성 한빛공원', exact: true });
  await expect(title).toBeVisible();
  await expect(title).toBeFocused();
  await expect(card.getByRole('listitem')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('synthetic-place-card.png'), fullPage: true });
  await card.getByRole('button', { name: '장소 카드 닫기' }).click();
  await expect(card).toHaveCount(0);
  await expect(canvas).toBeFocused();
  await page.getByRole('button', { name: '지도 확대', exact: true }).click();
  await expect(page.getByTestId('tiles-camera')).toContainText('z15.0');
  await page.getByRole('button', { name: '지도 축소', exact: true }).click();
  await expect(page.getByTestId('tiles-camera')).toContainText('z14.0');
  await page.getByRole('button', { name: '연결 해제', exact: true }).click();
  await expect(page.getByTestId('tiles-status')).toHaveAttribute('data-state', 'disconnected');
  await expect(page.locator('canvas, .kmk-place-selector, .maplibregl-ctrl')).toHaveCount(0);
  await expect(card).toHaveCount(0);
  expect(failures).toEqual([]);
});
