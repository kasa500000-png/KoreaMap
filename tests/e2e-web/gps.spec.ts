import { test, expect } from '@playwright/test';
test('mock GPS: consent, live path, pause segments, delete/export/import, multiple tracks and replay', async ({
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
  await page.goto('/gps/');
  await expect(page.getByTestId('gps-status')).toHaveText('준비 완료');
  await expect(page.getByRole('button', { name: '기록 시작', exact: true })).toBeDisabled();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '기록 시작', exact: true }).click();
  await expect(page.getByTestId('gps-status')).toHaveText('위치 구독 중');
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '모의 GPS 한 걸음' }).click();
  await expect(page.getByTestId('gps-metrics')).toContainText('4점');
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  await expect(page.getByTestId('gps-metrics')).toContainText('paused');
  await expect(page.getByRole('button', { name: '모의 GPS 한 걸음' })).toBeDisabled();
  await page.getByRole('button', { name: '재개', exact: true }).click();
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: '모의 GPS 한 걸음' }).click();
  await page.getByRole('button', { name: '종료', exact: true }).click();
  await expect(page.getByTestId('gps-metrics')).toContainText('stopped · 6점');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'GeoJSON 내보내기' }).click();
  expect((await download).suggestedFilename()).toBe('korea-map-track.geojson');
  const text = await page.getByRole('textbox', { name: '경로 파일 내용' }).inputValue();
  const record = JSON.parse(text) as { features: unknown[] };
  expect(record.features).toHaveLength(2);
  const parallel = JSON.parse(text) as {
    features: { geometry: { coordinates: [number, number][] } }[];
  };
  for (const feature of parallel.features)
    feature.geometry.coordinates = feature.geometry.coordinates.map(([x, y]) => [x, y + 0.0002]);
  await page.getByRole('textbox', { name: '경로 파일 내용' }).fill(JSON.stringify(parallel));
  await page.getByRole('button', { name: '경로 불러오기', exact: true }).click();
  await expect(page.getByTestId('gps-tracks')).toHaveText('표시 경로 2개');
  await page.getByRole('button', { name: '경로 리플레이', exact: true }).click();
  await expect(page.getByTestId('gps-replay')).toHaveText('리플레이: 완료');
  await expect(page.getByRole('combobox', { name: '지도 장소 선택' })).toContainText(
    '경로 리플레이',
  );
  await page.screenshot({ path: 'test-results/gps-tracks.png', fullPage: true });
  const gpxDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'GPX 내보내기' }).click();
  await gpxDownload;
  await page.getByRole('button', { name: '경로 불러오기', exact: true }).click();
  await expect(page.getByTestId('gps-tracks')).toHaveText('표시 경로 3개');
  await page.getByRole('button', { name: '모든 기록 삭제' }).click();
  await expect(page.getByTestId('gps-metrics')).toContainText('idle · 0점 · 0.0m');
  await expect(page.getByTestId('gps-tracks')).toHaveText('표시 경로 0개');
  await expect(page.getByRole('textbox', { name: '경로 파일 내용' })).toBeEmpty();
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await expect(
    page.getByRole('combobox', { name: '지도 장소 선택' }).locator('option'),
  ).toHaveCount(1);
  await page.goto('/api/');
  await expect(page.getByTestId('api-status')).toHaveText('ready');
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('real browser geolocation API: no prompt before consent, granted fixes, denied permission and visibility stop', async ({
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
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ longitude: 126.978, latitude: 37.5665, accuracy: 12 });
  await page.goto('/gps/');
  await expect(page.getByTestId('gps-status')).toHaveText('준비 완료');
  await page.getByRole('combobox', { name: '위치 공급자' }).selectOption('browser');
  await expect(page.getByRole('button', { name: '현재 위치', exact: true })).toBeDisabled();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '현재 위치', exact: true }).click();
  await expect(page.getByTestId('gps-status')).toHaveText('현재 위치 · 정확도 12m');
  await page.getByRole('button', { name: '기록 시작', exact: true }).click();
  await expect(page.getByTestId('gps-metrics')).toContainText('1점');
  await context.setGeolocation({ longitude: 126.97801, latitude: 37.5665, accuracy: 15 });
  // Lifecycle dispatch is a simulation; this does not prove OS background execution.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByTestId('gps-metrics')).toContainText('paused');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByTestId('gps-metrics')).toContainText('paused');
  await page.getByRole('button', { name: '모든 기록 삭제' }).click();
  const cdp = await context.newCDPSession(page);
  const { targetInfo } = await cdp.send('Target.getTargetInfo');
  if (!targetInfo.browserContextId) throw new Error('Expected isolated browser context');
  await cdp.send('Browser.setPermission', {
    permission: { name: 'geolocation' },
    setting: 'denied',
    origin: 'http://127.0.0.1:4173',
    browserContextId: targetInfo.browserContextId,
  });
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '현재 위치', exact: true }).click();
  await expect(page.getByTestId('gps-status')).toHaveText('PERMISSION_DENIED');
  await page.getByRole('button', { name: '기록 시작', exact: true }).click();
  await expect(page.getByTestId('gps-status')).toHaveText('PERMISSION_DENIED');
  await expect(page.getByTestId('gps-metrics')).toContainText('paused · 0점');
  await cdp.detach();
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
