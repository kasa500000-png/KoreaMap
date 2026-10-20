import { resolve, dirname } from 'node:path';
import {
  activeGeneration,
  activateGeneration,
  buildGeneration,
  downloadSource,
  downloadTool,
} from './pipeline.js';
import { invariant, readBoundedFile, regionName, sourceEligibility, tileSchema } from './config.js';
import { startTileServer } from './server.js';

const [command, ...args] = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const required = (name: string) => {
  const value = flag(name);
  invariant(value, `REQUIRED_${name.replaceAll('-', '_')}`);
  return value;
};
const root = process.cwd(),
  store = resolve(flag('--store') ?? 'artifacts/tiles');
const optIn = args.includes('--operator-opt-in');
const controller = new AbortController();
const cancel = () => controller.abort();
if (command !== 'serve') {
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
}
try {
  if (command === 'tool') {
    await downloadTool(
      resolve(flag('--jar') ?? `${store}/tools/planetiler-0.10.2.jar`),
      optIn,
      controller.signal,
    );
    console.log('VERIFIED_PLANETILER_TOOL');
  } else if (command === 'download') {
    const source = await downloadSource({
      root,
      store,
      expectedSha256: required('--sha256'),
      operatorOptIn: optIn,
      signal: controller.signal,
    });
    console.log(
      JSON.stringify({ sha256: source.sha256, dataAsOf: source.dataAsOf, verified: true }),
    );
  } else if (command === 'build') {
    const schema = tileSchema(flag('--schema'));
    const region = regionName(required('--region'));
    const java = flag('--java') ?? 'java';
    const javac =
      flag('--javac') ??
      (java === 'java'
        ? 'javac'
        : resolve(dirname(java), process.platform === 'win32' ? 'javac.exe' : 'javac'));
    const generation = await buildGeneration({
      root,
      store,
      region,
      schema,
      input: required('--input'),
      expectedSha256: required('--sha256'),
      operatorOptIn: optIn,
      jar: resolve(flag('--jar') ?? `${store}/tools/planetiler-0.10.2.jar`),
      java,
      javac,
      maxzoom: Number(
        flag('--maxzoom') ?? (region === 'context' ? 9 : schema === 'design-v2' ? 16 : 14),
      ),
      heapMiB: Number(flag('--heap-mib') ?? 4096),
      timeoutMs: Number(flag('--timeout-ms') ?? 300000),
      signal: controller.signal,
    });
    console.log(JSON.stringify(generation));
  } else if (command === 'activate' || command === 'rollback') {
    invariant(optIn, 'OPERATOR_OPT_IN_REQUIRED');
    sourceEligibility(root);
    const region = regionName(required('--region'));
    const generation =
      command === 'activate'
        ? required('--generation')
        : (
            JSON.parse(readBoundedFile(store, `${region}/active.json`, 4096).toString('utf8')) as {
              previous: string | null;
            }
          ).previous;
    invariant(generation, 'NO_PREVIOUS_GENERATION');
    await activateGeneration(store, region, generation);
    console.log('VERIFIED_GENERATION_ACTIVATED');
  } else if (command === 'serve') {
    const region = regionName(required('--region'));
    sourceEligibility(root);
    const glyphs = flag('--glyphs');
    invariant(glyphs || args.includes('--no-labels'), 'EXPLICIT_GLYPHS_OR_NO_LABELS_REQUIRED');
    const port = Number(flag('--port') ?? 8787);
    invariant(Number.isInteger(port) && port > 1024 && port <= 65535, 'INVALID_PORT');
    const cors = flag('--cors-origin');
    const quality = flag('--quality');
    invariant(
      quality === undefined || ['legacy', 'balanced', 'sparse', 'dense'].includes(quality),
      'INVALID_CARTOGRAPHY_QUALITY',
    );
    invariant(
      !flag('--context-generation') || args.includes('--context'),
      'EXPLICIT_CONTEXT_REQUIRED',
    );
    const service = await startTileServer({
      store,
      region,
      port,
      ...(glyphs ? { glyphs: resolve(glyphs) } : {}),
      ...(cors ? { allowedOrigins: [cors] } : {}),
      ...(quality ? { quality: quality as 'legacy' | 'balanced' | 'sparse' | 'dense' } : {}),
      ...(args.includes('--context')
        ? {
            context: {
              ...(flag('--context-generation')
                ? { generation: flag('--context-generation')! }
                : {}),
            },
          }
        : {}),
    });
    console.log(
      JSON.stringify({
        origin: service.origin,
        region,
        generation: activeGeneration(store, region),
      }),
    );
    let stopping = false;
    const stop = () => {
      if (!stopping) {
        stopping = true;
        void service.close();
      }
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } else throw new Error('USE_TILE_TOOL_DOWNLOAD_BUILD_ACTIVATE_ROLLBACK_SERVE');
} catch (error) {
  const code =
    error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : 'TILE_OPERATION_FAILED';
  console.error(code);
  process.exitCode = 1;
}
