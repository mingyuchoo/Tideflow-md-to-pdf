import { create } from 'zustand';
import { getSystemFonts } from '../api';

interface FontStoreState {
  fonts: string[];
  monoFonts: string[];
  isLoading: boolean;
  error: string | null;
  loadFonts: () => Promise<void>;
}

// Common monospace font keywords for filtering
const MONO_KEYWORDS = ['mono', 'console', 'courier', 'code', 'terminal', 'fixed', 'typewriter'];

// Fallback fonts if system font loading fails
const FALLBACK_FONTS = [
  'Arial', 'Calibri', 'Cambria', 'Candara', 'Comic Sans MS',
  'Constantia', 'Corbel', 'Georgia', 'Palatino Linotype',
  'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'
];

const FALLBACK_MONO_FONTS = ['Consolas', 'Courier New', 'Lucida Console'];

export const useFontStore = create<FontStoreState>((set, get) => ({
  fonts: [],
  monoFonts: [],
  isLoading: false,
  error: null,
  
  loadFonts: async () => {
    // Skip if already loaded
    if (get().fonts.length > 0) {
      return;
    }
    
    // Skip if already loading
    if (get().isLoading) {
      return;
    }
    
    set({ isLoading: true, error: null });
    
    try {
      const fonts = await getSystemFonts();
      
      // Filter monospace fonts
      const mono = fonts.filter(font => 
        MONO_KEYWORDS.some(keyword => font.toLowerCase().includes(keyword))
      );
      
      set({ 
        fonts, 
        monoFonts: mono.length > 0 ? mono : fonts,
        isLoading: false 
      });
    } catch (error) {
      console.error('Failed to load system fonts:', error);
      
      // Use fallback fonts on error
      set({ 
        fonts: FALLBACK_FONTS,
        monoFonts: FALLBACK_MONO_FONTS,
        error: String(error),
        isLoading: false 
      });
    }
  }
}));
