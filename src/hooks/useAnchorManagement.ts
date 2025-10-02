/**
 * Hook to handle anchor-related effects: activeAnchorId scrolling, anchor initialization.
 * Manages programmatic scrolling to anchors when PDF preview updates.
 */

import { useEffect, useRef } from 'react';
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

  // TWO-SOURCEMAP PATTERN: Keep reference to previous sourceMap to preserve position when IDs change
  // This allows us to look up the old anchor's line number and find the closest match in the new sourceMap
  // Works with any ID format (not dependent on parsing tf-LINE-N patterns)
  const prevSourceMapRef = useRef<SourceMap | null>(null);

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
    // Scroll editor in both 'locked-to-pdf' and 'two-way' modes
    if (syncModeRef.current !== 'locked-to-pdf' && syncModeRef.current !== 'two-way') return;

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

  // Initialize active anchor when sourceMap first loads or changes
  useEffect(() => {
    const anchors = sourceMap?.anchors ?? [];
    const prevSourceMap = prevSourceMapRef.current;
    
    // Update ref for next render
    prevSourceMapRef.current = sourceMap;
    
    if (anchors.length === 0) {
      if (activeAnchorId !== null) {
        setActiveAnchorId(null);
      }
      return;
    }
    
    // If current activeAnchorId exists in new anchors, keep it
    if (activeAnchorId && anchors.some((anchor) => anchor.id === activeAnchorId)) {
      return;
    }
    
    // activeAnchorId doesn't exist in new sourceMap (IDs changed after re-render)
    // Use previous sourceMap to find the old anchor's line number
    if (activeAnchorId && prevSourceMap) {
      const oldAnchor = prevSourceMap.anchors.find(a => a.id === activeAnchorId);
      
      if (oldAnchor) {
        // Find closest anchor in new map by line number
        let closest = anchors[0];
        let minDiff = Math.abs(anchors[0].editor.line - oldAnchor.editor.line);
        
        for (const anchor of anchors) {
          const diff = Math.abs(anchor.editor.line - oldAnchor.editor.line);
          if (diff < minDiff) {
            minDiff = diff;
            closest = anchor;
          }
        }
        
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[useAnchorManagement] anchor ID changed, preserving position', {
            oldId: activeAnchorId,
            oldLine: oldAnchor.editor.line,
            newId: closest.id,
            newLine: closest.editor.line,
            diff: minDiff
          });
        }
        
        anchorUpdateFromEditorRef.current = true;
        setActiveAnchorId(closest.id);
        return;
      }
    }
    
    // activeAnchorId exists but no previous sourceMap or anchor not found
    // Don't reset - let editor sync handle it naturally
    if (activeAnchorId) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[useAnchorManagement] keeping activeAnchorId - let editor sync update', {
          activeAnchorId,
          hasPrevSourceMap: !!prevSourceMap
        });
      }
      return;
    }
    
    // Fallback: use first anchor (only on true initial load when no activeAnchorId)
    anchorUpdateFromEditorRef.current = true;
    setActiveAnchorId(anchors[0].id);
  }, [sourceMap, activeAnchorId, setActiveAnchorId, anchorUpdateFromEditorRef]);
}
