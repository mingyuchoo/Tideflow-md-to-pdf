import type { Preferences } from './types';
import { defaultPreferences } from './store';

export const serifReport: Preferences = {
  ...defaultPreferences,
  toc_title: '',
  fonts: { main: 'Georgia', mono: 'Liberation Mono' },
  margin: { x: '2.5cm', y: '3cm' },
  default_image_width: '70%',
};

export const compact: Preferences = {
  ...defaultPreferences,
  toc_title: '',
  margin: { x: '1.5cm', y: '1.8cm' },
  default_image_width: '55%',
  toc: false,
};

export const themePresets: Record<string, Preferences> = {
  default: defaultPreferences,
  serif: serifReport,
  compact: compact,
};