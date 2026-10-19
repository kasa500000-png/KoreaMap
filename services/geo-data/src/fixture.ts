import { digest, registerImport, type PreparedImport } from './ingestion.js';

/** Entirely invented records. Never labelled as Korean government data. */
export function syntheticImport(revision: 1 | 2 = 1): PreparedImport {
  const categories = [
    'park',
    'tourism',
    'parking',
    'toilet',
    'pet_facility',
    'trail',
    'other',
  ] as const;
  const rows = categories.map((category, i) => ({
    place: {
      id: `synthetic:${category}`,
      name: `합성 ${category}${revision === 2 ? ' 갱신' : ''}`,
      category,
      location: null,
      address: '합성 주소',
      source: 'synthetic-fixture',
      source_id: category,
      license: 'MIT',
      attribution: 'Korea Map Kit — original synthetic test data',
      updated_at: `2026-10-${revision === 1 ? '18' : '19'}T00:00:00.000Z`,
      metadata: { synthetic: true },
    },
    projected: category === 'trail' ? null : ([127 + i * 0.001, 37.5] as const),
    srid: 4326,
  }));
  return registerImport({
    source: 'synthetic-fixture',
    sha256: digest(JSON.stringify(rows)),
    rows,
    duplicates: 0,
    synthetic: true,
  });
}
