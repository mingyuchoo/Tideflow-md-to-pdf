import type { Preferences } from './types';
import { defaultPreferences } from './store';

// Academic - Formal, structured, scholarly
export const academic: Preferences = {
  ...defaultPreferences,
  papersize: 'a4',
  margin: { x: '2.5cm', y: '2.5cm' },
  fonts: { main: 'Times New Roman', mono: 'Courier New' },
  toc: true,
  toc_title: 'Table of Contents',
  number_sections: true,
  default_image_width: '75%',
  default_image_alignment: 'center',
};

// Modern - Clean, contemporary, professional
export const modern: Preferences = {
  ...defaultPreferences,
  papersize: 'a4',
  margin: { x: '1.8cm', y: '2.2cm' },
  fonts: { main: 'Segoe UI', mono: 'Consolas' },
  toc: true,
  toc_title: 'Contents',
  number_sections: false,
  default_image_width: '85%',
  default_image_alignment: 'center',
};

// Classic - Traditional, elegant, timeless
export const classic: Preferences = {
  ...defaultPreferences,
  papersize: 'us-letter',
  margin: { x: '2.2cm', y: '2.8cm' },
  fonts: { main: 'Georgia', mono: 'Courier New' },
  toc: true,
  toc_title: 'Contents',
  number_sections: true,
  default_image_width: '70%',
  default_image_alignment: 'center',
};

// Minimal - Sparse, focused, distraction-free
export const minimal: Preferences = {
  ...defaultPreferences,
  papersize: 'a4',
  margin: { x: '1.5cm', y: '2cm' },
  fonts: { main: 'Arial', mono: 'Consolas' },
  toc: false,
  toc_title: '',
  number_sections: false,
  default_image_width: '90%',
  default_image_alignment: 'center',
};

// Technical - Code-heavy, monospace, developer-focused
export const technical: Preferences = {
  ...defaultPreferences,
  papersize: 'a4',
  margin: { x: '2cm', y: '2cm' },
  fonts: { main: 'Consolas', mono: 'Consolas' },
  toc: true,
  toc_title: 'Index',
  number_sections: true,
  default_image_width: '80%',
  default_image_alignment: 'left',
};

// Creative - Artistic, expressive, magazine-style
export const creative: Preferences = {
  ...defaultPreferences,
  papersize: 'a4',
  margin: { x: '1.2cm', y: '1.8cm' },
  fonts: { main: 'Comic Sans MS', mono: 'Consolas' },
  toc: false,
  toc_title: '',
  number_sections: false,
  default_image_width: '95%',
  default_image_alignment: 'center',
};

// Business - Professional, corporate, formal
export const business: Preferences = {
  ...defaultPreferences,
  papersize: 'us-letter',
  margin: { x: '2.5cm', y: '2.5cm' },
  fonts: { main: 'Calibri', mono: 'Courier New' },
  toc: true,
  toc_title: 'Table of Contents',
  number_sections: true,
  default_image_width: '70%',
  default_image_alignment: 'center',
};

// Journal - Magazine-style, spacious, editorial
export const journal: Preferences = {
  ...defaultPreferences,
  papersize: 'a4',
  margin: { x: '3cm', y: '3.5cm' },
  fonts: { main: 'Cambria', mono: 'Consolas' },
  toc: true,
  toc_title: 'Contents',
  number_sections: false,
  default_image_width: '85%',
  default_image_alignment: 'center',
};


export const themePresets: Record<string, { name: string; preferences: Preferences }> = {
  default: { name: 'Default', preferences: defaultPreferences },
  academic: { name: 'Academic', preferences: academic },
  modern: { name: 'Modern', preferences: modern },
  classic: { name: 'Classic', preferences: classic },
  minimal: { name: 'Minimal', preferences: minimal },
  technical: { name: 'Technical', preferences: technical },
  creative: { name: 'Creative', preferences: creative },
  business: { name: 'Business', preferences: business },
  journal: { name: 'Journal', preferences: journal },
};