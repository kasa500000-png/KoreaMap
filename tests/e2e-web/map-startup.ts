import { expect, type Page, type TestInfo } from '@playwright/test';

// Next's ssr:false map module attaches after document navigation. Keep that
// phase inside the existing runner deadline before starting the unchanged
// map-ready assertion budget. The local ceiling also covers both phases when
// an explicit navigation timeout is configured; the runner enforces the actual
// remaining test time (TestInfo does not expose a public start time).
export async function openMapDemo(page: Page, testInfo: TestInfo) {
  const startedAt = Date.now();
  const configuredNavigationTimeout = testInfo.project.use.navigationTimeout ?? 0;
  const deadline =
    startedAt + Math.min(testInfo.timeout || Infinity, configuredNavigationTimeout || Infinity);
  const remaining = () => {
    if (!Number.isFinite(deadline)) return 0;
    const timeout = deadline - Date.now();
    if (timeout <= 0) throw new Error('Map client attachment exceeded the navigation deadline');
    return timeout;
  };
  const phases: Record<string, number> = {};
  let phase = 'navigation';
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: remaining() });
    phases.navigationMs = Date.now() - startedAt;
    phase = 'client-attachment';
    const status = page.getByTestId('status');
    await status.waitFor({ state: 'attached', timeout: remaining() });
    phases.clientAttachedMs = Date.now() - startedAt;
    phase = 'map-ready';
    await expect(status).toHaveText('ready');
    phases.mapReadyMs = Date.now() - startedAt;
    phase = 'complete';
  } finally {
    await testInfo.attach('map-startup-phases', {
      body: JSON.stringify({ diagnosticOnly: true, phase, ...phases }),
      contentType: 'application/json',
    });
  }
}
