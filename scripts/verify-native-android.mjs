import assert from 'node:assert/strict';
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { delimiter, dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runVerification } from './verify-native-consumer.mjs';
import { assertAndroidHost, runOwnedAndroidCommand } from './native-android-process.mjs';

export function parseAndroidBuildOptions(args) {
  const values = {};
  for (const arg of args.filter((value) => value !== '--')) {
    const match = /^--(android-sdk|jdk|gradle|gradle-cache)=(.+)$/.exec(arg);
    assert(match, 'Only explicit Android tool paths are accepted');
    assert(!Object.hasOwn(values, match[1]), 'Duplicate tool path');
    assert(isAbsolute(match[2]), 'Android tool paths must be absolute');
    values[match[1]] = match[2];
  }
  assert.equal(Object.keys(values).length, 4, 'Specify android-sdk, jdk, gradle and gradle-cache');
  return values;
}

export function withEmbeddedDebugBundle(source) {
  assert.equal(
    [...source.matchAll(/^react\s*\{/gm)].length,
    1,
    'Expected one generated react block',
  );
  assert(
    !/^\s*debuggableVariants\s*=/m.test(source),
    'Existing variant configuration requires review',
  );
  return source.replace(/^react\s*\{/m, 'react {\n    debuggableVariants = []');
}

export function assertAndroidApk(badging, permissions, listing) {
  assert.match(badging, /^package: name='org\.koreamapkit\.consumer'/m);
  assert.match(badging, /native-code:.*'x86_64'/);
  const declared = new Set(
    [
      ...permissions.matchAll(
        /^uses-permission(?:-sdk-\d+)?: name='([^']+)'(?:[ \t][^\r\n]*)?\r?$/gm,
      ),
    ].map((match) => match[1]),
  );
  assert(declared.has('android.permission.ACCESS_FINE_LOCATION'));
  assert(!declared.has('android.permission.ACCESS_BACKGROUND_LOCATION'));
  assert(!declared.has('android.permission.FOREGROUND_SERVICE_LOCATION'));
  assert.match(listing, /^assets\/index\.android\.bundle$/m, 'Embedded JavaScript missing');
  assert.match(listing, /^lib\/x86_64\/.*maplibre.*\.so$/im, 'MapLibre native library missing');
}

export function initializeAndroidEvidence(output) {
  mkdirSync(output, { recursive: true });
  writeFileSync(
    resolve(output, 'report.json'),
    `${JSON.stringify({ schemaVersion: 1, checkedAt: new Date().toISOString(), status: 'NOT_RUN', releaseBlocked: true, androidDevelopmentBuild: 'NOT_VERIFIED' }, null, 2)}\n`,
  );
}

export function buildIsolatedAndroid(context, options, output) {
  assertAndroidHost();
  const began = new Date();
  const { directory, expo, environment, report } = context;
  const sdk = realpathSync(options['android-sdk']);
  const jdk = realpathSync(options.jdk);
  const gradle = realpathSync(options.gradle);
  const cache = realpathSync(options['gradle-cache']);
  assert(statSync(sdk).isDirectory() && statSync(jdk).isDirectory());
  assert(statSync(gradle).isFile() && statSync(cache).isDirectory());
  mkdirSync(output, { recursive: true });
  const env = {
    ...environment,
    ANDROID_HOME: sdk,
    ANDROID_SDK_ROOT: sdk,
    JAVA_HOME: jdk,
    GRADLE_USER_HOME: cache,
    PATH: `${resolve(jdk, 'bin')}${delimiter}${environment.PATH ?? ''}`,
  };
  const commands = [];
  const execute = (name, binary, args, cwd = directory) => {
    const started = Date.now();
    const result = runOwnedAndroidCommand(binary, args, { cwd, env });
    writeFileSync(resolve(output, `${name}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
    commands.push({
      name,
      elapsedMs: Date.now() - started,
      status: result.status,
      signal: result.signal,
      failure: result.failure,
      cleanup: result.cleanup,
    });
    writeFileSync(resolve(output, 'commands.json'), `${JSON.stringify(commands, null, 2)}\n`);
    assert(
      !result.failure && !result.signal && result.status === 0,
      `${name} did not complete; inspect ignored log`,
    );
    return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  };
  assert.match(
    execute('java', resolve(jdk, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'), [
      '-version',
    ]),
    /version "21\./,
  );
  assert.match(
    execute('gradle-version', gradle, ['--offline', '--version']),
    /^Gradle 9\.4\.1\r?$/m,
  );
  execute('prebuild', process.execPath, [
    expo,
    'prebuild',
    '--platform',
    'android',
    '--no-install',
  ]);
  const appGradle = resolve(directory, 'android/app/build.gradle');
  writeFileSync(appGradle, withEmbeddedDebugBundle(readFileSync(appGradle, 'utf8')));
  execute(
    'assemble',
    gradle,
    [
      ':app:assembleDebug',
      '--offline',
      '--no-daemon',
      '--max-workers=2',
      '--console=plain',
      '-PreactNativeArchitectures=x86_64',
    ],
    resolve(directory, 'android'),
  );
  const apk = resolve(directory, 'android/app/build/outputs/apk/debug/app-debug.apk');
  const aapt = resolve(
    sdk,
    'build-tools/37.0.0',
    process.platform === 'win32' ? 'aapt.exe' : 'aapt',
  );
  const badging = execute('badging', aapt, ['dump', 'badging', apk]);
  const permissions = execute('permissions', aapt, ['dump', 'permissions', apk]);
  const listing = execute('contents', aapt, ['list', apk]);
  assertAndroidApk(badging, permissions, listing);
  const generatedBundle = resolve(
    directory,
    'android/app/build/generated/assets/react/debug/index.android.bundle',
  );
  const attempt = resolve(output, 'attempts', String(began.getTime()));
  mkdirSync(attempt, { recursive: true });
  const savedApk = resolve(attempt, 'app-debug.apk');
  const savedBundle = resolve(attempt, 'generated-index.android.bundle');
  copyFileSync(apk, savedApk);
  copyFileSync(generatedBundle, savedBundle);
  writeFileSync(
    resolve(output, 'report.json'),
    `${JSON.stringify({ schemaVersion: 1, status: 'VERIFYING_APK', releaseBlocked: true, attempt: relative(output, attempt).split('\\').join('/'), packages: report.packages }, null, 2)}\n`,
  );
  const scripts = dirname(fileURLToPath(import.meta.url));
  const payload = JSON.parse(
    execute('apk-payload', process.execPath, [
      resolve(scripts, 'python.mjs'),
      resolve(scripts, 'verify-native-apk.py'),
      '--apk',
      savedApk,
      '--generated-bundle',
      savedBundle,
    ]),
  );
  assert.equal(payload.status, 'PASS');
  copyFileSync(savedApk, resolve(output, 'app-debug.apk'));
  const evidence = {
    schemaVersion: 1,
    startedAt: began.toISOString(),
    completedAt: new Date().toISOString(),
    elapsedMs: Date.now() - began.getTime(),
    host: { platform: process.platform, architecture: process.arch, node: process.version },
    tools: { javaMajor: 21, gradle: '9.4.1', buildTools: '37.0.0', offline: true },
    attempt: relative(output, attempt).split('\\').join('/'),
    sourceCommit: report.sourceCommit,
    sourceDirty: report.sourceDirty,
    status: 'PASS_BUILD_ONLY',
    releaseBlocked: true,
    packages: report.packages,
    apk: {
      file: 'app-debug.apk',
      ...payload.apk,
    },
    bundle: payload.bundle,
    libraries: payload.libraries,
    binaryNoticeInventory: payload.binaryNoticeInventory,
    zip: payload.zip,
    commands,
    checks: {
      isolatedTarballs: 'PASS',
      embeddedJavaScript: 'PASS',
      nativeLibrary: 'PASS',
      generatedBundleMatchesApk: 'PASS',
      zipCrcAndBounds: 'PASS',
      foregroundPermissions: 'PASS',
    },
    androidEmulator: 'NOT_RUN',
    androidPhysicalDevice: 'NOT_RUN',
    ios: 'NOT_RUN',
    osNetwork: 'NOT_RUN',
    binaryNotices: 'NOT_RUN',
  };
  writeFileSync(resolve(output, 'report.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  report.native.androidDevelopmentBuild = 'PASS';
  report.native.androidEmbeddedJavaScript = 'PASS';
  console.log(
    'PASS_BUILD_ONLY: isolated tarball APK with embedded JS; device/OS QA and release gates remain',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = resolve(dirname(fileURLToPath(import.meta.url)), '../artifacts/qa/native-android');
  // A failed new attempt must never reuse the success report from an earlier build.
  initializeAndroidEvidence(output);
  try {
    const options = parseAndroidBuildOptions(process.argv.slice(2));
    assertAndroidHost();
    runVerification({
      afterJavaScriptExport: (context) => buildIsolatedAndroid(context, options, output),
    });
  } catch (error) {
    mkdirSync(output, { recursive: true });
    // The Native verifier records declaration failures separately after preserving successful build evidence.
    const evidence = JSON.parse(readFileSync(resolve(output, 'report.json'), 'utf8'));
    evidence.consumerVerification = 'NOT_ACCEPTED';
    if (evidence.status !== 'PASS_BUILD_ONLY') evidence.status = 'FAIL';
    evidence.releaseBlocked = true;
    writeFileSync(resolve(output, 'report.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    console.error(error instanceof Error ? error.message : 'Android verification did not complete');
    process.exitCode = 1;
  }
}
