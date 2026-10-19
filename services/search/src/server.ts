import { createServer } from 'node:http';
import {
  createCancellationSource,
  KitError,
  type KoreanSearchProvider,
  type SearchRequest,
} from 'korea-map-core';
/** Loopback/proxy-only sample. Authentication and quotas belong to the operator's application gateway. */
export function createSearchServer(provider: KoreanSearchProvider) {
  let active = 0;
  const server = createServer(async (req, res) => {
    let sent = false;
    const reply = (status: number, data: unknown) => {
      if (sent || res.destroyed) return;
      sent = true;
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      res.end(JSON.stringify(data));
    };
    if (req.method !== 'POST' || req.url !== '/search') {
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
    const timer = setTimeout(() => {
      source.cancel();
      reply(504, { code: 'TIMEOUT' });
      req.destroy();
    }, 5000);
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
        size += bytes.length;
        if (size > 8192) {
          reply(413, { code: 'INVALID_ARGUMENT' });
          req.destroy();
          return;
        }
        chunks.push(bytes);
      }
      let request: SearchRequest;
      try {
        request = JSON.parse(Buffer.concat(chunks).toString('utf8')) as SearchRequest;
      } catch {
        reply(400, { code: 'INVALID_ARGUMENT' });
        return;
      }
      if (!request || !['search', 'autocomplete', 'reverse'].includes(request.kind)) {
        reply(400, { code: 'INVALID_ARGUMENT' });
        return;
      }
      const options = { signal: source.signal, timeoutMs: 2000 };
      const result =
        request.kind === 'reverse'
          ? await provider.reverseNearby(request.query, options)
          : request.kind === 'autocomplete'
            ? await provider.autocomplete(request.query, options)
            : await provider.searchPage(request.query, options);
      reply(200, result);
    } catch (error) {
      const code = error instanceof KitError ? error.code : 'UNAVAILABLE';
      reply(code === 'INVALID_ARGUMENT' ? 400 : code === 'TIMEOUT' ? 504 : 503, { code });
    } finally {
      clearTimeout(timer);
      res.off('close', abort);
      active--;
    }
  });
  server.headersTimeout = 5000;
  server.requestTimeout = 5000;
  server.keepAliveTimeout = 1000;
  server.maxConnections = 32;
  return server;
}
