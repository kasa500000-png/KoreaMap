import assert from 'node:assert/strict';

const ansi = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g');

/** A compiler must finish normally; a killed, timed-out or unstarted probe is not a pass. */
export function summarizeDeclarationProbe(result, { roots = [] } = {}) {
  const prefixes = roots
    .filter((root) => typeof root === 'string' && root.length > 0)
    .map((root) => root.replaceAll('\\', '/').replace(/\/$/, ''))
    .sort((a, b) => b.length - a.length);
  const output = [result?.stdout, result?.stderr]
    .map((value) => (value == null ? '' : String(value)))
    .join('\n')
    .replace(ansi, '')
    .replaceAll('\\', '/')
    .replaceAll('\r', '');
  const normalized = prefixes.reduce(
    (text, prefix) => text.replaceAll(`${prefix}/`, '<root>/').replaceAll(prefix, '<root>'),
    output,
  );
  const diagnostics = [
    ...new Set(
      normalized
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => /\b(?:error|warning) TS\d+:/.test(line))
        .map((line) => line.slice(0, 2048)),
    ),
  ].slice(0, 100);
  const diagnosticCodes = [...new Set(diagnostics.flatMap((line) => line.match(/\bTS\d+/g) ?? []))];
  const diagnosticFiles = [
    ...new Set(
      diagnostics.flatMap((line) => {
        const match = /^(.+?)\(\d+,\d+\):\s*(?:error|warning) TS\d+:/.exec(line);
        return match ? [match[1]] : [];
      }),
    ),
  ];
  const exitCode = Number.isInteger(result?.status) ? result.status : null;
  const signal = typeof result?.signal === 'string' && result.signal ? result.signal : null;
  const executionErrorCode = result?.error ? String(result.error.code ?? 'PROCESS_ERROR') : null;
  const completed = exitCode !== null && signal === null && !result?.error;
  const reason =
    executionErrorCode === 'ETIMEDOUT'
      ? 'TIMED_OUT'
      : signal
        ? 'SIGNALLED'
        : result?.error
          ? 'START_FAILED'
          : !completed
            ? 'NO_COMPLETION'
            : exitCode === 0
              ? 'SUCCESS'
              : diagnosticCodes.length
                ? 'COMPILER_ERRORS'
                : 'EXIT_NONZERO';
  return {
    status: completed ? (exitCode === 0 ? 'PASS' : 'FAIL') : 'NOT_RUN',
    completed,
    exitCode,
    signal,
    executionErrorCode,
    reason,
    diagnosticCodes,
    diagnosticFiles,
    diagnostics,
  };
}

/** Call after persisting the complete report, so useful checks survive a failed declaration gate. */
export function assertDeclarationProbe(summary, label = 'Declaration probe') {
  assert(
    summary?.status === 'PASS' &&
      summary.completed === true &&
      summary.exitCode === 0 &&
      summary.signal === null &&
      summary.executionErrorCode === null,
    `${label} did not pass: ${summary?.reason ?? 'NO_COMPLETION'} (${summary?.diagnosticCodes?.join(', ') || 'no compiler diagnostics'})`,
  );
}
