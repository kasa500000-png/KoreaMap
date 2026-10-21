import { afterEach, expect, it, vi } from 'vitest';
import type { Page, TestInfo } from '@playwright/test';
import { openMapDemo } from '../e2e-web/map-startup';

type Scene = { attached: boolean; status: string; rendered: string };
type WaitOptions = { polling?: number; timeout: number };
type Handle = { jsonValue(): Promise<unknown>; dispose(): Promise<void> };

function harness(timeout = 90_000, navigationTimeout?: number) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T00:00:00Z'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const began = Date.now();
  const scene: Scene = { attached: true, status: 'loading', rendered: '화면 마커: 0' };
  const at = (ms: number, patch: Partial<Scene>) =>
    setTimeout(() => Object.assign(scene, patch), ms);
  const elements = {
    status: {
      get textContent() {
        return scene.status;
      },
    },
    rendered: {
      get textContent() {
        return scene.rendered;
      },
    },
  };
  vi.stubGlobal('document', {
    querySelector: (selector: string) => {
      if (!scene.attached) return null;
      if (selector.includes('"status"') || selector.includes("'status'")) return elements.status;
      if (selector.includes('"rendered"') || selector.includes("'rendered'"))
        return elements.rendered;
      throw new Error(`Unexpected browser selector: ${selector}`);
    },
  });
  const waitExpired = new Error('Browser wait timed out');
  const poll = (predicate: () => unknown, options: WaitOptions) =>
    new Promise<unknown>((resolve, reject) => {
      // A zero Playwright timeout disables the local bound.
      const deadline = options.timeout > 0 ? Date.now() + options.timeout : Infinity;
      const check = () => {
        try {
          const result = predicate();
          if (result) {
            resolve(result);
            return;
          }
        } catch (error) {
          reject(error);
          return;
        }
        const remaining = deadline - Date.now();
        if (remaining <= 0) reject(waitExpired);
        else setTimeout(check, Math.min(options.polling ?? 25, remaining));
      };
      check();
    });
  const handles: Handle[] = [];
  const locator = {
    waitFor: vi.fn(async (options: { state: string; timeout: number }) => {
      await poll(() => scene.attached, options);
    }),
    textContent: vi.fn(async () => (scene.attached ? scene.status : null)),
  };
  const page = {
    goto: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    getByTestId: vi.fn(() => locator),
    waitForFunction: vi.fn(
      async (predicate: (arg: unknown) => unknown, arg: unknown, options: WaitOptions) => {
        // Execute the real browser predicate; only the DOM and clock are replaced.
        const value = await poll(() => predicate(arg), options);
        const handle = { jsonValue: vi.fn(async () => value), dispose: vi.fn(async () => {}) };
        handles.push(handle);
        return handle;
      },
    ),
  };
  const testInfo = {
    timeout,
    project: { use: navigationTimeout === undefined ? {} : { navigationTimeout } },
    attach: vi
      .fn<(_: string, attachment: { body: string; contentType: string }) => Promise<void>>()
      .mockResolvedValue(undefined),
  };
  return {
    scene,
    at,
    page,
    locator,
    handles,
    testInfo,
    waitExpired,
    elapsed: () => Date.now() - began,
    diagnostics: () => {
      const attachment = testInfo.attach.mock.calls.find(([name]) => name === 'map-startup-phases');
      expect(attachment).toBeDefined();
      return JSON.parse(attachment![1].body) as Record<string, unknown>;
    },
    open: () => openMapDemo(page as unknown as Page, testInfo as unknown as TestInfo),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('navigation, attachment and never-ready initialization share one total ten-second ceiling', async () => {
  const h = harness();
  h.scene.attached = false;
  h.page.goto.mockImplementation(async () => {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  });
  h.at(4_000, { attached: true });
  let settled = false;
  const opening = h.open().finally(() => {
    settled = true;
  });
  const rejected = expect(opening).rejects.toBe(h.waitExpired);
  await vi.advanceTimersByTimeAsync(9_999);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await rejected;
  expect(h.elapsed()).toBe(10_000);
});

it('waiting for the initial hundred markers cannot add a fresh ten-second budget', async () => {
  const h = harness();
  h.page.goto.mockImplementation(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  });
  h.at(7_000, { status: 'ready' });
  h.at(11_000, { rendered: '화면 마커: 100' });
  const rejected = expect(h.open()).rejects.toBe(h.waitExpired);
  await vi.advanceTimersByTimeAsync(10_000);
  await rejected;
  expect(h.elapsed()).toBe(10_000);
  expect(h.scene.rendered).toBe('화면 마커: 0');
});

it('an explicit navigation cap bounds the entire startup after navigation returns', async () => {
  const h = harness(90_000, 500);
  h.page.goto.mockImplementation(async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
  const rejected = expect(h.open()).rejects.toBe(h.waitExpired);
  await vi.advanceTimersByTimeAsync(500);
  await rejected;
  expect(h.elapsed()).toBe(500);
});

it('a shorter test timeout supplies the local ceiling while the runner owns its actual remaining time', async () => {
  const h = harness(800);
  const rejected = expect(h.open()).rejects.toBe(h.waitExpired);
  await vi.advanceTimersByTimeAsync(800);
  await rejected;
  expect(h.elapsed()).toBe(800);
});

it('disabled runner and navigation timeout settings cannot disable the ten-second startup ceiling', async () => {
  const h = harness(0, 0);
  const rejected = expect(h.open()).rejects.toBe(h.waitExpired);
  await vi.advanceTimersByTimeAsync(10_000);
  await rejected;
  expect(h.elapsed()).toBe(10_000);
});

it('a client that never attaches remains bounded by the same startup deadline', async () => {
  const h = harness(1_000);
  h.scene.attached = false;
  const rejected = expect(h.open()).rejects.toBe(h.waitExpired);
  await vi.advanceTimersByTimeAsync(1_000);
  await rejected;
  expect(h.page.waitForFunction).not.toHaveBeenCalled();
});

it('an exhausted budget cannot turn the following attachment wait into an infinite zero timeout', async () => {
  const h = harness();
  h.page.goto.mockImplementation(async () => {
    vi.setSystemTime(Date.now() + 10_000);
  });
  await expect(h.open()).rejects.toThrow();
  expect(h.locator.waitFor).not.toHaveBeenCalled();
});

for (const status of ['error', 'destroyed']) {
  it(`a terminal ${status} fails immediately even if readiness would follow`, async () => {
    const h = harness();
    h.at(100, { status });
    h.at(200, { status: 'ready', rendered: '화면 마커: 100' });
    const rejected = expect(h.open()).rejects.toThrow(new RegExp(status, 'i'));
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(h.elapsed()).toBe(100);
    expect(h.diagnostics().failureStatus).toBe(status);
  });

  it(`a terminal ${status} during initial marker rendering cannot become a later success`, async () => {
    const h = harness();
    h.at(100, { status: 'ready' });
    h.at(200, { status });
    h.at(300, { status: 'ready', rendered: '화면 마커: 100' });
    const rejected = expect(h.open()).rejects.toThrow(new RegExp(status, 'i'));
    await vi.advanceTimersByTimeAsync(200);
    await rejected;
    expect(h.elapsed()).toBe(200);
    expect(h.diagnostics().failureStatus).toBe(status);
  });
}

it('navigation errors propagate without starting attachment or initialization waits', async () => {
  const h = harness();
  const navigationFailure = new Error('Navigation failed');
  h.page.goto.mockRejectedValue(navigationFailure);
  await expect(h.open()).rejects.toBe(navigationFailure);
  expect(h.locator.waitFor).not.toHaveBeenCalled();
  expect(h.page.waitForFunction).not.toHaveBeenCalled();
});

it('ready status alone is insufficient until all hundred initial markers are rendered', async () => {
  const h = harness();
  h.at(250, { status: 'ready', rendered: '화면 마커: 99' });
  h.at(750, { rendered: '화면 마커: 100' });
  let settled = false;
  const opening = h.open().finally(() => {
    settled = true;
  });
  await vi.advanceTimersByTimeAsync(749);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await opening;
  expect(h.elapsed()).toBe(750);
  expect(h.handles).toHaveLength(2);
  for (const handle of h.handles) expect(handle.dispose).toHaveBeenCalledOnce();
});

it('readiness at exactly ten seconds does not satisfy the existing less-than-ten-second requirement', async () => {
  const h = harness();
  h.at(10_000, { status: 'ready', rendered: '화면 마커: 100' });
  const rejected = expect(h.open()).rejects.toThrow(/budget/);
  await vi.advanceTimersByTimeAsync(10_000);
  await rejected;
});

it('a six-second successful startup reports the legacy five-second diagnostic as FAIL', async () => {
  const h = harness();
  h.at(6_000, { status: 'ready', rendered: '화면 마커: 100' });
  const opening = h.open();
  await vi.advanceTimersByTimeAsync(6_000);
  await opening;
  expect(h.elapsed()).toBe(6_000);
  const diagnostic = h.diagnostics();
  expect(diagnostic.phase).toBe('complete');
  expect(diagnostic.legacyReadyFiveSeconds).toEqual({
    targetMs: 5_000,
    elapsedMs: 6_000,
    status: 'FAIL',
  });
});
