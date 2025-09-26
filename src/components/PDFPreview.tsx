import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAppStore } from '../store';
import { handleError } from '../utils/errorHandler';
import './PDFPreview.css';
import * as pdfjsLib from 'pdfjs-dist';
import { convertFileSrc } from '@tauri-apps/api/core';
import PdfJsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';
import type { SourceMap } from '../types';

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
  // Pull editor (for compileStatus) and sync state
  const { editor, sourceMap, activeAnchorId, setActiveAnchorId, syncMode, setSyncMode, isTyping } = useAppStore();
  const { compileStatus } = editor;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [rendering, setRendering] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const renderingRef = useRef(rendering);
  useEffect(() => { renderingRef.current = rendering; }, [rendering]);
  const isTypingRef = useRef(isTyping);
  useEffect(() => { isTypingRef.current = isTyping; }, [isTyping]);
  const cancelRenderRef = useRef<{ canceled: boolean }>({ canceled: false });
  const programmaticScrollRef = useRef(false);
  const anchorOffsetsRef = useRef<Map<string, number>>(new Map());
  const pdfMetricsRef = useRef<{ page: number; height: number; scale: number }[]>([]);
  const syncModeRef = useRef(syncMode);
  useEffect(() => { syncModeRef.current = syncMode; }, [syncMode]);
  const activeAnchorRef = useRef<string | null>(activeAnchorId);
  useEffect(() => { activeAnchorRef.current = activeAnchorId; }, [activeAnchorId]);
  const sourceMapRef = useRef<SourceMap | null>(sourceMap);
  useEffect(() => { sourceMapRef.current = sourceMap; }, [sourceMap]);

  const recomputeAnchorOffsets = useCallback((map: SourceMap | null) => {
    const metrics = pdfMetricsRef.current;
    const offsets = new Map<string, number>();
    if (!map || metrics.length === 0) {
      anchorOffsetsRef.current = offsets;
      return;
    }
    const pageOffsets = new Map<number, number>();
    let cumulative = 0;
    for (const metric of metrics) {
      pageOffsets.set(metric.page, cumulative);
      cumulative += metric.height;
    }
    for (const anchor of map.anchors) {
      const pdf = anchor.pdf;
      if (!pdf) continue;
      const metric = metrics.find((m) => m.page === pdf.page);
      if (!metric) continue;
      const pageTop = pageOffsets.get(pdf.page) ?? 0;
      const yPx = pdf.y * metric.scale;
      const offset = pageTop + yPx;
      offsets.set(anchor.id, offset);
    }
    anchorOffsetsRef.current = offsets;
  }, []);

  const scrollToAnchor = useCallback((anchorId: string, center = false) => {
    const el = containerRef.current;
    if (!el) return;
    const offset = anchorOffsetsRef.current.get(anchorId);
    if (offset === undefined) return;
    const bias = center ? el.clientHeight / 2 : el.clientHeight * 0.3;
    const target = Math.max(0, offset - bias);
    programmaticScrollRef.current = true;
    el.scrollTo({ top: target, behavior: 'auto' });
    requestAnimationFrame(() => {
      setTimeout(() => {
        programmaticScrollRef.current = false;
      }, 60);
    });
  }, []);

  useEffect(() => {
    const load = async () => {
      if (compileStatus.status !== 'ok' || !compileStatus.pdf_path) {
        setPdfError(null);
        if (containerRef.current) containerRef.current.innerHTML = '';
        pdfMetricsRef.current = [];
        anchorOffsetsRef.current = new Map();
        return;
      }
      if (!containerRef.current) return;
      setRendering(true);
      setPdfError(null);
      cancelRenderRef.current.canceled = false;
      const localCancelToken = cancelRenderRef.current;
      try {
        const bust = Date.now();
        const fileUrl = convertFileSrc(compileStatus.pdf_path) + `?v=${bust}`;
        const doc = await pdfjsLib.getDocument({ url: fileUrl }).promise;
        if (localCancelToken.canceled) return;
        const frag = document.createDocumentFragment();
        const tmpWrap = document.createElement('div');
        tmpWrap.style.display = 'contents';
        const metrics: { page: number; height: number; scale: number }[] = [];
        const renderScale = 1.2;
        for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
          if (localCancelToken.canceled) return;
          const page = await doc.getPage(pageNum);
          if (localCancelToken.canceled) return;
          const viewport = page.getViewport({ scale: renderScale });
          metrics.push({ page: pageNum, height: viewport.height, scale: renderScale });
          const canvas = document.createElement('canvas');
          canvas.className = 'pdfjs-page-canvas';
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          tmpWrap.appendChild(canvas);
          await page.render({ canvasContext: ctx, viewport }).promise;
        }
        frag.appendChild(tmpWrap);
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
          containerRef.current.appendChild(frag);
        }
        pdfMetricsRef.current = metrics;
        recomputeAnchorOffsets(sourceMapRef.current);
        setRendering(false);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (syncModeRef.current !== 'locked-to-pdf') {
              const anchorId = activeAnchorRef.current ?? sourceMapRef.current?.anchors[0]?.id;
              if (anchorId) {
                scrollToAnchor(anchorId, true);
              }
            }
          });
        });
      } catch (e) {
        if (!localCancelToken.canceled) {
          handleError(e, { operation: 'render PDF', component: 'PDFPreview' });
          setPdfError(e instanceof Error ? e.message : String(e));
          setRendering(false);
        }
      }
    };
    load();
    return () => {
      cancelRenderRef.current.canceled = true;
    };
  }, [compileStatus, recomputeAnchorOffsets, scrollToAnchor]);

  useEffect(() => {
    recomputeAnchorOffsets(sourceMap);
  }, [sourceMap, recomputeAnchorOffsets]);

  useEffect(() => {
    if (!activeAnchorId) return;
    if (syncMode === 'locked-to-pdf') return;
    if (isTypingRef.current) return;
    scrollToAnchor(activeAnchorId);
  }, [activeAnchorId, scrollToAnchor, syncMode]);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const onScroll = () => {
      if (programmaticScrollRef.current) return;
      if (renderingRef.current) return;
      const map = sourceMapRef.current;
      if (!map || map.anchors.length === 0) return;
      const center = el.scrollTop + el.clientHeight / 2;
      let closestId: string | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const anchor of map.anchors) {
        const offset = anchorOffsetsRef.current.get(anchor.id);
        if (offset === undefined) continue;
        const dist = Math.abs(offset - center);
        if (dist < bestDist) {
          bestDist = dist;
          closestId = anchor.id;
        }
      }
      if (!closestId) return;
      if (syncModeRef.current !== 'locked-to-pdf') {
        setSyncMode('locked-to-pdf');
      }
      if (activeAnchorRef.current !== closestId) {
        setActiveAnchorId(closestId);
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [setActiveAnchorId, setSyncMode]);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      if (renderingRef.current) return;
      recomputeAnchorOffsets(sourceMapRef.current);
      if (syncModeRef.current !== 'locked-to-pdf' && activeAnchorRef.current) {
        scrollToAnchor(activeAnchorRef.current);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [recomputeAnchorOffsets, scrollToAnchor]);
  
  // Render PDF pages when compile status signals a new PDF
  useEffect(() => {
    console.log('[PDFPreview] mount');
    return () => { console.log('[PDFPreview] unmount'); };
  }, []);

  useEffect(() => {
    console.log('[PDFPreview] compileStatus changed', compileStatus);
  }, [compileStatus]);


  return (
    <div className="pdf-preview">
      <div className="pdf-preview-header">
        <h3>PDF Preview</h3>
        <div className="pdf-preview-actions sync-controls">
          <button
            type="button"
            onClick={() => {
              setSyncMode('auto');
              const targetAnchor = activeAnchorId ?? sourceMap?.anchors[0]?.id;
              if (targetAnchor) {
                scrollToAnchor(targetAnchor, true);
              }
            }}
            title="Resume automatic sync with the editor"
            className="resync-btn"
          >Resume Sync</button>
          {syncMode === 'locked-to-pdf' && (
            <div className="sync-paused-badge" title="Preview is controlling scroll until you move the editor">
              Preview Locked
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
