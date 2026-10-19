import { createServer, type Server } from 'node:http';
import {
  createCancellationSource,
  KitError,
  type PlacesProvider,
  type PlacesQuery,
} from '@korea-map-kit/core';

/** Local/proxy-only HTTP boundary. No public binding, CORS wildcard or logging of bodies/credentials. */
export function createPlacesServer(provider: PlacesProvider): Server {
  let active = 0;
  const server = createServer(async (req, res) => {
    const reply = (status: number, body: unknown) => {
      if (res.destroyed) return;
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'POST' || req.url !== '/places/query') {
      reply(404, { code: 'NOT_FOUND' });
      req.resume();
      return;
    }
    if (
      req.headers.origin ||
      !/^application\/json(?:;|$)/iu.test(req.headers['content-type'] ?? '')
    ) {
      reply(403, { code: 'PERMISSION_DENIED' });
      req.resume();
      return;
    }
    if (active >= 8) {
      reply(503, { code: 'UNAVAILABLE' });
      req.resume();
      return;
    }
    active++;
    const source = createCancellationSource();
    const abort = () => source.cancel();
    res.on('close', abort);
    const timeout = setTimeout(() => {
      source.cancel();
      reply(504, { code: 'TIMEOUT' });
      req.destroy();
    }, 10000);
    try {
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of req) {
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
        bytes += data.length;
        if (bytes > 8192) {
          reply(413, { code: 'INVALID_ARGUMENT' });
          req.destroy();
          return;
        }
        chunks.push(data);
      }
      let query: PlacesQuery;
      try {
        query = JSON.parse(Buffer.concat(chunks).toString('utf8')) as PlacesQuery;
      } catch {
        reply(400, { code: 'INVALID_ARGUMENT' });
        return;
      }
      reply(200, await provider.query(query, { signal: source.signal }));
    } catch (error) {
      const code = error instanceof KitError ? error.code : 'UNAVAILABLE';
      reply(code === 'INVALID_ARGUMENT' ? 400 : 503, { code });
    } finally {
      clearTimeout(timeout);
      res.off('close', abort);
      active--;
    }
  });
  server.headersTimeout = 5000;
  server.requestTimeout = 10000;
  server.keepAliveTimeout = 1000;
  server.maxConnections = 32;
  return server;
}
