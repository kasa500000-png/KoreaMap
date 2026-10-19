import {
  createKoreanSearchProvider,
  normalizeSearchText,
  validatePublicPlace,
  KitError,
  type PublicPlace,
  type Scheduler,
  type SearchPort,
  type SearchHit,
} from '@korea-map-kit/core';
/** Authored test facilities at approximate city locations, not real public POIs or official addresses. */
export function createKoreanSearchFixturePlaces(): readonly PublicPlace[] {
  const rows = [
    ['서울 합성공원', '서울 가상로 101', 'park', 127, 37.5],
    ['서울 합성주차장', '서울 가상로 102', 'parking', 127.001, 37.5],
    ['울산 합성산책공원', '울산 가상로 201', 'park', 129.3, 35.5],
    ['울산 합성관광안내소', '울산 가상로 202', 'tourism', 129.301, 35.5],
    ['제주 합성공원', '제주 가상길 301', 'park', 126.5, 33.5],
    ['제주 합성관광안내소', '제주 가상길 302', 'tourism', 126.501, 33.5],
    ['제주 합성위치없음', '제주 가상길 999', 'other', null, null],
  ] as const;
  return rows.map(([name, address, category, x, y], i) =>
    validatePublicPlace({
      id: `search-fixture-${i}`,
      name,
      address,
      category,
      location: x === null ? null : [x, y],
      source: 'synthetic-search-v1',
      source_id: String(i),
      license: 'MIT',
      attribution: 'Korea Map Kit 자체 합성 검색 자료 · MIT',
      updated_at: '2026-10-19T00:00:00.000Z',
      metadata: { synthetic: true },
    }),
  );
}
/** Approximate fixture similarity; real indexed search uses PostgreSQL pg_trgm. */
export function fixtureTrigramSimilarity(a: string, b: string): number {
  function grams(text: string) {
    const set = new Set<string>();
    for (const word of text.match(/[\p{L}\p{N}]+/gu) ?? []) {
      const chars = [...('  ' + word + ' ')];
      for (let i = 0; i < chars.length - 2; i++) set.add(chars.slice(i, i + 3).join(''));
    }
    return set;
  }
  const left = grams(a),
    right = grams(b);
  let same = 0;
  for (const g of left) if (right.has(g)) same++;
  return same / (left.size + right.size - same) || 0;
}
export function createFixtureKoreanSearchProvider(scheduler: Scheduler) {
  const places = createKoreanSearchFixturePlaces();
  const port: SearchPort = {
    async request(request, context) {
      if (context.signal.aborted) throw new KitError('ABORTED', 'OPERATION_ABORTED');
      const q = request.query;
      const distance = (p: PublicPlace) => {
        if (!q.center || !p.location) return null;
        const r = Math.PI / 180;
        const a =
          Math.sin(((p.location[1] - q.center[1]) * r) / 2) ** 2 +
          Math.cos(q.center[1] * r) *
            Math.cos(p.location[1] * r) *
            Math.sin(((p.location[0] - q.center[0]) * r) / 2) ** 2;
        return 6371008.8 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
      };
      const hits: SearchHit[] = [];
      for (const p of places) {
        if (q.category && q.category !== p.category) continue;
        const d = distance(p);
        if (q.radiusMeters !== undefined && (d === null || d > q.radiusMeters)) continue;
        if (request.kind === 'reverse') {
          if (d !== null) hits.push({ place: p, distanceMeters: d, relevance: 1 });
          continue;
        }
        const b = request.query.bounds;
        if (
          b &&
          (!p.location ||
            p.location[1] < b.south ||
            p.location[1] > b.north ||
            (b.west <= b.east
              ? p.location[0] < b.west || p.location[0] > b.east
              : p.location[0] < b.west && p.location[0] > b.east))
        )
          continue;
        const text = request.query.text,
          name = normalizeSearchText(p.name),
          address = normalizeSearchText(p.address ?? '');
        const similarity = Math.max(
          fixtureTrigramSimilarity(text, name),
          fixtureTrigramSimilarity(text, address),
        );
        const matches =
          request.kind === 'autocomplete'
            ? name.startsWith(text)
            : name.includes(text) ||
              address.includes(text) ||
              (text.length >= 3 && similarity >= 0.25);
        if (matches)
          hits.push({
            place: p,
            distanceMeters: d,
            relevance:
              name === text
                ? 3
                : (name.startsWith(text)
                    ? 2
                    : name.includes(text) || address.includes(text)
                      ? 1
                      : 0) + similarity,
          });
      }
      if (request.kind === 'reverse') {
        hits.sort(
          (a, b) =>
            (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity) ||
            a.place.id.localeCompare(b.place.id),
        );
        const hit = hits[0];
        return hit
          ? { kind: 'nearby-poi', place: hit.place, distanceMeters: hit.distanceMeters }
          : null;
      }
      hits.sort(
        (a, b) =>
          (request.query.sort === 'distance'
            ? (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity)
            : 0) ||
          b.relevance - a.relevance ||
          a.place.id.localeCompare(b.place.id),
      );
      const offset = request.query.offset ?? 0,
        limit = request.query.limit,
        next = offset + limit;
      return {
        hits: hits.slice(offset, next),
        nextOffset:
          request.kind !== 'autocomplete' && next <= 1000 && hits.length > next ? next : null,
      };
    },
  };
  return createKoreanSearchProvider(port, scheduler);
}
/** Inject only an operator-approved transport; no Nominatim or other endpoint/default account. */
export function createRemoteKoreanSearchProvider(
  request: SearchPort['request'],
  scheduler: Scheduler,
) {
  if (typeof request !== 'function')
    throw new KitError('INVALID_ARGUMENT', 'SEARCH_TRANSPORT_REQUIRED');
  return createKoreanSearchProvider({ request }, scheduler);
}
