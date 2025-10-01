/**
 * Hook to handle custom event listeners for resume sync and final sync.
 */

import { useEffect } from 'react';
import type { SourceMap } from '../types';

interface UsePreviewEventsParams {
  scrollToAnchor: (anchorId: string, center?: boolean, force?: boolean) => void;
  recomputeAnchorOffsets: (map: SourceMap | null) => void;
  consumePendingAnchor: (force?: boolean) => void;
  sourceMapRef: React.MutableRefObject<SourceMap | null>;
}

export function usePreviewEvents(params: UsePreviewEventsParams): void {
  const { scrollToAnchor, recomputeAnchorOffsets, consumePendingAnchor, sourceMapRef } = params;

  useEffect(() => {
    const onResume = (ev: Event) => {
      try {
        const ce = ev as CustomEvent<{ anchor: string }>;
        const anchor = ce?.detail?.anchor;
        if (anchor) {
          // Force the resume to center and treat as user-initiated resume
          scrollToAnchor(anchor, true);
        }
      } catch (e) {
        void e;
      }
    };

    const onFinal = () => {
      try {
        if (process.env.NODE_ENV !== 'production')
          console.debug('[usePreviewEvents] pdf-preview-final-sync received');

        recomputeAnchorOffsets(sourceMapRef.current);
        consumePendingAnchor(true);
      } catch (e) {
        void e;
      }
    };

    window.addEventListener('pdf-preview-resume-sync', onResume as EventListener);
    window.addEventListener('pdf-preview-final-sync', onFinal as EventListener);

    return () => {
      window.removeEventListener('pdf-preview-resume-sync', onResume as EventListener);
      window.removeEventListener('pdf-preview-final-sync', onFinal as EventListener);
    };
  }, [scrollToAnchor, recomputeAnchorOffsets, consumePendingAnchor, sourceMapRef]);
}
