import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanBuildOutputs } from './clean-build-outputs.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sdkNames = ['core', 'web', 'native', 'styles', 'data-adapters'];
function pnpm(...args) {
  if (!process.env.npm_execpath) throw new Error('Run this task with pnpm.');
  const cli = process.env.npm_execpath;
  const isScript = /\.[cm]?js$/.test(cli);
  const result = spawnSync(isScript ? process.execPath : cli, isScript ? [cli, ...args] : args, {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
function sdk() {
  pnpm('exec', 'tsc', '-b', 'tsconfig.build.json');
  for (const name of sdkNames) {
    mkdirSync(resolve(root, 'packages', name, 'dist'), { recursive: true });
    cpSync(resolve(root, 'LICENSE'), resolve(root, 'packages', name, 'dist', 'LICENSE'));
  }
}
function typecheck() {
  sdk();
  for (const dir of ['examples/web', 'examples/expo', 'tests'])
    pnpm('exec', 'tsc', '--noEmit', '-p', dir);
}
function build() {
  sdk();
  pnpm('--filter', '@korea-map-kit/example-web', 'build');
  pnpm('--filter', '@korea-map-kit/example-expo', 'build');
}
const task = process.argv[2];
if (task === 'sdk') sdk();
else if (task === 'typecheck') typecheck();
else if (task === 'build') build();
else if (task === 'check') {
  for (const step of [
    'check:boundaries',
    'check:licenses',
    'test:licenses',
    'check:data',
    'test:data',
    'check:data-docs',
    'lint',
    'format:check',
    'typecheck',
    'check:native-types',
    'test',
    'test:core',
    'check:api-docs',
    'build',
    'check:docs',
    'test:python',
    'audit:cost',
    'test:audit',
    'test:clean',
    'test:release',
    'test:tiles',
    'test:real-poi',
    'test:real-tiles',
    'test:map-quality',
    'test:browser-policy',
    'test:web-deploy',
    'test:service-quality',
    'test:native-consumer',
    'test:native-android',
    'changeset:status',
  ])
    pnpm('run', step);
} else if (task === 'dev-web' || task === 'dev-expo') {
  sdk();
  pnpm('--filter', `@korea-map-kit/example-${task === 'dev-web' ? 'web' : 'expo'}`, 'dev');
} else if (task === 'clean') {
  cleanBuildOutputs(root);
} else throw new Error('Unknown task');
