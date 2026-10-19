import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import ts from 'typescript';
const allowed = {
  core: [],
  styles: ['core'],
  'data-adapters': ['core'],
  web: ['core', 'styles'],
  native: ['core', 'styles'],
};
for (const [name, edges] of Object.entries(allowed)) {
  const dir = `packages/${name}`;
  const pkg = JSON.parse(readFileSync(`${dir}/package.json`, 'utf8'));
  const deps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.peerDependencies,
    ...pkg.optionalDependencies,
  };
  if (name === 'core') assert.deepEqual(Object.keys(deps), [], 'core has no dependencies');
  for (const dep of Object.keys(deps)) {
    if (dep.startsWith('@korea-map-kit/'))
      assert(
        edges.includes(dep.slice('@korea-map-kit/'.length)),
        `${name}: forbidden dependency ${dep}`,
      );
  }
  const config = JSON.parse(readFileSync(`${dir}/tsconfig.json`, 'utf8'));
  if (name === 'core')
    assert(
      !config.compilerOptions.lib && !config.compilerOptions.types,
      'core inherits platform-free ES libs',
    );
  for (const file of readdirSync(`${dir}/src`, { recursive: true }).filter((file) =>
    /\.tsx?$/.test(file),
  )) {
    const path = resolve(dir, 'src', file);
    const source = ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    function visit(node) {
      const spec =
        ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
          ? node.moduleSpecifier
          : ts.isCallExpression(node) &&
              (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
                node.expression.getText(source) === 'require')
            ? node.arguments[0]
            : undefined;
      if (spec && ts.isStringLiteral(spec)) {
        const value = spec.text;
        assert(
          !value.includes('services/') && !value.includes('examples/'),
          `${path}: backend/example import`,
        );
        if (value.startsWith('.'))
          assert(
            resolve(path, '..', value).startsWith(resolve(dir, 'src') + sep),
            `${path}: cross-package relative import`,
          );
        else {
          const dep = value.startsWith('@')
            ? value.split('/').slice(0, 2).join('/')
            : value.split('/')[0];
          assert(
            name !== 'core' && Object.hasOwn(deps, dep),
            `${path}: undeclared/platform dependency ${dep}`,
          );
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
for (const group of ['examples', 'services']) {
  for (const name of readdirSync(group))
    assert(
      JSON.parse(readFileSync(`${group}/${name}/package.json`, 'utf8')).private === true,
      `${group}/${name} must be private`,
    );
}
console.log('PASS: core is platform-free; package edges and private app/service boundaries');
