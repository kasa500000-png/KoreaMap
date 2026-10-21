import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  assertConsumerManifest,
  assertConsumerDeclarations,
  assertPublicSdkDeclarations,
  assertInstalledSdk,
  assertIntrospection,
  createNativePublicTypeConfig,
  installNativeConsumer,
  pinnedPeers,
} from '../scripts/verify-native-consumer.mjs';
import { summarizeDeclarationProbe } from '../scripts/declaration-probe.mjs';

const tarballs = Object.fromEntries(
  ['core', 'native', 'styles'].map((name) => [
    `korea-map-${name}`,
    `file:/example/korea-map-${name}-0.1.0.tgz`,
  ]),
);
function manifest() {
  return {
    private: true,
    type: 'module',
    main: 'index.js',
    dependencies: { ...pinnedPeers, ...tarballs },
  };
}
function introspection() {
  return {
    updates: { enabled: false },
    android: { package: 'org.koreamapkit.consumer' },
    ios: { bundleIdentifier: 'org.koreamapkit.consumer' },
    plugins: [
      [
        '@maplibre/maplibre-react-native',
        {
          android: { nativeVersion: '13.6.1', nativeVariant: 'opengl', locationEngine: 'default' },
          ios: { nativeVersion: '6.31.0' },
        },
      ],
      [
        'expo-location',
        {
          locationAlwaysPermission: false,
          locationAlwaysAndWhenInUsePermission: false,
          isIosBackgroundLocationEnabled: false,
          isAndroidBackgroundLocationEnabled: false,
          isAndroidForegroundServiceEnabled: false,
        },
      ],
    ],
    _internal: {
      pluginHistory: { '@maplibre/maplibre-react-native': { version: '11.5.0' } },
      modResults: {
        ios: {
          infoPlist: { NSLocationWhenInUseUsageDescription: 'User requested foreground GPS' },
        },
        android: {
          manifest: { permission: 'android.permission.ACCESS_FINE_LOCATION' },
          gradleProperties: Object.entries({
            nativeVersion: '13.6.1',
            nativeVariant: 'opengl',
            locationEngine: 'default',
          }).map(([name, value]) => ({
            type: 'property',
            key: `org.maplibre.reactnative.${name}`,
            value,
          })),
        },
      },
    },
  };
}

test('a fresh consumer prepares public registry metadata before its frozen offline install', () => {
  const temp = mkdtempSync(resolve(tmpdir(), 'kmk-native-consumer-install-test-'));
  try {
    const globalCache = resolve(temp, 'global-cache');
    mkdirSync(globalCache);
    writeFileSync(resolve(globalCache, 'cached-metadata'), 'must not seed the consumer');
    const quotedTarballs = {
      ...tarballs,
      'korea-map-native': "file:C:\\reviewed tarballs\\package's-native.tgz",
    };
    const caches = [];
    for (const name of ["first's consumer", 'second consumer']) {
      const directory = resolve(temp, name);
      mkdirSync(directory);
      const checks = { registryLockPreparation: 'NOT_RUN', offlineTarballInstall: 'NOT_RUN' };
      const commands = [];
      installNativeConsumer({
        directory,
        tarballs: quotedTarballs,
        store: '/reviewed-package-store',
        checks,
        pnpm(args, cwd) {
          assert.equal(cwd, directory);
          assert(args.includes('--ignore-scripts'));
          assert.equal(args[args.indexOf('--store-dir') + 1], '/reviewed-package-store');
          const config = readFileSync(resolve(directory, 'pnpm-workspace.yaml'), 'utf8');
          const cache = JSON.parse(config.match(/^cacheDir: (.+)$/m)[1]);
          assert.equal(cache, resolve(directory, 'empty-metadata-cache').replaceAll('\\', '/'));
          assert.match(config, /^strictPeerDependencies: true$/m);
          assert.match(config, /^minimumReleaseAge: 1440$/m);
          assert.match(config, /^ {2}'xcode>uuid': 11\.1\.1$/m);
          for (const [name, value] of Object.entries(quotedTarballs))
            assert(
              config.includes(
                `  ${JSON.stringify(name)}: ${JSON.stringify(value.replaceAll('\\', '/'))}`,
              ),
            );
          if (commands.length === 0) {
            assert.deepEqual(readdirSync(cache), [], 'Global metadata must not mask a fresh cache');
            assert(args.includes('--lockfile-only'));
            assert(args.includes('--no-frozen-lockfile'));
            assert(!args.includes('--offline'));
            assert.equal(args[args.indexOf('--registry') + 1], 'https://registry.npmjs.org/');
            assert.equal(checks.registryLockPreparation, 'FAIL');
            assert.equal(checks.offlineTarballInstall, 'NOT_RUN');
            writeFileSync(resolve(cache, 'prepared-metadata'), 'registry preparation completed');
            caches.push(cache);
          } else {
            assert.equal(checks.registryLockPreparation, 'PASS');
            assert.equal(checks.offlineTarballInstall, 'FAIL');
            assert(args.includes('--offline'));
            assert(args.includes('--frozen-lockfile'));
            assert(!args.includes('--lockfile-only'));
            assert(!args.includes('--no-frozen-lockfile'));
            assert.deepEqual(readdirSync(cache), ['prepared-metadata']);
          }
          commands.push(args);
        },
      });
      assert.equal(commands.length, 2);
      assert.equal(checks.registryLockPreparation, 'PASS');
      // Installation alone cannot pass before the reviewed graph and SDK provenance guards.
      assert.notEqual(checks.offlineTarballInstall, 'PASS');
      assert.throws(
        () =>
          installNativeConsumer({
            directory,
            tarballs,
            store: '/reviewed-package-store',
            checks,
            pnpm() {
              assert.fail('A populated metadata cache must never be reused');
            },
          }),
        { code: 'EEXIST' },
      );
    }
    assert.notEqual(caches[0], caches[1]);
    assert.equal(
      readFileSync(resolve(globalCache, 'cached-metadata'), 'utf8'),
      'must not seed the consumer',
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('registry preparation and frozen offline installation failures stop without retry or fallback', () => {
  const temp = mkdtempSync(resolve(tmpdir(), 'kmk-native-consumer-failure-test-'));
  try {
    for (const failureAt of [1, 2]) {
      const directory = resolve(temp, `failure-${failureAt}`);
      mkdirSync(directory);
      const checks = { registryLockPreparation: 'NOT_RUN', offlineTarballInstall: 'NOT_RUN' };
      const failure = new Error(`install stage ${failureAt} failed`);
      let calls = 0;
      assert.throws(
        () =>
          installNativeConsumer({
            directory,
            tarballs,
            store: '/reviewed-package-store',
            checks,
            pnpm() {
              if (++calls === failureAt) throw failure;
            },
          }),
        (error) => error === failure,
      );
      assert.equal(calls, failureAt);
      assert.equal(checks.registryLockPreparation, failureAt === 1 ? 'FAIL' : 'PASS');
      assert.equal(checks.offlineTarballInstall, failureAt === 1 ? 'NOT_RUN' : 'FAIL');
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('consumer rejects source aliases, unpinned peers and install hooks', () => {
  assertConsumerManifest(manifest(), tarballs);
  for (const value of ['workspace:*', 'link:../packages/native', 'file:/example/source']) {
    const next = manifest();
    next.dependencies['korea-map-native'] = value;
    assert.throws(() => assertConsumerManifest(next, tarballs));
  }
  const unpinned = manifest();
  unpinned.dependencies.react = '^19.3.0';
  assert.throws(() => assertConsumerManifest(unpinned, tarballs), /Unreviewed peer/);
  const hook = { ...manifest(), scripts: { postinstall: 'unexpected command' } };
  assert.throws(() => assertConsumerManifest(hook, tarballs), /hooks/);
  const commonjs = { ...manifest(), type: 'commonjs' };
  assert.throws(() => assertConsumerManifest(commonjs, tarballs), /ESM consumer/);
});

test('installed SDK must stay inside isolated consumer with dist-only public entrypoints', () => {
  const temp = mkdtempSync(resolve(tmpdir(), 'kmk-native-consumer-test-'));
  try {
    const consumer = resolve(temp, 'consumer');
    const installed = resolve(consumer, 'node_modules/korea-map-native');
    mkdirSync(resolve(installed, 'dist'), { recursive: true });
    writeFileSync(resolve(installed, 'dist/index.js'), '');
    writeFileSync(
      resolve(installed, 'dist/index.d.ts'),
      '/// <reference types="geojson" preserve="true" />\n',
    );
    const pkg = {
      name: 'korea-map-native',
      main: './dist/index.js',
      types: './dist/index.d.ts',
      dependencies: { 'korea-map-core': '0.1.0', '@types/geojson': '7946.0.16' },
    };
    assertInstalledSdk(pkg, installed, consumer);
    const leaked = resolve(temp, 'external');
    mkdirSync(leaked);
    assert.throws(() => assertInstalledSdk(pkg, leaked, consumer), /leaked out/);
    assert.throws(
      () =>
        assertInstalledSdk(
          { ...pkg, dependencies: { ...pkg.dependencies, 'korea-map-core': 'workspace:*' } },
          installed,
          consumer,
        ),
      /local dependency/,
    );
    assert.throws(
      () =>
        assertInstalledSdk(
          { ...pkg, dependencies: { 'korea-map-core': '0.1.0' } },
          installed,
          consumer,
        ),
      /GeoJSON type dependency/,
    );
    writeFileSync(resolve(installed, 'dist/index.d.ts'), '');
    assert.throws(() => assertInstalledSdk(pkg, installed, consumer), /GeoJSON reference/);
    writeFileSync(
      resolve(installed, 'dist/index.d.ts'),
      '/// <reference types="geojson" preserve="true" />\n',
    );
    mkdirSync(resolve(installed, 'src'));
    assert.throws(() => assertInstalledSdk(pkg, installed, consumer), /source/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('Expo introspection must prove foreground-only permissions and reviewed MapLibre engines', () => {
  assertIntrospection(introspection());
  const unreviewed = introspection();
  unreviewed.plugins[0][1].ios.nativeVersion = '0.0.0';
  assert.throws(() => assertIntrospection(unreviewed));
  const location = introspection();
  location._internal.modResults.ios.infoPlist.UIBackgroundModes = ['location'];
  assert.throws(() => assertIntrospection(location), /background mode/);
  const permission = introspection();
  permission._internal.modResults.android.manifest.permission =
    'ACCESS_FINE_LOCATION ACCESS_BACKGROUND_LOCATION';
  assert.throws(() => assertIntrospection(permission), /background permission/);
  const missingPlugin = introspection();
  delete missingPlugin._internal.pluginHistory;
  assert.throws(() => assertIntrospection(missingPlugin), /plugin did not run/);
  const missingGradle = introspection();
  missingGradle._internal.modResults.android.gradleProperties = [];
  assert.throws(() => assertIntrospection(missingGradle));
});

test('Native release gate accepts a completed compiler and rejects actual compiler diagnostics', () => {
  const success = spawnSync(process.execPath, ['-e', 'process.exit(0)'], { encoding: 'utf8' });
  assertConsumerDeclarations(summarizeDeclarationProbe(success));
  const failure = spawnSync(
    process.execPath,
    [
      '-e',
      "console.error('App.tsx(1,1): error TS2411: Synthetic declaration failure'); process.exit(2)",
    ],
    { encoding: 'utf8' },
  );
  const summary = summarizeDeclarationProbe(failure);
  assert.equal(summary.status, 'FAIL');
  assert(summary.diagnosticCodes.includes('TS2411'));
  assert.throws(() => assertConsumerDeclarations(summary), /Native dependency declarations/);
});

test('public SDK declarations use full library checks with React-only ambient types in both modes', () => {
  for (const mode of ['Bundler', 'NodeNext']) {
    const config = createNativePublicTypeConfig(mode);
    assert.deepEqual(config.compilerOptions, {
      strict: true,
      skipLibCheck: false,
      module: mode === 'NodeNext' ? 'NodeNext' : 'ESNext',
      moduleResolution: mode,
      target: 'ES2022',
      jsx: 'react-jsx',
      types: ['react'],
      lib: ['ES2022'],
      noEmit: true,
    });
    assert.deepEqual(config.files, ['public-sdk.tsx']);
  }
  assert.throws(() => createNativePublicTypeConfig('Classic'), /Unsupported/);
});

test('public SDK declaration gates require both completed probes and do not clear the RN app gate', () => {
  const pass = summarizeDeclarationProbe({ status: 0, signal: null });
  const fail = summarizeDeclarationProbe({
    status: 2,
    signal: null,
    stdout: 'public-sdk.tsx(1,1): error TS2503: Cannot find namespace GeoJSON.',
  });
  const incomplete = summarizeDeclarationProbe({ status: null, signal: null });
  const checks = { publicSdkBundlerDeclarations: pass, publicSdkNodeNextDeclarations: pass };
  assertPublicSdkDeclarations(checks);
  for (const key of Object.keys(checks)) {
    for (const result of [fail, incomplete, undefined])
      assert.throws(() => assertPublicSdkDeclarations({ ...checks, [key]: result }), /Native/);
  }
  // A successful SDK boundary cannot suppress errors in the application's RN declarations.
  assert.throws(() => assertConsumerDeclarations(fail), /Native dependency declarations/);
});

test('Native release gate never accepts a killed or timed-out compiler as a declaration pass', () => {
  const killed = spawnSync(process.execPath, ['-e', "process.kill(process.pid, 'SIGTERM')"], {
    encoding: 'utf8',
  });
  const timeout = spawnSync(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    encoding: 'utf8',
    timeout: 50,
  });
  // Windows can report forced termination as a nonzero status without a POSIX signal.
  const killedSummary = summarizeDeclarationProbe(killed);
  assert.notEqual(killedSummary.status, 'PASS');
  assert.throws(() => assertConsumerDeclarations(killedSummary), /Native dependency declarations/);
  const timeoutSummary = summarizeDeclarationProbe(timeout);
  assert.equal(timeoutSummary.status, 'NOT_RUN');
  assert.equal(timeoutSummary.completed, false);
  assert.throws(() => assertConsumerDeclarations(timeoutSummary), /Native dependency declarations/);
});

test('Native release gate rejects startup failure and missing completion even without TypeScript diagnostics', () => {
  for (const result of [
    { status: null, signal: null, error: { code: 'ENOENT' }, stdout: '', stderr: '' },
    { status: null, signal: null, stdout: '', stderr: '' },
  ]) {
    const summary = summarizeDeclarationProbe(result);
    assert.equal(summary.status, 'NOT_RUN');
    assert.throws(() => assertConsumerDeclarations(summary), /Native dependency declarations/);
  }
});
