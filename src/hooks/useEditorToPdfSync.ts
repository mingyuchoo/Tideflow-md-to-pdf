/**
 * Simplified hook to sync PDF preview to editor scroll position.
 * Handles: activeAnchorId changes, sourceMap changes, startup sync.
 * 
 * Replaces: useAnchorSync, usePendingScroll, useStartupSync, useFinalSync
 */

import { useEffect, useRef } from 'react';
import type { SourceMap } from '../types';

interface UseEditorToPdfSyncParams {
  // State
  activeAnchorId: string | null;
  syncMode: 'auto' | 'locked-to-editor' | 'locked-to-pdf';
  isTyping: boolean;
  sourceMap: SourceMap | null;
  compileStatus: { status: string; pdf_path?: string | null };
  
  // Refs
  containerRef: React.RefObject<HTMLDivElement | null>;
  anchorOffsetsRef: React.MutableRefObject<Map<string, number>>;
  pdfMetricsRef: React.MutableRefObject<{ page: number; height: number; scale: number }[]>;
  sourceMapRef: React.MutableRefObject<SourceMap | null>;
  syncModeRef: React.MutableRefObject<'auto' | 'locked-to-editor' | 'locked-to-pdf'>;
  userInteractedRef: React.MutableRefObject<boolean>;
  
  // Actions
  scrollToAnchor: (anchorId: string, center?: boolean, force?: boolean) => void;
  recomputeAnchorOffsets: (map: SourceMap | null) => void;
}

export function useEditorToPdfSync(params: UseEditorToPdfSyncParams): void {
  const {
    activeAnchorId,
    syncMode,
    isTyping,
    sourceMap,
    compileStatus,
    containerRef,
    anchorOffsetsRef,
    pdfMetricsRef,
    sourceMapRef,
    syncModeRef,
    userInteractedRef,
    scrollToAnchor,
    recomputeAnchorOffsets,
  } = params;

  // Track if we've done initial sync
  const initialSyncDoneRef = useRef(false);
  const lastSourceMapRef = useRef<SourceMap | null>(null);
  const lastActiveAnchorIdRef = useRef<string | null>(null);
  const wasTypingRef = useRef(isTyping);

  // Effect 1: Sync PDF to active anchor when it changes (normal operation)
  useEffect(() => {
    // Don't sync if same anchor as last time (prevents feedback loop from PDF scroll handler)
    if (activeAnchorId === lastActiveAnchorIdRef.current) return;
    
    // Don't sync if PDF is locked
    if (syncMode === 'locked-to-pdf') {
      lastActiveAnchorIdRef.current = activeAnchorId;
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[EditorToPdfSync] skipped - PDF locked');
      }
      return;
    }

    // Don't sync if no anchor
    if (!activeAnchorId) {
      lastActiveAnchorIdRef.current = activeAnchorId;
      return;
    }

    // Don't sync if offsets not ready
    if (anchorOffsetsRef.current.size === 0) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[EditorToPdfSync] skipped - no offsets yet');
      }
      // Don't update lastActiveAnchorIdRef - we want to retry when offsets are ready
      return;
    }

    // Update last anchor BEFORE scrolling to prevent re-triggering
    lastActiveAnchorIdRef.current = activeAnchorId;

    // Debounce: wait longer if user is typing
    // During typing, we debounce more to reduce scroll spam
    // When not typing (e.g., just scrolling editor), sync quickly
    const debounceMs = isTyping ? 150 : 30;

    const timerId = setTimeout(() => {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[EditorToPdfSync] syncing to anchor', { activeAnchorId, isTyping, debounceMs });
      }
      scrollToAnchor(activeAnchorId, false, false);
    }, debounceMs);

    return () => clearTimeout(timerId);
  }, [activeAnchorId, syncMode, isTyping, anchorOffsetsRef, scrollToAnchor]);

  // Effect 1b: Trigger sync when user stops typing (to catch up if needed)
  useEffect(() => {
    // Track if typing state changed from true to false
    const stoppedTyping = wasTypingRef.current && !isTyping;
    wasTypingRef.current = isTyping;

    if (!stoppedTyping) return;
    if (syncMode === 'locked-to-pdf') return;
    if (!activeAnchorId) return;
    if (anchorOffsetsRef.current.size === 0) return;

    // User stopped typing - sync to current anchor position
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[EditorToPdfSync] user stopped typing, syncing', { activeAnchorId });
    }

    const timerId = setTimeout(() => {
      scrollToAnchor(activeAnchorId, false, false);
    }, 100);

    return () => clearTimeout(timerId);
  }, [isTyping, syncMode, activeAnchorId, anchorOffsetsRef, scrollToAnchor]);

  // Effect 2: Handle sourceMap changes (new render completed)
  useEffect(() => {
    // Skip if no sourceMap or same as last time
    if (!sourceMap || sourceMap === lastSourceMapRef.current) return;
    
    lastSourceMapRef.current = sourceMap;

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[EditorToPdfSync] sourceMap changed, recomputing offsets', {
        anchorsCount: sourceMap.anchors.length,
      });
    }

    // Recompute offsets for new render
    recomputeAnchorOffsets(sourceMap);

    // Wait for offsets to be ready, then scroll
    const checkAndScroll = () => {
      const el = containerRef.current;
      if (!el || !el.isConnected) return;
      
      // Check if offsets are ready
      if (anchorOffsetsRef.current.size === 0) {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[EditorToPdfSync] waiting for offsets after sourceMap change');
        }
        return;
      }

      // Find anchor to scroll to
      const targetAnchor = activeAnchorId ?? sourceMap.anchors[0]?.id;
      if (!targetAnchor) return;

      // Don't force scroll if user has interacted and PDF is locked
      if (userInteractedRef.current && syncModeRef.current === 'locked-to-pdf') {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[EditorToPdfSync] skipping post-render scroll - user has control');
        }
        return;
      }

      if (process.env.NODE_ENV !== 'production') {
        console.debug('[EditorToPdfSync] scrolling after sourceMap change', { targetAnchor });
      }

      scrollToAnchor(targetAnchor, true, false);
    };

    // Give PDF renderer time to update metrics
    const timerId = setTimeout(checkAndScroll, 150);
    return () => clearTimeout(timerId);
  }, [
    sourceMap,
    activeAnchorId,
    containerRef,
    anchorOffsetsRef,
    syncModeRef,
    userInteractedRef,
    scrollToAnchor,
    recomputeAnchorOffsets,
  ]);

  // Effect 3: Initial startup sync (when app first loads)
  useEffect(() => {
    // Only run once
    if (initialSyncDoneRef.current) return;

    // Wait for all conditions to be ready
    const el = containerRef.current;
    if (!el || !el.isConnected) return;
    if (compileStatus.status !== 'ok' || !compileStatus.pdf_path) return;
    if (!sourceMap || sourceMap.anchors.length === 0) return;
    if (pdfMetricsRef.current.length === 0) return;

    // Don't interfere if user has already interacted
    if (userInteractedRef.current) return;

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[EditorToPdfSync] performing initial startup sync', {
        hasSourceMap: !!sourceMap,
        metricsCount: pdfMetricsRef.current.length,
        offsetsCount: anchorOffsetsRef.current.size,
      });
    }

    // Ensure offsets are computed
    if (anchorOffsetsRef.current.size === 0) {
      recomputeAnchorOffsets(sourceMap);
    }

    // Wait a bit for everything to settle, then scroll
    const timerId = setTimeout(() => {
      if (initialSyncDoneRef.current) return;
      if (userInteractedRef.current) return;

      const targetAnchor = activeAnchorId ?? sourceMap.anchors[0]?.id;
      if (targetAnchor) {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[EditorToPdfSync] executing initial sync scroll', { targetAnchor });
        }
        scrollToAnchor(targetAnchor, true, true);
        initialSyncDoneRef.current = true;
      }
    }, 200);

    return () => clearTimeout(timerId);
  }, [
    compileStatus.status,
    compileStatus.pdf_path,
    sourceMap,
    activeAnchorId,
    containerRef,
    pdfMetricsRef,
    anchorOffsetsRef,
    userInteractedRef,
    scrollToAnchor,
    recomputeAnchorOffsets,
  ]);

  // Effect 4: Recompute offsets on resize (debounced)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let resizeTimeout: number | null = null;
    let lastWidth = el.clientWidth;
    let lastHeight = el.clientHeight;

    const resizeObserver = new ResizeObserver(() => {
      if (!sourceMapRef.current) return;
      
      // Only recompute if size actually changed significantly (more than 5px)
      const newWidth = el.clientWidth;
      const newHeight = el.clientHeight;
      if (Math.abs(newWidth - lastWidth) < 5 && Math.abs(newHeight - lastHeight) < 5) {
        return; // Ignore tiny fluctuations
      }
      
      lastWidth = newWidth;
      lastHeight = newHeight;

      if (resizeTimeout) window.clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(() => {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[EditorToPdfSync] container resized, recomputing offsets');
        }
        recomputeAnchorOffsets(sourceMapRef.current);
        
        // Re-sync to current anchor after resize (if not locked)
        if (syncModeRef.current !== 'locked-to-pdf' && activeAnchorId) {
          setTimeout(() => {
            scrollToAnchor(activeAnchorId, false, false);
          }, 50);
        }
      }, 150); // Debounce resize recomputation
    });

    resizeObserver.observe(el);
    return () => {
      if (resizeTimeout) window.clearTimeout(resizeTimeout);
      resizeObserver.disconnect();
    };
  }, [containerRef, sourceMapRef, syncModeRef, activeAnchorId, scrollToAnchor, recomputeAnchorOffsets]);
}
