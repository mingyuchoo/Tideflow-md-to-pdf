/**
 * Hook to handle startup synchronization logic in PDFPreview.
 * Manages mount signal detection, resilient startup polling, and final refresh.
 */

import { useEffect, useState } from 'react';
import { computeFallbackOffsets } from '../utils/offsets';
import { TIMING } from '../constants/timing';
import type { ScrollStateRefs } from './useScrollState';
import type { OffsetManagerRefs } from './useOffsetManager';

export interface UseStartupSyncParams {
  compileStatus: { status: string; pdf_path?: string | null };
  scrollStateRefs: ScrollStateRefs;
  offsetManagerRefs: OffsetManagerRefs;
  recomputeAnchorOffsets: (map: import('../types').SourceMap | null) => void;
  scrollToAnchor: (id: string, center?: boolean, force?: boolean) => void;
}

export interface UseStartupSyncResult {
  mountSignal: number;
}

/**
 * Custom hook that manages all startup synchronization behaviors:
 * - Mount signal detection (waits for container to be connected)
 * - Resilient startup polling (retries sync until timeout)
 * - Final refresh (one-shot sync after everything is ready)
 */
export function useStartupSync(params: UseStartupSyncParams): UseStartupSyncResult {
  const {
    compileStatus,
    scrollStateRefs,
    offsetManagerRefs,
    recomputeAnchorOffsets,
    scrollToAnchor,
  } = params;

  const {
    containerRef,
    syncModeRef,
    activeAnchorRef,
    userInteractedRef,
    initialForcedScrollDoneRef,
    startupOneShotAppliedRef,
  } = scrollStateRefs;

  const { anchorOffsetsRef, pdfMetricsRef, sourceMapRef } = offsetManagerRefs;

  // Signal value that flips when the container DOM node becomes available
  const [mountSignal, setMountSignal] = useState<number>(0);

  // Mount signal detection: wait for container to be connected to DOM
  useEffect(() => {
    let cancelled = false;
    const start = Date.now();
    const iv = window.setInterval(() => {
      if (cancelled) return;
      try {
        if (containerRef.current && containerRef.current.isConnected) {
          setMountSignal(Date.now());
          window.clearInterval(iv);
          return;
        }
        if (Date.now() - start > 2000) {
          window.clearInterval(iv);
        }
      } catch {
        // swallow
      }
    }, 80);

    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, [containerRef]);

  // Resilient one-shot startup poll: try to kickstart autosync on app
  // startup by recomputing offsets and performing a forced scroll once
  // we detect metrics, sourceMap and container are available. This
  // retries briefly (max ~5s) to tolerate races during initial layout.
  useEffect(() => {
    let cancelled = false;
    const start = Date.now();
    const iv = window.setInterval(() => {
      if (cancelled) return;
      try {
        if (initialForcedScrollDoneRef.current) {
          window.clearInterval(iv);
          return;
        }

        // Basic readiness checks
        const el = containerRef.current;
        if (!el || !el.isConnected) return;
        if (compileStatus.status !== 'ok' || !compileStatus.pdf_path) return;
        if (pdfMetricsRef.current.length === 0) return;

        const map = sourceMapRef.current;
        if (!map || map.anchors.length === 0) return;

        // Respect user interaction and locked-sync
        if (userInteractedRef.current) return;
        if (syncModeRef.current === 'locked-to-pdf') return;

        // Recompute offsets and attempt a forced startup scroll
        recomputeAnchorOffsets(map);

        // If recompute didn't produce offsets yet, create a conservative
        // fallback map based on anchor index and container height so we
        // can at least perform a sensible startup scroll immediately.
        if (anchorOffsetsRef.current.size === 0) {
          const anchors = map.anchors ?? [];
          const el = containerRef.current;
          if (el) {
            const fallback = computeFallbackOffsets(
              anchors,
              el.scrollHeight,
              el.clientHeight
            );
            anchorOffsetsRef.current = fallback;
            if (process.env.NODE_ENV !== 'production') {
              console.debug('[useStartupSync] startup poll applied fallback offsets', {
                count: fallback.size,
              });
            }
          }
        }

        const anchorId = activeAnchorRef.current ?? map.anchors[0]?.id;
        if (
          anchorId &&
          !initialForcedScrollDoneRef.current &&
          !startupOneShotAppliedRef.current
        ) {
          // perform a forced scroll based on fallback offsets and mark
          // the one-shot as applied so parallel codepaths don't repeat it.
          scrollToAnchor(anchorId, true, true);
          initialForcedScrollDoneRef.current = true;
          startupOneShotAppliedRef.current = true;
          window.clearInterval(iv);
          return;
        }

        if (Date.now() - start > TIMING.STARTUP_SYNC_TIMEOUT_MS) {
          window.clearInterval(iv);
        }
      } catch {
        // swallow and keep trying until timeout
      }
    }, 140);

    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, [
    compileStatus.status,
    compileStatus.pdf_path,
    recomputeAnchorOffsets,
    scrollToAnchor,
    containerRef,
    pdfMetricsRef,
    sourceMapRef,
    userInteractedRef,
    syncModeRef,
    anchorOffsetsRef,
    activeAnchorRef,
    initialForcedScrollDoneRef,
    startupOneShotAppliedRef,
  ]);

  // One-shot final autosync when app is fully loaded and preview is mounted
  useEffect(() => {
    // Only run once per mount
    let didRun = false;

    const runFinalSync = () => {
      if (didRun) return;
      didRun = true;

      // Wait for PDF metrics, sourceMap, and container
      const waitReady = () =>
        new Promise<void>((resolve) => {
          const start = Date.now();
          const iv = window.setInterval(() => {
            if (
              pdfMetricsRef.current.length > 0 &&
              sourceMapRef.current &&
              sourceMapRef.current.anchors.length > 0 &&
              containerRef.current
            ) {
              window.clearInterval(iv);
              resolve();
              return;
            }
            if (Date.now() - start > TIMING.STARTUP_SYNC_TIMEOUT_MS) {
              window.clearInterval(iv);
              resolve();
            }
          }, TIMING.OFFSET_POLL_INTERVAL_MS);
        });

      waitReady().then(() => {
        // Only run if not already done by other startup syncs
        if (
          !initialForcedScrollDoneRef.current &&
          !userInteractedRef.current &&
          syncModeRef.current !== 'locked-to-pdf'
        ) {
          const map = sourceMapRef.current;
          if (map) {
            recomputeAnchorOffsets(map);
            const anchorId = activeAnchorRef.current ?? map.anchors[0]?.id;
            if (anchorId) {
              scrollToAnchor(anchorId, true, true);
              initialForcedScrollDoneRef.current = true;
            }
          }
        }
      });
    };

    // Run final sync after a short delay
    const timeout = window.setTimeout(runFinalSync, TIMING.STARTUP_REFRESH_DELAY_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    recomputeAnchorOffsets,
    scrollToAnchor,
    pdfMetricsRef,
    sourceMapRef,
    containerRef,
    initialForcedScrollDoneRef,
    userInteractedRef,
    syncModeRef,
    activeAnchorRef,
  ]);

  return { mountSignal };
}
