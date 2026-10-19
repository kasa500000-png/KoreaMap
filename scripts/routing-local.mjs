import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  copyFileSync,
  rmSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { routingFixturePbf, fixturePoints } from './routing-fixture.mjs';
import { createLocalRoutingProvider } from '../services/routing/dist/index.js';

// Official base image, release 3.9.1; no scripted auto-downloader or publisher service.
const image =
  'ghcr.io/valhalla/valhalla:3.9.1@sha256:4fd114eb1d26b8fc2f43bcb3df234c1b63a0bf13c277405e5943d5361dc575de';
const [command, ...args] = process.argv.slice(2);
const flag = (key) => {
  const i = args.indexOf(key);
  return i < 0 ? undefined : args[i + 1];
};
const testing = command === 'test';
const region = testing ? `test-${randomBytes(5).toString('hex')}` : flag('--region');
if (
  !['build', 'start', 'stop', 'test', 'activate'].includes(command) ||
  !/^[a-z0-9][a-z0-9-]{0,40}$/.test(region ?? '')
)
  throw new Error('Use build/start/stop/activate --region <slug>, or test. See docs/routing.md.');
const root = resolve('artifacts', 'routing', region);
const name = `kmk-routing-${region}${command === 'build' ? `-build-${randomBytes(4).toString('hex')}` : ''}`;
const network = `${name}-local`;
const env = { ...process.env };
for (const key of [
  'DOCKER_HOST',
  'DOCKER_CONTEXT',
  'DOCKER_TLS',
  'DOCKER_TLS_VERIFY',
  'DOCKER_CERT_PATH',
])
  delete env[key];
const host =
  process.platform === 'win32' ? 'npipe:////./pipe/docker_engine' : 'unix:///var/run/docker.sock';
const user = `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`;
function docker(args, capture = true) {
  const r = spawnSync('docker', ['--host', host, ...args], {
    env,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error || r.status !== 0) {
    if (testing) console.error(r.stderr?.slice(-4000));
    throw new Error('Local routing Docker command failed.');
  }
  return r.stdout?.trim() ?? '';
}
function run(dir, args) {
  return docker([
    'run',
    '--rm',
    '--user',
    user,
    '--network',
    'none',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--mount',
    `type=bind,src=${dir},dst=/data`,
    image,
    ...args,
  ]);
}
async function hash(file) {
  const h = createHash('sha256');
  for await (const c of createReadStream(file)) h.update(c);
  return h.digest('hex');
}
function stop() {
  if (docker(['ps', '-aq', '--filter', `name=^/${name}$`])) docker(['rm', '-f', name]);
  if (docker(['network', 'ls', '-q', '--filter', `name=^${network}$`]))
    docker(['network', 'rm', network]);
}
async function start(dir, port) {
  docker(['network', 'create', network]);
  docker([
    'run',
    '-d',
    '--user',
    user,
    '--name',
    name,
    '--network',
    network,
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--read-only',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=64m',
    '--pids-limit',
    '128',
    '--memory',
    '1g',
    '--publish',
    `127.0.0.1:${port}:8002`,
    '--mount',
    `type=bind,src=${dir},dst=/data,readonly`,
    image,
    'valhalla_service',
    '/data/valhalla.json',
    '2',
  ]);
  const address = docker(['port', name, '8002/tcp']);
  if (!/^127\.0\.0\.1:\d+$/u.test(address)) throw new Error('Expected loopback port.');
  const local = new URL('http://127.0.0.1/route');
  local.port = address.split(':')[1];
  const endpoint = local.href;
  const status = new URL('/status', local);
  for (let i = 0; i < 40; i++) {
    try {
      const r = await globalThis.fetch(status, { signal: globalThis.AbortSignal.timeout(500) });
      if (r.ok) return endpoint;
    } catch {
      /* wait for local process */
    }
    await delay(250);
  }
  throw new Error('Routing engine readiness failed.');
}
function generationDir(id) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/u.test(id ?? '')) throw new Error('Invalid generation.');
  return join(root, id);
}
function activate(id) {
  const dir = generationDir(id);
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  if (manifest.smokePassed !== true || manifest.engineImage !== image)
    throw new Error('Only verified generations can be activated.');
  writeFileSync(join(root, 'active.next'), JSON.stringify({ generation: id }));
  renameSync(join(root, 'active.next'), join(root, 'active.json'));
}
let temporaryEngine = false;
try {
  if (command === 'stop') stop();
  else if (command === 'activate') {
    activate(flag('--generation'));
    console.log('Verified generation selected. Restart explicitly to switch the service.');
  } else if (command === 'start') {
    if (docker(['ps', '-aq', '--filter', `name=^/${name}$`]))
      throw new Error('Local engine already exists.');
    const current = JSON.parse(readFileSync(join(root, 'active.json'), 'utf8'));
    const dir = generationDir(current.generation);
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    if (!manifest.smokePassed || manifest.engineImage !== image)
      throw new Error('Unverified generation.');
    temporaryEngine = true;
    const endpoint = await start(dir, 8002);
    writeFileSync(
      join(root, '.env'),
      `ROUTING_ENGINE_URL=${endpoint}\nROUTING_DATASET_FILE=${JSON.stringify(join(dir, 'manifest.json').replaceAll('\\', '/'))}\n`,
      { mode: 0o600 },
    );
    console.log(
      'Local engine ready; private gateway settings are in artifacts/routing/<region>/.env.',
    );
    temporaryEngine = false;
  } else {
    // Never interrupt a running generation to build its replacement.
    if (docker(['ps', '-aq', '--filter', `name=^/${name}$`]))
      throw new Error(
        'Use a separate region build or stop the local sample before testing a replacement.',
      );
    const version = `v-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const dir = generationDir(version);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const input = join(dir, 'input.osm.pbf');
    let dataset, sourceHash, asOf, smoke;
    if (testing) {
      writeFileSync(input, routingFixturePbf());
      sourceHash = await hash(input);
      asOf = null;
      dataset = {
        id: region,
        version,
        source: 'synthetic-routing-v1',
        license: 'MIT',
        attribution: 'Korea Map Kit 자체 합성 도로망 · MIT',
      };
      smoke = [fixturePoints.start, fixturePoints.finish];
    } else {
      const source = JSON.parse(readFileSync('data/sources.json', 'utf8')).sources.find(
        (s) => s.id === 'osm-geofabrik-kr',
      );
      const expected = flag('--sha256');
      asOf = flag('--as-of');
      if (
        !args.includes('--accept-odbl') ||
        source.grade !== 'A' ||
        !source.collectionEligible ||
        !Number.isFinite(Date.parse(`${source.reviewBy}T23:59:59Z`)) ||
        new Date(`${source.reviewBy}T23:59:59Z`) < new Date() ||
        !/^[a-f0-9]{64}$/u.test(expected ?? '') ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(asOf ?? '') ||
        !Number.isFinite(Date.parse(asOf)) ||
        new Date(asOf).toISOString().replace('.000Z', 'Z') !== asOf ||
        Date.parse(asOf) > Date.now()
      )
        throw new Error(
          'Reviewed A source, explicit ODbL opt-in, source timestamp and SHA-256 required.',
        );
      const file = resolve(flag('--input') ?? '');
      if (!file.endsWith('.osm.pbf') || (await hash(file)) !== expected)
        throw new Error('Input hash mismatch.');
      copyFileSync(file, input);
      sourceHash = await hash(input);
      if (sourceHash !== expected) throw new Error('Input changed while copying.');
      smoke = JSON.parse(readFileSync(flag('--smoke'), 'utf8'));
      dataset = {
        id: region,
        version,
        source: source.id,
        license: source.license,
        attribution: '© OpenStreetMap contributors · ODbL 1.0 · Geofabrik',
      };
    }
    const config = JSON.parse(
      run(dir, [
        'valhalla_build_config',
        '--mjolnir-tile-dir',
        '/data/tiles',
        '--mjolnir-tile-extract',
        '',
        '--mjolnir-concurrency',
        '2',
        '--mjolnir-id-table-size',
        testing ? '1' : '100',
        '--mjolnir-admin',
        '/data/admin.sqlite',
      ]),
    );
    config.logging = { type: '', color: false };
    config.loki.actions = ['route', 'status'];
    config.httpd.service.timeout_seconds = 5;
    for (const mode of ['auto', 'pedestrian', 'bicycle']) {
      config.service_limits[mode].max_locations = 10;
      config.service_limits[mode].max_distance = 200000;
    }
    if (testing) {
      config.mjolnir.hierarchy = false;
      config.mjolnir.shortcuts = false;
    }
    writeFileSync(join(dir, 'valhalla.json'), JSON.stringify(config));
    if (!testing)
      run(dir, ['valhalla_build_admins', '-c', '/data/valhalla.json', '/data/input.osm.pbf']);
    run(dir, ['valhalla_build_tiles', '-c', '/data/valhalla.json', '/data/input.osm.pbf']);
    temporaryEngine = true;
    const endpoint = await start(dir, 0);
    const provider = createLocalRoutingProvider(endpoint, dataset);
    for (const mode of ['driving', 'walking', 'cycling'])
      await provider.route({ mode, waypoints: smoke });
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify(
        {
          dataset,
          sourceHash,
          sourceAsOf: asOf,
          engineImage: image,
          builtAt: new Date().toISOString(),
          smokePassed: true,
          limitations: ['no-live-traffic', 'no-safety-guarantee', 'no-elevation-or-timezone-data'],
        },
        null,
        2,
      ),
    );
    if (testing) {
      const result = spawnSync(
        process.execPath,
        ['--test', 'tests/routing-integration.test.mjs', 'tests/routing-operations.test.mjs'],
        {
          env: {
            ...env,
            KMK_TEST_ROUTING_URL: endpoint,
            KMK_TEST_ROUTING_DATASET: JSON.stringify(dataset),
          },
          stdio: 'inherit',
        },
      );
      if (result.error || result.status !== 0) throw new Error('Routing integration tests failed.');
    } else {
      activate(version);
      console.log(
        `Verified routing generation ${version} prepared; start explicitly. Previous generations remain for rollback.`,
      );
    }
  }
} catch (error) {
  // Configuration/path/body details can contain private information; do not echo them.
  console.error(
    'Routing task failed. Check the command, Docker, data rights/hash, smoke coverage and port availability.',
  );
  if (testing && error instanceof Error) console.error(error.message);
  process.exitCode = 1;
} finally {
  if (temporaryEngine || (testing && existsSync(root))) {
    try {
      stop();
      if (testing) rmSync(root, { recursive: true, force: true });
    } catch {
      console.error('Routing test cleanup failed; inspect local kmk-routing containers.');
      process.exitCode = 1;
    }
  }
}
