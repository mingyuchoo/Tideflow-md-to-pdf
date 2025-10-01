/**
 * Hook to handle content management: auto-render, typing detection, and debouncing.
 * Manages the render queue and auto-save logic.
 */

import { useCallback } from 'react';
import { renderTypst, cleanupTempPdfs } from '../api';
import type { SourceMap, SyncMode } from '../types';
import type { EditorStateRefs } from './useEditorState';

interface CompileStatus {
  status: 'running' | 'ok' | 'error';
  pdf_path?: string;
  source_map?: SourceMap;
  message?: string;
  details?: string;
}

interface UseContentManagementParams {
  editorStateRefs: EditorStateRefs;
  sourceMap: SourceMap | null;
  setCompileStatus: (status: CompileStatus) => void;
  setSourceMap: (map: SourceMap | null) => void;
  setSyncMode: (mode: SyncMode) => void;
}

export function useContentManagement(params: UseContentManagementParams) {
  const {
    editorStateRefs,
    sourceMap,
    setCompileStatus,
    setSourceMap,
    setSyncMode,
  } = params;

  const {
    autoRenderInFlightRef,
    pendingRenderRef,
  } = editorStateRefs;

  // Auto-render function (always full content)
  const handleAutoRender = useCallback(async (content: string) => {
    try {
      if (autoRenderInFlightRef.current) {
        // A render is already in progress; remember the latest content to render afterwards.
        pendingRenderRef.current = content;
        return;
      }
      autoRenderInFlightRef.current = true;
      const wasSourceMapNull = !sourceMap;
      setCompileStatus({ status: 'running' });
      const document = await renderTypst(content, 'pdf');
      setSourceMap(document.sourceMap);
      setCompileStatus({
        status: 'ok',
        pdf_path: document.pdfPath,
        source_map: document.sourceMap,
      });
      // On first render that sets sourceMap, lock PDF to editor for initial sync
      if (wasSourceMapNull) {
        setSyncMode('locked-to-pdf');
      }
      
      // Clean up old temp PDFs after successful render
      try {
        await cleanupTempPdfs(10); // Keep last 10 temp PDFs
      } catch (err) {
        // Don't fail the render if cleanup fails
        console.warn('Failed to cleanup temp PDFs:', err);
      }
    } catch (err) {
      setCompileStatus({
        status: 'error',
        message: 'Auto-render failed',
        details: String(err)
      });
      setSourceMap(null);
    } finally {
      autoRenderInFlightRef.current = false;
      // If there is a pending update queued during render, render once more with latest snapshot
      const pending = pendingRenderRef.current;
      pendingRenderRef.current = null;
      if (pending) {
        // Fire-and-forget; guard will re-enter to in-flight again
        handleAutoRender(pending);
      }
    }
  }, [
    setCompileStatus,
    setSourceMap,
    sourceMap,
    setSyncMode,
    autoRenderInFlightRef,
    pendingRenderRef,
  ]);

  return {
    handleAutoRender,
  };
}
