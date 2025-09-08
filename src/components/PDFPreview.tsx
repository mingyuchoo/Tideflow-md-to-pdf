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
  const { editor, editorScrollRatio, preferences } = useAppStore();
  const { compileStatus } = editor;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastAppliedRatioRef = useRef<number>(-1);
  const [rendering, setRendering] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const cancelRenderRef = useRef<{ canceled: boolean }>({ canceled: false });

  // Attempt to scroll the PDF iframe content proportional to editorScrollRatio.
  // Note: Accessing PDF DOM is limited because it's a separate document rendered by the browser's PDF plugin / PDF.js.
  // Strategy: Use fragment navigation (scroll) by injecting a tiny script when same-origin isn't blocked.
  // Fallback: Use iframe.contentWindow.scrollTo if allowed.
  const lastScrollHeightRef = useRef<number>(0);
  // Bias pushes target slightly further down (e.g., keep cursor's logical line near top third)
  // Adaptive bias handled by mapping util
  const applyScrollRatio = useCallback((force = false) => {
    if (!containerRef.current) return;
  // Adaptive mapping: smaller base bias, gamma=1 (linear), tapered, clamped near bottom.
  // If TOC is enabled, add offset to skip TOC pages
  // 0.12 (12%) typically covers 1-2 TOC pages in most documents
  const tocOffset = preferences.toc ? 0.12 : 0;
  const ratio = mapEditorToPdfRatio(editorScrollRatio, { baseBias: 0.06, taper: true, gamma: 1, tocOffset });
    const el = containerRef.current;
    const currentScrollHeight = el.scrollHeight;
    const heightChanged = currentScrollHeight !== lastScrollHeightRef.current;
    const delta = Math.abs(ratio - lastAppliedRatioRef.current);
    // If height changed (pages added) or force flag, accept even small deltas
    if (!force && !heightChanged && delta < 0.01) return;
    lastAppliedRatioRef.current = ratio;
    lastScrollHeightRef.current = currentScrollHeight;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll > 2) {
      el.scrollTop = maxScroll * ratio;
    }
  }, [editorScrollRatio, preferences.toc]);
  
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
        const bust = Date.now();
        const fileUrl = convertFileSrc(compileStatus.pdf_path) + `?v=${bust}`;
        const doc = await pdfjsLib.getDocument({ url: fileUrl }).promise;
        if (localCancelToken.canceled) return;
        // Clear previous pages
        containerRef.current.innerHTML = '';
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
            containerRef.current.appendChild(canvas);
            await page.render({ canvasContext: ctx, viewport }).promise;
            // Apply partial scroll as pages stream in for early pages beyond first
            if (pageNum === 1 || pageNum === doc.numPages || pageNum % 2 === 0) {
              applyScrollRatio(true);
            }
        }
        setRendering(false);
        console.log('[PDFPreview] finished render total pages:', doc.numPages);
        requestAnimationFrame(() => requestAnimationFrame(() => applyScrollRatio(true)));
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
  }, [compileStatus, applyScrollRatio]);

  // When editor scroll ratio changes after a render completed, attempt to apply.
  useEffect(() => {
    applyScrollRatio();
  }, [editorScrollRatio, applyScrollRatio]);

  // Observe container size changes (e.g., new pages appended or window resized)
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      applyScrollRatio(true);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [applyScrollRatio]);

  return (
    <div className="pdf-preview">
      <div className="pdf-preview-header">
        <h3>PDF Preview</h3>
        <div className="pdf-preview-actions">
          <button
            type="button"
            onClick={() => applyScrollRatio(true)}
            title="Manually re-sync preview scroll to editor position"
            className="resync-btn"
          >Resync</button>
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
