import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parseBrowserLifecycleOptions } from '../scripts/verify-browser-lifecycle.mjs';

test('browser QA accepts one explicit local browser and optional headed mode', () => {
  for (const browser of ['chromium', 'firefox', 'webkit']) {
    assert.deepEqual(parseBrowserLifecycleOptions([`--browser=${browser}`]), {
      browser,
      headed: false,
    });
    assert.deepEqual(parseBrowserLifecycleOptions([`--browser=${browser}`, '--headed']), {
      browser,
      headed: true,
    });
  }
});
test('browser QA cannot silently choose another browser, install a payload or ignore duplicate input', () => {
  for (const args of [
    [],
    ['--browser=safari'],
    ['--headed'],
    ['--browser=firefox', '--browser=webkit'],
    ['--browser=firefox', '--browser=firefox'],
    ['--browser=webkit', '--headed', '--headed'],
    ['--browser=chromium', '--install'],
  ])
    assert.throws(() => parseBrowserLifecycleOptions(args));
});
test('CI keeps browser portability independent and runs actual headed rendering with system prerequisites', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const job = workflow.split('  browser-portability:\n')[1]?.split('  windows:\n')[0];
  assert(job, 'Browser portability job required');
  assert.match(job, /browser: \[chromium, firefox, webkit\]/);
  assert.match(job, /fail-fast: false/);
  assert.match(job, /playwright install --with-deps/);
  assert.match(job, /xvfb-run --auto-servernum pnpm verify:browser-lifecycle --browser=/);
  assert.match(job, /--headed/);
  assert.doesNotMatch(job, /needs:|continue-on-error:|SKIP_VALIDATE_HOST_REQUIREMENTS|\|\|\s*true/);
});
