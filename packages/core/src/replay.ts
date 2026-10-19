import { KitError } from './base.js';
import type { Coordinate, Scheduler } from './contracts.js';
import { validateTrack, type Track, type TrackingClock } from './tracks.js';
export interface ReplayFrame {
  readonly coordinate: Coordinate | null;
  readonly elapsedMs: number;
  readonly durationMs: number;
  readonly segmentIndex: number;
  readonly finished: boolean;
}
export interface TrackReplay {
  play(): void;
  pause(): void;
  stop(): void;
  seek(elapsedMs: number): void;
  destroy(): void;
}
function timeline(value: Track) {
  const track = validateTrack(value),
    points: { coordinate: Coordinate; time: number; segment: number }[] = [];
  let elapsed = 0;
  track.segments.forEach((segment, i) =>
    segment.forEach((point, j) => {
      if (j) {
        const previous = segment[j - 1]!;
        elapsed +=
          point.timestampMs !== null && previous.timestampMs !== null
            ? point.timestampMs - previous.timestampMs
            : 1000;
      }
      points.push({ coordinate: point.coordinate, time: elapsed, segment: i });
    }),
  );
  if (elapsed > 31536000000) throw new KitError('INVALID_ARGUMENT', 'REPLAY_DURATION_LIMIT');
  return { points, duration: elapsed };
}
function frameAt(data: ReturnType<typeof timeline>, elapsed: number): ReplayFrame {
  if (!Number.isFinite(elapsed) || elapsed < 0)
    throw new KitError('INVALID_ARGUMENT', 'INVALID_REPLAY_TIME');
  const time = Math.min(data.duration, elapsed);
  let low = 0,
    high = data.points.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (data.points[mid]!.time <= time) low = mid + 1;
    else high = mid;
  }
  const a = data.points[Math.max(0, low - 1)],
    b = data.points[low];
  let coordinate: Coordinate | null = a ? [...a.coordinate] : null;
  if (a && b && a.segment === b.segment && b.time > a.time && time > a.time) {
    const ratio = (time - a.time) / (b.time - a.time);
    const delta = ((b.coordinate[0] - a.coordinate[0] + 540) % 360) - 180;
    coordinate = [
      ((a.coordinate[0] + delta * ratio + 540) % 360) - 180,
      a.coordinate[1] + (b.coordinate[1] - a.coordinate[1]) * ratio,
    ];
  }
  return {
    coordinate,
    elapsedMs: time,
    durationMs: data.duration,
    segmentIndex: a?.segment ?? -1,
    finished: time >= data.duration,
  };
}
/** Missing timestamps use 1 second per edge; pause/gap segments jump without interpolation. */
export function replayFrameAt(track: Track, elapsedMs: number): ReplayFrame {
  return frameAt(timeline(track), elapsedMs);
}
export function createTrackReplay(
  track: Track,
  clock: Pick<TrackingClock, 'monotonicMs'>,
  scheduler: Scheduler,
  onFrame: (frame: ReplayFrame) => void,
  options: { speed?: number; tickMs?: number } = {},
): TrackReplay {
  const data = timeline(track),
    speed = options.speed ?? 1,
    tickMs = options.tickMs ?? 50;
  if (
    !Number.isFinite(speed) ||
    speed < 0.1 ||
    speed > 100 ||
    !Number.isFinite(tickMs) ||
    tickMs < 16 ||
    tickMs > 1000
  )
    throw new KitError('INVALID_ARGUMENT', 'INVALID_REPLAY_OPTIONS');
  let playing = false,
    destroyed = false,
    position = 0,
    started = 0,
    clear = () => {};
  function now() {
    const n = clock.monotonicMs();
    if (!Number.isFinite(n) || n < 0) throw new KitError('INVALID_ARGUMENT', 'INVALID_CLOCK');
    return n;
  }
  function current() {
    return Math.min(data.duration, position + (playing ? Math.max(0, now() - started) * speed : 0));
  }
  function pause() {
    if (playing) position = current();
    playing = false;
    clear();
  }
  function emit() {
    const frame = frameAt(data, current());
    if (frame.finished) pause();
    try {
      onFrame(frame);
    } catch {
      pause();
    }
    if (playing) clear = scheduler.schedule(emit, tickMs);
  }
  function guard() {
    if (destroyed) throw new KitError('UNAVAILABLE', 'REPLAY_DESTROYED');
  }
  return {
    play() {
      guard();
      if (playing) return;
      if (position >= data.duration) position = 0;
      started = now();
      playing = true;
      emit();
    },
    pause() {
      guard();
      pause();
    },
    stop() {
      guard();
      pause();
      position = 0;
      emit();
    },
    seek(value) {
      guard();
      if (!Number.isFinite(value) || value < 0)
        throw new KitError('INVALID_ARGUMENT', 'INVALID_REPLAY_TIME');
      const active = playing;
      pause();
      position = Math.min(value, data.duration);
      started = now();
      playing = active;
      emit();
    },
    destroy() {
      if (destroyed) return;
      pause();
      destroyed = true;
    },
  };
}
