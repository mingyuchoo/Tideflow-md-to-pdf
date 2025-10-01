/**
 * Hook to handle anchor-related effects: activeAnchorId scrolling, anchor initialization.
 * Manages programmatic scrolling to anchors when PDF preview updates.
 */

import { useEffect } from 'react';
import { EditorView } from 'codemirror';
import type { SourceMap } from '../types';
import type { EditorStateRefs } from './useEditorState';

interface UseAnchorManagementParams {
  editorStateRefs: EditorStateRefs;
  sourceMap: SourceMap | null;
  activeAnchorId: string | null;
  setActiveAnchorId: (id: string | null) => void;
}

export function useAnchorManagement(params: UseAnchorManagementParams) {
  const {
    editorStateRefs,
    sourceMap,
    activeAnchorId,
    setActiveAnchorId,
  } = params;

  const {
    editorViewRef,
    anchorUpdateFromEditorRef,
    isTypingStoreRef,
    syncModeRef,
    programmaticScrollRef,
  } = editorStateRefs;

  // Scroll editor to active anchor when PDF preview updates it
  useEffect(() => {
    if (!editorViewRef.current) return;
    if (!sourceMap) return;
    if (!activeAnchorId) return;
    if (anchorUpdateFromEditorRef.current) {
      anchorUpdateFromEditorRef.current = false;
      return;
    }
    if (isTypingStoreRef.current) return;
    if (syncModeRef.current !== 'locked-to-pdf') return;

    const anchor = sourceMap.anchors.find((candidate) => candidate.id === activeAnchorId);
    if (!anchor) return;

    const view = editorViewRef.current;
    programmaticScrollRef.current = true;
    const effect = EditorView.scrollIntoView(anchor.editor.offset, { y: 'center' });
    view.dispatch({ effects: effect });
    requestAnimationFrame(() => {
      programmaticScrollRef.current = false;
    });
  }, [
    activeAnchorId,
    sourceMap,
    editorViewRef,
    anchorUpdateFromEditorRef,
    isTypingStoreRef,
    syncModeRef,
    programmaticScrollRef,
  ]);

  // Initialize active anchor when sourceMap first loads
  useEffect(() => {
    const anchors = sourceMap?.anchors ?? [];
    if (anchors.length === 0) {
      if (activeAnchorId !== null) {
        setActiveAnchorId(null);
      }
      return;
    }
    if (activeAnchorId && anchors.some((anchor) => anchor.id === activeAnchorId)) {
      return;
    }
    anchorUpdateFromEditorRef.current = true;
    setActiveAnchorId(anchors[0].id);
  }, [sourceMap, activeAnchorId, setActiveAnchorId, anchorUpdateFromEditorRef]);
}
