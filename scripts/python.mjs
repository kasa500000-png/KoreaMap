import { spawnSync } from 'node:child_process';
const candidates =
  process.platform === 'win32'
    ? [['py', '-3'], ['python'], ['python3']]
    : [['python3'], ['python']];
let done = false;
for (const [command, ...prefix] of candidates) {
  const probe = spawnSync(command, [...prefix, '--version'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0 || !probe.stdout.startsWith('Python 3.')) continue;
  const result = spawnSync(command, [...prefix, ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
  done = true;
  break;
}
if (!done) throw new Error('Python 3 is required for documentation and cost audits.');
