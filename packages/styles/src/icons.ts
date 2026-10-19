import { KitError } from '@korea-map-kit/core';
export const poiKinds = ['park', 'parking', 'trail', 'facility'] as const;
export type PoiKind = (typeof poiKinds)[number];
export interface RgbaIcon {
  width: number;
  height: number;
  data: Uint8Array;
}
/** Original geometric marks, authored for Korea Map Kit under MIT. No font or external asset. */
export function createPoiIcon(kind: PoiKind, background: string, ink: string, size = 32): RgbaIcon {
  if (
    !poiKinds.includes(kind) ||
    !Number.isInteger(size) ||
    size < 16 ||
    size > 128 ||
    !/^#[\da-fA-F]{6}$/.test(background) ||
    !/^#[\da-fA-F]{6}$/.test(ink)
  )
    throw new KitError('INVALID_ARGUMENT', 'INVALID_ICON');
  const rgb = (hex: string) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
  const bg = rgb(background),
    fg = rgb(ink);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size,
        v = (y + 0.5) / size;
      if (Math.hypot(u - 0.5, v - 0.5) > 0.47) continue;
      let mark = false;
      if (kind === 'park')
        mark =
          (v >= 0.21 && v <= 0.63 && Math.abs(u - 0.5) < (v - 0.15) * 0.6) ||
          (u > 0.45 && u < 0.55 && v > 0.6 && v < 0.8);
      if (kind === 'parking')
        mark =
          (u > 0.32 && u < 0.43 && v > 0.23 && v < 0.78) ||
          (u > 0.4 && u < 0.67 && ((v > 0.23 && v < 0.34) || (v > 0.47 && v < 0.58))) ||
          (u > 0.59 && u < 0.7 && v > 0.3 && v < 0.51);
      if (kind === 'trail')
        mark = v > 0.23 && v < 0.78 && Math.abs(u - (0.5 + 0.15 * Math.sin(v * 12))) < 0.065;
      if (kind === 'facility')
        mark =
          (Math.abs(u - 0.5) < 0.065 && v > 0.24 && v < 0.76) ||
          (Math.abs(v - 0.5) < 0.065 && u > 0.24 && u < 0.76);
      const color = mark ? fg : bg;
      const index = (y * size + x) * 4;
      data.set([...color, 255], index);
    }
  return { width: size, height: size, data };
}
