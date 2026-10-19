import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const command = process.argv[2];
if (!['start', 'stop', 'test'].includes(command)) throw new Error('Use start, stop or test.');
const testing = command === 'test';
const suffix = testing ? randomBytes(6).toString('hex') : 'dev';
const dir = resolve('artifacts', `geo-${suffix}`);
mkdirSync(dir, { recursive: true, mode: 0o700 });
const passwordFile = resolve(dir, 'db-password');
if (!existsSync(passwordFile))
  writeFileSync(passwordFile, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
const credential = readFileSync(passwordFile, 'utf8').trim();
const env = {
  ...process.env,
  KMK_LOCAL_PASSWORD_FILE: passwordFile,
  KMK_LOCAL_PORT: testing ? '0' : '54329',
};
// Target the explicitly selected LOCAL Docker installation; never consume a remote DOCKER_HOST/context.
for (const key of [
  'DOCKER_HOST',
  'DOCKER_CONTEXT',
  'DOCKER_TLS',
  'DOCKER_TLS_VERIFY',
  'DOCKER_CERT_PATH',
])
  delete env[key];
const dockerHost =
  process.platform === 'win32' ? 'npipe:////./pipe/docker_engine' : 'unix:///var/run/docker.sock';
function docker(args, capture = false) {
  const result = spawnSync(
    'docker',
    [
      '--host',
      dockerHost,
      'compose',
      '-p',
      `kmk-poi-${suffix}`,
      '-f',
      'services/geo-data/compose.yml',
      ...args,
    ],
    { env, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' },
  );
  if (result.error || result.status !== 0) throw new Error('Local Docker Compose command failed.');
  return result.stdout?.trim() ?? '';
}
try {
  if (command === 'stop') docker(['down']);
  else {
    docker(['up', '-d', '--wait', '--wait-timeout', '90']);
    const binding = docker(['port', 'db', '5432'], true);
    if (!/^127\.0\.0\.1:\d+$/.test(binding)) throw new Error('Expected loopback-only DB port.');
    const connection = new URL('postgresql://127.0.0.1/kmk');
    connection.port = binding.split(':')[1];
    connection.username = 'kmk_admin';
    connection.password = credential;
    if (testing) {
      const result = spawnSync(process.execPath, ['--test', 'tests/geo-integration.test.mjs'], {
        env: { ...env, GEO_DATABASE_URL: connection.href },
        stdio: 'inherit',
      });
      if (result.error || result.status !== 0) process.exitCode = 1;
    } else {
      writeFileSync(resolve(dir, '.env'), `GEO_DATABASE_URL=${connection.href}\n`, { mode: 0o600 });
      console.log(
        'Local DB ready. Server-only settings: artifacts/geo-dev/.env. Run geo:migrate, then geo:fixture.',
      );
    }
  }
} catch {
  console.error('Local DB command failed; check Docker availability and local port conflicts.');
  process.exitCode = 1;
} finally {
  if (testing) {
    try {
      docker(['down', '--volumes']);
      rmSync(dir, { recursive: true, force: true });
    } catch {
      console.error('Temporary test DB cleanup failed; inspect kmk-poi test containers.');
      process.exitCode = 1;
    }
  }
}
