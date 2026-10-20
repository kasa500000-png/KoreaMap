import { assertLngLat, KitError } from './base.js';
import type { Coordinate, FeatureCollection, LocationFix } from './contracts.js';
import { validateLocationFix } from './location.js';

export interface TrackPoint {
  readonly coordinate: Coordinate;
  readonly timestampMs: number | null;
  /** Null means the imported format did not provide accuracy; never infer it from GPX HDOP. */
  readonly accuracyMeters: number | null;
}
export interface Track {
  readonly version: 1;
  readonly id: string;
  /** Separate segments never contribute a connecting distance. */
  readonly segments: readonly (readonly TrackPoint[])[];
  /** Active recording time, including stationary time and excluding explicit pauses. */
  readonly durationMs: number | null;
}
export interface TrackingClock {
  monotonicMs(): number;
  epochMs(): number;
}
export interface GpsFilterOptions {
  readonly maxAccuracyMeters?: number;
  readonly maxSpeedMetersPerSecond?: number;
  readonly minDistanceMeters?: number;
  readonly maxGapMs?: number;
  readonly maxAgeMs?: number;
  readonly maxPoints?: number;
}
export type FixRejection =
  | 'inactive'
  | 'invalid'
  | 'poor-accuracy'
  | 'stale'
  | 'future'
  | 'time-reversal'
  | 'duplicate'
  | 'jitter'
  | 'too-fast'
  | 'capacity';
export type FixDecision =
  { readonly accepted: true } | { readonly accepted: false; readonly reason: FixRejection };
export interface TrackSnapshot {
  readonly state: 'idle' | 'recording' | 'paused' | 'stopped';
  readonly track: Track;
  readonly distanceMeters: number;
  readonly pointCount: number;
  readonly rejectedCount: number;
  readonly accuracyMeters: number | null;
}
export interface TrackRecorder {
  start(): void;
  pause(): void;
  resume(): void;
  stop(): TrackSnapshot;
  ingest(fix: LocationFix): FixDecision;
  getSnapshot(): TrackSnapshot;
  /** Removes the recorder's copies. Apps must separately delete their persistence/export copies. */
  clear(): void;
}
const EARTH_RADIUS = 6371008.8;
/** Spherical great-circle surface distance in meters, not 3D/elevation distance. */
export function distanceMeters(a: Coordinate, b: Coordinate): number {
  assertLngLat(a);
  assertLngLat(b);
  const r = Math.PI / 180;
  const h =
    Math.sin(((b[1] - a[1]) * r) / 2) ** 2 +
    Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(((b[0] - a[0]) * r) / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function validateTrack(value: Track): Track {
  if (
    !value ||
    value.version !== 1 ||
    typeof value.id !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,64}$/u.test(value.id) ||
    !Array.isArray(value.segments) ||
    value.segments.length > 1000 ||
    (value.durationMs !== null &&
      (!Number.isFinite(value.durationMs) ||
        value.durationMs < 0 ||
        value.durationMs > 31536000000))
  )
    throw new KitError('INVALID_ARGUMENT', 'INVALID_TRACK');
  let count = 0,
    previousTime = -1;
  const segments = value.segments.map((segment) => {
    if (!Array.isArray(segment) || !segment.length || (count += segment.length) > 10000)
      throw new KitError('INVALID_ARGUMENT', 'TRACK_LIMIT');
    return segment.map((point: TrackPoint) => {
      if (!point) throw new KitError('INVALID_ARGUMENT', 'INVALID_TRACK_POINT');
      assertLngLat(point.coordinate);
      if (point.timestampMs !== null) {
        if (
          !Number.isFinite(point.timestampMs) ||
          point.timestampMs < 0 ||
          point.timestampMs > 253402300799999 ||
          point.timestampMs <= previousTime
        )
          throw new KitError('INVALID_ARGUMENT', 'INVALID_TRACK_TIME');
        previousTime = point.timestampMs;
      }
      if (
        point.accuracyMeters !== null &&
        (!Number.isFinite(point.accuracyMeters) ||
          point.accuracyMeters < 0 ||
          point.accuracyMeters > 100000)
      )
        throw new KitError('INVALID_ARGUMENT', 'INVALID_TRACK_ACCURACY');
      return {
        coordinate: [...point.coordinate] as Coordinate,
        timestampMs: point.timestampMs,
        accuracyMeters: point.accuracyMeters,
      };
    });
  });
  return { version: 1, id: value.id, segments, durationMs: value.durationMs };
}
export function trackDistanceMeters(value: Track): number {
  const track = validateTrack(value);
  let total = 0;
  for (const segment of track.segments)
    for (let i = 1; i < segment.length; i++)
      total += distanceMeters(segment[i - 1]!.coordinate, segment[i]!.coordinate);
  return total;
}
export function createTrackRecorder(
  id: string,
  clock: TrackingClock,
  options: GpsFilterOptions = {},
): TrackRecorder {
  validateTrack({ version: 1, id, segments: [], durationMs: 0 });
  const config = {
    maxAccuracyMeters: 50,
    maxSpeedMetersPerSecond: 15,
    minDistanceMeters: 3,
    maxGapMs: 30000,
    maxAgeMs: 30000,
    maxPoints: 10000,
    ...options,
  };
  for (const [key, value] of Object.entries(config))
    if (!Number.isFinite(value) || value < (key === 'minDistanceMeters' ? 0 : 1))
      throw new KitError('INVALID_ARGUMENT', 'INVALID_GPS_FILTER');
  if (
    !Number.isInteger(config.maxPoints) ||
    config.maxPoints > 10000 ||
    config.maxAccuracyMeters > 100000 ||
    config.maxSpeedMetersPerSecond > 1000 ||
    config.maxGapMs > 3600000 ||
    config.maxAgeMs > 3600000
  )
    throw new KitError('INVALID_ARGUMENT', 'INVALID_GPS_FILTER');
  let state: TrackSnapshot['state'] = 'idle',
    segments: TrackPoint[][] = [],
    total = 0,
    count = 0,
    rejected = 0;
  let lastFix: LocationFix | null = null,
    lastTimestamp = -1,
    accuracy: number | null = null;
  let accumulated = 0,
    started = 0,
    lastClock = 0;
  function now() {
    const value = clock.monotonicMs();
    if (!Number.isFinite(value) || value < 0)
      throw new KitError('INVALID_ARGUMENT', 'INVALID_CLOCK');
    lastClock = Math.max(lastClock, value);
    return lastClock;
  }
  function elapsed() {
    return accumulated + (state === 'recording' ? now() - started : 0);
  }
  function requireState(expected: TrackSnapshot['state']) {
    if (state !== expected) throw new KitError('INVALID_ARGUMENT', 'INVALID_TRACK_STATE');
  }
  function pause() {
    requireState('recording');
    accumulated = elapsed();
    state = 'paused';
    lastFix = null;
  }
  function reject(reason: FixRejection): FixDecision {
    if (reason !== 'inactive') rejected++;
    return { accepted: false, reason };
  }
  function snapshot(): TrackSnapshot {
    return {
      state,
      track: validateTrack({ version: 1, id, segments, durationMs: elapsed() }),
      distanceMeters: total,
      pointCount: count,
      rejectedCount: rejected,
      accuracyMeters: accuracy,
    };
  }
  return {
    start() {
      requireState('idle');
      started = now();
      state = 'recording';
    },
    pause,
    resume() {
      requireState('paused');
      started = now();
      state = 'recording';
    },
    stop() {
      if (state === 'recording') pause();
      if (state !== 'paused' && state !== 'stopped')
        throw new KitError('INVALID_ARGUMENT', 'INVALID_TRACK_STATE');
      state = 'stopped';
      return snapshot();
    },
    clear() {
      state = 'idle';
      segments = [];
      lastFix = null;
      lastTimestamp = -1;
      accuracy = null;
      total = count = rejected = accumulated = started = lastClock = 0;
    },
    getSnapshot: snapshot,
    ingest(value) {
      if (state !== 'recording') return reject('inactive');
      let fix: LocationFix;
      try {
        fix = validateLocationFix(value);
      } catch {
        return reject('invalid');
      }
      const epoch = clock.epochMs();
      if (!Number.isFinite(epoch) || epoch < 0) return reject('invalid');
      if (fix.timestampMs > epoch + 5000) return reject('future');
      if (epoch - fix.timestampMs > config.maxAgeMs) return reject('stale');
      if (fix.timestampMs <= lastTimestamp) return reject('time-reversal');
      lastTimestamp = fix.timestampMs;
      accuracy = fix.accuracyMeters;
      if (fix.accuracyMeters > config.maxAccuracyMeters) return reject('poor-accuracy');
      let distance = 0;
      const gap = lastFix ? fix.timestampMs - lastFix.timestampMs : Infinity;
      if (lastFix && gap <= config.maxGapMs) {
        distance = distanceMeters(lastFix.coordinate, fix.coordinate);
        if (distance === 0) {
          lastFix = fix;
          return reject('duplicate');
        }
        if (distance < config.minDistanceMeters) return reject('jitter');
        if (distance / (gap / 1000) > config.maxSpeedMetersPerSecond) return reject('too-fast');
      }
      if (
        count >= config.maxPoints ||
        ((!lastFix || gap > config.maxGapMs) && segments.length >= 1000)
      ) {
        pause();
        return reject('capacity');
      }
      if (!lastFix || gap > config.maxGapMs) {
        segments.push([]);
        distance = 0;
      }
      segments[segments.length - 1]!.push({
        coordinate: [...fix.coordinate],
        timestampMs: fix.timestampMs,
        accuracyMeters: fix.accuracyMeters,
      });
      count++;
      total += distance;
      lastFix = fix;
      return { accepted: true };
    },
  };
}
/** Render one or many tracks without connecting pause/gap boundaries. Single-point segments stay visible. */
export function tracksToFeatureCollection(values: readonly Track[]): FeatureCollection {
  if (values.length > 50) throw new KitError('INVALID_ARGUMENT', 'TRACK_LIMIT');
  const features: FeatureCollection['features'][number][] = [];
  let count = 0;
  for (const value of values) {
    const track = validateTrack(value);
    track.segments.forEach((segment, index) => {
      count += segment.length;
      if (count > 10000 || features.length >= 10000)
        throw new KitError('INVALID_ARGUMENT', 'TRACK_LIMIT');
      features.push({
        type: 'Feature',
        id: `${track.id}-${index}`,
        properties: { trackId: track.id, segment: index },
        geometry:
          segment.length === 1
            ? { type: 'Point', coordinates: [...segment[0]!.coordinate] }
            : {
                type: 'LineString',
                coordinates: segment.map((p) => [...p.coordinate] as [number, number]),
              },
      });
    });
  }
  return { type: 'FeatureCollection', features };
}
/** Approximate horizontal uncertainty, not a confidence guarantee or an altitude accuracy. */
export function locationAccuracyFeature(value: LocationFix): FeatureCollection {
  const fix = validateLocationFix(value),
    ring: [number, number][] = [],
    r = Math.PI / 180;
  const lat = fix.coordinate[1] * r,
    lon = fix.coordinate[0] * r,
    d = Math.max(0.01, fix.accuracyMeters) / EARTH_RADIUS;
  for (let i = 0; i < 32; i++) {
    const bearing = (i * 2 * Math.PI) / 32;
    const y = Math.asin(
      Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(bearing),
    );
    const x =
      lon +
      Math.atan2(
        Math.sin(bearing) * Math.sin(d) * Math.cos(lat),
        Math.cos(d) - Math.sin(lat) * Math.sin(y),
      );
    if (Math.abs(x / r) > 180 || Math.abs(y / r) > 85.051129)
      throw new KitError('UNSUPPORTED', 'ACCURACY_OUTSIDE_RENDER_BOUNDS');
    ring.push([x / r, y / r]);
  }
  ring.push([...ring[0]!]);
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { accuracyMeters: fix.accuracyMeters },
        geometry: { type: 'Polygon', coordinates: [ring] },
      },
    ],
  };
}
