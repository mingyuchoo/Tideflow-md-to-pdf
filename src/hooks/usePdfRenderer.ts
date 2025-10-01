import { useEffect } from 'react';
import { renderPdfPages } from '../utils/pdfRenderer';
import { extractOffsetsFromPdfText } from '../utils/offsets';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { SourceMap } from '../types';

interface UsePdfRendererArgs {
  compileStatus: { status: string; pdf_path?: string | null };
  containerRef: React.RefObject<HTMLElement | null>;
  cancelRenderRef: { current: { canceled: boolean } };
  // mutable refs shared with component
  pdfMetricsRef: { current: { page: number; height: number; scale: number }[] };
  anchorOffsetsRef: { current: Map<string, number> };
  sourceMapRef: { current: SourceMap | null };
  // New refs to respect manual user interaction and sync mode
  userInteractedRef: { current: boolean };
  syncModeRef: { current: import('../types').SyncMode };
  isTypingRef: { current: boolean };
  pendingFallbackRef: { current: Map<string, number> | null };
  pendingFallbackTimerRef: { current: number | null };
  pendingForcedTimerRef: { current: number | null };
  pendingForcedAnchorRef: { current: string | null };
  pendingForcedOneShotRef?: { current: number | null };
  // accept external pending-scroll handlers so the component can
  // create a single stable instance and share it across renderer
  // and preview logic.
  registerPendingAnchor?: (anchorId: string) => void;
  consumePendingAnchor?: (checkOffset?: boolean) => void;
  initialForcedScrollDoneRef: { current: boolean };
  setRendering: (v: boolean) => void;
  setPdfError: (v: string | null) => void;
  recomputeAnchorOffsets: (map: SourceMap | null) => void;
  scrollToAnchor: (id: string, center?: boolean, force?: boolean) => void;
  mountSignal?: number;
}

export function usePdfRenderer(args: UsePdfRendererArgs) {
  const {
    compileStatus,
    containerRef,
    cancelRenderRef,
    pdfMetricsRef,
    anchorOffsetsRef,
    sourceMapRef,
    userInteractedRef,
    syncModeRef,
    isTypingRef,
    pendingFallbackRef,
    pendingFallbackTimerRef,
    pendingForcedTimerRef,
    pendingForcedAnchorRef,
    initialForcedScrollDoneRef,
    setRendering,
    setPdfError,
    recomputeAnchorOffsets,
    scrollToAnchor,
  } = args;

  // prefer externally supplied handlers to avoid multiple hook
  // instances and duplicated timers; call fallbacks if not provided
  const registerPendingAnchor = args.registerPendingAnchor;
  const consumePendingAnchor = args.consumePendingAnchor;

  useEffect(() => {
    const localCancel = cancelRenderRef.current;
    const load = async () => {
      if (compileStatus.status !== 'ok' || !compileStatus.pdf_path) {
        setPdfError(null);
        if (containerRef.current && containerRef.current.isConnected) {
          try {
            while (containerRef.current.firstChild) containerRef.current.removeChild(containerRef.current.firstChild);
          } catch { try { containerRef.current.innerHTML = ''; } catch { /* swallow */ } }
        }
        pdfMetricsRef.current = [];
        anchorOffsetsRef.current = new Map();
        return;
      }
      if (!containerRef.current) return;
      setRendering(true);
      setPdfError(null);
      localCancel.canceled = false;
      // Reset the one-shot forced-scroll guard for this new PDF so we can
      // attempt an initial auto-sync. This avoids a stale true value from
      // previous render passes preventing the automatic scroll.
      initialForcedScrollDoneRef.current = false;
      try {
        // Ensure file paths are converted to a browser-loadable URL when
        // running inside Tauri; convertFileSrc handles file:// -> http(s)
        // served blob URLs required by pdf.js.
        const fileUrl = convertFileSrc(compileStatus.pdf_path ?? '') + `?v=${Date.now()}`;
        const renderScale = 1.0;
        const { doc, metrics } = await renderPdfPages(fileUrl, containerRef.current, renderScale, localCancel);
        if (localCancel.canceled) return;
        pdfMetricsRef.current = metrics;

        const tryComputeAndMaybeScroll = async () => {
          const map = sourceMapRef.current;
          if (!map) return; // SourceMap should already be set by render event

          recomputeAnchorOffsets(map);

          // Always attempt PDF-text extraction as fallback if typst query produced no anchors
          // This happens naturally when sourceMap.anchors.length === 0
          try {
            if (map.anchors.length === 0) {
              if (process.env.NODE_ENV !== 'production') console.debug('[usePdfRenderer] no typst anchors, running PDF-text extraction fallback');
              try {
                const extracted = await extractOffsetsFromPdfText(doc, metrics, map.anchors, renderScale);
                      if (extracted.size > 0) {
                        const prev = anchorOffsetsRef.current.size;
                        anchorOffsetsRef.current = extracted;
                        if (prev === 0 && extracted.size > 0 && !initialForcedScrollDoneRef.current && !userInteractedRef.current && syncModeRef.current !== 'locked-to-pdf') {
                          const anchorId = map.anchors[0]?.id ?? null;
                          if (anchorId) {
                            if (registerPendingAnchor) {
                              registerPendingAnchor(anchorId);
                              if (process.env.NODE_ENV !== 'production') console.debug('[usePdfRenderer] pendingForcedAnchor registered (extraction, typst failed) via shared handler', { anchorId });
                            } else {
                              pendingForcedAnchorRef.current = anchorId;
                              if (process.env.NODE_ENV !== 'production') console.debug('[usePdfRenderer] pendingForcedAnchor registered (extraction, typst failed)', { anchorId });
                            }
                          }
                        }
                      }
              } catch (e) {
                if (process.env.NODE_ENV !== 'production') console.debug('[usePdfRenderer] immediate extraction failed', e);
              }
            }
          } catch (e) {
            void e;
          }

          // If offsets still empty, try PDF-text extraction (single attempt)
          if (anchorOffsetsRef.current.size === 0 && (map?.anchors.length ?? 0) > 0) {
            try {
              const map = sourceMapRef.current!;
              const extracted = await extractOffsetsFromPdfText(doc, metrics, map.anchors, renderScale);
                if (extracted.size > 0) {
                const prev = anchorOffsetsRef.current.size;
                anchorOffsetsRef.current = extracted;
                // Don't perform a forced scroll while rendering is still in
                // progress here. Instead register the first anchor as a
                // pending forced scroll target. The post-render block at
                // the end of this function will perform the actual scroll
                // once rendering completes; if the user is typing we keep
                // a timer that will fire when typing stops.
                if (prev === 0 && extracted.size > 0 && !initialForcedScrollDoneRef.current && !userInteractedRef.current && syncModeRef.current !== 'locked-to-pdf') {
                  const anchorId = (map.anchors[0] && map.anchors[0].id) ?? null;
                  if (anchorId) {
                      if (registerPendingAnchor) registerPendingAnchor(anchorId);
                      else pendingForcedAnchorRef.current = anchorId;
                  }
                }
              }
            } catch (_e) {
              console.debug('[usePdfRenderer] extraction failed', _e);
            }

            const anchors = sourceMapRef.current!.anchors;
            const el = containerRef.current;
            if (el) {
              const avail = Math.max(0, el.scrollHeight - el.clientHeight);
              const fallback = new Map<string, number>();
              for (let i = 0; i < anchors.length; i++) {
                const frac = i / Math.max(1, anchors.length - 1);
                let pos = Math.round(frac * avail);
                if (avail > 100 && pos < 8) pos = 8;
                fallback.set(anchors[i].id, pos);
              }
              if (anchorOffsetsRef.current.size === 0) {
                // Apply fallback immediately if not typing, otherwise store for later
                if (!isTypingRef.current) {
                  anchorOffsetsRef.current = fallback;
                  // Register pending anchor for forced scroll
                  const anchorId = sourceMapRef.current?.anchors[0]?.id ?? null;
                  if (anchorId) {
                    if (registerPendingAnchor) registerPendingAnchor(anchorId);
                    else pendingForcedAnchorRef.current = anchorId;
                  }
                } else {
                  // Store fallback to be applied when typing stops (handled by useEditorToPdfSync)
                  pendingFallbackRef.current = fallback;
                  const anchorId = sourceMapRef.current?.anchors[0]?.id ?? null;
                  if (anchorId) {
                    if (registerPendingAnchor) registerPendingAnchor(anchorId);
                    else pendingForcedAnchorRef.current = anchorId;
                  }
                }
              }
            }
          }

          setRendering(false);

          // If an earlier extraction/fallback registered a pending forced
          // anchor, perform that forced scroll now that rendering has
          // completed via the consumePendingAnchor handler (which uses a single RAF)
          if (process.env.NODE_ENV !== 'production') console.debug('[usePdfRenderer] post-render check', { pending: pendingForcedAnchorRef.current, initialForced: initialForcedScrollDoneRef.current, isTyping: isTypingRef.current });
          if (pendingForcedAnchorRef.current && !initialForcedScrollDoneRef.current) {
              if (consumePendingAnchor) {
                consumePendingAnchor();
              }
          }
        };
        tryComputeAndMaybeScroll();
      } catch (e) {
        if (!localCancel.canceled) {
          setPdfError(e instanceof Error ? e.message : String(e));
          setRendering(false);
        }
      }
    };
    load();
    return () => {
      localCancel.canceled = true;
      if (pendingFallbackTimerRef.current) { window.clearInterval(pendingFallbackTimerRef.current); pendingFallbackTimerRef.current = null; }
      if (pendingForcedTimerRef.current) { window.clearInterval(pendingForcedTimerRef.current); pendingForcedTimerRef.current = null; }
    };
  }, [
    compileStatus.status,
    compileStatus.pdf_path,
    cancelRenderRef,
    containerRef,
    pdfMetricsRef,
    anchorOffsetsRef,
    sourceMapRef,
    userInteractedRef,
    syncModeRef,
    isTypingRef,
    pendingFallbackRef,
    pendingFallbackTimerRef,
    pendingForcedTimerRef,
    pendingForcedAnchorRef,
    initialForcedScrollDoneRef,
    recomputeAnchorOffsets,
    scrollToAnchor,
    setRendering,
    setPdfError,
    consumePendingAnchor,
    registerPendingAnchor,
    args.mountSignal,
  ]);
}
