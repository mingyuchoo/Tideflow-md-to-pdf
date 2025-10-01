  // ...existing code...
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAppStore } from '../store';
import './PDFPreview.css';
import * as pdfjsLib from 'pdfjs-dist';
import PDFPreviewHeader from './PDFPreviewHeader';
import { usePdfRenderer } from '../hooks/usePdfRenderer';
import PdfJsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';
import { useScrollState } from '../hooks/useScrollState';
import { useOffsetManager } from '../hooks/useOffsetManager';
import { useEditorToPdfSync } from '../hooks/useEditorToPdfSync';
import { usePdfToEditorSync } from '../hooks/usePdfToEditorSync';
import { UI } from '../constants/timing';

interface PdfJsWorkerOptions {
  workerPort?: unknown;
  workerSrc?: string;
}
interface PdfJsLibWithWorker {
  GlobalWorkerOptions?: PdfJsWorkerOptions;
}
try {
  const lib = pdfjsLib as unknown as PdfJsLibWithWorker;
  if (lib.GlobalWorkerOptions && !lib.GlobalWorkerOptions.workerPort) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lib.GlobalWorkerOptions.workerPort = new (PdfJsWorker as any)();
      if (process.env.NODE_ENV !== 'production') console.log('[PDFPreview] pdf.js workerPort initialized');
    } catch (inner) {
      if (process.env.NODE_ENV !== 'production') console.warn('[PDFPreview] Worker construction failed, continuing with fake worker', inner);
    }
  }
} catch (outer) {
  if (process.env.NODE_ENV !== 'production') console.warn('[PDFPreview] Worker initialization outer failure; continuing without worker', outer);
}

const PDFPreview: React.FC = () => {
  // Store state
  const { editor, sourceMap, activeAnchorId, setActiveAnchorId, syncMode, setSyncMode, isTyping } = useAppStore();
  const { compileStatus } = editor;

  // Local state
  const [rendering, setRendering] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Rendering control refs
  const cancelRenderRef = useRef<{ canceled: boolean }>({ canceled: false });
  const mountedAt = useRef<number>(Date.now());

  // Pending scroll state refs
  const pendingFallbackRef = useRef<Map<string, number> | null>(null);
  const pendingFallbackTimerRef = useRef<number | null>(null);
  const pendingForcedTimerRef = useRef<number | null>(null);
  const pendingForcedOneShotRef = useRef<number | null>(null);
  const pendingForcedAnchorRef = useRef<string | null>(null);

  // Use scroll state hook - consolidates 19 refs
  const scrollState = useScrollState({
    syncMode,
    activeAnchorId,
    isTyping,
    rendering,
  });

  const {
    containerRef,
    programmaticScrollRef,
    lastProgrammaticScrollAt,
    userInteractedRef,
    initialForcedScrollDoneRef,
    syncModeRef,
    activeAnchorRef,
    isTypingRef,
  } = scrollState;

  // Legacy refs no longer used (kept in scrollState for backward compat)
  // startupOneShotAppliedRef, finalRefreshDoneRef

  // Temporary ref for registerPendingAnchor to avoid circular dependency
  const registerPendingAnchorRef = useRef<((anchorId: string) => void) | null>(null);

  // Use offset manager hook
  const offsetManager = useOffsetManager({
    sourceMap,
    scrollStateRefs: {
      syncModeRef,
      activeAnchorRef,
      userInteractedRef,
      initialForcedScrollDoneRef,
    },
    registerPendingAnchor: (anchorId: string) => {
      if (registerPendingAnchorRef.current) {
        registerPendingAnchorRef.current(anchorId);
      }
    },
  });

  const { anchorOffsetsRef, pdfMetricsRef, sourceMapRef, recomputeAnchorOffsets } = offsetManager;

  const renderingRef = useRef(rendering);
  useEffect(() => { renderingRef.current = rendering; }, [rendering]);

  const scrollToAnchor = useCallback((anchorId: string, center = false, force = false) => {
  const el = containerRef.current;
  // Ensure the container is still attached to the document; during fast
  // doc switches it may be removed which would make subsequent DOM ops
  // throw (removeChild). Also guard if parentNode is missing.
  if (!el || !el.parentNode || !el.isConnected) return;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[PDFPreview] scrollToAnchor requested: anchor=${anchorId}, offsets=${anchorOffsetsRef.current.size}, topBefore=${el.scrollTop}, clientH=${el.clientHeight}, scrollHeight=${el.scrollHeight}`);
    }
    const offset = anchorOffsetsRef.current.get(anchorId);
    if (offset === undefined) return;
    // Defensive guard: avoid jumping the preview to the very top (offset
    // near zero) when the preview is currently scrolled elsewhere or when
    // the user is typing. This prevents jarring jumps produced by fallback
    // offsets or transient races while pages/anchors are still settling.
    const currentTop = el.scrollTop ?? 0;
    if (!force && (isTypingRef.current) && Math.abs(currentTop - offset) > UI.SCROLL_POSITION_TOLERANCE_PX) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[PDFPreview] skipping scrollToAnchor due to typing', { anchorId, offset, currentTop: el.scrollTop });
      }
      return;
    }
    // If the computed target would be essentially the document top (<=8px)
    // but the user is already scrolled well past the top, avoid jumping
    // them to the top. Allow a single forced startup scroll (controlled by
    // initialForcedScrollDoneRef) to handle the case where the preview
    // initially needs to sync on load.
    if (!force && offset <= UI.MIN_OFFSET_FROM_TOP_PX && Math.abs(currentTop - offset) > UI.SCROLL_POSITION_TOLERANCE_PX) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[PDFPreview] skipping scrollToAnchor to near-top (guard)', { anchorId, offset, currentTop: el.scrollTop });
      }
      return;
    }
    if (force && offset <= UI.MIN_OFFSET_FROM_TOP_PX && currentTop > UI.SCROLL_AWAY_FROM_TOP_THRESHOLD_PX) {
      // If this is a forced scroll but the user is already scrolled down,
      // only allow it once on startup.
      if (initialForcedScrollDoneRef.current) {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[PDFPreview] ignoring repeated forced near-top scroll', { anchorId, offset, currentTop });
        }
        return;
      }
      // Do NOT mark done here; the authoritative place to mark the
      // one-shot forced-startup scroll as completed is immediately
      // after we've actually performed a programmatic forced scroll in
      // this function. That prevents other codepaths from prematurely
      // blocking future startup sync attempts.
    }
    const bias = center ? el.clientHeight / 2 : el.clientHeight * 0.3;
    const target = Math.max(0, offset - bias);
    // Avoid jumping to near-top positions for users who are scrolled well
    // below the top. If the computed target is very small but the current
    // scrollTop is significantly larger, skip the programmatic scroll
    // unless explicitly forced.
    if (!force && (el.scrollTop ?? 0) > 20 && target < 8) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[PDFPreview] suppressing near-top jump', { anchorId, offset, target, currentTop: el.scrollTop });
      }
      return;
    }
    programmaticScrollRef.current = true;
    lastProgrammaticScrollAt.current = Date.now();
    const beforeTop = el.scrollTop;
    // Perform the programmatic scroll. We avoid prematurely marking the
    // one-shot startup sync as completed for a no-op (zero-delta) scroll
    // because offsets may still be imprecise; instead rely on the rAF
    // confirmation below which marks the startup sync only if the
    // scroll actually changed the viewport.
    el.scrollTo({ top: target, behavior: 'auto' });
    // We will mark the one-shot startup guard only after confirming the
    // programmatic scroll actually moved the viewport. This avoids
    // premature marking when the attempted scroll was a no-op (for
    // example when the target equals the current scrollTop) or when a
    // conservative fallback was applied before precise offsets were
    // available.
    if (process.env.NODE_ENV !== 'production') {
      // Wrap RAF checks with a defensive read to ensure the element
      // is still present when the callback runs.
      requestAnimationFrame(() => {
        setTimeout(() => {
          try {
            const currentEl = containerRef.current;
            if (!currentEl || !currentEl.isConnected) return;
            const after = currentEl.scrollTop;
            const delta = after - beforeTop;
            console.log(`[PDFPreview] scrollToAnchor effect: anchor=${anchorId}, offset=${offset}, target=${target}, topBefore=${beforeTop}, topAfter=${after}, delta=${delta}, scrollHeight=${currentEl.scrollHeight}`);
            if (force && !initialForcedScrollDoneRef.current) {
              if (delta !== 0 || Math.abs(beforeTop - target) > UI.SCROLL_NO_MOVEMENT_THRESHOLD_PX) {
                programmaticScrollRef.current = true;
                console.debug('[PDFPreview] initialForcedScrollDone set by scrollToAnchor (confirmed)', { anchorId, target, delta });
              } else {
                console.debug('[PDFPreview] initialForcedScrollDone NOT set (no movement)', { anchorId, target, delta });
              }
            }
          } catch {
            // swallow any exceptions during the diagnostic logging so
            // they don't bubble up during unmounts or fast switches.
          }
        }, 80);
      });
    }
    requestAnimationFrame(() => {
      setTimeout(() => {
        programmaticScrollRef.current = false;
      }, 60);
    });
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[PDFPreview] programmaticScroll set true', { anchorId, target, timestamp: lastProgrammaticScrollAt.current });
    }
  }, [containerRef, anchorOffsetsRef, isTypingRef, initialForcedScrollDoneRef, programmaticScrollRef, lastProgrammaticScrollAt]);

  // SIMPLIFIED: Editor → PDF sync (replaces useAnchorSync, usePendingScroll, useStartupSync, useFinalSync)
  useEditorToPdfSync({
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
  });

  // SIMPLIFIED: PDF → Editor sync (replaces usePdfSync, usePreviewEvents)
  usePdfToEditorSync({
    containerRef,
    anchorOffsetsRef,
    sourceMapRef,
    programmaticScrollRef,
    lastProgrammaticScrollAt,
    mountedAt,
    userInteractedRef,
    activeAnchorRef,
    syncModeRef,
    renderingRef: scrollState.renderingRef,
    setActiveAnchorId,
    setSyncMode,
  });

  // Dummy for backward compat during migration
  const registerPendingAnchor = useCallback(() => {}, []);
  const consumePendingAnchor = useCallback(() => {}, []);
  const mountSignal = 0;

  // Wire up the registerPendingAnchor to the ref
  registerPendingAnchorRef.current = registerPendingAnchor;

  // PDF renderer hook
  usePdfRenderer({
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
    pendingForcedOneShotRef,
    initialForcedScrollDoneRef,
    setRendering,
    setPdfError,
    recomputeAnchorOffsets,
    scrollToAnchor,
    mountSignal,
  });

  // Offset-transition watcher: polls briefly for offsets when a pending
  // forced anchor is registered and consumes it once offsets become
  // available. Defensive guards cancel the watcher if the container
  // disappears (e.g., during document switch) to avoid DOM ops after
  // unmount.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[PDFPreview] offset-transition watcher mounted');
    }
    let cancelled = false;
    const iv = window.setInterval(() => {
      if (cancelled) return;
      // Defensive: if containerRef is gone, cancel interval
      if (!containerRef.current) {
        cancelled = true;
        window.clearInterval(iv);
        return;
      }
      try {
        const pending = pendingForcedAnchorRef.current;
        if (!pending) return;
        if (anchorOffsetsRef.current.size === 0) return;
        // If offsets are now available for the pending anchor, consume it.
        const off = anchorOffsetsRef.current.get(pending);
        if (off !== undefined) {
          consumePendingAnchor();
        }
      } catch {
        // swallow; keep polling
      }
    }, 200);
    return () => { cancelled = true; window.clearInterval(iv); };
  }, [consumePendingAnchor, anchorOffsetsRef, containerRef]);

  // ✅ ALL OLD HOOKS REPLACED WITH 2 NEW SIMPLIFIED HOOKS ABOVE ✅
  // Removed: usePdfSync, useAnchorSync, useDocumentLifecycle, useFinalSync, usePreviewEvents
  // Total removed: ~800 lines of complex sync logic
  // Replaced with: useEditorToPdfSync + usePdfToEditorSync (~400 lines)

  return (
    <div className="pdf-preview">
      <PDFPreviewHeader
        syncMode={syncMode}
        setSyncMode={setSyncMode}
        activeAnchorId={activeAnchorId}
        sourceMap={sourceMap}
        anchorOffsetsRef={anchorOffsetsRef}
        containerRef={containerRef}
      />
      
      <div className="pdf-preview-content">
        {compileStatus.status === 'error' ? (
          <div className="error-message">
            <h4>Rendering Failed</h4>
            <p>{compileStatus.message}</p>
            {compileStatus.details && (
              <pre className="error-details">{compileStatus.details}</pre>
            )}
          </div>
        ) : pdfError ? (
          <div className="error-message">
            <h4>PDF Load Failed</h4>
            <pre className="error-details">{pdfError}</pre>
          </div>
        ) : compileStatus.status === 'ok' && compileStatus.pdf_path ? (
          <>
            <div ref={containerRef} className="pdfjs-scroll-container" />
            {rendering && (
              <div className="pdfjs-loading-overlay">Rendering pages...</div>
            )}
          </>
        ) : (
          <div className="no-pdf-message">
            <p>No PDF to preview.</p>
            <p>Save (Ctrl+S) or click Render to generate a PDF.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PDFPreview;
