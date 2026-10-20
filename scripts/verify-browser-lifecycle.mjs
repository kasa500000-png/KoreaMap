// Optional real browser QA. Prerequisites are installed explicitly; this runner downloads nothing.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function parseBrowserLifecycleOptions(args) {
  const browsers = args.filter((arg) => /^--browser=(chromium|firefox|webkit)$/.test(arg));
  assert.equal(browsers.length, 1, 'One explicit --browser=chromium|firefox|webkit required');
  assert(
    args.every((arg) => arg === browsers[0] || arg === '--headed') &&
      new Set(args).size === args.length,
    'Only unique browser and optional --headed flags are supported',
  );
  return { browser: browsers[0].slice('--browser='.length), headed: args.includes('--headed') };
}

export function verifyBrowserLifecycle(options) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const report = resolve(root, 'artifacts/qa/browser-lifecycle', options.browser, 'report.json');
  mkdirSync(dirname(report), { recursive: true });
  const require = createRequire(import.meta.url);
  const result = spawnSync(
    process.execPath,
    [
      require.resolve('@playwright/test/cli'),
      'test',
      '--config=playwright.config.ts',
      '--reporter=list,json',
      ...(options.headed ? ['--headed'] : []),
    ],
    {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        KMK_QA_BROWSER: options.browser,
        PLAYWRIGHT_JSON_OUTPUT_NAME: report,
      },
    },
  );
  return result.error || result.signal || result.status === null ? 1 : result.status;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    process.exitCode = verifyBrowserLifecycle(parseBrowserLifecycleOptions(process.argv.slice(2)));
  } catch {
    console.error('Browser lifecycle QA requires explicit valid options and local prerequisites.');
    process.exitCode = 1;
  }
}
