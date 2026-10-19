import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  admitSource,
  digest,
  downloadCsv,
  prepareCsv,
  type CsvImportConfig,
} from '../../services/geo-data/src/ingestion.js';
import { openDatabase } from '../../services/geo-data/src/database.js';
const catalog: unknown = JSON.parse(readFileSync('data/sources.json', 'utf8'));
const now = new Date('2026-10-19T12:00:00Z');
// Authored strings exercise source mappings; these are not government dataset rows.
const header = '이름,주소,경도,위도';
const csv = `${header}\n"합성,주차장",합성주소,127,37.5\n`;
const bytes = (s: string) => new TextEncoder().encode(s);
const config = (s = csv): CsvImportConfig => ({
  sourceId: 'yongsan-parking',
  operatorOptIn: true,
  sha256: digest(s),
  snapshotUpdatedAt: '2026-10-18T00:00:00.000Z',
  encoding: 'utf-8',
  columns: { name: '이름', address: '주소', x: '경도', y: '위도' },
});
describe('rights-gated ingestion', () => {
  it('rejects B/C/D, missing opt-in, expired review, unsupported license/profile and unknown CRS before network', async () => {
    for (const id of ['parks-standard', 'tourapi-images', 'tourapi-nd-images', 'missing'])
      expect(() => admitSource(catalog, id, true, now)).toThrow();
    expect(() => admitSource(catalog, 'yongsan-parking', false, now)).toThrow();
    expect(() =>
      admitSource(catalog, 'yongsan-parking', 'false' as unknown as boolean, now),
    ).toThrow();
    expect(() => admitSource(catalog, 'yongsan-parking', true, new Date('2027-01-18'))).toThrow(
      'EXPIRED',
    );
    for (const id of ['tourapi-text', 'osm-geofabrik-kr', 'hanam-pet-bags'])
      expect(() => admitSource(catalog, id, true, now)).toThrow();
    const changed = structuredClone(catalog) as {
      sources: Array<{
        id: string;
        grade: string;
        rights: Record<string, string>;
        crs: { status: string; value: string | null };
      }>;
    };
    const record = changed.sources.find((s) => s.id === 'yongsan-parking')!;
    record.grade = 'B';
    expect(() => admitSource(changed, record.id, true, now)).toThrow();
    record.grade = 'A';
    record.rights['store'] = 'unknown';
    expect(() => admitSource(changed, record.id, true, now)).toThrow();
    record.rights['store'] = 'allowed';
    record.crs.status = 'unknown';
    expect(() => admitSource(changed, record.id, true, now)).toThrow();
    await expect(
      downloadCsv(
        catalog,
        { ...config(), sourceId: 'parks-standard' },
        'https://unapproved.invalid/file',
        now,
      ),
    ).rejects.toThrow();
  });
  it('parses quoted UTF-8/BOM, projects only approved columns, fingerprints stable IDs and freezes admitted rows', () => {
    const text = `\ufeff${csv}`;
    const result = prepareCsv(catalog, config(text), bytes(text), now);
    expect(result.rows[0]?.place.name).toBe('합성,주차장');
    expect(result.rows[0]?.place.location).toEqual([127, 37.5]);
    expect(result.rows[0]?.place.attribution).toContain('용산구');
    expect(result.rows[0]?.place.metadata['snapshot_sha256']).toBe(digest(text));
    expect(Object.isFrozen(result.rows[0]?.place)).toBe(true);
    const changed = csv.replace('127,37.5', '127.1,37.5');
    expect(prepareCsv(catalog, config(changed), bytes(changed), now).rows[0]?.place.id).toBe(
      result.rows[0]?.place.id,
    );
  });
  it('detects exact and conflicting IDs, missing fields, malformed CSV, wrong hashes and swapped coordinates', () => {
    const repeated = csv + csv.split('\n')[1] + '\n';
    expect(prepareCsv(catalog, config(repeated), bytes(repeated), now).duplicates).toBe(1);
    for (const text of [
      csv + '"합성,주차장",합성주소,128,37.5\n',
      csv.replace('127,37.5', '37.5,127'),
      csv.replace('127,37.5', '0,0'),
      csv.replace('127,37.5', '127,'),
      csv.replace('합성주소', ''),
      `${header}\n"unterminated`,
      '이름,이름\na,b\n',
    ])
      expect(() => prepareCsv(catalog, config(text), bytes(text), now)).toThrow();
    expect(() => prepareCsv(catalog, config(), bytes(csv + ' '), now)).toThrow('HASH');
    expect(() =>
      prepareCsv(
        catalog,
        { ...config(), snapshotUpdatedAt: '2026-02-30T00:00:00.000Z' },
        bytes(csv),
        now,
      ),
    ).toThrow();
  });
  it('preserves missing coordinates and business status without harvesting personal fields', () => {
    const walk = '이름,주소\n합성산책로,합성시작주소\n';
    const w = prepareCsv(
      catalog,
      { ...config(walk), sourceId: 'bukgu-walking', columns: { name: '이름', address: '주소' } },
      bytes(walk),
      now,
    );
    expect(w.rows[0]?.projected).toBeNull();
    expect(w.rows[0]?.place.location).toBeNull();
    const vet = 'id,이름,주소,x,y,상태,전화\nv1,합성병원,합성주소,200000,500000,폐업,수집제외\n';
    const v = prepareCsv(
      catalog,
      {
        ...config(vet),
        sourceId: 'mois-animal-hospitals',
        columns: { source_id: 'id', name: '이름', address: '주소', x: 'x', y: 'y', status: '상태' },
      },
      bytes(vet),
      now,
    );
    expect(v.rows[0]?.srid).toBe(5174);
    expect(v.rows[0]?.place.metadata['business_status']).toBe('폐업');
    expect(JSON.stringify(v)).not.toContain('수집제외');
    const empty = csv.replace('127,37.5', ',');
    expect(
      prepareCsv(catalog, config(empty), bytes(empty), now).rows[0]?.place.location,
    ).toBeNull();
  });
  it('downloads only an explicit approved host and matching bounded snapshot, with redirects disabled', async () => {
    const previousFetch = globalThis.fetch;
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(csv, { status: 200, headers: { 'content-type': 'text/csv' } }),
    );
    vi.stubGlobal('fetch', fetcher);
    try {
      await expect(
        downloadCsv(catalog, config(), 'https://unapproved.invalid/file', now),
      ).rejects.toThrow();
      expect(fetcher).not.toHaveBeenCalled();
      // Construct the official host from reviewed metadata; no embedded runtime service URL.
      const source = admitSource(catalog, 'yongsan-parking', true, now);
      expect(new Uint8Array(await downloadCsv(catalog, config(), source.sourceUrl, now))).toEqual(
        bytes(csv),
      );
      expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error', credentials: 'omit' });
      fetcher.mockImplementation(
        async () =>
          new Response('<html>error</html>', { headers: { 'content-type': 'text/html' } }),
      );
      await expect(downloadCsv(catalog, config(), source.sourceUrl, now)).rejects.toThrow();
      fetcher.mockImplementation(
        async () => new Response('different', { headers: { 'content-type': 'text/csv' } }),
      );
      await expect(downloadCsv(catalog, config(), source.sourceUrl, now)).rejects.toThrow('HASH');
    } finally {
      vi.stubGlobal('fetch', previousFetch);
    }
  });
  it('requires operator DB settings and disallows URL TLS overrides', () => {
    expect(() => openDatabase(undefined)).toThrow('CONFIGURATION_REQUIRED');
    expect(() => openDatabase('postgresql://localhost/kmk')).toThrow(
      'INVALID_DATABASE_CONFIGURATION',
    );
    expect(() => openDatabase('postgresql://operator.invalid/db?sslmode=disable')).toThrow();
  });
  it('decodes explicitly selected Korean legacy encoding and rejects malformed UTF-8', () => {
    const prefix = bytes('n,a,x,y\n');
    const suffix = bytes(',127,37.5\n');
    const legacy = new Uint8Array([...prefix, 0xb0, 0xa1, 44, 0xb0, 0xa1, ...suffix]);
    const mapped: CsvImportConfig = {
      ...config(),
      encoding: 'euc-kr',
      sha256: digest(legacy),
      columns: { name: 'n', address: 'a', x: 'x', y: 'y' },
    };
    expect(prepareCsv(catalog, mapped, legacy, now).rows[0]?.place.name).toBe('가');
    expect(() => prepareCsv(catalog, { ...mapped, encoding: 'utf-8' }, legacy, now)).toThrow(
      'INVALID_CSV',
    );
  });
});
