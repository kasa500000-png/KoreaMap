import { describe, it, expect, vi } from 'vitest';
import {
  createTrackRecorder,
  distanceMeters,
  trackDistanceMeters,
  tracksToFeatureCollection,
  locationAccuracyFeature,
  exportTracksGeoJSON,
  importTracksGeoJSON,
  exportTracksGPX,
  importTracksGPX,
  replayFrameAt,
  createTrackReplay,
  validateTrack,
  type Track,
  type LocationFix,
} from 'korea-map-core';
const epoch = 1700000000000;
const fix = (x: number, t: number, accuracyMeters = 5): LocationFix => ({
  coordinate: [x, 37.5],
  timestampMs: epoch + t,
  accuracyMeters,
});
const sample: Track = {
  version: 1,
  id: 'test',
  durationMs: 12000,
  segments: [
    [
      { coordinate: [127, 37.5], timestampMs: epoch, accuracyMeters: 5 },
      { coordinate: [127.001, 37.5], timestampMs: epoch + 10000, accuracyMeters: 8 },
    ],
    [
      { coordinate: [129.3, 35.5], timestampMs: epoch + 20000, accuracyMeters: 6 },
      { coordinate: [129.3001, 35.5], timestampMs: epoch + 22000, accuracyMeters: 7 },
    ],
  ],
};
describe('GPS track math, filtering and lifecycle', () => {
  it('great-circle meter units: known equator arc, antipodes, symmetry and dateline', () => {
    expect(distanceMeters([0, 0], [1, 0])).toBeCloseTo(111195.0802335329, 6);
    expect(distanceMeters([0, 0], [180, 0])).toBeCloseTo(Math.PI * 6371008.8, 5);
    expect(distanceMeters([179.9, 0], [-179.9, 0])).toBeCloseTo(22239.0160467, 4);
    expect(distanceMeters([127, 37.5], [127, 37.5])).toBe(0);
    expect(distanceMeters([127, 37.5], [129.3, 35.5])).toBe(
      distanceMeters([129.3, 35.5], [127, 37.5]),
    );
    expect(() => distanceMeters([37, 127], [0, 0])).toThrow('INVALID_COORDINATE');
  });
  it('records live distance/time, excludes pauses and never joins distant segments', () => {
    let time = 0;
    const recorder = createTrackRecorder('walk', {
      monotonicMs: () => time,
      epochMs: () => epoch + time,
    });
    recorder.start();
    expect(recorder.ingest(fix(127, 0)).accepted).toBe(true);
    time = 2000;
    recorder.ingest(fix(127.0001, time));
    time = 3000;
    recorder.pause();
    expect(recorder.ingest(fix(128, 3000))).toMatchObject({ reason: 'inactive' });
    time = 10000;
    recorder.resume();
    recorder.ingest(fix(129, time));
    time = 12000;
    recorder.ingest(fix(129.0001, time));
    const snapshot = recorder.stop();
    expect(snapshot.track.durationMs).toBe(5000);
    expect(snapshot.track.segments).toHaveLength(2);
    expect(snapshot.distanceMeters).toBeCloseTo(trackDistanceMeters(snapshot.track), 6);
    expect(snapshot.distanceMeters).toBeLessThan(20);
    const leaked = snapshot.track.segments as unknown as { coordinate: number[] }[][];
    leaked[0]![0]!.coordinate[0] = 0;
    expect(recorder.getSnapshot().track.segments[0]![0]!.coordinate[0]).toBe(127);
    recorder.clear();
    expect(recorder.getSnapshot()).toMatchObject({
      state: 'idle',
      pointCount: 0,
      rejectedCount: 0,
      track: { segments: [] },
    });
    expect(() => recorder.resume()).toThrow('INVALID_TRACK_STATE');
  });
  it('filters bad accuracy, stale/future times, reversal, duplicate, jitter and speed spikes', () => {
    let time = 0;
    const r = createTrackRecorder('filters', {
      monotonicMs: () => time,
      epochMs: () => epoch + time,
    });
    r.start();
    expect(r.ingest({ ...fix(127, 0), coordinate: [127, 100] })).toMatchObject({
      reason: 'invalid',
    });
    expect(r.ingest(fix(127, -40000))).toMatchObject({ reason: 'stale' });
    expect(r.ingest(fix(127, 6000))).toMatchObject({ reason: 'future' });
    expect(r.ingest(fix(127, 0)).accepted).toBe(true);
    expect(r.ingest(fix(127, 0))).toMatchObject({ reason: 'time-reversal' });
    time = 1000;
    expect(r.ingest(fix(127, time))).toMatchObject({ reason: 'duplicate' });
    time = 2000;
    expect(r.ingest(fix(127.000001, time))).toMatchObject({ reason: 'jitter' });
    time = 3000;
    expect(r.ingest(fix(129, time))).toMatchObject({ reason: 'too-fast' });
    time = 4000;
    expect(r.ingest(fix(127.0001, time, 100))).toMatchObject({ reason: 'poor-accuracy' });
    time = 5000;
    expect(r.ingest(fix(127.0001, time)).accepted).toBe(true);
    expect(r.getSnapshot().pointCount).toBe(2);
    time = 40000;
    expect(r.ingest(fix(129, time)).accepted).toBe(true);
    expect(r.getSnapshot().track.segments).toHaveLength(2);
    expect(r.getSnapshot().distanceMeters).toBeLessThan(10);
  });
  it('caps memory and clamps a reversed duration clock', () => {
    let time = 1000;
    const r = createTrackRecorder(
      'limited',
      { monotonicMs: () => time, epochMs: () => epoch + time },
      { maxPoints: 1 },
    );
    r.start();
    r.ingest(fix(127, time));
    time = 500;
    expect(r.getSnapshot().track.durationMs).toBe(0);
    time = 3000;
    expect(r.ingest(fix(127.0001, time))).toMatchObject({ reason: 'capacity' });
    expect(r.getSnapshot().state).toBe('paused');
    expect(() =>
      createTrackRecorder(
        'bad',
        { monotonicMs: () => 0, epochMs: () => 0 },
        { maxPoints: Infinity },
      ),
    ).toThrow();
  });
  it('renders multiple independent segments and a bounded accuracy polygon', () => {
    expect(tracksToFeatureCollection([sample, { ...sample, id: 'other' }]).features).toHaveLength(
      4,
    );
    const area = locationAccuracyFeature(fix(127, 0, 10));
    const geometry = area.features[0]!.geometry;
    expect(geometry.type).toBe('Polygon');
    if (geometry.type === 'Polygon')
      expect(distanceMeters([127, 37.5], geometry.coordinates[0]![0]!)).toBeCloseTo(10, 3);
    expect(() =>
      locationAccuracyFeature({ ...fix(179.99999, 0, 100), coordinate: [179.99999, 0] }),
    ).toThrow('ACCURACY_OUTSIDE_RENDER_BOUNDS');
  });
});
describe('private route exchange', () => {
  it('GeoJSON round-trips segments, times, accuracy, active time and empty tracks', () => {
    const empty: Track = { version: 1, id: 'empty', durationMs: 0, segments: [] };
    expect(importTracksGeoJSON(exportTracksGeoJSON([sample, empty]))).toEqual([sample, empty]);
    const generic = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { privateName: 'discard me' },
          geometry: {
            type: 'MultiLineString',
            coordinates: [
              [
                [127, 37],
                [127.1, 37],
              ],
              [
                [129, 35],
                [129.1, 35],
              ],
            ],
          },
        },
      ],
    });
    const result = importTracksGeoJSON(generic);
    expect(result[0]?.segments).toHaveLength(2);
    expect(result[0]?.durationMs).toBeNull();
    expect(JSON.stringify(result)).not.toContain('discard');
  });
  it('GPX1.1 round-trips position/time segments, discarding metadata and unknown accuracy', () => {
    const gpx = exportTracksGPX([sample]);
    const [track] = importTracksGPX(gpx);
    expect(track!.segments.map((s) => s.map((p) => p.coordinate))).toEqual(
      sample.segments.map((s) => s.map((p) => p.coordinate)),
    );
    expect(track!.segments[0]![0]!.accuracyMeters).toBeNull();
    expect(track!.segments[0]![0]!.timestampMs).toBe(epoch);
    expect(trackDistanceMeters(track!)).toBeCloseTo(trackDistanceMeters(sample), 6);
    const missing = gpx.replace(/<time>.*?<\/time>/gu, '');
    expect(importTracksGPX(missing)[0]?.durationMs).toBeNull();
    const prefixed = gpx
      .replace('xmlns=', 'xmlns:g=')
      .replace(/<(\/?)(gpx|trk|trkseg|trkpt|time)([\s>])/gu, '<$1g:$2$3');
    expect(importTracksGPX(prefixed)[0]?.segments).toHaveLength(2);
  });
  it('rejects DTD/entities, malformed namespaces/XML, invalid coordinates/time and excess payload', () => {
    const gpx = exportTracksGPX([sample]);
    for (const text of [
      '<!DOCTYPE gpx [<!ENTITY x SYSTEM "file:///private">]>' + gpx,
      gpx.replace('<trk>', '<trk>&unknown;'),
      gpx.replace('<trk>', '<trk bogus="x" bogus="y">'),
      gpx.replace('</trk>', '</different>'),
      gpx.replace('lat="37.5"', 'lat="100"'),
      gpx.replace('2023-11-14', '2023-02-30'),
      gpx.replace('GPX/1/1', 'wrong'),
      gpx.replace('2023-11-14T22:13:30.000Z', '2023-11-14T22:13:20.000Z'),
    ])
      expect(() => importTracksGPX(text)).toThrow();
    expect(() => importTracksGPX(' '.repeat(2097153))).toThrow();
    expect(() =>
      importTracksGeoJSON(
        '{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[0,100]}}]}',
      ),
    ).toThrow();
    expect(() => validateTrack({ ...sample, id: '../private' })).toThrow();
  });
});
describe('route replay', () => {
  it('interpolates within segments and jumps pauses without joining unrelated places', () => {
    expect(replayFrameAt(sample, 5000).coordinate?.[0]).toBeCloseTo(127.0005, 6);
    expect(replayFrameAt(sample, 10000).coordinate).toEqual([129.3, 35.5]);
    expect(replayFrameAt(sample, 12000).finished).toBe(true);
    const dateline: Track = {
      version: 1,
      id: 'dateline',
      durationMs: null,
      segments: [
        [
          { coordinate: [179, 0], timestampMs: null, accuracyMeters: null },
          { coordinate: [-179, 0], timestampMs: null, accuracyMeters: null },
        ],
      ],
    };
    expect(Math.abs(replayFrameAt(dateline, 500).coordinate![0])).toBe(180);
  });
  it('plays, pauses, seeks and disposes timers without GPS or network', async () => {
    vi.useFakeTimers();
    try {
      const frames = vi.fn();
      const replay = createTrackReplay(
        sample,
        { monotonicMs: () => Date.now() },
        {
          schedule(fn, ms) {
            const id = setTimeout(fn, ms);
            return () => clearTimeout(id);
          },
        },
        frames,
        { speed: 10 },
      );
      replay.play();
      await vi.advanceTimersByTimeAsync(500);
      replay.pause();
      expect(frames.mock.lastCall?.[0].elapsedMs).toBe(5000);
      expect(vi.getTimerCount()).toBe(0);
      replay.seek(10000);
      expect(frames.mock.lastCall?.[0].segmentIndex).toBe(1);
      replay.play();
      await vi.advanceTimersByTimeAsync(300);
      expect(frames.mock.lastCall?.[0].finished).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      replay.stop();
      expect(frames.mock.lastCall?.[0].elapsedMs).toBe(0);
      replay.destroy();
      expect(() => replay.play()).toThrow('REPLAY_DESTROYED');
    } finally {
      vi.useRealTimers();
    }
  });
});
