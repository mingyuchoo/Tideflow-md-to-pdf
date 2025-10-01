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
  handleAutoRender: (content: string) => Promise<void>;
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
  useEffect(() => {
    if (!editorViewRef.current) return;
    // When a new file is selected
    if (currentFile && currentFile !== prevFileRef.current) {
      // Save current scroll position for the previous file before switching
      if (prevFileRef.current) {
        const sc = getScrollElement(editorViewRef.current);
        if (sc) {
          const pos = sc.scrollTop;
          setEditorScrollPosition(prevFileRef.current, pos);
          if (process.env.NODE_ENV !== 'production') console.debug('[Editor] saved scroll pos on file switch', { file: prevFileRef.current, pos });
        }
      }
      // Replace document content with the file's content
      editorViewRef.current.dispatch({
        changes: {
          from: 0,
          to: editorViewRef.current.state.doc.length,
          insert: content
        },
        selection: { anchor: 0, head: 0 } // Set cursor to top to prevent auto-scroll
      });
      lastLoadedContentRef.current = content;
      prevFileRef.current = currentFile;
      // Restore persisted scroll position if available
      try {
        const stored = getEditorScrollPosition(currentFile);
        if (stored !== null && editorViewRef.current) {
          const sc = getScrollElement(editorViewRef.current);
          if (sc) {
            // Don't mark programmatic scroll as user-initiated
            programmaticScrollRef.current = true;
            sc.scrollTop = stored;
            requestAnimationFrame(() => { programmaticScrollRef.current = false; });
            if (process.env.NODE_ENV !== 'production') console.debug('[Editor] restored scroll pos', { file: currentFile, pos: stored });
          }
        }
      } catch { /* ignore */ }
      computeAnchorFromViewport(false);
      handleAutoRender(content);
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
  useEffect(() => {
    if (!editorViewRef.current) return;
    if (!currentFile) return;
    const currentDoc = editorViewRef.current.state.doc.toString();
    if (content !== currentDoc && currentFile === prevFileRef.current) {
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
