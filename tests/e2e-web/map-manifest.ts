/** Next's module keys use the build host's separator; emitted chunk URLs stay POSIX. */
export function mapDemoChunkCandidates(manifest: unknown): string[] {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest))
    throw new Error('Invalid loadable manifest');
  const entries = Object.entries(manifest).filter(
    ([key]) => key.replaceAll('\\', '/') === 'app/map-client.tsx -> ./map-demo',
  );
  if (entries.length !== 1) throw new Error('Expected exactly one map module entry');
  const entry: unknown = entries[0]?.[1];
  const files = entry && typeof entry === 'object' && 'files' in entry ? entry.files : undefined;
  if (
    !Array.isArray(files) ||
    files.length === 0 ||
    files.length > 8 ||
    !files.every(
      (file): file is string =>
        typeof file === 'string' &&
        /^static\/chunks\/[\w./-]+\.js$/.test(file) &&
        !file.includes('..'),
    )
  )
    throw new Error('Invalid map module chunk paths');
  return files;
}
