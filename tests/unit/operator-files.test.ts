import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readOperatorFile } from '../../services/geo-data/src/operator-files.js';

const temporary: string[] = [];
async function fixture() {
  const workspace = await mkdtemp(resolve(tmpdir(), 'kmk-operator-files-'));
  temporary.push(workspace);
  const storage = resolve(workspace, 'data/raw');
  await mkdir(storage, { recursive: true });
  const file = resolve(storage, 'authored.csv');
  await writeFile(file, 'authored fixture bytes');
  return { workspace, storage, file };
}
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('private ETL operator file boundary', () => {
  it('reads only bounded regular files through one descriptor, preserving exact bytes', async () => {
    const { workspace, storage, file } = await fixture();
    const expected = await readFile(file);
    expect(await readOperatorFile(file, expected.length, workspace)).toEqual(expected);
    expect(await readOperatorFile('data/raw/authored.csv', expected.length, workspace)).toEqual(
      expected,
    );
    const nested = resolve(storage, 'nested');
    await mkdir(nested);
    await writeFile(resolve(nested, 'empty.csv'), Buffer.alloc(0));
    expect(await readOperatorFile('data/raw/nested/empty.csv', 1, workspace)).toEqual(
      Buffer.alloc(0),
    );
  });
  it('rejects absent inputs, invalid limits, directories, traversal, sibling-prefixes and oversized files', async () => {
    const { workspace, storage, file } = await fixture();
    await expect(readOperatorFile(undefined, 10, workspace)).rejects.toThrow(
      'OPERATOR_FILE_REQUIRED',
    );
    for (const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 10 * 1024 * 1024 + 1])
      await expect(readOperatorFile(file, limit, workspace)).rejects.toThrow(
        'INVALID_OPERATOR_FILE_LIMIT',
      );
    for (const path of [
      storage,
      '../outside.csv',
      'data/raw/../outside.csv',
      'data/raw-sibling/file',
    ])
      await expect(readOperatorFile(path, 10, workspace)).rejects.toThrow(
        'USE_IGNORED_OPERATOR_STORAGE',
      );
    const nested = resolve(storage, 'directory.csv');
    await mkdir(nested);
    await expect(readOperatorFile(nested, 100, workspace)).rejects.toThrow(
      'OPERATOR_REGULAR_FILE_REQUIRED',
    );
    await expect(readOperatorFile(file, 2, workspace)).rejects.toThrow('OPERATOR_FILE_TOO_LARGE');
  });
  it('rejects linked ancestor directories even when a link targets another location inside storage', async () => {
    const { workspace, storage } = await fixture();
    const nested = resolve(storage, 'nested');
    await mkdir(nested);
    await writeFile(resolve(nested, 'authored.csv'), 'inside fixture');
    const outside = resolve(workspace, 'outside');
    await mkdir(outside);
    await writeFile(resolve(outside, 'authored.csv'), 'outside fixture');
    for (const [name, target] of [
      ['inside-link', nested],
      ['outside-link', outside],
    ] as const) {
      await symlink(
        target,
        resolve(storage, name),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      await expect(
        readOperatorFile(`data/raw/${name}/authored.csv`, 100, workspace),
      ).rejects.toThrow('OPERATOR_LINK_NOT_ALLOWED');
    }
    expect(await readFile(resolve(outside, 'authored.csv'), 'utf8')).toBe('outside fixture');
  });
  it('rejects a symlink/junction substituted for the ignored storage directory', async () => {
    const { workspace, storage } = await fixture();
    const outside = resolve(workspace, 'outside');
    await mkdir(outside);
    await writeFile(resolve(outside, 'authored.csv'), 'outside fixture');
    await rm(storage, { recursive: true });
    await symlink(outside, storage, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(readOperatorFile('data/raw/authored.csv', 100, workspace)).rejects.toThrow(
      'OPERATOR_LINK_NOT_ALLOWED',
    );
  });
  it.skipIf(process.platform === 'win32')('rejects direct and dangling file symlinks', async () => {
    const { workspace, storage, file } = await fixture();
    const outside = resolve(workspace, 'outside.csv');
    await writeFile(outside, 'outside fixture');
    for (const [name, target] of [
      ['inside.csv', file],
      ['outside.csv', outside],
      ['dangling.csv', `${outside}-missing`],
    ] as const) {
      const link = resolve(storage, name);
      await symlink(target, link);
      await expect(readOperatorFile(link, 100, workspace)).rejects.toThrow(
        'OPERATOR_LINK_NOT_ALLOWED',
      );
    }
  });
  it('normalizes a workspace root alias before inspecting operator-controlled components', async () => {
    const { workspace } = await fixture();
    const alias = `${workspace}-alias`;
    temporary.push(alias);
    await symlink(workspace, alias, process.platform === 'win32' ? 'junction' : 'dir');
    expect((await readOperatorFile('data/raw/authored.csv', 100, alias)).toString()).toBe(
      'authored fixture bytes',
    );
  });
  it('does not expose private input paths in filesystem failures', async () => {
    const { workspace } = await fixture();
    const missing = 'data/raw/operator-private-input.csv';
    await expect(readOperatorFile(missing, 100, workspace)).rejects.toThrow(
      'OPERATOR_FILE_UNAVAILABLE',
    );
    try {
      await readOperatorFile(missing, 100, workspace);
    } catch (error) {
      expect(String(error)).not.toContain(workspace);
      expect(String(error)).not.toContain('operator-private-input');
    }
  });
});
