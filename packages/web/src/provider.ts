import { parseCustomStyle } from 'korea-map-styles';
import type { StyleSpecification } from 'maplibre-gl';
import { KitError, validateMapConfig, type LocalMapConfig } from 'korea-map-core';
export type WebMapConfig =
  | LocalMapConfig
  | {
      readonly mode: 'inline';
      readonly style: StyleSpecification;
      readonly allowedOrigins: readonly string[];
      readonly attribution: string;
      readonly costAcknowledged: true;
    }
  | {
      readonly mode: 'operator';
      readonly styleUrl: string;
      readonly allowedOrigins: readonly string[];
      /** Plain text; the SDK escapes it before passing it to the renderer. */
      readonly attribution: string;
      readonly costAcknowledged: true;
    };
function allowedUrl(value: string, base: string): URL {
  const url = new URL(value, base);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))
  )
    throw new KitError('INVALID_ARGUMENT', 'UNSAFE_PROVIDER_URL');
  return url;
}
export function validateWebConfig(config: WebMapConfig, origin: string): WebMapConfig {
  if (!config || (config.mode !== 'operator' && config.mode !== 'inline'))
    return validateMapConfig(config);
  if (
    config.costAcknowledged !== true ||
    !config.attribution?.trim() ||
    !Array.isArray(config.allowedOrigins) ||
    (config.mode === 'operator' &&
      (!config.allowedOrigins.length || typeof config.styleUrl !== 'string' || !config.styleUrl))
  )
    throw new KitError('INVALID_ARGUMENT', 'PROVIDER_CONFIG_REQUIRED');
  const allowedOrigins = config.allowedOrigins.map((value) => {
    const url = allowedUrl(value, origin);
    if (value !== url.origin) throw new KitError('INVALID_ARGUMENT', 'EXACT_ORIGIN_REQUIRED');
    return url.origin;
  });
  if (config.mode === 'inline')
    return Object.freeze({
      mode: 'inline',
      style: parseCustomStyle(config.style),
      allowedOrigins: Object.freeze(allowedOrigins),
      attribution: config.attribution,
      costAcknowledged: true,
    });
  const styleUrl = allowedUrl(config.styleUrl, origin).href;
  if (!allowedOrigins.includes(new URL(styleUrl).origin))
    throw new KitError('INVALID_ARGUMENT', 'STYLE_ORIGIN_NOT_ALLOWED');
  return Object.freeze({
    mode: 'operator',
    styleUrl,
    allowedOrigins: Object.freeze(allowedOrigins),
    attribution: config.attribution,
    costAcknowledged: true,
  });
}
export function resourceUrl(config: WebMapConfig, url: string, origin: string): string {
  if (config.mode === 'local-fixture')
    throw new KitError('UNAVAILABLE', 'FIXTURE_RESOURCE_BLOCKED');
  const parsed = allowedUrl(url, origin);
  if (!config.allowedOrigins.includes(parsed.origin))
    throw new KitError('UNAVAILABLE', 'RESOURCE_ORIGIN_BLOCKED');
  return parsed.href;
}
export function escapeAttribution(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (value) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[value] ?? value,
  );
}
