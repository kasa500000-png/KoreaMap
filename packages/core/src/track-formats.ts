import { KitError } from './base.js';
import type { Coordinate, JsonObject } from './contracts.js';
import { validateTrack, type Track, type TrackPoint } from './tracks.js';

const MAX_TEXT = 2 * 1024 * 1024;
/** XML namespace identifier only. It is never fetched. */
const GPX_NAMESPACE = 'http://www.topografix.com/GPX/1/1';
function invalid(): never {
  throw new KitError('INVALID_ARGUMENT', 'INVALID_TRACK_FILE');
}
function textLimit(text: string) {
  if (typeof text !== 'string' || text.length > MAX_TEXT || text.length === 0) invalid();
}
function collectionLimit(tracks: readonly Track[]) {
  if (
    tracks.length > 50 ||
    new Set(tracks.map((t) => t.id)).size !== tracks.length ||
    tracks.reduce((sum, t) => sum + t.segments.reduce((n, s) => n + s.length, 0), 0) > 10000
  )
    invalid();
}
function inferredDuration(segments: readonly (readonly TrackPoint[])[]): number | null {
  if (segments.some((s) => s.some((p) => p.timestampMs === null))) return null;
  return segments.reduce(
    (sum, s) => sum + (s.length ? s[s.length - 1]!.timestampMs! - s[0]!.timestampMs! : 0),
    0,
  );
}
/** Text only; apps choose whether/where to persist. Exported files contain sensitive coordinates/times. */
export function exportTracksGeoJSON(values: readonly Track[]): string {
  const tracks = values.map(validateTrack);
  collectionLimit(tracks);
  const features = tracks.flatMap((track) =>
    track.segments.map((segment, index) => ({
      type: 'Feature',
      properties: {
        format: 'kmk-track-v1',
        trackId: track.id,
        segmentIndex: index,
        durationMs: track.durationMs,
        timestamps: segment.map((p) => p.timestampMs),
        accuracies: segment.map((p) => p.accuracyMeters),
      },
      geometry:
        segment.length === 1
          ? { type: 'Point', coordinates: segment[0]!.coordinate }
          : { type: 'LineString', coordinates: segment.map((p) => p.coordinate) },
    })),
  );
  // The manifest preserves empty tracks too; unrelated application metadata is never copied.
  const text = JSON.stringify({
    type: 'FeatureCollection',
    kmkTracks: tracks.map((t) => ({ id: t.id, durationMs: t.durationMs })),
    features,
  });
  textLimit(text);
  return text;
}
/** FeatureCollection Point/LineString/MultiLineString. Unknown properties are discarded. */
export function importTracksGeoJSON(text: string): readonly Track[] {
  textLimit(text);
  try {
    const root = JSON.parse(text) as { type?: unknown; kmkTracks?: unknown; features?: unknown };
    if (
      !root ||
      root.type !== 'FeatureCollection' ||
      !Array.isArray(root.features) ||
      root.features.length > 10000
    )
      invalid();
    const tracks = new Map<
      string,
      { id: string; segments: TrackPoint[][]; durationMs: number | null | undefined }
    >();
    if (root.kmkTracks !== undefined) {
      if (!Array.isArray(root.kmkTracks) || root.kmkTracks.length > 50) invalid();
      for (const item of root.kmkTracks) {
        const t = validateTrack({ ...item, version: 1, segments: [] });
        if (tracks.has(t.id)) invalid();
        tracks.set(t.id, { id: t.id, segments: [], durationMs: t.durationMs });
      }
    }
    let pointCount = 0;
    root.features.forEach(
      (
        f: {
          type?: unknown;
          properties?: JsonObject;
          geometry?: { type?: string; coordinates?: unknown };
        },
        i,
      ) => {
        if (!f || f.type !== 'Feature' || !f.geometry) invalid();
        const props = f.properties ?? {},
          owned = props.format === 'kmk-track-v1';
        const id = owned ? props.trackId : `import-${i}`;
        if (typeof id !== 'string') invalid();
        const existing = tracks.get(id);
        if (owned && root.kmkTracks !== undefined && !existing) invalid();
        const item = existing ?? {
          id,
          segments: [],
          durationMs: owned ? (props.durationMs as number | null) : undefined,
        };
        const coords = f.geometry.coordinates;
        const lines =
          f.geometry.type === 'Point'
            ? [[coords]]
            : f.geometry.type === 'LineString'
              ? [coords]
              : f.geometry.type === 'MultiLineString' && !owned
                ? coords
                : invalid();
        if (
          !Array.isArray(lines) ||
          !lines.length ||
          (owned && props.segmentIndex !== item.segments.length)
        )
          invalid();
        for (const line of lines) {
          if (!Array.isArray(line) || !line.length || (pointCount += line.length) > 10000)
            invalid();
          const times = owned ? props.timestamps : undefined,
            accuracies = owned ? props.accuracies : undefined;
          if (
            owned &&
            (!Array.isArray(times) ||
              !Array.isArray(accuracies) ||
              times.length !== line.length ||
              accuracies.length !== line.length ||
              props.durationMs !== item.durationMs)
          )
            invalid();
          item.segments.push(
            line.map((c: unknown, j: number) => ({
              coordinate: c as Coordinate,
              timestampMs: owned ? (times as (number | null)[])[j]! : null,
              accuracyMeters: owned ? (accuracies as (number | null)[])[j]! : null,
            })),
          );
        }
        tracks.set(id, item);
      },
    );
    const result = [...tracks.values()].map((t) =>
      validateTrack({
        version: 1,
        ...t,
        durationMs: t.durationMs === undefined ? inferredDuration(t.segments) : t.durationMs,
      }),
    );
    collectionLimit(result);
    return result;
  } catch {
    return invalid();
  }
}

interface XmlNode {
  name: string;
  namespace: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}
function decode(value: string): string {
  return value.replace(/&([^;]*);|&/gu, (_match, entity: string | undefined) => {
    const basic: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (entity && basic[entity]) return basic[entity];
    if (entity && /^#(?:x[0-9a-f]+|\d+)$/iu.test(entity)) {
      const code = entity[1] === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      if (
        code === 9 ||
        code === 10 ||
        code === 13 ||
        (code >= 32 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff))
      )
        return String.fromCodePoint(code);
    }
    return invalid();
  });
}
/** Bounded, non-resolving XML reader. DTD, CDATA and non-XML processing instructions are rejected. */
function parseXml(input: string): XmlNode {
  const text = input
    .replace(/^\uFEFF/u, '')
    .replace(/^\s*<\?xml\s+version=["']1\.0["'](?:\s+encoding=["']UTF-8["'])?\s*\?>/iu, '');
  if (
    /<!(?!--)|<\?/u.test(text) ||
    [...text].some((char) => char.charCodeAt(0) < 32 && ![9, 10, 13].includes(char.charCodeAt(0)))
  )
    invalid();
  const stack: { node: XmlNode; qualified: string; namespaces: Record<string, string> }[] = [];
  let root: XmlNode | undefined,
    position = 0,
    nodes = 0;
  const tokens = /<!--[\s\S]*?-->|<[^<>]*>|[^<]+/gu;
  for (const match of text.matchAll(tokens)) {
    if (match.index !== position) invalid();
    position += match[0].length;
    const token = match[0];
    if (token.startsWith('<!--')) {
      if (token.slice(4, -3).includes('--')) invalid();
      continue;
    }
    if (!token.startsWith('<')) {
      const current = stack[stack.length - 1];
      if (current) {
        current.node.text += decode(token);
        if (current.node.text.length > 4096) invalid();
      } else if (token.trim()) invalid();
      continue;
    }
    if (token.startsWith('</')) {
      const close = /^<\/([\w:.-]+)\s*>$/u.exec(token);
      if (!close || stack.pop()?.qualified !== close[1]) invalid();
      continue;
    }
    const open = /^<([A-Za-z_][\w:.-]*)([\s\S]*?)(\/?)>$/u.exec(token);
    if (!open || ++nodes > 40000 || stack.length >= 16) invalid();
    const qualified = open[1]!,
      attrs: Record<string, string> = Object.create(null) as Record<string, string>;
    let rest = open[2]!;
    while (rest.trim()) {
      const attribute = /^\s+([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/u.exec(rest);
      if (!attribute || Object.hasOwn(attrs, attribute[1]!)) invalid();
      attrs[attribute[1]!] = decode(attribute[2] ?? attribute[3]!);
      rest = rest.slice(attribute[0].length);
    }
    const parent = stack[stack.length - 1];
    const namespaces = { ...parent?.namespaces };
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'xmlns') namespaces[''] = value;
      else if (key.startsWith('xmlns:')) namespaces[key.slice(6)] = value;
    }
    const parts = qualified.split(':');
    if (parts.length > 2) invalid();
    const prefix = parts.length === 2 ? parts[0]! : '',
      name = parts[parts.length - 1]!;
    if (prefix && !Object.hasOwn(namespaces, prefix)) invalid();
    const node: XmlNode = {
      name,
      namespace: namespaces[prefix] ?? '',
      attrs,
      children: [],
      text: '',
    };
    if (parent) parent.node.children.push(node);
    else if (root) invalid();
    else root = node;
    if (!open[3]) stack.push({ node, qualified, namespaces });
  }
  if (position !== text.length || stack.length || !root) invalid();
  return root;
}
function children(node: XmlNode, name: string) {
  return node.children.filter((c) => c.namespace === GPX_NAMESPACE && c.name === name);
}
function parseTime(value: string): number {
  const m =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/u.exec(
      value,
    );
  if (!m) invalid();
  const [, year, month, day, hour, minute, second] = m;
  const check = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (
    !Number.isFinite(check.getTime()) ||
    check.toISOString().slice(0, 10) !== value.slice(0, 10) ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59
  )
    invalid();
  const result = Date.parse(value);
  if (!Number.isFinite(result) || result < 0) invalid();
  return result;
}
/** GPX 1.1 tracks only. Names/extensions/links/elevation are omitted; no XML resource is fetched. */
export function importTracksGPX(text: string): readonly Track[] {
  textLimit(text);
  try {
    const root = parseXml(text);
    if (root.name !== 'gpx' || root.namespace !== GPX_NAMESPACE || root.attrs.version !== '1.1')
      invalid();
    if (children(root, 'rte').length || children(root, 'wpt').length)
      throw new KitError('UNSUPPORTED', 'GPX_TRACKS_ONLY');
    let count = 0;
    const tracks = children(root, 'trk').map((track, index) => {
      const segments = children(track, 'trkseg')
        .map((segment) =>
          children(segment, 'trkpt').map((point): TrackPoint => {
            if (
              ++count > 10000 ||
              !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u.test(point.attrs.lat ?? '') ||
              !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u.test(point.attrs.lon ?? '')
            )
              invalid();
            const times = children(point, 'time');
            if (times.length > 1 || times[0]?.children.length) invalid();
            return {
              coordinate: [Number(point.attrs.lon), Number(point.attrs.lat)],
              timestampMs: times.length ? parseTime(times[0]!.text.trim()) : null,
              accuracyMeters: null,
            };
          }),
        )
        .filter((s) => s.length);
      return validateTrack({
        version: 1,
        id: `gpx-${index}`,
        segments,
        durationMs: inferredDuration(segments),
      });
    });
    collectionLimit(tracks);
    return tracks;
  } catch (error) {
    if (error instanceof KitError && error.code === 'UNSUPPORTED') throw error;
    return invalid();
  }
}
export function exportTracksGPX(values: readonly Track[]): string {
  const tracks = values.map(validateTrack);
  collectionLimit(tracks);
  const text = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Korea Map Kit" xmlns="${GPX_NAMESPACE}">${tracks.map((track) => `<trk>${track.segments.map((segment) => `<trkseg>${segment.map((point) => `<trkpt lat="${point.coordinate[1]}" lon="${point.coordinate[0]}">${point.timestampMs === null ? '' : `<time>${new Date(point.timestampMs).toISOString()}</time>`}</trkpt>`).join('')}</trkseg>`).join('')}</trk>`).join('')}</gpx>`;
  textLimit(text);
  return text;
}
