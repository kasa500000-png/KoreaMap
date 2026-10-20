import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { KitError } from 'korea-map-core';

const maximumBytes = 10 * 1024 * 1024;
function fail(detail: string): never {
  throw new KitError('INVALID_ARGUMENT', detail);
}
function inside(directory: string, file: string): boolean {
  const path = relative(directory, file);
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

/** Private CLI input: regular files under data/raw; never follow operator-created links. */
export async function readOperatorFile(
  input: string | undefined,
  maxBytes: number,
  workspace = process.cwd(),
): Promise<Buffer> {
  if (typeof input !== 'string' || !input) fail('OPERATOR_FILE_REQUIRED');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > maximumBytes)
    fail('INVALID_OPERATOR_FILE_LIMIT');
  const lexicalRoot = resolve(workspace),
    lexicalStorage = resolve(lexicalRoot, 'data/raw'),
    lexicalFile = resolve(lexicalRoot, input);
  if (!inside(lexicalStorage, lexicalFile)) fail('USE_IGNORED_OPERATOR_STORAGE');

  try {
    // Canonicalize only the workspace root (e.g. macOS /var -> /private/var),
    // then inspect every operator-controlled path component without following links.
    const canonicalRoot = await realpath(lexicalRoot),
      suffix = relative(lexicalStorage, lexicalFile),
      canonicalStorage = resolve(canonicalRoot, 'data/raw');
    const components = ['data', 'raw', ...suffix.split(sep)];
    let current = canonicalRoot;
    for (const [index, component] of components.entries()) {
      current = resolve(current, component);
      const info = await lstat(current);
      if (info.isSymbolicLink()) fail('OPERATOR_LINK_NOT_ALLOWED');
      if (index === components.length - 1) {
        if (!info.isFile()) fail('OPERATOR_REGULAR_FILE_REQUIRED');
      } else if (!info.isDirectory()) fail('OPERATOR_DIRECTORY_REQUIRED');
    }
    const original = await lstat(current);
    if (original.size > maxBytes) fail('OPERATOR_FILE_TOO_LARGE');
    if (!inside(canonicalStorage, await realpath(current))) fail('OPERATOR_PATH_ESCAPE');
    // O_NONBLOCK also prevents a concurrently substituted POSIX FIFO from hanging open.
    // Windows uses lstat/realpath and descriptor identity checks with its supported flags.
    const flags =
      process.platform === 'win32'
        ? constants.O_RDONLY
        : constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
    const file = await open(current, flags);
    try {
      const opened = await file.stat();
      if (!opened.isFile()) fail('OPERATOR_REGULAR_FILE_REQUIRED');
      if (opened.dev !== original.dev || opened.ino !== original.ino) fail('OPERATOR_FILE_CHANGED');
      if (opened.size > maxBytes) fail('OPERATOR_FILE_TOO_LARGE');
      if (!inside(canonicalStorage, await realpath(current))) fail('OPERATOR_PATH_ESCAPE');
      const chunks: Buffer[] = [];
      const buffer = Buffer.alloc(Math.min(65536, maxBytes + 1));
      let size = 0;
      for (;;) {
        const { bytesRead } = await file.read(
          buffer,
          0,
          Math.min(buffer.length, maxBytes + 1 - size),
          null,
        );
        if (bytesRead === 0) break;
        size += bytesRead;
        if (size > maxBytes) fail('OPERATOR_FILE_TOO_LARGE');
        chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
      }
      return Buffer.concat(chunks, size);
    } finally {
      await file.close();
    }
  } catch (error) {
    if (error instanceof KitError) throw error;
    // Filesystem messages can contain private paths; the CLI emits stable codes only.
    throw new KitError('INVALID_ARGUMENT', 'OPERATOR_FILE_UNAVAILABLE');
  }
}
