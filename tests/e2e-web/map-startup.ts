import type { Page, TestInfo } from '@playwright/test';

// The synthetic example already requires navigation -> ready + 100 markers in
// <10s (quality.spec.ts). Share that functional budget across every phase.
// Playwright's unchanged runner deadline enforces the actual remaining test time.
export async function openMapDemo(page: Page, testInfo: TestInfo) {
  const startedAt = Date.now();
  const configuredNavigationTimeout = testInfo.project.use.navigationTimeout ?? 0;
  const budgetMs = Math.min(
    10_000,
    testInfo.timeout || Infinity,
    configuredNavigationTimeout || Infinity,
  );
  const deadline = startedAt + budgetMs;
  const remaining = () => {
    const timeout = deadline - Date.now();
    if (timeout <= 0)
      throw new Error(`Map startup exceeded the ${budgetMs}ms total initialization budget`);
    return timeout;
  };
  const phases: Record<string, number> = {};
  let phase = 'navigation';
  let finalStatus = 'not-attached';
  let failureStatus: string | undefined;
  let status: ReturnType<Page['getByTestId']> | undefined;
  const awaitState = async (requireMarkers: boolean) => {
    const result = await page.waitForFunction(
      (requireMarkers) => {
        const status = document.querySelector('[data-testid="status"]')?.textContent?.trim();
        const rendered = document.querySelector('[data-testid="rendered"]')?.textContent?.trim();
        if (
          status === 'error' ||
          status === 'destroyed' ||
          (status === 'ready' && (!requireMarkers || rendered === '화면 마커: 100'))
        )
          return { status, rendered };
        return false;
      },
      requireMarkers,
      { polling: 25, timeout: remaining() },
    );
    const observed = await result.jsonValue();
    await result.dispose();
    if (!observed || observed.status !== 'ready') {
      failureStatus = observed ? observed.status : 'unknown';
      throw new Error(`Map initialization ended with status ${failureStatus}`);
    }
    finalStatus = observed.status;
  };
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: remaining() });
    phases.navigationMs = Date.now() - startedAt;
    phase = 'client-attachment';
    status = page.getByTestId('status');
    await status.waitFor({ state: 'attached', timeout: remaining() });
    phases.clientAttachedMs = Date.now() - startedAt;
    phase = 'map-ready';
    await awaitState(false);
    phases.mapReadyMs = Date.now() - startedAt;
    phase = 'initial-markers';
    await awaitState(true);
    remaining();
    phases.initialMarkersMs = Date.now() - startedAt;
    phase = 'complete';
  } finally {
    if (status) {
      try {
        const value = (await status.textContent({ timeout: 100 }))?.trim();
        finalStatus = ['loading', 'ready', 'error', 'destroyed'].includes(value ?? '')
          ? value!
          : 'unavailable';
      } catch {
        finalStatus = 'unavailable';
      }
    }
    const elapsedMs = Date.now() - startedAt;
    const readyElapsedMs =
      phases.clientAttachedMs === undefined
        ? undefined
        : (phases.mapReadyMs ?? elapsedMs) - phases.clientAttachedMs;
    const legacyReadyFiveSeconds = {
      targetMs: 5_000,
      elapsedMs: readyElapsedMs ?? null,
      status:
        phases.mapReadyMs !== undefined
          ? readyElapsedMs! < 5_000
            ? 'PASS'
            : 'FAIL'
          : readyElapsedMs !== undefined && readyElapsedMs >= 5_000
            ? 'FAIL'
            : 'NOT_MEASURED',
    };
    const diagnostic = {
      diagnosticOnly: true,
      phase,
      budgetMs,
      elapsedMs,
      finalStatus,
      failureStatus: failureStatus ?? null,
      ...phases,
      legacyReadyFiveSeconds,
    };
    console.log('MAP_STARTUP_DIAGNOSTIC', JSON.stringify(diagnostic));
    await testInfo.attach('map-startup-phases', {
      body: JSON.stringify(diagnostic),
      contentType: 'application/json',
    });
  }
}
