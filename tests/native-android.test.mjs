import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseAndroidBuildOptions,
  withEmbeddedDebugBundle,
  assertAndroidApk,
  initializeAndroidEvidence,
} from '../scripts/verify-native-android.mjs';
import { resolve } from 'node:path';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { assertAndroidHost, runOwnedAndroidCommand } from '../scripts/native-android-process.mjs';
import { invokeNativeExportHook } from '../scripts/verify-native-consumer.mjs';
import { setTimeout as delay } from 'node:timers/promises';

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return (
      process.platform !== 'linux' ||
      !/^\d+ \(.+\) Z\b/.test(readFileSync(`/proc/${pid}/stat`, 'utf8'))
    );
  } catch (error) {
    assert(['ESRCH', 'ENOENT'].includes(error.code));
    return false;
  }
}

async function waitForTermination(pid) {
  for (let attempt = 0; attempt < 40 && isRunning(pid); attempt++) await delay(25);
  assert.equal(isRunning(pid), false, 'Owned test child must not remain running');
}

function killTestChild(pid) {
  try {
    process.kill(pid, 'SIGKILL');
  } catch (error) {
    assert.equal(error.code, 'ESRCH');
  }
}

test('a failed new attempt cannot reuse an earlier successful report and preserves its owned APK', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'kmk-android-evidence-'));
  try {
    writeFileSync(resolve(directory, 'report.json'), JSON.stringify({ status: 'PASS_BUILD_ONLY' }));
    writeFileSync(resolve(directory, 'app-debug.apk'), 'synthetic previous build');
    initializeAndroidEvidence(directory);
    const evidence = JSON.parse(readFileSync(resolve(directory, 'report.json'), 'utf8'));
    assert.equal(evidence.status, 'NOT_RUN');
    assert.equal(evidence.releaseBlocked, true);
    assert.equal(
      readFileSync(resolve(directory, 'app-debug.apk'), 'utf8'),
      'synthetic previous build',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('Android builds require every explicit local tool and reject unknown/duplicate/relative arguments', () => {
  const args = ['android-sdk', 'jdk', 'gradle', 'gradle-cache'].map(
    (name) => `--${name}=${resolve('local', name)}`,
  );
  assert.equal(Object.keys(parseAndroidBuildOptions(args)).length, 4);
  for (const input of [
    [],
    args.slice(1),
    [...args, args[0]],
    [...args, '--online'],
    args.map((arg) => arg.replace(`=${resolve('local', 'jdk')}`, '=relative-jdk')),
  ])
    assert.throws(() => parseAndroidBuildOptions(input));
});
test('isolated generated debug build embeds current JS and refuses ambiguous/custom variant configuration', () => {
  assert.match(
    withEmbeddedDebugBundle('react {\n // Generated project\n}\n'),
    /debuggableVariants = \[\]/,
  );
  for (const input of ['', 'react {\n}\nreact {\n}', 'react {\n debuggableVariants = ["debug"]\n}'])
    assert.throws(() => withEmbeddedDebugBundle(input));
});
test('APK acceptance requires consumer identity, native renderer, embedded JS and foreground-only permissions', () => {
  const badging = "package: name='org.koreamapkit.consumer'\nnative-code: 'x86_64'\n";
  const permission = "uses-permission: name='android.permission.ACCESS_FINE_LOCATION'\n";
  const listing = 'assets/index.android.bundle\nlib/x86_64/libmaplibre.so\n';
  assertAndroidApk(badging, permission, listing);
  for (const [bad, perms, files] of [
    [badging.replace('consumer', 'example'), permission, listing],
    [badging.replace('x86_64', 'arm64-v8a'), permission, listing],
    [badging, '', listing],
    [badging, permission.replace('ACCESS_FINE_LOCATION', 'ACCESS_FINE_LOCATION_EXTRA'), listing],
    [
      badging,
      permission + "uses-permission: name='android.permission.ACCESS_BACKGROUND_LOCATION'\n",
      listing,
    ],
    [
      badging,
      permission +
        "uses-permission-sdk-23: name='android.permission.FOREGROUND_SERVICE_LOCATION'\n",
      listing,
    ],
    [badging, permission, listing.replace('assets/index.android.bundle\n', '')],
    [badging, permission, listing.replace('lib/x86_64/libmaplibre.so\n', '')],
  ])
    assert.throws(() => assertAndroidApk(bad, perms, files));
});

test('optional Native export hooks must complete synchronously and cannot silently start async work', () => {
  const report = {};
  invokeNativeExportHook(undefined, report);
  invokeNativeExportHook((value) => {
    value.called = true;
  }, report);
  assert.equal(report.called, true);
  let called = false;
  assert.throws(
    () =>
      invokeNativeExportHook(async () => {
        called = true;
      }, {}),
    /synchronous/,
  );
  assert.equal(called, false);
  assert.throws(() => invokeNativeExportHook(() => Promise.resolve(), {}), /synchronously/);
  assert.throws(() => invokeNativeExportHook({}, {}), /synchronous/);
});

test('optional Android QA explicitly limits unsupported Windows launchers without changing SDK platform support', () => {
  assertAndroidHost('linux');
  assertAndroidHost('darwin');
  assert.throws(() => assertAndroidHost('win32'), /ANDROID_QA_HOST_NOT_AVAILABLE/);
});

test('bounded Python stdlib APK checks reject fake ZIP, bundle and ELF evidence', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/python.mjs', 'tests/native-android-apk.test.py'],
    { encoding: 'utf8', timeout: 10000 },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test(
  'owned supervisor safely passes literal arguments and kills descendant groups on timeout and overflow',
  { skip: process.platform === 'win32' },
  async () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'kmk-android-child-'));
    const created = [];
    try {
      const literal = 'space ; $(must-not-execute) `literal`';
      const success = runOwnedAndroidCommand(
        process.execPath,
        ['-e', 'process.stdout.write(process.argv[1])', literal],
        { timeoutMs: 3000 },
      );
      assert.equal(success.status, 0);
      assert.equal(success.stdout, literal);
      for (const overflow of [false, true]) {
        const pidFile = resolve(directory, overflow ? 'overflow.pid' : 'timeout.pid');
        const source = `const {spawn}=require('node:child_process');const {writeFileSync}=require('node:fs');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',detached:true});writeFileSync(process.argv[1],String(child.pid));${overflow ? "process.stdout.write('x'.repeat(65536));" : ''}setInterval(()=>{},1000);`;
        const result = runOwnedAndroidCommand(process.execPath, ['-e', source, pidFile], {
          timeoutMs: 1000,
          maxOutputBytes: 4096,
        });
        const pid = Number(readFileSync(pidFile, 'utf8'));
        created.push(pid);
        assert.equal(result.failure, overflow ? 'COMMAND_OUTPUT_LIMIT' : 'COMMAND_TIMEOUT');
        assert.equal(result.cleanup.status, 'TRACKED_PROCESSES_SIGNALED');
        assert.equal(result.cleanup.descendantCoverage, 'UNKNOWN');
        assert(result.cleanup.trackedProcesses >= 2);
        await waitForTermination(pid);
      }
    } finally {
      for (const file of readdirSync(directory).filter((name) => name.endsWith('.pid')))
        created.push(Number(readFileSync(resolve(directory, file), 'utf8')));
      for (const pid of new Set(created)) {
        killTestChild(pid);
        await waitForTermination(pid);
      }
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test(
  'an immediately exiting parent cannot promise that every reparented child was cleaned',
  { skip: process.platform === 'win32' },
  async () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'kmk-fast-parent-'));
    const pidFile = resolve(directory, 'child.pid');
    let pid;
    try {
      const source = `const {spawn}=require('node:child_process');const {writeFileSync}=require('node:fs');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',detached:true});child.unref();writeFileSync(process.argv[1],String(child.pid));process.exit(1);`;
      const result = runOwnedAndroidCommand(process.execPath, ['-e', source, pidFile], {
        timeoutMs: 3000,
      });
      pid = Number(readFileSync(pidFile, 'utf8'));
      assert.equal(result.failure, 'COMMAND_FAILED');
      assert.equal(result.cleanup.descendantCoverage, 'UNKNOWN');
      assert.notEqual(result.cleanup.status, 'OWNED_TREE_KILLED');
    } finally {
      // The fixture owns this exact intentionally escaped child and always removes it.
      if (!pid) {
        try {
          pid = Number(readFileSync(pidFile, 'utf8'));
        } catch (error) {
          assert.equal(error.code, 'ENOENT');
        }
      }
      if (pid) {
        killTestChild(pid);
        await waitForTermination(pid);
      }
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
