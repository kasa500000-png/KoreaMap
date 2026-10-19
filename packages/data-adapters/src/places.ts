import {
  KitError,
  validatePlacesQuery,
  validatePublicPlace,
  type PlacesProvider,
  type PlacesQuery,
  type OperationContext,
  type PublicPlace,
} from 'korea-map-core';

/** Inject an authenticated operator transport. The SDK supplies no endpoint, credential or fetch implementation. */
export function createRemotePlacesProvider(
  request: (query: PlacesQuery, context: OperationContext) => Promise<unknown>,
): PlacesProvider {
  if (typeof request !== 'function')
    throw new KitError('INVALID_ARGUMENT', 'POI_TRANSPORT_REQUIRED');
  return {
    async query(input, context) {
      const q = validatePlacesQuery(input);
      if (context.signal.aborted) throw new KitError('ABORTED', 'OPERATION_ABORTED');
      const result = await request(q, context);
      if (!Array.isArray(result) || result.length > (q.limit ?? 20))
        throw new KitError('UNAVAILABLE', 'INVALID_POI_RESPONSE');
      return Array.from(result, validatePublicPlace);
    },
  };
}

/** Explicit local-only example, authored MIT data. No public dataset is represented by these records. */
export function createFixturePlacesProvider(): PlacesProvider {
  const categories = [
    'park',
    'tourism',
    'parking',
    'toilet',
    'pet_facility',
    'trail',
    'other',
  ] as const;
  const rows: PublicPlace[] = categories.map((category, i) => ({
    id: `synthetic:${category}`,
    name: `합성 ${category}`,
    category,
    location: [127 + i * 0.001, 37.5],
    address: null,
    source: 'synthetic-fixture',
    source_id: category,
    license: 'MIT',
    attribution: 'Korea Map Kit — original synthetic test data',
    updated_at: '2026-10-19T00:00:00.000Z',
    metadata: { synthetic: true },
  }));
  return {
    async query(input, context) {
      const q = validatePlacesQuery(input);
      if (context.signal.aborted) throw new KitError('ABORTED', 'OPERATION_ABORTED');
      let result = rows.filter((p) => q.category === undefined || p.category === q.category);
      if (q.kind === 'bounds') {
        const b = q.bounds;
        result = result.filter(
          (p) =>
            p.location &&
            p.location[1] >= b.south &&
            p.location[1] <= b.north &&
            (b.west <= b.east
              ? p.location[0] >= b.west && p.location[0] <= b.east
              : p.location[0] >= b.west || p.location[0] <= b.east),
        );
      }
      if (q.kind === 'nearby') {
        const rad = Math.PI / 180;
        const distance = (p: PublicPlace) => {
          if (!p.location) return Infinity;
          const a =
            Math.sin(((p.location[1] - q.center[1]) * rad) / 2) ** 2 +
            Math.cos(q.center[1] * rad) *
              Math.cos(p.location[1] * rad) *
              Math.sin(((p.location[0] - q.center[0]) * rad) / 2) ** 2;
          return 6371008.8 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
        };
        result = result
          .filter((p) => distance(p) <= q.radiusMeters)
          .sort((a, b) => distance(a) - distance(b) || a.id.localeCompare(b.id));
      } else result.sort((a, b) => a.id.localeCompare(b.id));
      return result.slice(0, q.limit ?? 20).map(validatePublicPlace);
    },
  };
}
