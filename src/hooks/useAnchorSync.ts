/**
 * Hook to handle active anchor synchronization logic.
 * Manages syncing the PDF preview to the active anchor in the editor.
 */

import { useEffect } from 'react';
import { TIMING } from '../constants/timing';

interface UseAnchorSyncParams {
  activeAnchorId: string | null;
  syncMode: 'auto' | 'locked-to-editor' | 'locked-to-pdf';
  containerRef: React.RefObject<HTMLDivElement | null>;
  anchorOffsetsRef: React.MutableRefObject<Map<string, number>>;
  sourceMapRef: React.MutableRefObject<{ anchors: Array<{ id: string }> } | null>;
  isTypingRef: React.MutableRefObject<boolean>;
  userInteractedRef: React.MutableRefObject<boolean>;
  syncModeRef: React.MutableRefObject<'auto' | 'locked-to-editor' | 'locked-to-pdf'>;
  initialForcedScrollDoneRef: React.MutableRefObject<boolean>;
  pendingForcedAnchorRef: React.MutableRefObject<string | null>;
  scrollToAnchor: (anchorId: string, center?: boolean, force?: boolean) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recomputeAnchorOffsets: (map: any) => void;
  consumePendingAnchor: () => void;
}

export function useAnchorSync(params: UseAnchorSyncParams): void {
  const {
    activeAnchorId,
    syncMode,
    containerRef,
    anchorOffsetsRef,
    sourceMapRef,
    isTypingRef,
    userInteractedRef,
    syncModeRef,
    initialForcedScrollDoneRef,
    pendingForcedAnchorRef,
    scrollToAnchor,
    recomputeAnchorOffsets,
    consumePendingAnchor,
  } = params;

  // Main activeAnchorId sync effect
  useEffect(() => {
    const el = containerRef.current;
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[useAnchorSync] activeAnchorId effect start', {
        activeAnchorId,
        syncMode,
        isTyping: isTypingRef.current,
        offsetsSize: anchorOffsetsRef.current.size,
        scrollTop: el?.scrollTop,
      });
    }

    if (!activeAnchorId) {
      if (process.env.NODE_ENV !== 'production')
        console.debug('[useAnchorSync] aborted: no-active-anchor');
      return;
    }

    if (syncMode === 'locked-to-pdf' && initialForcedScrollDoneRef.current) {
      if (process.env.NODE_ENV !== 'production')
        console.debug('[useAnchorSync] aborted: locked-to-pdf and initial done');
      return;
    }

    // Try to ensure we have offsets for this anchor
    const offset = anchorOffsetsRef.current.get(activeAnchorId);
    if (offset === undefined) {
      if (process.env.NODE_ENV !== 'production')
        console.debug('[useAnchorSync] offset missing; attempting recompute', { activeAnchorId });

      recomputeAnchorOffsets(sourceMapRef.current);

      const after = anchorOffsetsRef.current.get(activeAnchorId);
      if (after !== undefined) {
        if (process.env.NODE_ENV !== 'production')
          console.debug('[useAnchorSync] offset obtained after recompute', {
            activeAnchorId,
            offset: after,
          });
        scrollToAnchor(activeAnchorId);
        return;
      }

      // Register a pending forced anchor
      if (
        userInteractedRef.current ||
        syncModeRef.current === 'locked-to-pdf'
      ) {
        if (process.env.NODE_ENV !== 'production')
          console.debug(
            '[useAnchorSync] not registering pendingForcedAnchor due to user interaction or locked sync',
            { activeAnchorId, userInteracted: userInteractedRef.current, syncMode }
          );
        return;
      }

      pendingForcedAnchorRef.current = activeAnchorId;

      // Poll quickly for offsets to appear (fast-path)
      let attempts = 0;
      const pollIv = window.setInterval(() => {
        if (!containerRef.current) {
          window.clearInterval(pollIv);
          return;
        }
        attempts += 1;
        const nowOff = anchorOffsetsRef.current.get(activeAnchorId);
        if (nowOff !== undefined) {
          window.clearInterval(pollIv);
          consumePendingAnchor();
          return;
        }
        if (attempts >= TIMING.MAX_OFFSET_POLL_ATTEMPTS) {
          window.clearInterval(pollIv);
          if (process.env.NODE_ENV !== 'production')
            console.debug('[useAnchorSync] offset poll timed out for anchor', { activeAnchorId });
        }
      }, 120);
      return;
    }

    // Skip auto-scroll to top if preview is scrolled elsewhere
    if (offset === 0 && el && Math.abs((el.scrollTop ?? 0) - 0) > 10) {
      if (process.env.NODE_ENV !== 'production')
        console.debug('[useAnchorSync] skipping auto-scroll to top (suspicious zero offset)', {
          activeAnchorId,
          currentTop: el.scrollTop,
        });
      return;
    }

    // Perform immediate sync to the editor anchor
    scrollToAnchor(activeAnchorId, false, true);
  }, [
    activeAnchorId,
    syncMode,
    scrollToAnchor,
    recomputeAnchorOffsets,
    consumePendingAnchor,
    containerRef,
    anchorOffsetsRef,
    sourceMapRef,
    isTypingRef,
    userInteractedRef,
    syncModeRef,
    initialForcedScrollDoneRef,
    pendingForcedAnchorRef,
  ]);

  // Debug logging effect
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[useAnchorSync] activeAnchorId change', {
        activeAnchorId,
        syncMode,
        isTyping: isTypingRef.current,
      });
    }
  }, [activeAnchorId, syncMode, isTypingRef]);
}
