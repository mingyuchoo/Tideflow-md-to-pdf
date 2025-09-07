import { create } from 'zustand';
import type { CompileStatus, EditorState, Preferences } from './types';

// Initial preferences
const defaultPreferences: Preferences = {
  papersize: 'a4',  // Changed from paper_size to papersize
  margin: {         // Changed from margins to margin
    x: '2cm',
    y: '2.5cm',
  },
  toc: true,
  number_sections: true,
  default_image_width: '60%',
  default_image_alignment: 'center',
  fonts: {
    main: 'New Computer Modern',
    mono: 'Liberation Mono',
  },
  // Preview optimization settings
  render_debounce_ms: 400,
  focused_preview_enabled: false,
  preserve_scroll_position: true,
};

// Initial editor state
const initialEditorState: EditorState = {
  currentFile: null,
  openFiles: [],
  content: '',
  modified: false,
  compileStatus: {
    status: 'idle',
  },
};

// Define store types
interface AppState {
  // Editor state
  editor: EditorState;
  setCurrentFile: (path: string | null) => void;
  setContent: (content: string) => void;
  setModified: (modified: boolean) => void;
  setCompileStatus: (status: CompileStatus) => void;
  // Scroll / cursor sync
  editorScrollRatio: number; // 0..1 proportion of scroll/cursor position inside document
  setEditorScrollRatio: (ratio: number) => void;
  
  // Tab management
  addOpenFile: (path: string) => void;
  removeOpenFile: (path: string) => void;
  closeAllFiles: () => void;
  
  // Preferences state
  preferences: Preferences;
  setPreferences: (preferences: Preferences) => void;
  
  // UI state
  prefsModalOpen: boolean;
  setPrefsModalOpen: (open: boolean) => void;
  
  previewVisible: boolean;
  setPreviewVisible: (visible: boolean) => void;
  // (Panel persistence removed)
  
  // Reset state
  resetState: () => void;
  // Sample doc injection guard
  initialSampleInjected: boolean;
  setInitialSampleInjected: (v: boolean) => void;
  // In-memory sample document content so we can return after switching files
  sampleDocContent: string | null;
  setSampleDocContent: (content: string) => void;
}

// Create store
export const useAppStore = create<AppState>((set) => ({
  // Editor state
  editor: initialEditorState,
  editorScrollRatio: 0,
  setEditorScrollRatio: (ratio: number) => set({ editorScrollRatio: Math.min(1, Math.max(0, ratio)) }),
  setCurrentFile: (path: string | null) => set((state: AppState) => {
    return {
      editor: {
        ...state.editor,
        currentFile: path,
        // Don't reset content here - it should be set separately with setContent
        modified: false,
      }
    };
  }),
  setContent: (content: string) => set((state: AppState) => {
    return {
      editor: {
        ...state.editor,
        content,
      }
    };
  }),
  setModified: (modified: boolean) => set((state: AppState) => ({
    editor: {
      ...state.editor,
      modified,
    }
  })),
  setCompileStatus: (compileStatus: CompileStatus) => set((state: AppState) => ({
    editor: {
      ...state.editor,
      compileStatus,
    }
  })),
  
  // Tab management
  addOpenFile: (path: string) => set((state: AppState) => {
    // If file is already open, don't add it again
    if (state.editor.openFiles.includes(path)) {
      return { editor: state.editor };
    }
    
    // Add file to open files list
    const newState = {
      editor: {
        ...state.editor,
        openFiles: [...state.editor.openFiles, path]
      }
    };
    return newState;
  }),
  
  removeOpenFile: (path: string) => set((state: AppState) => {
    // Remove file from open files
    const newOpenFiles = state.editor.openFiles.filter(f => f !== path);
    
    // If we're closing the current file, set currentFile to the last open file or null
    let newCurrentFile = state.editor.currentFile;
    let newContent = state.editor.content;
    let newModified = state.editor.modified;
    
    if (path === state.editor.currentFile) {
      newCurrentFile = newOpenFiles.length > 0 ? newOpenFiles[newOpenFiles.length - 1] : null;
      
      if (newCurrentFile === null) {
        // If no files left open, reset content and modified state
        newContent = '';
        newModified = false;
      }
    }
    
    return {
      editor: {
        ...state.editor,
        openFiles: newOpenFiles,
        currentFile: newCurrentFile,
        content: newContent,
        modified: newModified
      }
    };
  }),
  
  closeAllFiles: () => set((state: AppState) => {
    // Return user to sample.md (in-memory). Ensure it's the only open file.
    const sampleName = 'sample.md';
    return {
      editor: {
        ...state.editor,
        openFiles: [sampleName],
        currentFile: sampleName,
        content: state.sampleDocContent ?? '# Sample Document\n\nStart writing...\n',
        modified: false,
        compileStatus: { status: 'idle' } // Clear previous PDF so stale preview disappears
      }
    };
  }),
  
  // Preferences state
  preferences: defaultPreferences,
  setPreferences: (preferences: Preferences) => set({ preferences }),
  
  // UI state
  prefsModalOpen: false,
  setPrefsModalOpen: (open: boolean) => set({ prefsModalOpen: open }),
  
  previewVisible: true,
  setPreviewVisible: (visible: boolean) => set({ previewVisible: visible }),
  // removed panelRestoreTick & previewRerenderTick
  
  // Reset state
  resetState: () => set({
    editor: initialEditorState,
    preferences: defaultPreferences,
    prefsModalOpen: false,
    previewVisible: true,
    initialSampleInjected: false,
  sampleDocContent: null,
  setSampleDocContent: (content: string) => set({ sampleDocContent: content }),
  }),
  initialSampleInjected: false,
  setInitialSampleInjected: (v: boolean) => set({ initialSampleInjected: v }),
  sampleDocContent: null,
  setSampleDocContent: (content: string) => set({ sampleDocContent: content }),
}));
