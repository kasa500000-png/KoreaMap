// Local production-bundle harness. It neither discovers a provider nor installs/downloads tools.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const maxFileBytes = 16 * 1024 ** 2;
const maxCacheBytes = 64 * 1024 ** 2;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const contained = (parent, child) => {
  const path = relative(parent, child);
  return path !== '' && !path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path);
};
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};
const immutableName = /^assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8,}\.(?:js|css)$/;

function acceptsGzip(header = '') {
  let wildcard = 0,
    gzip;
  for (const token of String(header).toLowerCase().split(',')) {
    const [name, ...parameters] = token.trim().split(';');
    let quality = 1;
    for (const parameter of parameters) {
      const match = /^\s*q\s*=\s*(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)\s*$/.exec(parameter);
      if (match) quality = Number(match[1]);
      else if (/^\s*q\s*=/.test(parameter)) quality = 0;
    }
    if (name === 'gzip') gzip = quality;
    if (name === '*') wildcard = quality;
  }
  return (gzip ?? wildcard) > 0;
}

function builtFiles(directory, path = '', output = []) {
  assert(output.length < 128, 'Production consumer file count exceeded');
  for (const entry of readdirSync(resolve(directory, path), { withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), 'Production output symlinks forbidden');
    const file = path ? `${path}/${entry.name}` : entry.name;
    assert(!file.includes('\\') && file.split('/').length <= 4, 'Invalid production output path');
    if (entry.isDirectory()) builtFiles(directory, file, output);
    else {
      assert(entry.isFile() && output.length < 128, 'Bounded regular production files required');
      const absolute = realpathSync(resolve(directory, file));
      assert(contained(directory, absolute), 'Production output escapes its generation');
      assert(statSync(absolute).size <= maxFileBytes, 'Production asset size exceeded');
      const bytes = readFileSync(absolute);
      const compressed = /\.(?:html|js|mjs|css|txt|svg)$/.test(file) ? gzipSync(bytes) : undefined;
      output.push({
        file,
        bytes,
        compressed,
        sha256: sha(bytes),
        cacheControl: immutableName.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
    }
  }
  return output;
}

/** Bind first so the operator can configure tile CORS, then build one production HTML per region. */
export async function startQualityConsumer({ root, directory, workerPath }) {
  for (const value of [root, directory, workerPath])
    assert(
      typeof value === 'string' && isAbsolute(value),
      'Absolute local consumer paths required',
    );
  root = realpathSync(root);
  directory = realpathSync(directory);
  const artifacts = realpathSync(resolve(root, 'artifacts'));
  assert(
    contained(root, artifacts) && contained(artifacts, directory),
    'Consumer directory must be inside ignored artifacts',
  );
  assert(statSync(directory).isDirectory(), 'Local consumer directory required');
  const worker = realpathSync(workerPath);
  assert(
    extname(worker) === '.mjs' &&
      statSync(worker).isFile() &&
      statSync(worker).size > 0 &&
      statSync(worker).size <= maxFileBytes,
    'Bounded explicit local worker required',
  );
  const workspace = mkdtempSync(resolve(directory, 'production-'));
  const publicDir = resolve(workspace, 'public');
  mkdirSync(publicDir);
  cpSync(worker, resolve(publicDir, 'worker.mjs'));
  const files = new Map();
  let origin,
    closed = false,
    running;
  const server = createServer((request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    const fail = (status) => {
      response.writeHead(status, { 'Cache-Control': 'no-store' });
      response.end();
    };
    if (request.headers.host !== new URL(origin).host) return fail(403);
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD');
      return fail(405);
    }
    const raw = request.url ?? '';
    if (
      !raw.startsWith('/') ||
      raw.startsWith('//') ||
      raw.length > 2048 ||
      /[?#\\]/.test(raw) ||
      raw.includes(String.fromCharCode(0))
    )
      return fail(400);
    let path;
    try {
      path = decodeURIComponent(raw);
    } catch {
      return fail(400);
    }
    if (
      /[?#\\]/.test(path) ||
      path.includes(String.fromCharCode(0)) ||
      path.split('/').some((part) => part === '..' || part === '.')
    )
      return fail(400);
    if (request.headers.range) return fail(416);
    const name = path === '/' ? 'index.html' : path.slice(1);
    const file = files.get(name);
    if (!file) return fail(404);
    const gzip = file.compressed && acceptsGzip(request.headers['accept-encoding']);
    const bytes = gzip ? file.compressed : file.bytes;
    const etag = `"${gzip ? file.gzipSha256 : file.sha256}"`;
    response.setHeader('Content-Type', mime[extname(name)] ?? 'application/octet-stream');
    response.setHeader('Cache-Control', file.cacheControl);
    response.setHeader('ETag', etag);
    response.setHeader('Vary', 'Accept-Encoding');
    if (gzip) response.setHeader('Content-Encoding', 'gzip');
    if (
      String(request.headers['if-none-match'] ?? '')
        .split(',')
        .map((value) => value.trim())
        .some((value) => value === etag || value === '*')
    ) {
      response.writeHead(304);
      response.end();
      return;
    }
    response.setHeader('Content-Length', bytes.length);
    response.writeHead(200);
    response.end(request.method === 'HEAD' ? undefined : bytes);
  });
  server.on('clientError', (_error, socket) => {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    assert(address && typeof address !== 'string', 'Loopback consumer did not bind');
    origin = `http://127.0.0.1:${address.port}`;
  } catch (error) {
    server.close();
    rmSync(workspace, { recursive: true, force: true });
    throw error;
  }
  return {
    origin,
    async build(html) {
      assert(!closed && !running, 'Consumer is closed or already building');
      assert(
        typeof html === 'string' &&
          Buffer.byteLength(html) > 0 &&
          Buffer.byteLength(html) <= 1024 ** 2,
        'Bounded consumer HTML required',
      );
      assert(
        !/<(?:script|link|img|iframe|source)\b[^>]*\b(?:src|href)\s*=\s*(?:['"]\s*)?(?:https?:)?\/\//i.test(
          html,
        ),
        'External consumer assets forbidden',
      );
      const outputDir = mkdtempSync(resolve(workspace, 'site-'));
      running = (async () => {
        writeFileSync(resolve(workspace, 'index.html'), html);
        const { build } = await import('vite');
        await build({
          configFile: false,
          mode: 'production',
          define: { 'process.env.NODE_ENV': '"production"' },
          root: workspace,
          envDir: false,
          envPrefix: [],
          publicDir,
          cacheDir: resolve(workspace, '.vite-cache'),
          logLevel: 'silent',
          plugins: [
            {
              name: 'quality-local-imports',
              enforce: 'pre',
              resolveId(id) {
                assert(!/^(?:https?:)?\/\//i.test(id), 'External production imports forbidden');
              },
            },
          ],
          css: { postcss: { plugins: [] } },
          build: {
            outDir: outputDir,
            emptyOutDir: true,
            sourcemap: false,
            target: 'es2022',
            rollupOptions: { input: resolve(workspace, 'index.html') },
          },
        });
        const built = builtFiles(outputDir);
        assert(
          built.some((file) => file.file === 'index.html') &&
            built.some((file) => file.file === 'worker.mjs'),
          'Complete production consumer required',
        );
        const next = new Map([...files].filter(([name]) => immutableName.test(name)));
        for (const file of built)
          next.set(file.file, {
            ...file,
            gzipSha256: file.compressed ? sha(file.compressed) : undefined,
          });
        const cacheBytes = [...next.values()].reduce(
          (sum, file) => sum + file.bytes.length + (file.compressed?.length ?? 0),
          0,
        );
        assert(cacheBytes <= maxCacheBytes, 'Bounded production consumer cache exceeded');
        files.clear();
        for (const [name, file] of next) files.set(name, file);
        return {
          mode: 'production',
          assets: built.map((file) => ({
            file: file.file,
            bytes: file.bytes.length,
            gzipBytes: file.compressed?.length ?? null,
            sha256: file.sha256,
            cacheControl: file.cacheControl,
          })),
          totalBytes: built.reduce((sum, file) => sum + file.bytes.length, 0),
        };
      })();
      try {
        return await running;
      } finally {
        running = undefined;
        rmSync(outputDir, { recursive: true, force: true });
      }
    },
    async close() {
      if (closed) return;
      closed = true;
      await new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      });
      try {
        await running;
      } catch {
        /* A failed build must still release local files. */
      }
      files.clear();
      rmSync(workspace, { recursive: true, force: true });
    },
  };
}
