import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import {
  assertDeclarationProbe,
  summarizeDeclarationProbe,
} from '../scripts/declaration-probe.mjs';

test('normal compiler completion is required and failed compiler diagnostics include both output streams', () => {
  const escape = String.fromCharCode(27);
  const summary = summarizeDeclarationProbe(
    {
      status: 2,
      signal: null,
      stdout: `${escape}[31mC:\\consumer\\node_modules\\upstream\\index.d.ts(3,2): error TS2834: Explicit extensions required.${escape}[0m\r\n`,
      stderr:
        'C:\\consumer\\consumer.ts(1,1): error TS2307: Cannot find module.\nerror TS2834: Repeated code.\n',
    },
    { roots: ['C:\\consumer'] },
  );
  assert.equal(summary.status, 'FAIL');
  assert.equal(summary.completed, true);
  assert.equal(summary.exitCode, 2);
  assert.equal(summary.reason, 'COMPILER_ERRORS');
  assert.deepEqual(summary.diagnosticCodes, ['TS2834', 'TS2307']);
  assert.deepEqual(summary.diagnosticFiles, [
    '<root>/node_modules/upstream/index.d.ts',
    '<root>/consumer.ts',
  ]);
  assert.equal(summary.diagnostics.length, 3);
  assert(summary.diagnostics.every((line) => !line.includes(escape) && !line.includes('C:')));
  assert.throws(() => assertDeclarationProbe(summary, 'Web NodeNext'), /Web NodeNext.*TS2834/);
});

test('a successful compiler has a completed PASS while missing completion is NOT_RUN', () => {
  const pass = summarizeDeclarationProbe({ status: 0, signal: null, stdout: '', stderr: '' });
  assert.deepEqual(pass, {
    status: 'PASS',
    completed: true,
    exitCode: 0,
    signal: null,
    executionErrorCode: null,
    reason: 'SUCCESS',
    diagnosticCodes: [],
    diagnosticFiles: [],
    diagnostics: [],
  });
  assert.doesNotThrow(() => assertDeclarationProbe(pass));
  const missing = summarizeDeclarationProbe(undefined);
  assert.equal(missing.status, 'NOT_RUN');
  assert.equal(missing.reason, 'NO_COMPLETION');
  assert.throws(() => assertDeclarationProbe(missing));
  assert.throws(() => assertDeclarationProbe({ ...pass, completed: false }));
});

test('signal interruption and startup failure cannot pass even with misleading zero exit status', () => {
  const killed = summarizeDeclarationProbe({ status: null, signal: 'SIGTERM' });
  assert.equal(killed.status, 'NOT_RUN');
  assert.equal(killed.reason, 'SIGNALLED');
  assert.equal(killed.signal, 'SIGTERM');
  assert.throws(() => assertDeclarationProbe(killed));
  const startup = summarizeDeclarationProbe({ status: 0, error: { code: 'ENOENT' } });
  assert.equal(startup.status, 'NOT_RUN');
  assert.equal(startup.completed, false);
  assert.equal(startup.reason, 'START_FAILED');
  assert.equal(startup.executionErrorCode, 'ENOENT');
  assert.throws(() => assertDeclarationProbe(startup));
});

test('an actual timed-out child and unavailable executable are reported as uncompleted probes', () => {
  const timedOut = spawnSync(process.execPath, ['--eval', 'setInterval(() => {}, 1000)'], {
    encoding: 'utf8',
    timeout: 50,
  });
  const timeoutSummary = summarizeDeclarationProbe(timedOut);
  assert.equal(timeoutSummary.status, 'NOT_RUN');
  assert.equal(timeoutSummary.completed, false);
  assert.equal(timeoutSummary.reason, 'TIMED_OUT');
  assert.equal(timeoutSummary.executionErrorCode, 'ETIMEDOUT');
  assert.throws(() => assertDeclarationProbe(timeoutSummary));
  const unavailable = summarizeDeclarationProbe(
    spawnSync('kmk-nonexistent-compiler-7e8b0a', [], { encoding: 'utf8' }),
  );
  assert.equal(unavailable.status, 'NOT_RUN');
  assert.equal(unavailable.reason, 'START_FAILED');
  assert.equal(unavailable.executionErrorCode, 'ENOENT');
});

test('actual Node gate processes exit nonzero after retaining a failed or uncompleted probe summary', () => {
  const helper = new URL('../scripts/declaration-probe.mjs', import.meta.url).href;
  const source = `import { summarizeDeclarationProbe, assertDeclarationProbe } from ${JSON.stringify(helper)};
const summary = summarizeDeclarationProbe(JSON.parse(process.argv[1]));
console.log(JSON.stringify(summary));
assertDeclarationProbe(summary, 'Public declarations');`;
  for (const [result, status, reason, exitCode] of [
    [{ status: 0, signal: null }, 'PASS', 'SUCCESS', 0],
    [{ status: 2, stdout: 'error TS2834: declaration failure' }, 'FAIL', 'COMPILER_ERRORS', 1],
    [{ status: 1 }, 'FAIL', 'EXIT_NONZERO', 1],
    [{ status: null, signal: 'SIGTERM' }, 'NOT_RUN', 'SIGNALLED', 1],
    [{ status: null, error: { code: 'ETIMEDOUT' } }, 'NOT_RUN', 'TIMED_OUT', 1],
    [{ status: null, error: { code: 'ENOENT' } }, 'NOT_RUN', 'START_FAILED', 1],
    [{}, 'NOT_RUN', 'NO_COMPLETION', 1],
  ]) {
    const child = spawnSync(
      process.execPath,
      ['--input-type=module', '--eval', source, JSON.stringify(result)],
      { encoding: 'utf8', timeout: 5000 },
    );
    assert.equal(child.status, exitCode, child.stderr);
    assert.equal(child.signal, null);
    const summary = JSON.parse(child.stdout);
    assert.equal(summary.status, status);
    assert.equal(summary.reason, reason);
  }
});

test('compiler diagnostic collection is bounded and normalizes overlapping root prefixes', () => {
  const summary = summarizeDeclarationProbe(
    {
      status: 2,
      stdout: Array.from(
        { length: 200 },
        (_, i) => `/workspace/consumer/file${i}.ts(1,1): error TS2307: ${'x'.repeat(3000)}`,
      ).join('\n'),
    },
    { roots: ['/workspace', '/workspace/consumer'] },
  );
  assert.equal(summary.diagnostics.length, 100);
  assert(summary.diagnostics.every((line) => line.length <= 2048));
  assert.equal(summary.diagnosticFiles[0], '<root>/file0.ts');
});
