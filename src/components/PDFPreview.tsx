import React, { useEffect, useState, useRef, useCallback } from 'react';
import { mapEditorToPdfRatio } from '../utils/scrollMapping';
import { useAppStore } from '../store';
import { handleError } from '../utils/errorHandler';
import './PDFPreview.css';
import * as pdfjsLib from 'pdfjs-dist';
import { convertFileSrc } from '@tauri-apps/api/core';
import PdfJsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';

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
      console.log('[PDFPreview] pdf.js workerPort initialized');
    } catch (inner) {
      console.warn('[PDFPreview] Worker construction failed, continuing with fake worker', inner);
    }
  }
} catch (outer) {
  console.warn('[PDFPreview] Worker initialization outer failure; continuing without worker', outer);
}

const PDFPreview: React.FC = () => {
  // Pull editor (for compileStatus), scroll ratio, and typing state
  const { editor, editorScrollRatio, isTyping, preferences } = useAppStore();
  const { compileStatus } = editor;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastAppliedRatioRef = useRef<number>(-1);
  const [rendering, setRendering] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isManuallyScrolled, setIsManuallyScrolled] = useState(false);
  // Mirror rendering so async and observers see current state
  const renderingRef = useRef(rendering);
  useEffect(() => { renderingRef.current = rendering; }, [rendering]);
  // Mirror states into refs so async effects/loaders see up-to-date values
  const isTypingRef = useRef(isTyping);
  const isManuallyScrolledRef = useRef(isManuallyScrolled);
  useEffect(() => { isTypingRef.current = isTyping; }, [isTyping]);
  useEffect(() => { isManuallyScrolledRef.current = isManuallyScrolled; }, [isManuallyScrolled]);
  const cancelRenderRef = useRef<{ canceled: boolean }>({ canceled: false });
  // Explicitly suppress observers during DOM swaps & stabilization
  const suppressObserverRef = useRef(false);

  // Attempt to scroll the PDF iframe content proportional to editorScrollRatio.
  // Note: Accessing PDF DOM is limited because it's a separate document rendered by the browser's PDF plugin / PDF.js.
  // Strategy: Use fragment navigation (scroll) by injecting a tiny script when same-origin isn't blocked.
  // Fallback: Use iframe.contentWindow.scrollTo if allowed.
  const lastScrollHeightRef = useRef<number>(0);
  // Flag to identify programmatic scrolls (avoid triggering manual scroll detection)
  const programmaticScrollRef = useRef(false);

  const applyScrollRatio = useCallback((force = false) => {
    const el = containerRef.current;
    if (!el) return;
    // Avoid any non-forced sync while rendering to minimize jitter
    if (renderingRef.current && !force) return;
    // Skip if user manually scrolled and this isn't a forced update
    if (isManuallyScrolledRef.current && !force) return;
    // CRITICAL: Never scroll while typing, only when explicitly forced or when editor scrolls
    if (isTypingRef.current && !force) return;
    // Linear mapping with optional base offset when TOC is enabled
    const ratio = mapEditorToPdfRatio(editorScrollRatio, {
      gamma: 1,
      baseOffset: preferences?.toc ? 0.08 : 0, // ~8% document height ≈ one front-matter page
    });
  
    // Debug logging to understand what's happening
    if (process.env.NODE_ENV === 'development') {
      console.log(`[PDFPreview] Editor ratio: ${editorScrollRatio.toFixed(3)}, PDF ratio: ${ratio.toFixed(3)}`);
    }
    const currentScrollHeight = el.scrollHeight;
    const heightChanged = currentScrollHeight !== lastScrollHeightRef.current;
    const previous = lastAppliedRatioRef.current < 0 ? ratio : lastAppliedRatioRef.current;
    let target = ratio;
    const rawDelta = Math.abs(target - previous);
    // If not force, clamp large jumps (>0.35 of document) to reduce disorientation
    if (!force && rawDelta > 0.35) {
      const direction = target > previous ? 1 : -1;
      target = previous + direction * 0.35;
    }
    const delta = Math.abs(target - previous);
    // If height changed (pages added) or force flag, accept even small deltas
    if (!force && !heightChanged && delta < 0.01) return;
    lastAppliedRatioRef.current = target;
    lastScrollHeightRef.current = currentScrollHeight;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll > 2) {
      programmaticScrollRef.current = true; // mark so scroll listener ignores it
      // Always use instant scroll to avoid glide/jitter
      el.scrollTo({ top: maxScroll * target, behavior: 'auto' });
      // reset flag shortly after paint
      requestAnimationFrame(() => { 
        setTimeout(() => {
          programmaticScrollRef.current = false;
        }, 100); // Allow extra time for scroll events to complete
      });
    }
  }, [editorScrollRatio, preferences?.toc]);

  // When typing stops, DO NOT force resync. Let next editor scroll drive sync.
  const prevIsTypingRef = useRef(isTyping);
  useEffect(() => {
    if (prevIsTypingRef.current && !isTyping) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[PDFPreview] Typing stopped; not forcing sync');
      }
    }
    prevIsTypingRef.current = isTyping;
  }, [isTyping]);
  
  // Render PDF pages when compile status signals a new PDF
  useEffect(() => {
    console.log('[PDFPreview] mount');
    return () => { console.log('[PDFPreview] unmount'); };
  }, []);

  useEffect(() => {
    console.log('[PDFPreview] compileStatus changed', compileStatus);
  }, [compileStatus]);

  useEffect(() => {
    const load = async () => {
      if (compileStatus.status !== 'ok' || !compileStatus.pdf_path) {
        if (compileStatus.status !== 'ok') {
          console.log('[PDFPreview] status not ok, clearing preview');
        }
        setPdfError(null);
        if (containerRef.current) containerRef.current.innerHTML = '';
        return;
      }
      if (!containerRef.current) return;
      console.log('[PDFPreview] starting render for', compileStatus.pdf_path);
      setRendering(true);
      setPdfError(null);
      cancelRenderRef.current.canceled = false;
      const localCancelToken = cancelRenderRef.current;
      try {
        // Capture current scroll ratio to restore post-render when typing or sync paused
        let restoreRatio: number | null = null;
        if (containerRef.current) {
          const el = containerRef.current;
          const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
          restoreRatio = Math.max(0, Math.min(1, el.scrollTop / maxScroll));
        }
        const bust = Date.now();
        const fileUrl = convertFileSrc(compileStatus.pdf_path) + `?v=${bust}`;
        const doc = await pdfjsLib.getDocument({ url: fileUrl }).promise;
        if (localCancelToken.canceled) return;
        // Build pages off-DOM to prevent incremental layout shifts
        const frag = document.createDocumentFragment();
        const tmpWrap = document.createElement('div');
        tmpWrap.style.display = 'contents';
        for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
          if (localCancelToken.canceled) return;
            const page = await doc.getPage(pageNum);
            if (localCancelToken.canceled) return;
            const viewport = page.getViewport({ scale: 1.2 });
            const canvas = document.createElement('canvas');
            canvas.className = 'pdfjs-page-canvas';
            const ctx = canvas.getContext('2d');
            if (!ctx) continue;
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            tmpWrap.appendChild(canvas);
            await page.render({ canvasContext: ctx, viewport }).promise;
            // Removed incremental scroll syncing during render to avoid jitter.
        }
        frag.appendChild(tmpWrap);
        // Replace content in one shot to minimize scroll perturbations
        if (containerRef.current) {
          // Suppress observers during swap
          suppressObserverRef.current = true;
          containerRef.current.innerHTML = '';
          containerRef.current.appendChild(frag);
        }
        setRendering(false);
        console.log('[PDFPreview] finished render total pages:', doc.numPages);
        // After rendering: wait for layout to settle (double RAF), then
        // restore when typing/paused; otherwise force sync to editor position
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const el = containerRef.current;
            if (!el) { suppressObserverRef.current = false; return; }
            const maxScroll = el.scrollHeight - el.clientHeight;
            // If TOC is enabled and editor is near top, nudge restoreRatio a bit to compensate
            if (preferences?.toc && (restoreRatio ?? 0) < 0.02) {
              restoreRatio = Math.min(1, (restoreRatio ?? 0) + 0.08);
            }
            // If user was typing or manually scrolled, restore prior position and do NOT force sync
            if (isTypingRef.current || isManuallyScrolledRef.current) {
              if (restoreRatio !== null && maxScroll > 0) {
                programmaticScrollRef.current = true;
                el.scrollTo({ top: maxScroll * restoreRatio, behavior: 'auto' });
                requestAnimationFrame(() => { programmaticScrollRef.current = false; suppressObserverRef.current = false; });
                // Update refs so subsequent clamps use current position
                lastAppliedRatioRef.current = restoreRatio;
                lastScrollHeightRef.current = el.scrollHeight;
              } else {
                suppressObserverRef.current = false;
              }
              return;
            }
            // Not typing and not manually paused: align to current editor position now
            applyScrollRatio(true);
            // Re-enable observers after the forced sync has painted
            requestAnimationFrame(() => { suppressObserverRef.current = false; });
          });
        });
      } catch (e) {
        handleError(e, { operation: 'render PDF', component: 'PDFPreview' });
        setPdfError(e instanceof Error ? e.message : String(e));
        setRendering(false);
      }
    };
    load();
    const token = cancelRenderRef.current;
    return () => {
      token.canceled = true;
    };
  }, [compileStatus, applyScrollRatio, preferences?.toc]);

  // When editor scroll ratio changes after a render completed, attempt to apply.
  const lastEditorScrollRatioRef = useRef(editorScrollRatio);
  useEffect(() => {
    const editorScrollChanged = Math.abs(editorScrollRatio - lastEditorScrollRatioRef.current) > 0.03;
    lastEditorScrollRatioRef.current = editorScrollRatio;
    
    // If user had manually paused and the editor actually scrolled, auto-resume
    if (isManuallyScrolled && editorScrollChanged && !isTyping) {
      setIsManuallyScrolled(false);
      // snap to the new editor position immediately
      applyScrollRatio(true);
      return;
    }

    // CRITICAL: Only apply scroll if:
    // 1. NOT typing (typing should never trigger PDF scroll)
    // 2. Editor actually scrolled (not just content change)
    // 3. Manual pause is not active
    if (!isTyping && editorScrollChanged && !isManuallyScrolled) {
      applyScrollRatio();
    } else if (process.env.NODE_ENV === 'development' && isTyping) {
      console.log('[PDFPreview] Suppressing scroll during typing');
    }
  }, [editorScrollRatio, applyScrollRatio, isManuallyScrolled, isTyping]);

  // Detect manual scrolling of the PDF container
  useEffect(() => {
    if (!containerRef.current) return;
    
    const el = containerRef.current;
    const onScroll = () => {
      // Ignore programmatic scrolls
      if (programmaticScrollRef.current) return;
      // Ignore scrolls caused while rendering (layout shifts)
      if (renderingRef.current) return;
      
      // User manually scrolled the PDF, pause syncing
      if (!isManuallyScrolled) {
        setIsManuallyScrolled(true);
        if (process.env.NODE_ENV === 'development') {
          console.log('[PDFPreview] Manual scroll detected, pausing sync');
        }
      }
    };
    
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [isManuallyScrolled]);
  
  // Observe container size changes (e.g., new pages appended or window resized)
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      // Do NOT force sync if typing, manual pause, or while rendering
      if (isTypingRef.current || isManuallyScrolledRef.current || renderingRef.current || suppressObserverRef.current) return;
      applyScrollRatio(true);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [applyScrollRatio]);

  return (
    <div className="pdf-preview">
      <div className="pdf-preview-header">
        <h3>PDF Preview</h3>
        <div className="pdf-preview-actions sync-controls">
          <button
            type="button"
            onClick={() => {
              setIsManuallyScrolled(false);
              applyScrollRatio(true);
            }}
            title="Force sync preview to editor position and resume auto-sync"
            className="resync-btn"
          >Resync</button>
          {isManuallyScrolled && (
            <div className="sync-paused-badge" title="Preview will stay in place until you scroll the editor">
              Sync Paused
            </div>
          )}
        </div>
        {compileStatus.status === 'error' && (
          <div className="error-badge">Error</div>
        )}
      </div>
      
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
