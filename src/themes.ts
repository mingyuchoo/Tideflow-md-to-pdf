import type { Preferences } from './types';
import { defaultPreferences } from './store';

export interface ThemeDefinition {
  id: string;
  name: string;
  description: string;
  preferences: Preferences;
}

const mergePreferences = (overrides: Partial<Preferences>): Preferences => {
  return {
    ...defaultPreferences,
    ...overrides,
    margin: {
      ...defaultPreferences.margin,
      ...(overrides.margin ?? {}),
    },
    fonts: {
      ...defaultPreferences.fonts,
      ...(overrides.fonts ?? {}),
    },
  };
};

export const themePresets: Record<string, ThemeDefinition> = {
  default: {
    id: 'default',
    name: 'Default',
    description: 'Balanced typography with generous margins and serif body text.',
    preferences: mergePreferences({
      theme_id: 'default',
      fonts: { main: 'Times New Roman', mono: 'Courier New' },
      margin: { x: '2cm', y: '2.5cm' },
      toc: false,
      number_sections: true,
      default_image_width: '80%',
      default_image_alignment: 'center',
    }),
  },
  classic: {
    id: 'classic',
    name: 'Classic',
    description: 'Elegant serif headings with traditional book-inspired spacing.',
    preferences: mergePreferences({
      theme_id: 'classic',
      fonts: { main: 'Garamond', mono: 'Courier New' },
      margin: { x: '2.5cm', y: '3cm' },
      toc: true,
      toc_title: 'Contents',
      number_sections: true,
      default_image_width: '70%',
    }),
  },
  modern: {
    id: 'modern',
    name: 'Modern',
    description: 'Clean sans-serif typography with crisp headings and accents.',
    preferences: mergePreferences({
      theme_id: 'modern',
      fonts: { main: 'Segoe UI', mono: 'Consolas' },
      margin: { x: '1.8cm', y: '2.2cm' },
      toc: false,
      number_sections: false,
      default_image_width: '85%',
    }),
  },
  academic: {
    id: 'academic',
    name: 'Academic',
    description: 'Scholarly layout with structured headings and restrained palette.',
    preferences: mergePreferences({
      theme_id: 'academic',
      fonts: { main: 'Palatino Linotype', mono: 'Courier New' },
      margin: { x: '2.5cm', y: '2.5cm' },
      toc: true,
      toc_title: 'Table of Contents',
      number_sections: true,
      default_image_width: '75%',
    }),
  },
  journal: {
    id: 'journal',
    name: 'Journal',
    description: 'Editorial layout with expressive headings and expanded spacing.',
    preferences: mergePreferences({
      theme_id: 'journal',
      fonts: { main: 'Georgia', mono: 'Consolas' },
      margin: { x: '2.2cm', y: '2.8cm' },
      toc: false,
      number_sections: false,
      default_image_width: '85%',
    }),
  },
  colorful: {
    id: 'colorful',
    name: 'Colorful',
    description: 'Vibrant accent colors with geometric heading treatments.',
    preferences: mergePreferences({
      theme_id: 'colorful',
      fonts: { main: 'Candara', mono: 'Consolas' },
      margin: { x: '1.6cm', y: '2.1cm' },
      toc: false,
      number_sections: false,
      default_image_width: '90%',
    }),
  },
};

export const themeList = Object.values(themePresets);
