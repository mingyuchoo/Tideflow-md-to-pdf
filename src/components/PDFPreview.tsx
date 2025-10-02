  // ...existing code...
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
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
  const { editor, sourceMap, activeAnchorId, setActiveAnchorId, syncMode, setSyncMode, isTyping, preferences, pdfZoom, setPdfZoom } = useAppStore();
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
    userManuallyPositionedPdfRef,
    initialForcedScrollDoneRef,
    syncModeRef,
    activeAnchorRef,
    isTypingRef,
  } = scrollState;

  // Legacy refs no longer used (kept in scrollState for backward compat)
  // startupOneShotAppliedRef, finalRefreshDoneRef

  // Temporary ref for registerPendingAnchor to avoid circular dependency
  const registerPendingAnchorRef = useRef<((anchorId: string) => void) | null>(null);

  // Memoize the callback to prevent recreating it on every render
  const registerPendingAnchorCallback = useCallback((anchorId: string) => {
    if (registerPendingAnchorRef.current) {
      registerPendingAnchorRef.current(anchorId);
    }
  }, []); // Empty deps - uses ref which is always stable

  // Memoize the scrollStateRefs object to prevent recreating it on every render
  // Refs are stable and don't change, so this object can be created once
  const scrollStateRefs = useMemo(() => ({
    syncModeRef,
    activeAnchorRef,
    userInteractedRef,
    initialForcedScrollDoneRef,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []); // Empty deps - all values are refs which are stable

  // Use offset manager hook
  const offsetManager = useOffsetManager({
    sourceMap,
    scrollStateRefs,
    registerPendingAnchor: registerPendingAnchorCallback,
  });

  const { anchorOffsetsRef, pdfMetricsRef, sourceMapRef, recomputeAnchorOffsets } = offsetManager;

  const renderingRef = useRef(rendering);
  useEffect(() => { renderingRef.current = rendering; }, [rendering]);

  const scrollToAnchor = useCallback((anchorId: string, center = false, force = false) => {
    const el = containerRef.current;
    // Ensure the container is still attached to the document
    if (!el || !el.parentNode || !el.isConnected) return;
    
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[PDFPreview] scrollToAnchor: anchor=${anchorId}, force=${force}, center=${center}`);
    }
    
    const offset = anchorOffsetsRef.current.get(anchorId);
    if (offset === undefined) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[PDFPreview] no offset for anchor', { anchorId });
      }
      return;
    }
    
    // Calculate target position with bias
    const bias = center ? el.clientHeight / 2 : el.clientHeight * 0.3;
    const target = Math.max(0, offset - bias);
    const currentTop = el.scrollTop ?? 0;
    
    // Skip if already at target position (within tolerance)
    if (Math.abs(currentTop - target) <= UI.SCROLL_POSITION_TOLERANCE_PX) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[PDFPreview] already at target', { anchorId, target, currentTop });
      }
      return;
    }
    
    // Only guard against near-top jumps during initial forced scroll (startup)
    // After that, allow all scrolls to support normal document navigation
    if (force && !initialForcedScrollDoneRef.current) {
      // First forced scroll - mark it complete
      initialForcedScrollDoneRef.current = true;
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[PDFPreview] initial forced scroll completed', { anchorId });
      }
    }
    
    // Set programmatic scroll flag
    programmaticScrollRef.current = true;
    lastProgrammaticScrollAt.current = Date.now();
    const beforeTop = el.scrollTop;
    
    // Perform the scroll
    el.scrollTo({ top: target, behavior: 'auto' });
    
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[PDFPreview] scrolled', { anchorId, from: beforeTop, to: target, delta: target - beforeTop });
    }
    
        // Clear programmatic flag after scroll completes
    requestAnimationFrame(() => {
      setTimeout(() => {
        programmaticScrollRef.current = false;
      }, 50); // Quick clear for responsive two-way sync
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Refs are stable and don't need to be in dependency array

  // Clear manual position flag when switching to locked-to-editor or two-way mode
  useEffect(() => {
    if (syncMode === 'locked-to-editor' || syncMode === 'two-way') {
      userManuallyPositionedPdfRef.current = false;
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[PDFPreview] cleared manual position flag - mode:', syncMode);
      }
    }
  }, [syncMode, userManuallyPositionedPdfRef]);

  // Auto-switch from two-way to auto when typing starts
  // Two-way mode is for reading/navigation - when editing, switch to one-way (auto)
  const prevIsTypingForModeRef = useRef(isTyping);
  useEffect(() => {
    const startedTyping = !prevIsTypingForModeRef.current && isTyping;
    prevIsTypingForModeRef.current = isTyping;
    
    if (startedTyping && syncMode === 'two-way') {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[PDFPreview] 🔄 typing detected in two-way mode - switching to auto');
      }
      setSyncMode('auto');
    }
  }, [isTyping, syncMode, setSyncMode]);

  // Clear manual position flag ONLY on explicit editor scroll (not typing-induced changes)
  // We detect this by tracking when anchor changes due to editor scroll events, not typing
  const prevAnchorIdRef = useRef<string | null>(activeAnchorId);
  const prevIsTypingRef = useRef(isTyping);
  useEffect(() => {
    const wasTyping = prevIsTypingRef.current;
    const anchorChanged = activeAnchorId !== prevAnchorIdRef.current;
    
    // Only release lock if:
    // 1. User is NOT currently typing
    // 2. User was NOT typing before (prevents clearing on typing→not-typing transition)
    // 3. Anchor actually changed (user scrolled/navigated editor)
    if (!isTyping && !wasTyping && anchorChanged && activeAnchorId) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[PDFPreview] 🔓 clearing PDF lock - user SCROLLED/NAVIGATED editor', {
          from: prevAnchorIdRef.current,
          to: activeAnchorId
        });
      }
      userManuallyPositionedPdfRef.current = false;
    }
    
    prevAnchorIdRef.current = activeAnchorId;
    prevIsTypingRef.current = isTyping;
  }, [activeAnchorId, isTyping, userManuallyPositionedPdfRef]);

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
    userManuallyPositionedPdfRef,
    programmaticScrollRef,
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
    userManuallyPositionedPdfRef,
    activeAnchorRef,
    syncModeRef,
    renderingRef: scrollState.renderingRef,
    isTypingRef,
    rendering, // Pass state value so effect can re-run when PDF ready
    setActiveAnchorId,
    setSyncMode,
  });

  // Pending anchor management
  const registerPendingAnchor = useCallback((anchorId: string) => {
    pendingForcedAnchorRef.current = anchorId;
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[PDFPreview] registered pending anchor', { anchorId });
    }
  }, []);

  const consumePendingAnchor = useCallback((checkOffset = true) => {
    const anchorId = pendingForcedAnchorRef.current;
    if (!anchorId) return;

    if (checkOffset && anchorOffsetsRef.current.size === 0) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[PDFPreview] consumePendingAnchor: no offsets yet, skipping');
      }
      return;
    }

    pendingForcedAnchorRef.current = null;
    
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[PDFPreview] consuming pending anchor', { anchorId, offsets: anchorOffsetsRef.current.size });
    }

    requestAnimationFrame(() => {
      scrollToAnchor(anchorId, false, true);
    });
  }, [anchorOffsetsRef, scrollToAnchor]);

  const mountSignal = 0;

  // Wire up the registerPendingAnchor to the ref
  registerPendingAnchorRef.current = registerPendingAnchor;

  // PDF renderer hook
  usePdfRenderer({
    compileStatus,
    pdfZoom,
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
    registerPendingAnchor,
    consumePendingAnchor,
    activeAnchorId,
    preferences: { toc: preferences.toc, cover_page: preferences.cover_page },
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
    const checkPending = () => {
      if (!containerRef.current) return;
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
        // swallow silently
      }
    };
    
    // Check immediately, then once more after a frame (offsets may arrive asynchronously)
    checkPending();
    const rafId = requestAnimationFrame(checkPending);
    return () => cancelAnimationFrame(rafId);
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
        userManuallyPositionedPdfRef={userManuallyPositionedPdfRef}
        pdfZoom={pdfZoom}
        setPdfZoom={setPdfZoom}
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
