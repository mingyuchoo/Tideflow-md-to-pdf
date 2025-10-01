import { useRef, useEffect, useCallback } from 'react';
import type { SyncMode } from '../types';
import { TIMING } from '../constants/timing';

interface UsePendingScrollArgs {
  pendingForcedAnchorRef: { current: string | null };
  pendingForcedTimerRef: { current: number | null };
  pendingForcedOneShotRef?: { current: number | null };
  isTypingRef: { current: boolean };
  initialForcedScrollDoneRef: { current: boolean };
  userInteractedRef: { current: boolean };
  syncModeRef: { current: SyncMode };
  anchorOffsetsRef: { current: Map<string, number> };
  scrollToAnchor: (id: string, center?: boolean, force?: boolean) => void;
}

// Convert to a proper React hook so callers receive stable callbacks
// and we avoid creating multiple independent timer instances when the
// hook is invoked from multiple places. Internal references are stored
// on a ref to keep the callbacks stable while still reading up-to-date
// values.
export function usePendingScroll(args: UsePendingScrollArgs) {
  const argsRef = useRef<UsePendingScrollArgs>(args);
  useEffect(() => { argsRef.current = args; }, [args]);

  const consumePendingAnchor = useCallback((checkOffset = false) => {
    const {
      pendingForcedAnchorRef,
      pendingForcedTimerRef,
      isTypingRef,
      initialForcedScrollDoneRef,
      userInteractedRef,
      syncModeRef,
      anchorOffsetsRef,
      scrollToAnchor,
    } = argsRef.current;
    const pending = pendingForcedAnchorRef.current;
    if (checkOffset && pending && anchorOffsetsRef.current.get(pending) === undefined) return;
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[usePendingScroll] checking pending anchor', { pending, initialForced: initialForcedScrollDoneRef.current, isTyping: isTypingRef.current, userInteracted: userInteractedRef.current, syncMode: syncModeRef.current });
    }
    const allowDespiteInitial = Boolean(checkOffset && pending && anchorOffsetsRef.current.get(pending) !== undefined);
    const allowDespiteTyping = allowDespiteInitial;

    if (pending && (!initialForcedScrollDoneRef.current || allowDespiteInitial)) {
      if (userInteractedRef.current || syncModeRef.current === 'locked-to-pdf') {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[usePendingScroll] skipping pending forced anchor due to user interaction or locked sync', { pending });
        }
      } else if (!isTypingRef.current || allowDespiteTyping) {
        scrollToAnchor(pending, true, true);
        pendingForcedAnchorRef.current = null;
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[usePendingScroll] pendingForcedAnchor consumed (performed scroll)', { pending });
        }
      } else {
        if (!pendingForcedTimerRef.current) {
          pendingForcedTimerRef.current = window.setInterval(() => {
            if (!isTypingRef.current) {
              if (pendingForcedTimerRef.current) {
                window.clearInterval(pendingForcedTimerRef.current);
                pendingForcedTimerRef.current = null;
              }
              const a = pendingForcedAnchorRef.current;
              pendingForcedAnchorRef.current = null;
              if (a) {
                scrollToAnchor(a, true, true);
              }
            }
          }, TIMING.OFFSET_POLL_TIMEOUT_MS);
          if (process.env.NODE_ENV !== 'production') console.debug('[usePendingScroll] pendingForcedTimer created');
        }
      }
    }
  }, []);

  const registerPendingAnchor = useCallback((anchorId: string) => {
    const {
      pendingForcedAnchorRef,
      pendingForcedTimerRef,
      pendingForcedOneShotRef,
      isTypingRef,
      scrollToAnchor,
    } = argsRef.current;

    pendingForcedAnchorRef.current = anchorId;
    if (process.env.NODE_ENV !== 'production') console.debug('[usePendingScroll] pendingForcedAnchor registered', { anchorId });

    try {
      if (pendingForcedOneShotRef) {
        if (pendingForcedOneShotRef.current) { window.clearTimeout(pendingForcedOneShotRef.current); pendingForcedOneShotRef.current = null; }
        pendingForcedOneShotRef.current = window.setTimeout(() => {
          try {
            // Delegate to consumePendingAnchor with checkOffset so the
            // special-case logic is honored.
            consumePendingAnchor(true);
            if (pendingForcedOneShotRef.current) { window.clearTimeout(pendingForcedOneShotRef.current); pendingForcedOneShotRef.current = null; }
          } catch (e) { void e; }
        }, TIMING.PENDING_SCROLL_ONE_SHOT_MS);
      }
    } catch (e) { void e; }

    if (isTypingRef.current) {
      if (pendingForcedTimerRef.current) {
        window.clearInterval(pendingForcedTimerRef.current);
        pendingForcedTimerRef.current = null;
      }
      pendingForcedTimerRef.current = window.setInterval(() => {
        if (!isTypingRef.current) {
          if (pendingForcedTimerRef.current) { window.clearInterval(pendingForcedTimerRef.current); pendingForcedTimerRef.current = null; }
          const a = pendingForcedAnchorRef.current;
          pendingForcedAnchorRef.current = null;
          if (a) { scrollToAnchor(a, true, true); }
        }
      }, TIMING.OFFSET_POLL_TIMEOUT_MS);
      if (process.env.NODE_ENV !== 'production') console.debug('[usePendingScroll] pendingForcedTimer started');
    }
  }, [consumePendingAnchor]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      const { pendingForcedTimerRef, pendingForcedOneShotRef } = argsRef.current;
      try {
        if (pendingForcedTimerRef.current) { window.clearInterval(pendingForcedTimerRef.current); pendingForcedTimerRef.current = null; }
        if (pendingForcedOneShotRef && pendingForcedOneShotRef.current) { window.clearTimeout(pendingForcedOneShotRef.current); pendingForcedOneShotRef.current = null; }
      } catch (e) { void e; }
    };
  }, []);

  return { registerPendingAnchor, consumePendingAnchor };
}