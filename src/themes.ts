import type { Preferences } from './types';
import { defaultPreferences } from './store';

export const academic: Preferences = {
  ...defaultPreferences,
  papersize: 'a4',
  margin: { x: '2.5cm', y: '2.5cm' },
  fonts: { main: 'Times New Roman', mono: 'Courier New' },
  toc: true,
  toc_title: 'Contents',
  number_sections: true,
};

export const minimal: Preferences = {
  ...defaultPreferences,
  papersize: 'a4',
  margin: { x: '2cm', y: '2cm' },
  fonts: { main: 'Arial', mono: 'Consolas' },
  toc: false,
  number_sections: false,
};

export const clean: Preferences = {
  ...defaultPreferences,
  papersize: 'a4',
  margin: { x: '1.5in', y: '1.5in' },
  fonts: { main: 'Segoe UI', mono: 'Consolas' },
  toc: true,
  toc_title: '',
};

export const serifReport: Preferences = {
  ...defaultPreferences,
  toc_title: '',
  fonts: { main: 'Georgia', mono: 'Courier New' },
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


export const themePresets: Record<string, { name: string; preferences: Preferences }> = {
  default: { name: 'Default', preferences: defaultPreferences },
  academic: { name: 'Academic', preferences: academic },
  minimal: { name: 'Minimal', preferences: minimal },
  clean: { name: 'Clean', preferences: clean },
  serif: { name: 'Serif Report', preferences: serifReport },
  compact: { name: 'Compact', preferences: compact },
};