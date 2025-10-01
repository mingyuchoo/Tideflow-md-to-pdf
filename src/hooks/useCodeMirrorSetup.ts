/**
 * Hook to handle CodeMirror initialization, extensions, and keyboard shortcuts.
 * Manages the editor view lifecycle and event listeners.
 */

import { useEffect } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { keymap } from '@codemirror/view';
import { TIMING } from '../constants/timing';
import { cmd } from '../components/commands';
import { scrubRawTypstAnchors } from '../utils/scrubAnchors';
import { getScrollElement, type ScrollElementWithHandler } from '../types/codemirror';
import type { EditorStateRefs } from './useEditorState';

interface UseCodeMirrorSetupParams {
  editorStateRefs: EditorStateRefs;
  content: string;
  currentFile: string | null;
  setContent: (content: string) => void;
  setModified: (modified: boolean) => void;
  setSampleDocContent: (content: string) => void;
  setIsActivelyTyping: (typing: boolean) => void;
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
    currentFile,
    setContent,
    setModified,
    setSampleDocContent,
    setIsActivelyTyping,
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

  // Initialize CodeMirror when the component mounts (once)
  useEffect(() => {
    if (editorRef.current && !editorViewRef.current) {
      const view = new EditorView({
        doc: content,
        extensions: [
          basicSetup,
          markdown(),
          EditorView.lineWrapping,
          EditorView.theme({
            '.cm-content': {
              'white-space': 'pre-wrap',
              'word-wrap': 'break-word',
              'overflow-wrap': 'break-word'
            },
            '.cm-line': {
              'white-space': 'pre-wrap',
              'word-wrap': 'break-word',
              'overflow-wrap': 'break-word'
            }
          }),
          keymap.of([
            // Text formatting shortcuts
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
            // Other shortcuts
            {
              key: "Ctrl-Shift-q",
              run: (view) => { cmd.quote(view); return true; },
              preventDefault: true
            },
            {
              key: "Ctrl-Shift-c",
              run: (view) => { cmd.codeBlock(view); return true; },
              preventDefault: true
            },
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
          EditorView.updateListener.of(update => {
            if (update.docChanged) {
              isUserTypingRef.current = true;
              setIsActivelyTyping(true);
              setIsTyping(true);
              const newContent = update.state.doc.toString();
              setContent(newContent);
              setModified(true);
              if (currentFile === 'sample.md') {
                setSampleDocContent(newContent);
              }
              
              // Clear existing timeouts
              if (contentChangeTimeoutRef.current) {
                clearTimeout(contentChangeTimeoutRef.current);
              }
              if (typingDetectionTimeoutRef.current) {
                clearTimeout(typingDetectionTimeoutRef.current);
              }
              
              // Typing detection timeout (longer to avoid inter-keystroke sync)
              typingDetectionTimeoutRef.current = setTimeout(() => {
                setIsActivelyTyping(false);
                setIsTyping(false);
              }, TIMING.TYPING_IDLE_THRESHOLD_MS);
              
              // Smart trailing-only debounced render: one render after the last change
              // Store abort controller in ref so cleanup can access it
              const abortController = new AbortController();
              contentChangeAbortRef.current = abortController;
              contentChangeTimeoutRef.current = setTimeout(() => {
                handleAutoRender(newContent, abortController.signal);
                isUserTypingRef.current = false;
              }, renderDebounceMs);
            }
          }),
        ],
        parent: editorRef.current
      });
      
      editorViewRef.current = view;

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
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally empty to prevent recreation
}
