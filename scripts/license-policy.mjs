// Metadata review only; binary redistribution still requires notices/source review.
const permissive = new Set([
  'MIT',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'Unlicense',
  'BlueOak-1.0.0',
  '(MIT OR Apache-2.0)',
  '(MIT OR CC0-1.0)',
]);

export function isReviewedLicense(name, version, license) {
  if (permissive.has(license)) return true;
  // Windows ships libvips DLLs in the sharp package, unlike the separate Unix package.
  // Evidence and distribution limits: docs/research/windows-license-review.md.
  if (license === 'Apache-2.0 AND LGPL-3.0-or-later')
    return name === '@img/sharp-win32-x64' && version === '0.35.5';
  if (license === 'LGPL-3.0-or-later')
    return /^@img\/sharp-libvips-/.test(name) && version === '1.3.4';
  if (license === 'MPL-2.0') return /^lightningcss(?:-|$)/.test(name) && version === '1.33.0';
  if (license === 'CC-BY-4.0') return name === 'caniuse-lite' && version === '1.0.30001816';
  if (license === 'Python-2.0') return name === 'argparse' && version === '2.0.1';
  // Select the BSD option, not the GPL alternative. This does not clear security advisories.
  if (license === '(BSD-3-Clause OR GPL-2.0)') return name === 'node-forge' && version === '1.4.0';
  return false;
}
