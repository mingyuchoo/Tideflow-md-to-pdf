import type { Preferences } from './types';

// Base default preferences align with store defaultPreferences
export const defaultTheme: Preferences = {
  papersize: 'a4',
  margin: { x: '2cm', y: '2.5cm' },
  toc: true,
  toc_title: '',
  number_sections: true,
  default_image_width: '60%',
  default_image_alignment: 'center',
  fonts: { main: 'New Computer Modern', mono: 'Liberation Mono' },
  render_debounce_ms: 400,
  focused_preview_enabled: false,
  preserve_scroll_position: true,
};

export const serifReport: Preferences = {
  ...defaultTheme,
  toc_title: '',
  fonts: { main: 'Georgia', mono: 'Liberation Mono' },
  margin: { x: '2.5cm', y: '3cm' },
  default_image_width: '70%',
};

export const compact: Preferences = {
  ...defaultTheme,
  toc_title: '',
  margin: { x: '1.5cm', y: '1.8cm' },
  default_image_width: '55%',
  toc: false,
};

export const themePresets: Record<string, Preferences> = {
  default: defaultTheme,
  serif: serifReport,
  compact: compact,
};

export const isPresetTheme = (name: string) => name in themePresets;