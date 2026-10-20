import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
const root = resolve('examples/web/out');
const flags = process.argv.slice(2);
const tileFlag = flags.find((value) => value.startsWith('--tile-origin='));
let tileOrigin = '';
if (tileFlag) {
  const value = tileFlag.slice('--tile-origin='.length);
  const url = new URL(value);
  if (
    url.origin !== value ||
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  )
    throw new Error('QA tile origin must be one exact loopback HTTP origin');
  tileOrigin = value;
}
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1:4173').pathname);
    let path = resolve(root, '.' + pathname);
    if (path !== root && !path.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'self'; connect-src 'self'${tileOrigin ? ` ${tileOrigin}` : ''}; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; img-src 'self' data: blob:; font-src 'self'; object-src 'none'; base-uri 'self'`,
    );
    res.setHeader('Content-Type', mime[extname(path)] ?? 'application/octet-stream');
    res.end(await readFile(path));
  } catch {
    res.writeHead(404).end('Not found');
  }
});
server.listen(4173, '127.0.0.1', () => console.log('Local fixture server ready'));
