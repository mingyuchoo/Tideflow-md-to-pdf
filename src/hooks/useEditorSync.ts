/**
 * Hook to handle editor-to-PDF scroll synchronization.
 * Computes the active anchor based on the editor viewport and manages sync modes.
 */

import { useCallback, useEffect } from 'react';
import type { SourceAnchor, SourceMap, SyncMode } from '../types';
import { TIMING } from '../constants/timing';
import type { EditorStateRefs } from './useEditorState';

interface UseEditorSyncParams {
  editorStateRefs: EditorStateRefs;
  currentFile: string | null;
  sourceMap: SourceMap | null;
  setSyncMode: (mode: SyncMode) => void;
  setActiveAnchorId: (id: string | null) => void;
  setEditorScrollPosition: (file: string, position: number) => void;
}

export function useEditorSync(params: UseEditorSyncParams) {
  const {
    editorStateRefs,
    currentFile,
    sourceMap,
    setSyncMode,
    setActiveAnchorId,
    setEditorScrollPosition,
  } = params;

  const {
    editorViewRef,
    scrollElRef,
    programmaticScrollRef,
    sourceMapRef,
    activeAnchorIdRef,
    syncModeRef,
    isUserTypingRef,
    isTypingStoreRef,
    anchorUpdateFromEditorRef,
    scrollIdleTimeoutRef,
    initialSourceMapSet,
  } = editorStateRefs;

  const computeAnchorFromViewport = useCallback((userInitiated = false) => {
    const scrollEl = scrollElRef.current;
    if (!scrollEl) return;
    if (programmaticScrollRef.current) return;
    if (isUserTypingRef.current || isTypingStoreRef.current) return;
    const map = sourceMapRef.current;
    if (!map || map.anchors.length === 0) return;

    const top = scrollEl.scrollTop;
    const bottom = top + scrollEl.clientHeight;
    const topBlock = editorViewRef.current!.lineBlockAtHeight(Math.max(0, top));
    const bottomHeight = Math.max(0, Math.min(scrollEl.scrollHeight - 1, bottom));
    const bottomBlock = editorViewRef.current!.lineBlockAtHeight(bottomHeight);
    const topLine = Math.max(0, editorViewRef.current!.state.doc.lineAt(topBlock.from).number - 1);
    const bottomLine = Math.max(0, editorViewRef.current!.state.doc.lineAt(bottomBlock.to).number - 1);
    const centerLine = Math.max(0, Math.floor((topLine + bottomLine) / 2));

    let closest: SourceAnchor | null = null;
    let closestDiff = Number.POSITIVE_INFINITY;
    for (const anchor of map.anchors) {
      const diff = Math.abs(anchor.editor.line - centerLine);
      if (
        diff < closestDiff ||
        (diff === closestDiff && anchor.editor.offset < (closest?.editor.offset ?? Number.POSITIVE_INFINITY))
      ) {
        closest = anchor;
        closestDiff = diff;
      }
    }

    if (!closest) return;

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[Editor] computed closest anchor', { id: closest.id, line: closest.editor.line, centerLine });
      console.debug('[Editor] syncModeRef, activeAnchorIdRef', { syncMode: syncModeRef.current, activeAnchor: activeAnchorIdRef.current });
    }

    // Only release the preview lock when the editor scroll was
    // explicitly user-initiated (not on initial compute or programmatic
    // calls). This prevents the preview from unlocking immediately when
    // the editor initializes or when we programmatically set scroll/anchor.
    if (userInitiated && syncModeRef.current === 'locked-to-pdf') {
      setSyncMode('auto');
    }

    // Persist the current manual scroll position per-file so reopening
    // the same file restores the user's manual view. Only persist when
    // this was a true user-initiated scroll (not programmatic).
    try {
      const curFile = currentFile;
      if (userInitiated && curFile) {
        const pos = scrollEl.scrollTop;
        setEditorScrollPosition(curFile, pos);
        if (process.env.NODE_ENV !== 'production') console.debug('[Editor] persisted scroll pos', { file: curFile, pos });
      }
    } catch { /* ignore persistence failures */ }

    if (closest.id !== activeAnchorIdRef.current) {
      anchorUpdateFromEditorRef.current = true;
      setActiveAnchorId(closest.id);
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[Editor] setActiveAnchorId ->', closest.id);
      }
    }
  }, [
    setSyncMode,
    setActiveAnchorId,
    currentFile,
    setEditorScrollPosition,
    scrollElRef,
    programmaticScrollRef,
    isUserTypingRef,
    isTypingStoreRef,
    sourceMapRef,
    editorViewRef,
    activeAnchorIdRef,
    syncModeRef,
    anchorUpdateFromEditorRef,
  ]);

  // Sync sourceMapRef and trigger initial anchor compute when sourceMap is set
  useEffect(() => {
    sourceMapRef.current = sourceMap;
    if (sourceMap && !initialSourceMapSet.current) {
      initialSourceMapSet.current = true;
      computeAnchorFromViewport(false);
    }
  }, [sourceMap, computeAnchorFromViewport, sourceMapRef, initialSourceMapSet]);

  // Setup scroll listener with debounce
  const setupScrollListener = useCallback(() => {
    const scrollEl = scrollElRef.current;
    if (!scrollEl) return () => {};

    const handleScroll = () => {
      if (scrollIdleTimeoutRef.current) {
        clearTimeout(scrollIdleTimeoutRef.current);
      }
      scrollIdleTimeoutRef.current = setTimeout(() => {
        computeAnchorFromViewport(true);
      }, TIMING.SCROLL_DEBOUNCE_MS);
    };

    scrollEl.addEventListener('scroll', handleScroll, { passive: true });
    // Initial compute is not user-initiated
    computeAnchorFromViewport(false);

    return () => {
      scrollEl.removeEventListener('scroll', handleScroll);
    };
  }, [scrollElRef, scrollIdleTimeoutRef, computeAnchorFromViewport]);

  return {
    computeAnchorFromViewport,
    setupScrollListener,
  };
}
