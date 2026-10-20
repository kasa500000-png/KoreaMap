// Private optional Android QA supervisor. No shell, downloads or detached background service.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { clearInterval, clearTimeout, setInterval, setTimeout } from 'node:timers';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function assertAndroidHost(platform = process.platform) {
  assert(
    ['linux', 'darwin'].includes(platform),
    'ANDROID_QA_HOST_NOT_AVAILABLE: this optional tool supports Linux/macOS launchers; Windows APK QA is not verified',
  );
}

function validate(binary, args, timeoutMs, maxOutputBytes) {
  assert(typeof binary === 'string' && binary.length > 0);
  assert(Array.isArray(args) && args.every((arg) => typeof arg === 'string'));
  assert(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 360000);
  assert(
    Number.isSafeInteger(maxOutputBytes) && maxOutputBytes > 0 && maxOutputBytes <= 16 * 1024 ** 2,
  );
}

function processTable() {
  const rows = new Map();
  if (process.platform === 'linux') {
    for (const entry of readdirSync('/proc')) {
      if (!/^\d+$/.test(entry)) continue;
      try {
        const raw = readFileSync(`/proc/${entry}/stat`, 'utf8');
        const fields = raw.slice(raw.lastIndexOf(') ') + 2).split(' ');
        rows.set(Number(entry), { parent: Number(fields[1]), identity: fields[19] });
      } catch {
        /* Processes may exit between directory listing and stat. */
      }
    }
  } else {
    const result = spawnSync('/bin/ps', ['-axo', 'pid=,ppid=,lstart='], {
      encoding: 'utf8',
      timeout: 1000,
      maxBuffer: 1024 ** 2,
    });
    assert.equal(result.status, 0, 'ANDROID_PROCESS_TRACKING_UNAVAILABLE');
    for (const row of result.stdout.trim().split('\n')) {
      const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(row);
      if (match) rows.set(Number(match[1]), { parent: Number(match[2]), identity: match[3] });
    }
  }
  return rows;
}

export async function superviseAndroidCommand({ binary, args, timeoutMs, maxOutputBytes }) {
  assertAndroidHost();
  validate(binary, args, timeoutMs, maxOutputBytes);
  // Fail before spawning a tool if this host cannot identify owned descendants.
  processTable();
  return new Promise((done) => {
    const child = spawn(binary, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let timer,
      fallback,
      finished = false,
      failure = null,
      bytes = 0;
    const output = { stdout: [], stderr: [] };
    const cleanup = { status: 'NOT_REQUIRED' };
    const owned = new Map();
    const track = () => {
      const rows = processTable();
      if (child.pid && !owned.has(child.pid) && rows.has(child.pid))
        owned.set(child.pid, rows.get(child.pid).identity);
      let added;
      do {
        added = false;
        for (const [pid, row] of rows) {
          if (
            !owned.has(pid) &&
            owned.has(row.parent) &&
            rows.get(row.parent)?.identity === owned.get(row.parent)
          ) {
            owned.set(pid, row.identity);
            added = true;
          }
        }
      } while (added);
      return rows;
    };
    track();
    const tracking = setInterval(() => {
      try {
        track();
      } catch {
        stop('PROCESS_TRACKING_FAILED');
      }
    }, 100);
    const killGroup = (reason) => {
      failure ??= reason;
      let rows;
      try {
        rows = track();
      } catch {
        cleanup.status = 'TREE_TRACKING_FAILED';
        cleanup.reason = reason;
        if (child.exitCode === null && child.signalCode === null) {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            /* Keep the failure visible. */
          }
          child.kill('SIGKILL');
        }
        return;
      }
      cleanup.status = 'TRACKED_PROCESSES_SIGNALED';
      cleanup.trackedProcesses = owned.size;
      cleanup.descendantCoverage = 'UNKNOWN';
      cleanup.limitation =
        'PPID polling cannot prove discovery of children that immediately reparent or change sessions';
      for (const [pid, identity] of [...owned].reverse()) {
        // PID reuse must never turn cleanup into a signal to an unrelated process.
        if (rows.get(pid)?.identity !== identity) continue;
        try {
          process.kill(pid, 'SIGKILL');
        } catch (error) {
          if (error.code !== 'ESRCH') cleanup.status = 'TREE_KILL_FAILED';
        }
      }
      if (child.pid && rows.get(child.pid)?.identity === owned.get(child.pid)) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch (error) {
          if (error.code !== 'ESRCH') cleanup.status = 'TREE_KILL_FAILED';
        }
      }
      cleanup.reason = reason;
    };
    const finish = (status, signal) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearTimeout(fallback);
      clearInterval(tracking);
      process.off('SIGTERM', interrupted);
      process.off('SIGINT', interrupted);
      child.stdout?.destroy();
      child.stderr?.destroy();
      done({
        status,
        signal,
        failure,
        pid: child.pid ?? null,
        cleanup,
        stdout: Buffer.concat(output.stdout).toString('base64'),
        stderr: Buffer.concat(output.stderr).toString('base64'),
      });
    };
    const stop = (reason) => {
      if (finished) return;
      killGroup(reason);
      // A broken descendant must not keep inherited pipes and the supervisor alive.
      fallback ??= setTimeout(() => finish(null, 'SIGKILL'), 1000);
    };
    const interrupted = () => stop('SUPERVISOR_INTERRUPTED');
    process.once('SIGTERM', interrupted);
    process.once('SIGINT', interrupted);
    timer = setTimeout(() => stop('COMMAND_TIMEOUT'), timeoutMs);
    for (const stream of ['stdout', 'stderr'])
      child[stream].on('data', (chunk) => {
        const remaining = Math.max(0, maxOutputBytes - bytes);
        if (remaining) output[stream].push(chunk.subarray(0, remaining));
        bytes += chunk.length;
        if (bytes > maxOutputBytes) stop('COMMAND_OUTPUT_LIMIT');
      });
    child.once('error', () => {
      failure = 'COMMAND_START_FAILED';
      finish(null, null);
    });
    child.once('exit', (status, signal) => {
      if (status !== 0 || signal) stop(failure ?? 'COMMAND_FAILED');
    });
    child.once('close', (status, signal) => {
      if (status !== 0 || signal) killGroup(failure ?? 'COMMAND_FAILED');
      finish(status, signal);
    });
  });
}

/** Keep the Native consumer hook synchronous while a child supervisor owns timeout/tree cleanup. */
export function runOwnedAndroidCommand(
  binary,
  args,
  { cwd, env, timeoutMs = 360000, maxOutputBytes = 16 * 1024 ** 2 } = {},
) {
  assertAndroidHost();
  validate(binary, args, timeoutMs, maxOutputBytes);
  const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--supervise'], {
    cwd,
    env,
    input: JSON.stringify({ binary, args, timeoutMs, maxOutputBytes }),
    encoding: 'utf8',
    timeout: timeoutMs + 5000,
    killSignal: 'SIGTERM',
    maxBuffer: maxOutputBytes * 2 + 65536,
  });
  assert(!result.error && result.status === 0, 'ANDROID_SUPERVISOR_FAILED');
  const report = JSON.parse(result.stdout);
  return {
    ...report,
    stdout: Buffer.from(report.stdout, 'base64').toString('utf8'),
    stderr: Buffer.from(report.stderr, 'base64').toString('utf8'),
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  assert.deepEqual(process.argv.slice(2), ['--supervise']);
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    assert(input.length < 65536);
  }
  const result = await superviseAndroidCommand(JSON.parse(input));
  process.stdout.write(JSON.stringify(result));
}
