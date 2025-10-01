/**
 * Hook to handle document lifecycle effects.
 * Manages sourceMap changes, compile status changes, and cleanup.
 */

import { useEffect } from 'react';
import type { SourceMap } from '../types';

interface UseDocumentLifecycleParams {
  sourceMap: SourceMap | null;
  compileStatus: { status: string; pdf_path?: string };
  anchorOffsetsRef: React.MutableRefObject<Map<string, number>>;
  finalRefreshDoneRef: React.MutableRefObject<boolean>;
  initialForcedScrollDoneRef: React.MutableRefObject<boolean>;
  userInteractedRef: React.MutableRefObject<boolean>;
  pendingForcedAnchorRef: React.MutableRefObject<string | null>;
  pendingForcedTimerRef: React.MutableRefObject<number | null>;
  pendingForcedOneShotRef: React.MutableRefObject<number | null>;
  pendingFallbackTimerRef: React.MutableRefObject<number | null>;
  pendingFallbackRef: React.MutableRefObject<Map<string, number> | null>;
  setActiveAnchorId: (id: string | null) => void;
  setSyncMode: (mode: 'auto' | 'locked-to-editor' | 'locked-to-pdf') => void;
}

export function useDocumentLifecycle(params: UseDocumentLifecycleParams): void {
  const {
    sourceMap,
    compileStatus,
    anchorOffsetsRef,
    finalRefreshDoneRef,
    initialForcedScrollDoneRef,
    userInteractedRef,
    pendingForcedAnchorRef,
    pendingForcedTimerRef,
    pendingForcedOneShotRef,
    pendingFallbackTimerRef,
    pendingFallbackRef,
    setActiveAnchorId,
    setSyncMode,
  } = params;

  // SourceMap change effect
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[useDocumentLifecycle] sourceMap changed, anchors=', sourceMap?.anchors?.length ?? 0);
    }

    // Reset final refresh flag when sourceMap changes
    finalRefreshDoneRef.current = false;

    // Clear any pending forced anchor/timers from previous document
    try {
      pendingForcedAnchorRef.current = null;
      if (pendingForcedTimerRef.current) {
        window.clearInterval(pendingForcedTimerRef.current);
        pendingForcedTimerRef.current = null;
      }
      if (pendingForcedOneShotRef.current) {
        window.clearTimeout(pendingForcedOneShotRef.current);
        pendingForcedOneShotRef.current = null;
      }
      if (pendingFallbackTimerRef.current) {
        window.clearInterval(pendingFallbackTimerRef.current);
        pendingFallbackTimerRef.current = null;
      }
      pendingFallbackRef.current = null;
    } catch (e) {
      void e;
    }

    // If the store doesn't yet have an active anchor, default to first
    try {
      if (sourceMap && sourceMap.anchors && sourceMap.anchors.length > 0) {
        // Check if we need to set a default anchor (avoiding import of useAppStore)
        const first = sourceMap.anchors[0].id;
        if (first) {
          setActiveAnchorId(first);
        }
      }
    } catch (e) {
      void e;
    }

    // Reset offsets when a new sourceMap arrives
    try {
      anchorOffsetsRef.current = new Map();
    } catch (e) {
      void e;
    }
  }, [
    sourceMap,
    setActiveAnchorId,
    anchorOffsetsRef,
    finalRefreshDoneRef,
    pendingForcedAnchorRef,
    pendingForcedTimerRef,
    pendingForcedOneShotRef,
    pendingFallbackTimerRef,
    pendingFallbackRef,
  ]);

  // Compile status change effect
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production')
      console.log('[useDocumentLifecycle] compileStatus changed', compileStatus);

    // When a new PDF is produced, reset guards for fresh sync
    if (compileStatus.status === 'ok' && compileStatus.pdf_path) {
      initialForcedScrollDoneRef.current = false;
      userInteractedRef.current = false;
      setSyncMode('auto');
      finalRefreshDoneRef.current = false;

      if (process.env.NODE_ENV !== 'production') {
        console.debug('[useDocumentLifecycle] reset guards for new PDF');
      }

      // Clear any pending timers/anchors from previous renders
      try {
        pendingForcedAnchorRef.current = null;
        if (pendingForcedTimerRef.current) {
          window.clearInterval(pendingForcedTimerRef.current);
          pendingForcedTimerRef.current = null;
        }
        if (pendingForcedOneShotRef.current) {
          window.clearTimeout(pendingForcedOneShotRef.current);
          pendingForcedOneShotRef.current = null;
        }
        if (pendingFallbackTimerRef.current) {
          window.clearInterval(pendingFallbackTimerRef.current);
          pendingFallbackTimerRef.current = null;
        }
        pendingFallbackRef.current = null;
      } catch (e) {
        void e;
      }
    }
  }, [
    compileStatus,
    setSyncMode,
    finalRefreshDoneRef,
    initialForcedScrollDoneRef,
    userInteractedRef,
    pendingForcedAnchorRef,
    pendingForcedTimerRef,
    pendingForcedOneShotRef,
    pendingFallbackTimerRef,
    pendingFallbackRef,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        if (pendingForcedTimerRef.current) {
          window.clearInterval(pendingForcedTimerRef.current);
          pendingForcedTimerRef.current = null;
        }
        if (pendingForcedOneShotRef.current) {
          window.clearTimeout(pendingForcedOneShotRef.current);
          pendingForcedOneShotRef.current = null;
        }
        if (pendingFallbackTimerRef.current) {
          window.clearInterval(pendingFallbackTimerRef.current);
          pendingFallbackTimerRef.current = null;
        }
      } catch (e) {
        void e;
      }
    };
  }, [pendingForcedTimerRef, pendingForcedOneShotRef, pendingFallbackTimerRef]);
}
