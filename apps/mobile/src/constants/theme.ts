/**
 * Colours, type and spacing for ChoreShift.
 *
 * Light and dark are both defined explicitly so nothing has to be inferred at
 * runtime, and the semantic names (`accent`, `warning`, `danger`) are what
 * screens reference — never raw hex.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#101114',
    background: '#ffffff',
    backgroundElement: '#F4F5F7',
    backgroundSelected: '#E4E6EB',
    textSecondary: '#5C6270',
    border: '#E1E3E8',
    accent: '#3D63DD',
    accentSoft: '#E8EDFC',
    success: '#1F9254',
    successSoft: '#E4F4EB',
    warning: '#B26A00',
    warningSoft: '#FCF0DC',
    danger: '#C42B2B',
    dangerSoft: '#FBE7E7',
  },
  dark: {
    text: '#F2F3F5',
    background: '#0D0E11',
    backgroundElement: '#1B1D22',
    backgroundSelected: '#2A2D34',
    textSecondary: '#A2A8B4',
    border: '#2C2F36',
    accent: '#8AA5F5',
    accentSoft: '#1D2338',
    success: '#5FCF8E',
    successSoft: '#14261C',
    warning: '#E0A257',
    warningSoft: '#2A2013',
    danger: '#F08A8A',
    dangerSoft: '#2C1717',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** Per-member colours, used when a member has none of their own. */
export const MemberPalette = [
  '#3D63DD',
  '#E08C34',
  '#1F9254',
  '#9B51E0',
  '#D9455F',
  '#0E9BA6',
] as const;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  small: 6,
  medium: 10,
  large: 16,
  pill: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
