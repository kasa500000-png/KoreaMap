import assert from 'node:assert/strict';

/** Public runtime facts only: never copy environment variables, paths or host/user names. */
export function verificationEnvironment() {
  return {
    platform: process.platform,
    architecture: process.arch,
    node: process.versions.node,
    pnpm: null,
  };
}

export function observedPnpmVersion(output) {
  const version = output.trim();
  assert(/^\d+\.\d+\.\d+$/.test(version), 'Unable to identify stable pnpm version');
  return version;
}
