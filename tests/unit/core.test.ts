import { describe, expect, it } from 'vitest';
import {
  assertLngLat,
  assertMercatorCoordinate,
  validateMapConfig,
  requireSearchProvider,
  KitError,
} from '@korea-map-kit/core';
describe('platform-free contracts', () => {
  it('accepts WGS84 longitude/latitude without changing input', () => {
    const value = Object.freeze([126.978, 37.5665]);
    assertLngLat(value);
    expect(value).toEqual([126.978, 37.5665]);
  });
  it.each(
    [[181, 0], [0, 91], [NaN, 1], [Infinity, 0], ['127', 37], [127], null].map((value) => ({
      value,
    })),
  )('rejects invalid coordinate $value', ({ value }) => {
    expect(() => assertLngLat(value)).toThrow(KitError);
  });
  it('separates geographic validity from Mercator display', () => {
    expect(() => assertLngLat([0, 89])).not.toThrow();
    expect(() => assertMercatorCoordinate([0, 89])).toThrow('OUTSIDE_MERCATOR');
  });
  it('fails closed on missing or unsupported provider', () => {
    expect(() => validateMapConfig(undefined)).toThrow('CONFIG_REQUIRED');
    expect(() => validateMapConfig({ mode: 'operator' })).toThrow('PROVIDER_MODE_NOT_IMPLEMENTED');
    expect(() => requireSearchProvider()).toThrow('SEARCH_PROVIDER_REQUIRED');
  });
  it('requires a known fixture and rejects extra configuration', () => {
    expect(() => validateMapConfig({ mode: 'local-fixture', fixtureId: 'unknown' })).toThrow(
      'INVALID_FIXTURE_CONFIG',
    );
    expect(() =>
      validateMapConfig({ mode: 'local-fixture', fixtureId: 'synthetic-v1', endpoint: 'unused' }),
    ).toThrow('INVALID_FIXTURE_CONFIG');
    expect(validateMapConfig({ mode: 'local-fixture', fixtureId: 'synthetic-v1' })).toEqual({
      mode: 'local-fixture',
      fixtureId: 'synthetic-v1',
    });
  });
});
