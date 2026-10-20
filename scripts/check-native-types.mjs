import assert from 'node:assert/strict';
import ts from 'typescript';
const config = ts.readConfigFile('packages/native/tsconfig.json', ts.sys.readFile);
assert(!config.error, 'Native tsconfig must load');
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, 'packages/native');
assert.equal(parsed.errors.length, 0, 'Native tsconfig must parse');
const program = ts.createProgram({
  rootNames: parsed.fileNames,
  options: parsed.options,
  projectReferences: parsed.projectReferences,
});
const checker = program.getTypeChecker();
const source = program.getSourceFile(parsed.fileNames.find((name) => name.endsWith('/index.tsx')));
assert(source, 'Native MapView source must exist');
const required = new Set(['MapRef', 'CameraRef', 'LibreMapView', 'GeoJSONSource', 'Layer']);
function visit(node) {
  if (ts.isImportSpecifier(node) && required.has(node.name.text)) {
    const symbol = checker.getSymbolAtLocation(node.name);
    const type = node.name.text.endsWith('Ref')
      ? checker.getDeclaredTypeOfSymbol(checker.getAliasedSymbol(symbol))
      : checker.getTypeAtLocation(node.name);
    assert(
      !(type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)),
      `${node.name.text} silently resolved to any/unknown`,
    );
    if (node.name.text.endsWith('Ref')) {
      const method = checker.getPropertyOfType(
        type,
        node.name.text === 'CameraRef' ? 'setStop' : 'getBounds',
      );
      assert(method, 'Native bridge method must resolve');
      assert(
        !(checker.getTypeOfSymbolAtLocation(method, node.name).flags & ts.TypeFlags.Any),
        'Native method must not be any',
      );
    }
    required.delete(node.name.text);
  }
  ts.forEachChild(node, visit);
}
visit(source);
assert.equal(required.size, 0, 'All native bridge imports must be checked');
console.log('PASS: MapLibre Native component/ref/method types resolve without any/unknown');
