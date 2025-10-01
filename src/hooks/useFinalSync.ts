/**
 * Hook to handle mount/final refresh sync and typing idle sync.
 * Manages complex startup sync scenarios and typing-deferred scrolls.
 */

import { useEffect } from 'react';
import { computeFallbackOffsets } from '../utils/offsets';
import type { SourceMap } from '../types';

interface UseFinalSyncParams {
  rendering: boolean;
  isTyping: boolean;
  compileStatus: { status: string; pdf_path?: string };
  sourceMap: SourceMap | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  anchorOffsetsRef: React.MutableRefObject<Map<string, number>>;
  pdfMetricsRef: React.MutableRefObject<{ page: number; height: number; scale: number }[]>;
  sourceMapRef: React.MutableRefObject<SourceMap | null>;
  activeAnchorRef: React.MutableRefObject<string | null>;
  syncModeRef: React.MutableRefObject<'auto' | 'locked-to-editor' | 'locked-to-pdf'>;
  userInteractedRef: React.MutableRefObject<boolean>;
  initialForcedScrollDoneRef: React.MutableRefObject<boolean>;
  startupOneShotAppliedRef: React.MutableRefObject<boolean>;
  finalRefreshDoneRef: React.MutableRefObject<boolean>;
  scrollToAnchor: (anchorId: string, center?: boolean, force?: boolean) => void;
  recomputeAnchorOffsets: (map: SourceMap | null) => void;
  registerPendingAnchor: (anchorId: string) => void;
  consumePendingAnchor: (force?: boolean) => void;
}

export function useFinalSync(params: UseFinalSyncParams): void {
  const {
    rendering,
    isTyping,
    compileStatus,
    sourceMap,
    containerRef,
    anchorOffsetsRef,
    pdfMetricsRef,
    sourceMapRef,
    activeAnchorRef,
    syncModeRef,
    userInteractedRef,
    initialForcedScrollDoneRef,
    startupOneShotAppliedRef,
    finalRefreshDoneRef,
    scrollToAnchor,
    recomputeAnchorOffsets,
    registerPendingAnchor,
    consumePendingAnchor,
  } = params;

  // Typing idle sync effect
  useEffect(() => {
    if (isTyping) return;
    if (initialForcedScrollDoneRef.current) return;
    if (syncModeRef.current === 'locked-to-pdf') return;
    if (anchorOffsetsRef.current.size === 0) return;

    const anchorId = activeAnchorRef.current ?? sourceMapRef.current?.anchors[0]?.id;
    if (!anchorId) return;

    scrollToAnchor(anchorId, true, true);
  }, [
    isTyping,
    scrollToAnchor,
    activeAnchorRef,
    anchorOffsetsRef,
    initialForcedScrollDoneRef,
    sourceMapRef,
    syncModeRef,
  ]);

  // Mount effect - handle prior compiledAt
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') console.log('[useFinalSync] mount');

    // Perform mount final sync if needed
    try {
      if (!finalRefreshDoneRef.current) {
        if (process.env.NODE_ENV !== 'production')
          console.debug('[useFinalSync] detected prior compiledAt, running final-sync');

        recomputeAnchorOffsets(sourceMapRef.current);
        consumePendingAnchor(true);

        // Ensure one-shot startup sync
        try {
          if (
            !startupOneShotAppliedRef.current &&
            !initialForcedScrollDoneRef.current &&
            !userInteractedRef.current &&
            syncModeRef.current !== 'locked-to-pdf'
          ) {
            const map = sourceMapRef.current;
            const anchorId = activeAnchorRef.current ?? map?.anchors?.[0]?.id ?? null;

            if (anchorId) {
              let off = anchorOffsetsRef.current.get(anchorId);

              // Compute conservative fallback offsets if none exist
              if (
                off === undefined &&
                map &&
                map.anchors &&
                map.anchors.length > 0 &&
                containerRef.current
              ) {
                const el = containerRef.current;
                const fallback = computeFallbackOffsets(
                  map.anchors,
                  el.scrollHeight,
                  el.clientHeight
                );
                anchorOffsetsRef.current = fallback;
                if (process.env.NODE_ENV !== 'production')
                  console.debug('[useFinalSync] mount applied fallback offsets', {
                    count: fallback.size,
                  });
                off = anchorOffsetsRef.current.get(anchorId);
              }

              if (off !== undefined) {
                scrollToAnchor(anchorId, true, true);
                startupOneShotAppliedRef.current = true;
              } else {
                registerPendingAnchor(anchorId);
              }
            }
          }
        } catch (e) {
          void e;
        }

        finalRefreshDoneRef.current = true;
      }
    } catch (err) {
      if (process.env.NODE_ENV !== 'production')
        console.debug('[useFinalSync] mount final-sync error', err);
    }

    return () => {
      if (process.env.NODE_ENV !== 'production') console.log('[useFinalSync] unmount');
    };
  }, [
    recomputeAnchorOffsets,
    consumePendingAnchor,
    registerPendingAnchor,
    scrollToAnchor,
    activeAnchorRef,
    anchorOffsetsRef,
    containerRef,
    finalRefreshDoneRef,
    initialForcedScrollDoneRef,
    sourceMapRef,
    startupOneShotAppliedRef,
    syncModeRef,
    userInteractedRef,
  ]);

  // Immediate startup sync on document open
  useEffect(() => {
    const reasons: string[] = [];
    if (rendering) reasons.push('rendering');
    if (compileStatus.status !== 'ok' || !compileStatus.pdf_path) reasons.push('no-pdf');
    if (!containerRef.current) reasons.push('no-container');
    if (!activeAnchorRef.current) reasons.push('no-active-anchor');
    if (initialForcedScrollDoneRef.current) reasons.push('initial-forced-done');
    if (userInteractedRef.current) reasons.push('user-interacted');
    if (containerRef.current && (containerRef.current.scrollHeight ?? 0) === 0)
      reasons.push('empty-scrollHeight');

    if (reasons.length > 0) {
      if (process.env.NODE_ENV !== 'production') {
        const safeScrollHeight = containerRef.current ? containerRef.current.scrollHeight : null;
        console.debug('[useFinalSync] immediate startup sync skipped:', reasons.join(', '), {
          rendering,
          compileStatus,
          activeAnchor: activeAnchorRef.current,
          initialForced: initialForcedScrollDoneRef.current,
          userInteracted: userInteractedRef.current,
          scrollHeight: safeScrollHeight,
        });
      }
      return;
    }

    const anchorId = activeAnchorRef.current!;
    const el = containerRef.current!;

    // If we already have precise offset, use it
    const precise = anchorOffsetsRef.current.get(anchorId);
    if (precise !== undefined) {
      if (syncModeRef.current !== 'locked-to-pdf') {
        scrollToAnchor(anchorId, true, true);
      }
      return;
    }

    // Compute fallback position
    const anchors = sourceMapRef.current?.anchors ?? [];
    const fallbackMap = computeFallbackOffsets(anchors, el.scrollHeight, el.clientHeight);
    const pos =
      fallbackMap.get(anchorId) ?? Math.round(Math.max(0, el.scrollHeight - el.clientHeight) * 0.02);

    anchorOffsetsRef.current.set(anchorId, pos);
    if (syncModeRef.current !== 'locked-to-pdf') {
      scrollToAnchor(anchorId, true, true);
    }
  }, [
    rendering,
    compileStatus,
    scrollToAnchor,
    anchorOffsetsRef,
    containerRef,
    initialForcedScrollDoneRef,
    sourceMapRef,
    syncModeRef,
    userInteractedRef,
    activeAnchorRef,
  ]);

  // Final refresh after rendering settles
  useEffect(() => {
    if (finalRefreshDoneRef.current) return;
    if (rendering) return;
    if (compileStatus.status !== 'ok' || !compileStatus.pdf_path) return;

    const el = containerRef.current;
    if (!el) return;
    if (pdfMetricsRef.current.length === 0) return;

    const map = sourceMapRef.current;
    if (!map || map.anchors.length === 0) return;

    if (userInteractedRef.current) return;
    if (syncModeRef.current === 'locked-to-pdf') return;

    finalRefreshDoneRef.current = true;
    if (process.env.NODE_ENV !== 'production')
      console.debug('[useFinalSync] performing final startup refresh');

    setTimeout(() => {
      try {
        recomputeAnchorOffsets(map);
        const anchorId = activeAnchorRef.current ?? map.anchors[0]?.id ?? null;

        if (anchorId) {
          const off = anchorOffsetsRef.current.get(anchorId);
          if (off !== undefined) {
            scrollToAnchor(anchorId, true, true);
            initialForcedScrollDoneRef.current = true;
            startupOneShotAppliedRef.current = true;
          } else {
            registerPendingAnchor(anchorId);
            consumePendingAnchor();
          }
        }
      } catch (e) {
        void e;
      }
    }, 400);
  }, [
    rendering,
    compileStatus.status,
    compileStatus.pdf_path,
    scrollToAnchor,
    recomputeAnchorOffsets,
    registerPendingAnchor,
    consumePendingAnchor,
    sourceMap,
    activeAnchorRef,
    anchorOffsetsRef,
    containerRef,
    finalRefreshDoneRef,
    initialForcedScrollDoneRef,
    pdfMetricsRef,
    sourceMapRef,
    startupOneShotAppliedRef,
    syncModeRef,
    userInteractedRef,
  ]);
}
