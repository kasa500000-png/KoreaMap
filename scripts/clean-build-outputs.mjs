import { lstatSync, realpathSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Operator data, credentials, reports, archives and worktrees under artifacts are not build outputs.
const generatedPaths = [
  ...['core', 'web', 'native', 'styles', 'data-adapters'].map((name) => `packages/${name}/dist`),
  ...['geo-data', 'search', 'routing', 'tiles'].map((name) => `services/${name}/dist`),
  'examples/web/.next',
  'examples/web/out',
  'examples/web/tsconfig.tsbuildinfo',
  'examples/expo/dist',
  'test-results',
  'playwright-report',
];

/** Remove only known generated outputs after checking all paths, without following links. */
export function cleanBuildOutputs(workspace) {
  const root = realpathSync(resolve(workspace));
  // Preflight every path before deleting anything. Reject symlink/junction ancestors and targets.
  for (const relativePath of generatedPaths) {
    let path = root;
    for (const part of relativePath.split('/')) {
      path = join(path, part);
      let entry;
      try {
        entry = lstatSync(path);
      } catch (error) {
        if (error.code === 'ENOENT') break;
        throw error;
      }
      if (entry.isSymbolicLink()) throw new Error('CLEAN_LINK_PATH_REJECTED');
    }
  }
  for (const relativePath of generatedPaths)
    rmSync(resolve(root, relativePath), { recursive: true, force: true });
}
