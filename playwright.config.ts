import { defineConfig } from '@playwright/test';
const qaBrowser = process.env.KMK_QA_BROWSER;
if (qaBrowser && !['chromium', 'firefox', 'webkit'].includes(qaBrowser))
  throw new Error('KMK_QA_BROWSER must be chromium, firefox or webkit');
const chromiumLaunch = {
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {}),
  args: ['--enable-unsafe-swiftshader'],
};
export default defineConfig({
  testDir: './tests/e2e-web',
  ...(qaBrowser
    ? {
        outputDir: `artifacts/qa/browser-lifecycle/${qaBrowser}/results`,
        projects: [
          {
            name: `lifecycle-${qaBrowser}`,
            testMatch: '**/browser-lifecycle.spec.ts',
            use: {
              browserName: qaBrowser as 'chromium' | 'firefox' | 'webkit',
              launchOptions: qaBrowser === 'chromium' ? chromiumLaunch : {},
            },
          },
        ],
      }
    : { testIgnore: '**/browser-lifecycle.spec.ts' }),
  timeout: 30_000,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    serviceWorkers: 'block',
    launchOptions: chromiumLaunch,
  },
  webServer: {
    command: 'node scripts/serve-web.mjs',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
});
