import { KitError, type RoutingDataset, type Scheduler } from '@korea-map-kit/core';
import {
  createValhallaRoutingProvider,
  type ValhallaTransport,
} from '@korea-map-kit/data-adapters';
export const routingScheduler: Scheduler = {
  schedule(callback, ms) {
    const timer = setTimeout(callback, ms);
    return () => clearTimeout(timer);
  },
};
/** Explicit operator URL only. No discovery, redirects, credentials in URL, or response logging. */
export function createValhallaHttpTransport(endpoint: string): ValhallaTransport {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new KitError('INVALID_ARGUMENT', 'ROUTING_ENDPOINT_REQUIRED');
  }
  if (
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/route'
  )
    throw new KitError('INVALID_ARGUMENT', 'INVALID_ROUTING_ENDPOINT');
  return async (body, context) => {
    const abort = new AbortController();
    const off = context.signal.subscribe(() => abort.abort());
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: abort.signal,
        redirect: 'error',
      });
      if (!response.body) throw new Error();
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 8 * 1024 * 1024) throw new Error();
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      const raw: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!response.ok && response.status !== 400) throw new Error();
      return raw;
    } catch {
      if (context.signal.aborted) throw new KitError('ABORTED', 'OPERATION_ABORTED');
      throw new KitError('UNAVAILABLE', 'ROUTING_ENGINE_UNAVAILABLE');
    } finally {
      off();
      abort.abort();
    }
  };
}
export function createLocalRoutingProvider(endpoint: string, dataset: RoutingDataset) {
  return createValhallaRoutingProvider({
    request: createValhallaHttpTransport(endpoint),
    dataset,
    scheduler: routingScheduler,
  });
}
export { createRoutingServer } from './server.js';
