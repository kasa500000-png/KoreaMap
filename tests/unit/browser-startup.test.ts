import { afterEach, expect, it, vi } from 'vitest';
import type { Page, TestInfo } from '@playwright/test';
import { openMapDemo } from '../e2e-web/map-startup';

const ready = vi.hoisted(() => vi.fn<() => Promise<void>>());
vi.mock('@playwright/test', () => ({
  expect: () => ({ toHaveText: ready }),
}));

function harness(timeout = 1_000, navigationTimeout?: number) {
  const start = new Date('2026-10-21T00:00:00Z');
  vi.useFakeTimers();
  vi.setSystemTime(start);
  const locator = {
    waitFor: vi.fn<(_: { state: string; timeout: number }) => Promise<void>>(),
  };
  const page = {
    goto: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    getByTestId: vi.fn(() => locator),
  };
  const testInfo = {
    timeout,
    project: { use: navigationTimeout === undefined ? {} : { navigationTimeout } },
    attach: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
  ready.mockResolvedValue(undefined);
  return {
    locator,
    page,
    testInfo,
    open: () => openMapDemo(page as unknown as Page, testInfo as unknown as TestInfo),
  };
}

afterEach(() => {
  vi.useRealTimers();
  ready.mockReset();
});

it('navigation and a client that never attaches share one local test-timeout ceiling', async () => {
  const { page, locator, open } = harness();
  const attachmentFailure = new Error('client never attached');
  page.goto.mockImplementation(async () => {
    await new Promise((resolve) => setTimeout(resolve, 650));
  });
  locator.waitFor.mockImplementation(({ timeout }) => {
    // Playwright treats zero as no timeout. Preserve that behavior in this double.
    return new Promise((_, reject) => {
      if (timeout > 0) setTimeout(() => reject(attachmentFailure), timeout);
    });
  });
  const opening = open();
  const rejected = expect(opening).rejects.toBe(attachmentFailure);
  await vi.advanceTimersByTimeAsync(999);
  expect(ready).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await rejected;
  expect(Date.now()).toBe(new Date('2026-10-21T00:00:01Z').getTime());
  expect(ready).not.toHaveBeenCalled();
});

it('an explicit navigation deadline also bounds a client that never attaches', async () => {
  const { locator, open } = harness(10_000, 500);
  const attachmentFailure = new Error('navigation deadline reached');
  locator.waitFor.mockImplementation(({ timeout }) => {
    return new Promise((_, reject) => {
      if (timeout > 0) setTimeout(() => reject(attachmentFailure), timeout);
    });
  });
  const rejected = expect(open()).rejects.toBe(attachmentFailure);
  await vi.advanceTimersByTimeAsync(500);
  await rejected;
  expect(ready).not.toHaveBeenCalled();
});

it('an exhausted deadline fails before a zero timeout can disable attachment bounds', async () => {
  const { page, locator, open } = harness();
  page.goto.mockImplementation(async () => {
    vi.setSystemTime(new Date('2026-10-21T00:00:01Z'));
  });
  await expect(open()).rejects.toThrow();
  expect(locator.waitFor).not.toHaveBeenCalled();
  expect(ready).not.toHaveBeenCalled();
});

it('navigation failures propagate without starting client or map readiness waits', async () => {
  const { page, locator, open } = harness();
  const navigationFailure = new Error('navigation failed');
  page.goto.mockRejectedValue(navigationFailure);
  await expect(open()).rejects.toBe(navigationFailure);
  expect(locator.waitFor).not.toHaveBeenCalled();
  expect(ready).not.toHaveBeenCalled();
});

it('a mounted map readiness failure propagates through the unchanged default assertion', async () => {
  const { locator, open } = harness();
  const mapFailure = new Error('map status is error instead of ready');
  locator.waitFor.mockResolvedValue(undefined);
  ready.mockRejectedValue(mapFailure);
  await expect(open()).rejects.toBe(mapFailure);
  expect(ready).toHaveBeenCalledExactlyOnceWith('ready');
});
