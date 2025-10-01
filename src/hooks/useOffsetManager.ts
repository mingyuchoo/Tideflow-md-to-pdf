/**
 * Hook to manage PDF anchor offsets and metrics.
 * Handles offset computation, fallback generation, and metrics tracking.
 */

import { useCallback, useRef } from 'react';
import { computeAnchorOffsets } from '../utils/offsets';
import type { SourceMap } from '../types';
import type { ScrollStateRefs } from './useScrollState';

export interface OffsetManagerRefs {
  anchorOffsetsRef: React.MutableRefObject<Map<string, number>>;
  pdfMetricsRef: React.MutableRefObject<{ page: number; height: number; scale: number }[]>;
  sourceMapRef: React.MutableRefObject<SourceMap | null>;
}

export interface UseOffsetManagerParams {
  sourceMap: SourceMap | null;
  scrollStateRefs: Pick<
    ScrollStateRefs,
    | 'syncModeRef'
    | 'activeAnchorRef'
    | 'userInteractedRef'
    | 'initialForcedScrollDoneRef'
  >;
  registerPendingAnchor?: (anchorId: string) => void;
}

export interface UseOffsetManagerResult extends OffsetManagerRefs {
  recomputeAnchorOffsets: (map: SourceMap | null) => void;
}

export function useOffsetManager(
  params: UseOffsetManagerParams
): UseOffsetManagerResult {
  const { sourceMap, scrollStateRefs, registerPendingAnchor } = params;

  const anchorOffsetsRef = useRef<Map<string, number>>(new Map());
  const pdfMetricsRef = useRef<{ page: number; height: number; scale: number }[]>([]);
  const sourceMapRef = useRef<SourceMap | null>(sourceMap);

  // Keep sourceMapRef in sync
  sourceMapRef.current = sourceMap;

  const recomputeAnchorOffsets = useCallback(
    (map: SourceMap | null) => {
      // Delegate to the shared helper which computes offsets and returns a
      // small sample useful for logging. Keep the same defensive behaviors
      // as before (don't clear existing offsets when metrics are missing,
      // and register a pending forced anchor on first-populate).
      const metrics = [...pdfMetricsRef.current].sort((a, b) => a.page - b.page);
      const { offsets, samples } = computeAnchorOffsets(metrics, map);

      if (offsets.size > 0) {
        const prevSize = anchorOffsetsRef.current.size;
        anchorOffsetsRef.current = offsets;

        if (
          prevSize === 0 &&
          !scrollStateRefs.initialForcedScrollDoneRef.current &&
          !scrollStateRefs.userInteractedRef.current &&
          scrollStateRefs.syncModeRef.current !== 'locked-to-pdf'
        ) {
          const anchorId =
            scrollStateRefs.activeAnchorRef.current ??
            sourceMapRef.current?.anchors[0]?.id;

          if (anchorId && registerPendingAnchor) {
            registerPendingAnchor(anchorId);
          }
        }
      } else {
        // keep existing offsets (no-op) — caller may retry and then replace.
      }

      if (process.env.NODE_ENV !== 'production') {
        console.log(
          `[useOffsetManager] recomputeAnchorOffsets done: offsets=${offsets.size}, samples=${JSON.stringify(samples)}, totalOffsets=${anchorOffsetsRef.current.size}`
        );
      }
    },
    [scrollStateRefs, registerPendingAnchor]
  );

  return {
    anchorOffsetsRef,
    pdfMetricsRef,
    sourceMapRef,
    recomputeAnchorOffsets,
  };
}
