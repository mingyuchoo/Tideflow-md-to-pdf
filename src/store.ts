import { create } from 'zustand';
import type {
  CompileStatus,
  EditorState,
  Preferences,
  SourceMap,
  SyncMode,
} from './types';
import { SAMPLE_DOC } from './sampleDoc';

// Initial preferences
export const defaultPreferences: Preferences = {
  theme_id: 'default',
  papersize: 'a4',  // Changed from paper_size to papersize
  margin: {         // Changed from margins to margin
    x: '2cm',
    y: '2.5cm',
  },
  toc: false, // default changed to false (no table of contents unless user enables)
  toc_title: '',
  cover_page: false,
  cover_title: '',
  cover_writer: '',
  cover_image: '',
  number_sections: true,
  default_image_width: '80%',
  default_image_alignment: 'center',
  fonts: {
    main: 'Times New Roman',
    mono: 'Courier New',
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
  sourceMap: SourceMap | null;
  setSourceMap: (map: SourceMap | null) => void;
  activeAnchorId: string | null;
  setActiveAnchorId: (id: string | null) => void;
  syncMode: SyncMode;
  setSyncMode: (mode: SyncMode) => void;
  // Typing state (suppresses aggressive scroll sync while user is entering text)
  isTyping: boolean;
  setIsTyping: (v: boolean) => void;
  
  // Tab management
  addOpenFile: (path: string) => void;
  removeOpenFile: (path: string) => void;
  closeAllFiles: () => void;
  
  // Preferences state
  preferences: Preferences;
  setPreferences: (preferences: Preferences) => void;
  // Theme selection & design modal
  themeSelection: string; // 'default' | 'classic' | 'modern' | 'academic' | 'journal' | 'colorful' | 'custom'
  setThemeSelection: (theme: string) => void;
  designModalOpen: boolean;
  setDesignModalOpen: (open: boolean) => void;
  lastCustomPreferences: Preferences; // snapshot of preferences when user last entered custom path
  
  // UI state (design/preferences UI removed)
  
  previewVisible: boolean;
  setPreviewVisible: (visible: boolean) => void;
  // Timestamp when the last compiled event arrived; used to coordinate final-sync
  compiledAt: number;
  setCompiledAt: (ts: number) => void;
  // (Panel persistence removed)
  
  // Reset state
  resetState: () => void;
  // Sample doc injection guard
  initialSampleInjected: boolean;
  setInitialSampleInjected: (v: boolean) => void;
  // In-memory sample document content so we can return after switching files
  sampleDocContent: string | null;
  setSampleDocContent: (content: string) => void;
  clearCache: () => void;
  // Persisted editor scroll positions per-file (in-memory)
  editorScrollPositions: Record<string, number>;
  setEditorScrollPosition: (path: string, pos: number) => void;
  getEditorScrollPosition: (path: string) => number | null;
}

// Create store
export const useAppStore = create<AppState>((set, get) => ({
  // Editor state
  editor: initialEditorState,
  sourceMap: null,
  setSourceMap: (map: SourceMap | null) => set({ sourceMap: map }),
  activeAnchorId: null,
  setActiveAnchorId: (id: string | null) => set({ activeAnchorId: id }),
  syncMode: 'auto',
  setSyncMode: (mode: SyncMode) => set({ syncMode: mode }),
  isTyping: false,
  setIsTyping: (v: boolean) => set({ isTyping: v }),
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
        content: state.sampleDocContent ?? SAMPLE_DOC,
        modified: false,
        compileStatus: { status: 'idle' } // Clear previous PDF so stale preview disappears
      }
    };
  }),
  
  // Preferences state
  preferences: defaultPreferences,
  setPreferences: (preferences: Preferences) => set((state: AppState) => {
    const snapshot: Preferences = {
      ...preferences,
      margin: { ...preferences.margin },
      fonts: { ...preferences.fonts },
    };
    return {
      preferences,
      lastCustomPreferences: state.themeSelection === 'custom' ? snapshot : state.lastCustomPreferences,
    };
  }),
  themeSelection: 'default',
  setThemeSelection: (theme: string) => set({ themeSelection: theme }),
  designModalOpen: false,
  setDesignModalOpen: (open: boolean) => set({ designModalOpen: open }),
  lastCustomPreferences: {
    ...defaultPreferences,
    margin: { ...defaultPreferences.margin },
    fonts: { ...defaultPreferences.fonts },
  },
  
  // UI state
  
  previewVisible: true,
  setPreviewVisible: (visible: boolean) => set({ previewVisible: visible }),
  // editor scroll position persistence (in-memory map)
  editorScrollPositions: {},
  setEditorScrollPosition: (path: string, pos: number) => set((state: AppState) => ({
    editorScrollPositions: { ...state.editorScrollPositions, [path]: pos }
  })),
  getEditorScrollPosition: (path: string) => {
    // Use the `get` accessor provided by zustand to read current state.
    const s = get();
    return s.editorScrollPositions[path] ?? null;
  },
  // Provide cache clear early so type checker sees it (ordering not required but for clarity)
  clearCache: () => set(() => ({
    editor: {
      currentFile: 'sample.md',
      openFiles: ['sample.md'],
      content: SAMPLE_DOC,
      modified: false,
      compileStatus: { status: 'idle' }
    },
    sampleDocContent: SAMPLE_DOC,
    sourceMap: null,
    activeAnchorId: null,
    syncMode: 'auto',
    previewVisible: true,
  })),
  // removed panelRestoreTick & previewRerenderTick
  
  // Reset state
  resetState: () => set({
    editor: initialEditorState,
    preferences: defaultPreferences,
    previewVisible: true,
    initialSampleInjected: false,
    sampleDocContent: null,
  }),
  initialSampleInjected: false,
  setInitialSampleInjected: (v: boolean) => set({ initialSampleInjected: v }),
  sampleDocContent: null,
  setSampleDocContent: (content: string) => set({ sampleDocContent: content }),
  // Timestamp when the last compiled event arrived; used to coordinate final-sync
  compiledAt: 0,
  setCompiledAt: (ts: number) => set({ compiledAt: ts }),
}));
