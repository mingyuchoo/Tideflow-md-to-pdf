/**
 * Hook to handle file operations: saving, rendering, file switching, content loading.
 * Manages scroll position restoration and document lifecycle.
 */

import { useEffect, useCallback } from 'react';
import { writeMarkdownFile, renderTypst } from '../api';
import { scrubRawTypstAnchors } from '../utils/scrubAnchors';
import { handleError } from '../utils/errorHandler';
import { getScrollElement } from '../types/codemirror';
import type { SourceMap } from '../types';
import type { EditorStateRefs } from './useEditorState';

interface CompileStatus {
  status: 'running' | 'ok' | 'error';
  pdf_path?: string;
  source_map?: SourceMap;
  message?: string;
  details?: string;
}

interface UseFileOperationsParams {
  editorStateRefs: EditorStateRefs;
  currentFile: string | null;
  content: string;
  modified: boolean;
  setModified: (modified: boolean) => void;
  setCompileStatus: (status: CompileStatus) => void;
  setSourceMap: (map: SourceMap | null) => void;
  setEditorScrollPosition: (file: string, position: number) => void;
  getEditorScrollPosition: (file: string) => number | null;
  handleAutoRender: (content: string, signal?: AbortSignal) => Promise<void>;
  computeAnchorFromViewport: (userInitiated: boolean) => void;
}

export function useFileOperations(params: UseFileOperationsParams) {
  const {
    editorStateRefs,
    currentFile,
    content,
    modified,
    setModified,
    setCompileStatus,
    setSourceMap,
    setEditorScrollPosition,
    getEditorScrollPosition,
    handleAutoRender,
    computeAnchorFromViewport,
  } = params;

  const {
    editorViewRef,
    prevFileRef,
    lastLoadedContentRef,
    programmaticScrollRef,
  } = editorStateRefs;

  // Handle render
  const handleRender = useCallback(async () => {
    try {
      setCompileStatus({ status: 'running' });
      const document = await renderTypst(content, 'pdf');
      setSourceMap(document.sourceMap);
      setCompileStatus({
        status: 'ok',
        pdf_path: document.pdfPath,
        source_map: document.sourceMap,
      });
    } catch (err) {
      setCompileStatus({
        status: 'error',
        message: 'Rendering failed',
        details: String(err)
      });
      setSourceMap(null);
    }
  }, [content, setCompileStatus, setSourceMap]);

  // Save the file
  const handleSave = useCallback(async (setIsSaving: (saving: boolean) => void) => {
    if (!currentFile || !modified) return;
    
    try {
      setIsSaving(true);
      // Strip invisible raw-typst anchors before saving so the persisted
      // markdown doesn't contain those injected tokens which can interfere
      // with copy/paste and other tooling.
      const cleaned = scrubRawTypstAnchors(content);
      await writeMarkdownFile(currentFile, cleaned);
      setModified(false);
      
      // After saving, render the file
      await handleRender();
    } catch (err) {
      handleError(err, { operation: 'save file', component: 'Editor' });
    } finally {
      setIsSaving(false);
    }
  }, [currentFile, modified, content, setModified, handleRender]);

  // Load file content ONLY when switching to a different file, not on every keystroke.
  // Use generation tracking to prevent race conditions on rapid file switches.
  useEffect(() => {
    if (!editorViewRef.current) return;
    
    // When a new file is selected
    if (currentFile && currentFile !== prevFileRef.current) {
      // Track the target file to detect if user switches away during loading
      const targetFile = currentFile;
      
      // Save current scroll position for the previous file before switching
      if (prevFileRef.current) {
        const sc = getScrollElement(editorViewRef.current);
        if (sc) {
          const pos = sc.scrollTop;
          setEditorScrollPosition(prevFileRef.current, pos);
          if (process.env.NODE_ENV !== 'production') console.debug('[Editor] saved scroll pos on file switch', { file: prevFileRef.current, pos });
        }
      }
      
      // Update tracking refs immediately to prevent double-processing
      prevFileRef.current = currentFile;
      lastLoadedContentRef.current = content;
      
      // Replace document content with the file's content
      editorViewRef.current.dispatch({
        changes: {
          from: 0,
          to: editorViewRef.current.state.doc.length,
          insert: content
        },
        selection: { anchor: 0, head: 0 } // Set cursor to top to prevent auto-scroll
      });
      
      // Restore scroll position after content is loaded (async to avoid race)
      requestAnimationFrame(() => {
        // Verify we're still on the same file (user might have switched again)
        if (currentFile !== targetFile) {
          if (process.env.NODE_ENV !== 'production') console.debug('[Editor] skipped scroll restore - file changed', { targetFile, currentFile });
          return;
        }
        
        try {
          const stored = getEditorScrollPosition(targetFile);
          if (stored !== null && editorViewRef.current) {
            const sc = getScrollElement(editorViewRef.current);
            if (sc) {
              programmaticScrollRef.current = true;
              sc.scrollTop = stored;
              requestAnimationFrame(() => { programmaticScrollRef.current = false; });
              if (process.env.NODE_ENV !== 'production') console.debug('[Editor] restored scroll pos', { file: targetFile, pos: stored });
            }
          }
        } catch { /* ignore */ }
        
        // Compute anchor and auto-render (only if still on same file)
        if (currentFile === targetFile) {
          computeAnchorFromViewport(false);
          // Debounce auto-render on file switch to avoid race with content loading
          const abortController = new AbortController();
          const timerId = setTimeout(() => {
            if (currentFile === targetFile) {
              handleAutoRender(content, abortController.signal);
            }
          }, 100);
          
          // Cleanup: cancel render if component unmounts or file changes
          return () => {
            clearTimeout(timerId);
            abortController.abort();
          };
        }
      });
    }
  }, [
    currentFile,
    content,
    handleAutoRender,
    setEditorScrollPosition,
    getEditorScrollPosition,
    computeAnchorFromViewport,
    editorViewRef,
    prevFileRef,
    lastLoadedContentRef,
    programmaticScrollRef,
  ]);

  // If content in store changes for current file (e.g., loaded asynchronously) and differs from editor doc, update it.
  // This effect is now safer as it only runs when content genuinely changes for the CURRENT file.
  useEffect(() => {
    if (!editorViewRef.current) return;
    if (!currentFile) return;
    
    // Only update if this content is for the currently displayed file
    if (currentFile !== prevFileRef.current) return;
    
    const currentDoc = editorViewRef.current.state.doc.toString();
    if (content !== currentDoc && content !== lastLoadedContentRef.current) {
      editorViewRef.current.dispatch({
        changes: {
          from: 0,
          to: editorViewRef.current.state.doc.length,
          insert: content
        }
      });
      lastLoadedContentRef.current = content;
    }
  }, [content, currentFile, editorViewRef, prevFileRef, lastLoadedContentRef]);

  return {
    handleSave,
    handleRender,
  };
}
