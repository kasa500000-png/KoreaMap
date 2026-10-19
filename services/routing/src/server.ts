import { createServer } from 'node:http';
import {
  createCancellationSource,
  KitError,
  type RoadRoutingProvider,
  type RoutingRequest,
} from 'korea-map-core';
/** Local application gateway. Keep behind operator authentication/quotas for remote deployment. */
export function createRoutingServer(provider: RoadRoutingProvider) {
  let active = 0;
  const server = createServer(async (req, res) => {
    let sent = false;
    const reply = (status: number, body: unknown) => {
      if (sent || res.destroyed) return;
      sent = true;
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'POST' || req.url !== '/route') {
      reply(404, { code: 'NOT_FOUND' });
      req.resume();
      return;
    }
    if (
      req.headers.origin ||
      !/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/u.test(req.headers.host ?? '') ||
      !/^application\/json(?:;|$)/iu.test(req.headers['content-type'] ?? '')
    ) {
      reply(403, { code: 'PERMISSION_DENIED' });
      req.resume();
      return;
    }
    if (active >= 4) {
      reply(503, { code: 'UNAVAILABLE' });
      req.resume();
      return;
    }
    active++;
    const cancellation = createCancellationSource();
    const onClose = () => cancellation.cancel();
    res.on('close', onClose);
    const timer = setTimeout(() => {
      cancellation.cancel();
      reply(504, { code: 'TIMEOUT' });
      req.destroy();
    }, 6000);
    try {
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
        size += bytes.length;
        if (size > 4096) {
          reply(413, { code: 'INVALID_ARGUMENT' });
          req.destroy();
          return;
        }
        chunks.push(bytes);
      }
      let input: RoutingRequest;
      try {
        input = JSON.parse(Buffer.concat(chunks).toString('utf8')) as RoutingRequest;
      } catch {
        reply(400, { code: 'INVALID_ARGUMENT' });
        return;
      }
      reply(200, await provider.route(input, { signal: cancellation.signal, timeoutMs: 5000 }));
    } catch (error) {
      const code = error instanceof KitError ? error.code : 'UNAVAILABLE';
      reply(
        code === 'INVALID_ARGUMENT'
          ? 400
          : code === 'NOT_FOUND'
            ? 404
            : code === 'TIMEOUT'
              ? 504
              : 503,
        { code },
      );
    } finally {
      clearTimeout(timer);
      res.off('close', onClose);
      active--;
    }
  });
  server.headersTimeout = 6000;
  server.requestTimeout = 6000;
  server.keepAliveTimeout = 1000;
  server.maxConnections = 16;
  return server;
}
