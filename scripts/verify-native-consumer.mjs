import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertDeclarationProbe, summarizeDeclarationProbe } from './declaration-probe.mjs';

const sdkNames = ['core', 'native', 'styles'];
export const pinnedPeers = Object.freeze({
  '@maplibre/maplibre-react-native': '11.5.0',
  expo: '58.0.14',
  'expo-dev-client': '58.0.14',
  'expo-location': '58.0.17',
  react: '19.3.0',
  'react-native': '0.88.0',
});

/** Only a completed successful compiler run can clear the Native declaration release gate. */
export function assertConsumerDeclarations(summary) {
  assertDeclarationProbe(summary, 'Native dependency declarations');
}

export function assertConsumerManifest(manifest, tarballs) {
  assert.equal(manifest.private, true, 'Consumer must never be publishable');
  assert.equal(manifest.main, 'index.js');
  for (const [name, version] of Object.entries(pinnedPeers))
    assert.equal(manifest.dependencies[name], version, `Unreviewed peer version: ${name}`);
  for (const name of sdkNames) {
    const key = `korea-map-${name}`;
    assert.equal(manifest.dependencies[key], tarballs[key], 'SDK must resolve to its tarball');
    assert.match(tarballs[key], /^file:.*\.tgz$/, 'An actual SDK tarball is required');
  }
  for (const value of Object.values({ ...manifest.dependencies, ...manifest.devDependencies }))
    assert(!/^(workspace:|link:)/.test(value), 'Workspace/source aliases are forbidden');
  assert(!manifest.workspaces, 'Consumer cannot join the SDK workspace');
  assert(!manifest.scripts, 'Install/build hooks are not needed');
}

export function assertInstalledSdk(manifest, packageRoot, consumerRoot) {
  const consumer = realpathSync(consumerRoot);
  const installed = realpathSync(packageRoot);
  const within = relative(consumer, installed);
  assert(within && !within.startsWith('..') && !isAbsolute(within), 'SDK leaked out of consumer');
  assert.match(manifest.name, /^korea-map-(core|native|styles)$/);
  assert.equal(manifest.main, './dist/index.js');
  assert.equal(manifest.types, './dist/index.d.ts');
  assert(!existsSync(resolve(installed, 'src')), 'SDK source must not be installed');
  assert(existsSync(resolve(installed, 'dist/index.js')), 'Published JavaScript missing');
  assert(existsSync(resolve(installed, 'dist/index.d.ts')), 'Public declarations missing');
  for (const value of Object.values(manifest.dependencies ?? {}))
    assert(!/^(workspace:|link:|file:)/.test(value), 'Packed manifest retained a local dependency');
}

export function assertIntrospection(config) {
  assert.equal(config.updates.enabled, false, 'OTA updates must remain disabled');
  assert.equal(config.android.package, 'org.koreamapkit.consumer');
  assert.equal(config.ios.bundleIdentifier, 'org.koreamapkit.consumer');
  const plugins = new Map(
    config.plugins.map((value) => (Array.isArray(value) ? value : [value, {}])),
  );
  assert.deepEqual(plugins.get('@maplibre/maplibre-react-native'), {
    android: { nativeVersion: '13.6.1', nativeVariant: 'opengl', locationEngine: 'default' },
    ios: { nativeVersion: '6.31.0' },
  });
  assert.equal(
    config._internal?.pluginHistory?.['@maplibre/maplibre-react-native']?.version,
    pinnedPeers['@maplibre/maplibre-react-native'],
    'MapLibre config plugin did not run',
  );
  const gradleProperties = new Map(
    (config._internal?.modResults?.android?.gradleProperties ?? [])
      .filter((entry) => entry.type === 'property')
      .map((entry) => [entry.key, entry.value]),
  );
  for (const [name, value] of Object.entries(
    plugins.get('@maplibre/maplibre-react-native').android,
  ))
    assert.equal(gradleProperties.get(`org.maplibre.reactnative.${name}`), value);
  const location = plugins.get('expo-location');
  for (const key of [
    'locationAlwaysPermission',
    'locationAlwaysAndWhenInUsePermission',
    'isIosBackgroundLocationEnabled',
    'isAndroidBackgroundLocationEnabled',
    'isAndroidForegroundServiceEnabled',
  ])
    assert.equal(location[key], false, 'Background collection must not be configured');
  const permission = config._internal?.modResults?.ios?.infoPlist;
  assert(permission?.NSLocationWhenInUseUsageDescription, 'Location plugin did not run');
  assert(!permission.UIBackgroundModes?.includes('location'), 'iOS background mode is forbidden');
  const android = JSON.stringify(config._internal?.modResults?.android?.manifest ?? {});
  assert(android.includes('ACCESS_FINE_LOCATION'), 'Android foreground permission missing');
  assert(
    !android.includes('ACCESS_BACKGROUND_LOCATION'),
    'Android background permission forbidden',
  );
  assert(!android.includes('FOREGROUND_SERVICE_LOCATION'), 'Android location service forbidden');
}

function runVerification() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const cli = process.env.npm_execpath;
  assert(cli, 'Run with pnpm verify:native-consumer (after pnpm pack:check)');
  const taskEnv = {
    ...process.env,
    EXPO_NO_TELEMETRY: '1',
    EXPO_OFFLINE: '1',
    EXPO_NO_DOTENV: '1',
    CI: '1',
  };
  function execute(binary, args, cwd) {
    const result = spawnSync(binary, args, {
      cwd,
      env: taskEnv,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout: 180000,
    });
    assert.equal(result.status, 0, `${binary} failed:\n${result.stdout}\n${result.stderr}`);
    return result.stdout;
  }
  function pnpm(args, cwd = root) {
    const scripted = /\.[cm]?js$/.test(cli);
    return execute(scripted ? process.execPath : cli, scripted ? [cli, ...args] : args, cwd);
  }
  const directory = mkdtempSync(resolve(tmpdir(), 'kmk-native-consumer-'));
  const report = {
    schemaVersion: 1,
    sourceCommit: null,
    sourceDirty: null,
    overall: 'NOT_RUN',
    releaseBlocked: true,
    packages: [],
    checks: {},
    native: {
      androidDevelopmentBuild: 'NOT_RUN',
      androidPhysicalDevice: 'NOT_RUN',
      iosDevelopmentBuild: 'NOT_RUN',
      iosDevice: 'NOT_RUN',
      xyzGlyphRendering: 'NOT_RUN',
      pmtiles: 'NOT_RUN',
      osNetwork: 'NOT_RUN',
    },
  };
  const target = resolve(root, 'artifacts/qa/native-consumer.json');
  try {
    report.sourceCommit = execute('git', ['rev-parse', 'HEAD'], root).trim();
    report.sourceDirty = execute('git', ['status', '--porcelain'], root).trim().length !== 0;
    const tarballs = Object.fromEntries(
      sdkNames.map((name) => {
        const manifest = JSON.parse(readFileSync(resolve(root, 'packages', name, 'package.json')));
        const file = `${manifest.name}-${manifest.version}.tgz`;
        const path = resolve(root, 'artifacts', file);
        const bytes = readFileSync(path);
        report.packages.push({
          name: manifest.name,
          version: manifest.version,
          file,
          bytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        });
        return [manifest.name, `file:${path.replaceAll('\\', '/')}`];
      }),
    );
    const manifest = {
      name: 'isolated-korea-map-native-consumer',
      private: true,
      version: '0.0.0',
      main: 'index.js',
      dependencies: { ...tarballs, ...pinnedPeers },
      devDependencies: {
        '@types/geojson': '7946.0.16',
        '@types/react': '19.3.0',
        typescript: '6.0.3',
      },
    };
    assertConsumerManifest(manifest, tarballs);
    const json = (file, value) =>
      writeFileSync(resolve(directory, file), `${JSON.stringify(value, null, 2)}\n`);
    json('package.json', manifest);
    writeFileSync(
      resolve(directory, 'pnpm-workspace.yaml'),
      `ignoreScripts: true\nstrictPeerDependencies: true\npackageImportMethod: hardlink\noverrides:\n  'xcode>uuid': 11.1.1\n${Object.entries(
        tarballs,
      )
        .map(([name, value]) => `  '${name}': '${value}'`)
        .join('\n')}\n`,
    );
    copyFileSync(resolve(root, 'pnpm-lock.yaml'), resolve(directory, 'pnpm-lock.yaml'));
    const store = dirname(pnpm(['store', 'path']).trim());
    console.log('Native consumer: offline lock resolution and hardlinked tarball install');
    pnpm(
      [
        'install',
        '--offline',
        '--lockfile-only',
        '--no-frozen-lockfile',
        '--ignore-scripts',
        '--store-dir',
        store,
      ],
      directory,
    );
    pnpm(
      ['install', '--offline', '--frozen-lockfile', '--ignore-scripts', '--store-dir', store],
      directory,
    );
    const reviewed = new Set(
      Object.values(
        JSON.parse(pnpm(['-r', '--include-workspace-root', 'licenses', 'list', '--json'])),
      ).flatMap((entries) =>
        entries.flatMap(({ name, versions }) => versions.map((version) => `${name}@${version}`)),
      ),
    );
    for (const entries of Object.values(
      JSON.parse(pnpm(['licenses', 'list', '--json'], directory)),
    ))
      for (const { name, versions } of entries) {
        if (Object.hasOwn(tarballs, name)) continue;
        for (const version of versions)
          assert(
            reviewed.has(`${name}@${version}`),
            `Unreviewed native dependency: ${name}@${version}`,
          );
      }
    for (const name of sdkNames) {
      const path = resolve(directory, 'node_modules', `korea-map-${name}`);
      assertInstalledSdk(JSON.parse(readFileSync(resolve(path, 'package.json'))), path, directory);
    }
    report.checks.offlineTarballInstall = 'PASS';
    json('tsconfig.json', {
      compilerOptions: {
        strict: true,
        // Report upstream dependency declaration errors separately; keep application code strict.
        skipLibCheck: true,
        module: 'ESNext',
        moduleResolution: 'Bundler',
        target: 'ES2022',
        jsx: 'react-jsx',
        types: ['react', 'react-native'],
        lib: ['ES2022'],
        noEmit: true,
      },
      files: ['App.tsx'],
    });
    const source = `import { useRef } from 'react';
import { AppState, View } from 'react-native';
import * as Location from 'expo-location';
import { defineMapStyle, type MapController, type Coordinate, type MapMarker, type Scheduler } from 'korea-map-core';
import { MapView, createExpoLocationClient, createNativeVectorSource, type NativeMapConfig } from 'korea-map-native';
import { createThemeStyle, designAttribution } from 'korea-map-styles';
const coordinate: Coordinate = [126.978, 37.5665];
const marker: MapMarker = { id: 'synthetic', label: '합성 위치', coordinate };
const style = defineMapStyle(createThemeStyle({ theme: 'standard', target: 'native', data: { mode: 'fixture' }, typography: { mode: 'none' } }), designAttribution);
const config: NativeMapConfig = { mode: 'operator', style, resources: { allowedOrigins: [] } };
const scheduler: Scheduler = { schedule(callback, delayMs) { const timer = setTimeout(callback, delayMs); return () => clearTimeout(timer); } };
// Compile the optional platform seam without collecting location or asking for permission.
const createLocation = () => createExpoLocationClient(Location, AppState, scheduler);
void createLocation; void createNativeVectorSource;
async function exercise(map: MapController) {
  await map.setCenter(coordinate); await map.setZoom(14);
  await map.setCamera({ center: coordinate, zoom: 14, bearing: 10, pitch: 20 });
  await map.fitBounds({ west: 126.97, south: 37.56, east: 126.99, north: 37.58 });
  await map.setStyle(style); await map.addMarker(marker); await map.removeMarker(marker.id);
  await map.addGeoJSON('point', { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [...coordinate] } }] });
  await map.showRoute({ id: 'route', coordinates: [coordinate, [126.98, 37.57]] });
  await map.getVisibleBounds(); await map.removeGeoJSON('point');
  const off = map.onEvent((event) => { if (event.type === 'error') void event.error.code; }); off(); map.destroy();
}
void exercise;
// @ts-expect-error Coordinates are length-two tuples.
const invalid: Coordinate = [127]; void invalid;
// @ts-expect-error Ref consumers cannot omit required marker labels.
const invalidMarker: MapMarker = { id: 'missing', coordinate }; void invalidMarker;
type IsAny<T> = 0 extends (1 & T) ? true : false;
const componentIsTyped: IsAny<typeof MapView> = false;
const propsAreTyped: IsAny<Parameters<typeof MapView>[0]> = false;
void componentIsTyped; void propsAreTyped;
// @ts-expect-error Native providers cannot select an unreviewed implicit fixture.
const invalidConfig: NativeMapConfig = { mode: 'local-fixture', fixtureId: 'unreviewed' }; void invalidConfig;
export default function App() {
  const map = useRef<MapController>(null);
  return <View style={{ flex: 1 }}><MapView ref={map} config={config} onEvent={(event) => { if (event.type === 'ready') void map.current?.setZoom(14); }} /></View>;
}
`;
    writeFileSync(resolve(directory, 'App.tsx'), source);
    writeFileSync(
      resolve(directory, 'index.js'),
      "import { registerRootComponent } from 'expo';\nimport App from './App';\nregisterRootComponent(App);\n",
    );
    writeFileSync(
      resolve(directory, 'metro.config.cjs'),
      "const { getDefaultConfig } = require('expo/metro-config');\nmodule.exports = getDefaultConfig(__dirname);\n",
    );
    // Same reviewed plugin options as the real example; distinct consumer application identity.
    const app = JSON.parse(readFileSync(resolve(root, 'examples/expo/app.json')));
    app.expo.name = 'Korea Map Kit Isolated Consumer';
    app.expo.slug = 'korea-map-kit-isolated-consumer';
    app.expo.android.package = 'org.koreamapkit.consumer';
    app.expo.ios.bundleIdentifier = 'org.koreamapkit.consumer';
    json('app.json', app);
    const require = createRequire(resolve(directory, 'package.json'));
    const tsc = require.resolve('typescript/bin/tsc');
    execute(process.execPath, [tsc, '-p', 'tsconfig.json'], directory);
    report.checks.publicTypesStrictWithSkipLibCheck = 'PASS';
    const declarationProbe = spawnSync(
      process.execPath,
      [tsc, '-p', 'tsconfig.json', '--skipLibCheck', 'false'],
      { cwd: directory, env: taskEnv, encoding: 'utf8', timeout: 180000 },
    );
    report.checks.dependencyDeclarations = summarizeDeclarationProbe(declarationProbe, {
      roots: [directory, root],
    });
    console.log('NATIVE_DECLARATION_PROBE', JSON.stringify(report.checks.dependencyDeclarations));
    const expo = resolve(dirname(require.resolve('expo/package.json')), 'bin/cli');
    const introspection = JSON.parse(
      execute(process.execPath, [expo, 'config', '--type', 'introspect', '--json'], directory),
    );
    assertIntrospection(introspection);
    report.checks.configPluginIntrospection = 'PASS';
    console.log(
      'Native consumer: strict application/API types and Expo plugin introspection passed',
    );
    execute(
      process.execPath,
      [
        expo,
        'export',
        '--platform',
        'android',
        '--platform',
        'ios',
        '--output-dir',
        'dist',
        '--no-bytecode',
        '--max-workers',
        '2',
      ],
      directory,
    );
    const metadata = JSON.parse(readFileSync(resolve(directory, 'dist/metadata.json')));
    assert(metadata.fileMetadata?.android?.bundle, 'Android JS bundle missing');
    assert(metadata.fileMetadata?.ios?.bundle, 'iOS JS bundle missing');
    report.checks.androidJavaScriptExport = 'PASS';
    report.checks.iosJavaScriptExport = 'PASS';
    report.overall =
      report.checks.dependencyDeclarations.status === 'PASS' ? 'PASS' : 'PARTIAL_PASS';
    report.releaseBlocked = report.checks.dependencyDeclarations.status !== 'PASS';
    console.log(
      `${report.overall}: isolated Native tarballs, strict app/API types with skipLibCheck, plugins and Android/iOS JS export`,
    );
    console.log(
      `Dependency declarations (skipLibCheck:false): ${report.checks.dependencyDeclarations.status}; see report`,
    );
    console.log('NOT RUN: APK/IPA, devices, XYZ/glyph, PMTiles, OS network and native memory QA');
  } catch (error) {
    report.overall = 'FAIL';
    report.failed = true;
    throw error;
  } finally {
    try {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
  // Preserve supported checks and diagnostics before refusing a release with incomplete declarations.
  assertConsumerDeclarations(report.checks.dependencyDeclarations);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  runVerification();
