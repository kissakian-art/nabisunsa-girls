/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0F2042', // Academic Navy Blue
    textSecondary: '#5A6578', // Slate Grey
    background: '#FDFCF7', // Oxford Ivory White
    backgroundElement: '#FFFFFF', // Crisp pure white cards
    backgroundSelected: '#F2EDDC', // Soft champagne highlight
    primary: '#0F2042',
    gold: '#D4AF37', // Crested Royal Gold
    champagne: '#F5EECC',
    success: '#2E7D32',
    error: '#C62828',
    warning: '#EF6C00',
  },
  dark: {
    text: '#FDFCF7', // Off-White Ivory
    textSecondary: '#A3AFBF', // Soft slate
    background: '#070E1A', // Prestige Midnight Navy
    backgroundElement: '#0E1B30', // Deep luxury navy cards
    backgroundSelected: '#1C2E4C', // Active item
    primary: '#E5C158', // Brushed Gold
    gold: '#E5C158',
    champagne: '#202F48',
    success: '#4CAF50',
    error: '#EF5350',
    warning: '#FF9800',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
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

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
