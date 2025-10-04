/**
 * Hook to handle CodeMirror initialization, extensions, and keyboard shortcuts.
 * Manages the editor view lifecycle and event listeners.
 */

import { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { keymap } from '@codemirror/view';
import { search, searchKeymap, closeSearchPanel, openSearchPanel } from '@codemirror/search';
import { StateField, Annotation, Prec, Compartment } from '@codemirror/state';
import { TIMING } from '../constants/timing';
import { cmd } from '../components/commands';
import { scrubRawTypstAnchors } from '../utils/scrubAnchors';
import { getScrollElement, type ScrollElementWithHandler } from '../types/codemirror';
import type { EditorStateRefs } from './useEditorState';

// ============================================================================
// Custom Annotations for Transaction Tracking
// ============================================================================

/**
 * Annotation to mark programmatic (non-user) updates to the document.
 * Used to distinguish between user edits and system updates (e.g., file loading).
 */
const programmaticUpdateAnnotation = Annotation.define<boolean>();

/**
 * Annotation to mark user typing events.
 * Used to track when user is actively typing for debouncing and auto-render.
 */
const userTypingAnnotation = Annotation.define<boolean>();

// ============================================================================
// Custom State Field for Editor-Specific State
// ============================================================================

/**
 * State field to track custom editor state like typing status.
 * This replaces the ref-based state management with proper CodeMirror state.
 */
const editorCustomState = StateField.define<{
  isTyping: boolean;
  lastUserEdit: number;
}>({
  create: () => ({
    isTyping: false,
    lastUserEdit: 0,
  }),
  update: (value, tr) => {
    // Mark as typing when user edit annotation is present
    if (tr.annotation(userTypingAnnotation)) {
      return {
        isTyping: true,
        lastUserEdit: Date.now(),
      };
    }
    // Clear typing state on programmatic updates
    if (tr.annotation(programmaticUpdateAnnotation)) {
      return {
        ...value,
        isTyping: false,
      };
    }
    return value;
  },
});

// ============================================================================
// Configuration Compartments for Dynamic Reconfiguration
// ============================================================================

/**
 * Compartment for search configuration.
 * Allows dynamic reconfiguration of search panel settings without recreating editor.
 */
const searchConfigCompartment = new Compartment();

interface UseCodeMirrorSetupParams {
  editorStateRefs: EditorStateRefs;
  content: string;
  setContent: (content: string) => void;
  setModified: (modified: boolean) => void;
  setIsTyping: (typing: boolean) => void;
  handleSave: () => void;
  handleRender: () => void;
  handleAutoRender: (content: string, signal?: AbortSignal) => Promise<void>;
  renderDebounceMs: number;
  setupScrollListener: () => (() => void) | undefined;
  setEditorReady: (ready: boolean) => void;
}

export function useCodeMirrorSetup(params: UseCodeMirrorSetupParams) {
  const {
    editorStateRefs,
    content,
    setContent,
    setModified,
    setIsTyping,
    handleSave,
    handleRender,
    handleAutoRender,
    renderDebounceMs,
    setupScrollListener,
    setEditorReady,
  } = params;

  const {
    editorRef,
    editorViewRef,
    contentChangeTimeoutRef,
    contentChangeAbortRef,
    typingDetectionTimeoutRef,
    scrollElRef,
    isUserTypingRef,
  } = editorStateRefs;

  // Track if we've initialized the editor
  const initializedRef = useRef(false);

  // Initialize CodeMirror when the component mounts (ONCE - component never unmounts now)
  useEffect(() => {
    // Only initialize once - component is persistent now
    if (initializedRef.current) return;
    
    // Don't create editor if we don't have an editor container yet
    if (!editorRef.current) return;
    
    // Don't create editor if one already exists
    if (editorViewRef.current) return;
    
    // Create editor even without content - it will be updated by useFileOperations
    // This is because the component is now persistent and never unmounts
    if (process.env.NODE_ENV !== 'production') {
      console.log('[CodeMirror] Initializing editor, content length:', content.length);
    }
    
    initializedRef.current = true;
    
    const view = new EditorView({
      doc: content,
      extensions: [
        // ====================================================================
        // Core Extensions
        // ====================================================================
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        
        // Custom state field for editor-specific state
        editorCustomState,
        
        // Search configuration (wrapped in compartment for future reconfiguration)
        searchConfigCompartment.of(search({
          top: true,
          caseSensitive: false,
        })),
        
        // ====================================================================
        // Theme Configuration (Consolidated)
        // ====================================================================
        EditorView.baseTheme({
          // Content wrapping styles (light/dark same for now)
          '.cm-content': {
            'white-space': 'pre-wrap',
            'word-wrap': 'break-word',
            'overflow-wrap': 'break-word'
          },
          '.cm-line': {
            'white-space': 'pre-wrap',
            'word-wrap': 'break-word',
            'overflow-wrap': 'break-word'
          },
          
          // Search panel styles - light mode
          '&light .cm-panel.cm-search': {
            'background': '#ffffff',
            'border-bottom': '1px solid #cbd5e1',
            'padding': '8px 12px',
            'box-shadow': '0 2px 4px rgba(0, 0, 0, 0.05)',
            'color': '#1f2937'
          },
          '&light .cm-panel.cm-search label': {
            'color': '#374151',
            'font-size': '0.85rem'
          },
          '&light .cm-panel.cm-search input': {
            'background': '#ffffff',
            'border': '1px solid #cbd5e1',
            'border-radius': '4px',
            'padding': '6px 8px',
            'font-size': '0.85rem',
            'outline': 'none',
            'color': '#1f2937'
          },
          '&light .cm-panel.cm-search input::placeholder': {
            'color': '#9ca3af'
          },
          '&light .cm-panel.cm-search input:focus': {
            'border-color': '#64748b',
            'box-shadow': '0 0 0 2px rgba(100, 116, 139, 0.1)'
          },
          '&light .cm-panel.cm-search button': {
            'background': 'linear-gradient(to bottom, #f8fafc, #f1f5f9)',
            'border': '1px solid #cbd5e1',
            'border-radius': '4px',
            'padding': '4px 8px',
            'font-size': '0.75rem',
            'cursor': 'pointer',
            'transition': 'all 150ms ease',
            'color': '#475569',
            'font-weight': '500'
          },
          '&light .cm-panel.cm-search button:hover': {
            'background': 'linear-gradient(to bottom, #e2e8f0, #cbd5e1)',
            'border-color': '#94a3b8',
            'color': '#334155'
          },
          '&light .cm-panel.cm-search button[name="close"]': {
            'color': '#64748b'
          },
          '&light .cm-panel.cm-search button[name="close"]:hover': {
            'color': '#dc2626',
            'background': '#fee2e2',
            'border-color': '#fca5a5'
          },
          '&light .cm-search-label': {
            'color': '#6b7280',
            'font-size': '0.75rem'
          },
          
          // Search panel styles - dark mode (same values for now)
          '&dark .cm-panel.cm-search': {
            'background': '#ffffff',
            'border-bottom': '1px solid #cbd5e1',
            'padding': '8px 12px',
            'box-shadow': '0 2px 4px rgba(0, 0, 0, 0.05)',
            'color': '#1f2937'
          },
          '&dark .cm-panel.cm-search label': {
            'color': '#374151',
            'font-size': '0.85rem'
          },
          '&dark .cm-panel.cm-search input': {
            'background': '#ffffff',
            'border': '1px solid #cbd5e1',
            'border-radius': '4px',
            'padding': '6px 8px',
            'font-size': '0.85rem',
            'outline': 'none',
            'color': '#1f2937'
          },
          '&dark .cm-panel.cm-search input::placeholder': {
            'color': '#9ca3af'
          },
          '&dark .cm-panel.cm-search input:focus': {
            'border-color': '#64748b',
            'box-shadow': '0 0 0 2px rgba(100, 116, 139, 0.1)'
          },
          '&dark .cm-panel.cm-search button': {
            'background': 'linear-gradient(to bottom, #f8fafc, #f1f5f9)',
            'border': '1px solid #cbd5e1',
            'border-radius': '4px',
            'padding': '4px 8px',
            'font-size': '0.75rem',
            'cursor': 'pointer',
            'transition': 'all 150ms ease',
            'color': '#475569',
            'font-weight': '500'
          },
          '&dark .cm-panel.cm-search button:hover': {
            'background': 'linear-gradient(to bottom, #e2e8f0, #cbd5e1)',
            'border-color': '#94a3b8',
            'color': '#334155'
          },
          '&dark .cm-panel.cm-search button[name="close"]': {
            'color': '#64748b'
          },
          '&dark .cm-panel.cm-search button[name="close"]:hover': {
            'color': '#dc2626',
            'background': '#fee2e2',
            'border-color': '#fca5a5'
          },
          '&dark .cm-search-label': {
            'color': '#6b7280',
            'font-size': '0.75rem'
          }
        }),
        
        // ====================================================================
        // Keyboard Shortcuts (Organized by Priority)
        // ====================================================================
        
        // High priority: System commands that override defaults
        Prec.high(keymap.of([
          {
            key: "Ctrl-s",
            run: () => { handleSave(); return true; },
            preventDefault: true
          },
          {
            key: "Ctrl-r",
            run: () => { handleRender(); return true; },
            preventDefault: true
          },
          {
            key: "Ctrl-f",
            run: (view) => {
              // Toggle search panel: if close returns false, panel wasn't open, so open it
              const closed = closeSearchPanel(view);
              if (!closed) {
                return openSearchPanel(view);
              }
              return true;
            },
            preventDefault: true
          },
          {
            key: "Escape",
            run: (view) => {
              return closeSearchPanel(view);
            }
          }
        ])),
        
        // Normal priority: Text formatting shortcuts
        keymap.of([
          // Text formatting
          {
            key: "Ctrl-b",
            run: (view) => { cmd.bold(view); return true; },
            preventDefault: true
          },
          {
            key: "Ctrl-i", 
            run: (view) => { cmd.italic(view); return true; },
            preventDefault: true
          },
          {
            key: "Ctrl-`",
            run: (view) => { cmd.codeInline(view); return true; },
            preventDefault: true
          },
          {
            key: "Ctrl-k",
            run: (view) => { cmd.link(view); return true; },
            preventDefault: true
          },
          
          // Heading shortcuts
          {
            key: "Ctrl-Alt-1",
            run: (view) => { cmd.heading(view, 1); return true; },
            preventDefault: true
          },
          {
            key: "Ctrl-Alt-2",
            run: (view) => { cmd.heading(view, 2); return true; },
            preventDefault: true
          },
          {
            key: "Ctrl-Alt-3",
            run: (view) => { cmd.heading(view, 3); return true; },
            preventDefault: true
          },
          
          // List shortcuts
          {
            key: "Ctrl-Shift-8",
            run: (view) => { cmd.ul(view); return true; },
            preventDefault: true
          },
          {
            key: "Ctrl-Shift-7",
            run: (view) => { cmd.ol(view); return true; },
            preventDefault: true
          },
          {
            key: "Ctrl-Shift-9",
            run: (view) => { cmd.task(view); return true; },
            preventDefault: true
          },
          
          // Other formatting
          {
            key: "Ctrl-Shift-q",
            run: (view) => { cmd.quote(view); return true; },
            preventDefault: true
          },
          {
            key: "Ctrl-Shift-c",
            run: (view) => { cmd.codeBlock(view); return true; },
            preventDefault: true
          }
        ]),
        
        // Search keymap at default precedence
        keymap.of(searchKeymap),
        
        // Normal priority: History shortcuts
        keymap.of([
          {
            key: "Ctrl-z",
            run: (view) => { cmd.undo(view); return true; },
            preventDefault: true
          },
          {
            key: "Ctrl-y",
            run: (view) => { cmd.redo(view); return true; },
            preventDefault: true
          },
          {
            key: "Ctrl-Shift-z",
            run: (view) => { cmd.redo(view); return true; },
            preventDefault: true
          }
        ]),
        
        // Normal priority: Copy with anchor scrubbing
        keymap.of([
          {
            key: "Mod-c",
            run: (view) => {
              const state = view.state;
              const selection = state.selection.main;
              const text = selection.empty ? state.doc.toString() : state.sliceDoc(selection.from, selection.to);
              const scrubbed = scrubRawTypstAnchors(text);
              navigator.clipboard.writeText(scrubbed);
              return true;
            }
          }
        ]),
        
        // ====================================================================
        // Update Listener with Optimized State Management
        // ====================================================================
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            // Check if this is a programmatic update (e.g., file loading)
            const isProgrammatic = update.transactions.some(
              tr => tr.annotation(programmaticUpdateAnnotation)
            );
            
            // Skip marking as modified if this is a programmatic update
            if (isProgrammatic) {
              // Use requestMeasure for DOM-related work
              update.view.requestMeasure({
                read: () => update.state.doc.toString(),
                write: (newContent) => {
                  setContent(newContent);
                }
              });
              return;
            }
            
            // This is a user edit - mark as typing and modified
            isUserTypingRef.current = true;
            setIsTyping(true);
            
            // Use requestMeasure for state updates
            update.view.requestMeasure({
              read: () => update.state.doc.toString(),
              write: (newContent) => {
                setContent(newContent);
                setModified(true);
              }
            });
            
            // Clear existing timeouts
            if (contentChangeTimeoutRef.current) {
              clearTimeout(contentChangeTimeoutRef.current);
            }
            if (typingDetectionTimeoutRef.current) {
              clearTimeout(typingDetectionTimeoutRef.current);
            }
            
            // Typing detection timeout (longer to avoid inter-keystroke sync)
            typingDetectionTimeoutRef.current = setTimeout(() => {
              setIsTyping(false);
            }, TIMING.TYPING_IDLE_THRESHOLD_MS);
            
            // Smart trailing-only debounced render: one render after the last change
            const newContent = update.state.doc.toString();
            const abortController = new AbortController();
            contentChangeAbortRef.current = abortController;
            contentChangeTimeoutRef.current = setTimeout(() => {
              handleAutoRender(newContent, abortController.signal);
              isUserTypingRef.current = false;
            }, renderDebounceMs);
          }
        }), // Close the updateListener.of() call
      ],
      parent: editorRef.current!
    });
    
    editorViewRef.current = view;

    // If content prop has a value, ensure editor is initialized with it
    // This handles race conditions where content updates after mount
    if (content && content !== view.state.doc.toString()) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[CodeMirror] Content mismatch after creation, updating. Content length:', content.length);
      }
      // Use annotation to mark as programmatic update
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: content
        },
        annotations: programmaticUpdateAnnotation.of(true)
      });
    }

    // Signal that editor is ready
    setEditorReady(true);

    // Add scroll listener to compute active anchor based on viewport
    const scrollEl = getScrollElement(view);
    if (scrollEl) {
      scrollElRef.current = scrollEl;
      const cleanup = setupScrollListener();
      if (cleanup) {
        (scrollEl as ScrollElementWithHandler)._tideflowScrollHandler = cleanup;
      }
    }
    
    return () => {
      // Capture refs locally
      const timeoutId = contentChangeTimeoutRef.current;
      const abortController = contentChangeAbortRef.current;
      const typingId = typingDetectionTimeoutRef.current;

      if (editorViewRef.current) {
        // Remove scroll listener before destroy
        try {
          const scrollEl = scrollElRef.current;
          if (scrollEl && (scrollEl as ScrollElementWithHandler)._tideflowScrollHandler) {
            const handler = (scrollEl as ScrollElementWithHandler)._tideflowScrollHandler;
            if (typeof handler === 'function') {
              handler();
            }
            delete (scrollEl as ScrollElementWithHandler)._tideflowScrollHandler;
          }
        } catch { /* ignore */ }
        editorViewRef.current.destroy();
        editorViewRef.current = null;
      }
      if (timeoutId) clearTimeout(timeoutId);
      if (abortController) abortController.abort();
      if (typingId) clearTimeout(typingId);
      
      // Reset initialization flag so editor can be recreated on remount
      initializedRef.current = false;
    };
  // Run only once when component mounts - component is now persistent
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ============================================================================
// Exported Utilities
// ============================================================================

/**
 * Export the programmatic update annotation for use in other hooks.
 * This allows other parts of the codebase to mark their dispatches as programmatic.
 */
export { programmaticUpdateAnnotation };

/**
 * Helper function to create a programmatic dispatch spec.
 * Use this when programmatically updating the editor to mark it as non-user change.
 */
export function createProgrammaticDispatch(changes: unknown, additionalSpec: Record<string, unknown> = {}) {
  return {
    changes,
    annotations: programmaticUpdateAnnotation.of(true),
    ...additionalSpec
  };
}
