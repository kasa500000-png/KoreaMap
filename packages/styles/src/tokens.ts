import { KitError } from '@korea-map-kit/core';
export const themeNames = ['standard', 'dark', 'pastel', 'outdoor'] as const;
export type ThemeName = (typeof themeNames)[number];
export interface DesignTokens {
  colors: {
    background: string;
    land: string;
    park: string;
    water: string;
    boundary: string;
    building: string;
    buildingOutline: string;
    roadMajor: string;
    roadMinor: string;
    roadCasing: string;
    trail: string;
    poi: string;
    poiInk: string;
    label: string;
    labelHalo: string;
  };
  widths: {
    major: [number, number, number];
    minor: [number, number, number];
    trail: [number, number, number];
    casing: number;
    buildingOutline: number;
    boundary: number;
  };
  typography: { size: [number, number, number]; halo: number };
  zoom: {
    minorRoad: number;
    building: number;
    poi: number;
    label: number;
    boundary: number;
    trail: number;
  };
}
export type ThemeOverrides = { [K in keyof DesignTokens]?: Partial<DesignTokens[K]> };
const palettes: Record<ThemeName, DesignTokens['colors']> = {
  standard: {
    background: '#f3f1eb',
    land: '#e9e8df',
    park: '#c9ddbd',
    water: '#a4cedb',
    boundary: '#8c8798',
    building: '#ded9cf',
    buildingOutline: '#b9b1a2',
    roadMajor: '#fffdf6',
    roadMinor: '#ffffff',
    roadCasing: '#c4b798',
    trail: '#8c6840',
    poi: '#276b70',
    poiInk: '#ffffff',
    label: '#27393d',
    labelHalo: '#fffdf7',
  },
  dark: {
    background: '#141e2a',
    land: '#1d2c37',
    park: '#24483e',
    water: '#173e59',
    boundary: '#7a819c',
    building: '#334451',
    buildingOutline: '#576776',
    roadMajor: '#927b58',
    roadMinor: '#5d6d7b',
    roadCasing: '#101820',
    trail: '#e0b37c',
    poi: '#8cdacb',
    poiInk: '#14242c',
    label: '#eef4f7',
    labelHalo: '#141e2a',
  },
  pastel: {
    background: '#faf3f1',
    land: '#f0e8eb',
    park: '#d5e4ce',
    water: '#bfdae9',
    boundary: '#ac96b3',
    building: '#e8dce8',
    buildingOutline: '#c8b4c7',
    roadMajor: '#fff4cf',
    roadMinor: '#fffdfc',
    roadCasing: '#d6bca9',
    trail: '#9a7054',
    poi: '#725487',
    poiInk: '#ffffff',
    label: '#4a3b51',
    labelHalo: '#fffaf7',
  },
  outdoor: {
    background: '#f2eedc',
    land: '#dfe4c8',
    park: '#b7d19e',
    water: '#91c8d0',
    boundary: '#8b8066',
    building: '#ded2bc',
    buildingOutline: '#a99b7e',
    roadMajor: '#fcf4d8',
    roadMinor: '#eee8ce',
    roadCasing: '#c2ac80',
    trail: '#a34d28',
    poi: '#315e34',
    poiInk: '#ffffff',
    label: '#253e29',
    labelHalo: '#fcf8e7',
  },
};
function luminance(color: string): number {
  const channels = [1, 3, 5]
    .map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
export function contrastRatio(first: string, second: string): number {
  const [a, b] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (a! + 0.05) / (b! + 0.05);
}
/** Fresh independent tokens. Color input intentionally accepts opaque six-digit hex only. */
export function resolveTheme(theme: ThemeName, overrides: ThemeOverrides = {}): DesignTokens {
  if (!themeNames.includes(theme)) throw new KitError('INVALID_ARGUMENT', 'UNKNOWN_THEME');
  const base: DesignTokens = {
    colors: { ...palettes[theme] },
    widths: {
      major: [1.4, 4.8, 14],
      minor: [0.6, 2.8, 9],
      trail: theme === 'outdoor' ? [1, 2.8, 6] : [0.5, 1.6, 3.5],
      casing: 1.2,
      buildingOutline: 0.8,
      boundary: 1.3,
    },
    typography: { size: [12, 15, 20], halo: 1.5 },
    zoom: {
      minorRoad: 11,
      building: 14,
      poi: 14,
      label: 11,
      boundary: 8,
      trail: theme === 'outdoor' ? 10 : 13,
    },
  };
  for (const group of Object.keys(overrides)) {
    if (!(group in base) || !Object.hasOwn(base, group))
      throw new KitError('INVALID_ARGUMENT', 'UNKNOWN_TOKEN');
    const key = group as keyof DesignTokens;
    const values = overrides[key];
    if (!values || typeof values !== 'object' || Array.isArray(values))
      throw new KitError('INVALID_ARGUMENT', 'INVALID_TOKEN');
    for (const token of Object.keys(values))
      if (!Object.hasOwn(base[key], token)) throw new KitError('INVALID_ARGUMENT', 'UNKNOWN_TOKEN');
    Object.assign(base[key], values);
  }
  for (const color of Object.values(base.colors))
    if (typeof color !== 'string' || !/^#[\da-fA-F]{6}$/.test(color))
      throw new KitError('INVALID_ARGUMENT', 'INVALID_COLOR');
  for (const [name, value] of Object.entries(base.widths)) {
    if (['major', 'minor', 'trail'].includes(name)) {
      if (
        !Array.isArray(value) ||
        value.length !== 3 ||
        value.some((v) => !Number.isFinite(v) || v <= 0 || v > 40) ||
        value[0]! > value[1]! ||
        value[1]! > value[2]!
      )
        throw new KitError('INVALID_ARGUMENT', 'INVALID_WIDTH_STOPS');
    } else if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 5)
      throw new KitError('INVALID_ARGUMENT', 'INVALID_WIDTH');
  }
  if (
    !Array.isArray(base.typography.size) ||
    base.typography.size.length !== 3 ||
    base.typography.size.some((v) => !Number.isFinite(v) || v < 10 || v > 32) ||
    base.typography.size[0] > base.typography.size[1] ||
    base.typography.size[1] > base.typography.size[2] ||
    !Number.isFinite(base.typography.halo) ||
    base.typography.halo < 1 ||
    base.typography.halo > 3
  )
    throw new KitError('INVALID_ARGUMENT', 'INVALID_TYPOGRAPHY');
  for (const value of Object.values(base.zoom))
    if (!Number.isFinite(value) || value < 0 || value > 22)
      throw new KitError('INVALID_ARGUMENT', 'INVALID_ZOOM_RULE');
  if (
    contrastRatio(base.colors.label, base.colors.labelHalo) < 4.5 ||
    contrastRatio(base.colors.poi, base.colors.poiInk) < 4.5
  )
    throw new KitError('INVALID_ARGUMENT', 'INSUFFICIENT_TEXT_CONTRAST');
  return JSON.parse(JSON.stringify(base)) as DesignTokens;
}
