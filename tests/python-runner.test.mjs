import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

test('Python launcher reads Korean UTF-8 text and preserves arguments and failure status', () => {
  const directory = mkdtempSync(join(tmpdir(), 'kmk python '));
  try {
    const script = join(directory, 'probe.py');
    writeFileSync(join(directory, 'sample.txt'), '한국 지도 검증\n', 'utf8');
    writeFileSync(
      script,
      [
        'import pathlib, sys',
        'assert sys.flags.utf8_mode == 1',
        'assert sys.argv[1] == "argument with spaces"',
        'print(pathlib.Path(__file__).with_name("sample.txt").read_text(), end="")',
        'sys.exit(int(sys.argv[2]))',
      ].join('\n'),
    );
    for (const exitCode of [0, 7]) {
      const result = spawnSync(
        process.execPath,
        [
          fileURLToPath(new URL('../scripts/python.mjs', import.meta.url)),
          script,
          'argument with spaces',
          String(exitCode),
        ],
        {
          env: { ...process.env, PYTHONUTF8: '0' },
          encoding: 'utf8',
          timeout: 20000,
        },
      );
      assert.ifError(result.error);
      assert.equal(result.signal, null);
      assert.equal(result.status, exitCode, result.stderr);
      assert.equal(result.stdout.replaceAll('\r', ''), '한국 지도 검증\n');
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
