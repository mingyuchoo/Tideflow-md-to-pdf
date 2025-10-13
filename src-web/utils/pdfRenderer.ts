import * as pdfjsLib from 'pdfjs-dist';
import { logger } from './logger';

// Create scoped logger
const pdfLogger = logger.createScoped('pdfRenderer');

export interface CancelToken { canceled: boolean }
export interface PageMetric { page: number; height: number; scale: number }
export interface SavedScrollPosition { top: number; left: number }

// Configuration for progressive rendering
const RENDER_CONFIG = {
  INITIAL_BATCH_SIZE: 3,        // Render first 3 pages immediately
  VIEWPORT_BUFFER: 2,            // Render 2 pages above/below viewport
  BATCH_SIZE: 5,                 // Render 5 pages per batch
  BATCH_DELAY_MS: 16,            // ~1 frame delay between batches
  PLACEHOLDER_COLOR: '#f3f4f6',  // Light gray placeholder
};

export interface PageRenderState {
  pageNum: number;
  canvas: HTMLCanvasElement;
  placeholder: HTMLDivElement;
  rendered: boolean;
  viewport: pdfjsLib.PageViewport;
}

/**
 * Calculate which pages are currently visible in the viewport
 */
function getVisiblePageRange(
  container: HTMLElement,
  pageStates: PageRenderState[],
  buffer: number = RENDER_CONFIG.VIEWPORT_BUFFER
): { start: number; end: number } {
  const scrollTop = container.scrollTop;
  const viewportHeight = container.clientHeight;
  const scrollBottom = scrollTop + viewportHeight;

  let cumulativeHeight = 0;
  let start = 1;
  let end = pageStates.length;
  let foundStart = false;

  for (let i = 0; i < pageStates.length; i++) {
    const pageHeight = pageStates[i].viewport.height;
    const pageTop = cumulativeHeight;
    const pageBottom = cumulativeHeight + pageHeight;

    // Check if page intersects viewport
    if (!foundStart && pageBottom >= scrollTop) {
      start = Math.max(1, i + 1 - buffer);
      foundStart = true;
    }

    if (foundStart && pageTop > scrollBottom) {
      end = Math.min(pageStates.length, i + buffer);
      break;
    }

    cumulativeHeight += pageHeight;
  }

  return { start, end };
}

/**
 * Render a single PDF page to canvas
 */
async function renderSinglePage(
  doc: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
  canvas: HTMLCanvasElement,
  viewport: pdfjsLib.PageViewport,
  cancelToken: CancelToken
): Promise<void> {
  if (cancelToken.canceled) return;

  const page = await doc.getPage(pageNum);
  if (cancelToken.canceled) return;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({
    canvasContext: ctx,
    canvas,
    viewport
  }).promise;
}

/**
 * Optimized PDF renderer with viewport-based lazy loading.
 * Renders visible pages first, then progressively loads off-screen pages.
 */
export async function renderPdfPages(
  fileUrl: string,
  container: HTMLElement,
  renderScale = 1.0,
  cancelToken: CancelToken,
  savedScrollPosition?: SavedScrollPosition,
  programmaticScrollRef?: React.MutableRefObject<boolean>
): Promise<{ doc: pdfjsLib.PDFDocumentProxy; metrics: PageMetric[] }> {
  const startTime = performance.now();

  // Load PDF document
  const doc = await pdfjsLib.getDocument({ url: fileUrl }).promise;
  if (cancelToken.canceled) throw new Error('canceled');

  pdfLogger.debug('PDF loaded', {
    pages: doc.numPages,
    loadTime: `${(performance.now() - startTime).toFixed(1)}ms`
  });

  // Phase 1: Create placeholders and collect metrics (fast, synchronous)
  const pageStates: PageRenderState[] = [];
  const metrics: PageMetric[] = [];
  const frag = document.createDocumentFragment();
  const wrapper = document.createElement('div');
  wrapper.style.display = 'contents';

  // Pre-calculate all viewports and create placeholders
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    if (cancelToken.canceled) break;

    const page = await doc.getPage(pageNum);
    if (cancelToken.canceled) break;

    const viewport = page.getViewport({ scale: renderScale });
    metrics.push({ page: pageNum, height: viewport.height, scale: renderScale });

    // Create placeholder
    const placeholder = document.createElement('div');
    placeholder.className = 'pdfjs-page-placeholder';
    placeholder.style.width = `${viewport.width}px`;
    placeholder.style.height = `${viewport.height}px`;
    placeholder.style.backgroundColor = RENDER_CONFIG.PLACEHOLDER_COLOR;
    placeholder.style.position = 'relative';
    placeholder.dataset.pageNum = String(pageNum);

    // Create canvas (hidden initially)
    const canvas = document.createElement('canvas');
    canvas.className = 'pdfjs-page-canvas';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.opacity = '0';

    placeholder.appendChild(canvas);
    wrapper.appendChild(placeholder);

    pageStates.push({
      pageNum,
      canvas,
      placeholder,
      rendered: false,
      viewport
    });
  }

  frag.appendChild(wrapper);

  // Mount to DOM
  try {
    if (cancelToken.canceled) throw new Error('canceled');
    if (!container.isConnected) {
      return { doc, metrics };
    }

    const scrollTop = savedScrollPosition?.top ?? container.scrollTop;
    const scrollLeft = savedScrollPosition?.left ?? container.scrollLeft;

    // Clear container efficiently
    try {
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    } catch {
      try { container.innerHTML = ''; } catch { /* swallow */ }
    }

    container.appendChild(frag);

    pdfLogger.debug('Placeholders mounted', {
      time: `${(performance.now() - startTime).toFixed(1)}ms`
    });

    // Restore scroll position immediately
    requestAnimationFrame(() => {
      if (container.isConnected) {
        if (programmaticScrollRef) {
          programmaticScrollRef.current = true;
        }
        container.scrollTop = scrollTop;
        container.scrollLeft = scrollLeft;
      }
    });

  } catch (e) {
    if (e instanceof Error && e.message === 'canceled') throw e;
    return { doc, metrics };
  }

  // Phase 2: Progressive rendering
  // Strategy: Render initial batch → visible pages → remaining pages

  const renderPage = async (state: PageRenderState) => {
    if (state.rendered || cancelToken.canceled) return;

    try {
      await renderSinglePage(doc, state.pageNum, state.canvas, state.viewport, cancelToken);

      if (!cancelToken.canceled) {
        state.rendered = true;
        // Fade in the rendered canvas
        state.canvas.style.opacity = '1';
        state.canvas.style.transition = 'opacity 150ms ease-in';
        // Remove placeholder background
        state.placeholder.style.backgroundColor = 'transparent';
      }
    } catch (err) {
      if (!cancelToken.canceled) {
        pdfLogger.warn(`Failed to render page ${state.pageNum}`, err);
      }
    }
  };

  // Batch 1: Render initial pages immediately (for fast perceived load)
  const initialBatch = pageStates.slice(0, RENDER_CONFIG.INITIAL_BATCH_SIZE);
  await Promise.all(initialBatch.map(renderPage));

  if (cancelToken.canceled) throw new Error('canceled');

  pdfLogger.debug('Initial batch rendered', {
    pages: initialBatch.length,
    time: `${(performance.now() - startTime).toFixed(1)}ms`
  });

  // Batch 2: Render visible pages based on scroll position
  const visibleRange = getVisiblePageRange(container, pageStates);
  const visiblePages = pageStates.slice(visibleRange.start - 1, visibleRange.end);
  const unrenderedVisible = visiblePages.filter(s => !s.rendered);

  if (unrenderedVisible.length > 0) {
    await Promise.all(unrenderedVisible.map(renderPage));

    if (cancelToken.canceled) throw new Error('canceled');

    pdfLogger.debug('Visible pages rendered', {
      range: `${visibleRange.start}-${visibleRange.end}`,
      count: unrenderedVisible.length,
      time: `${(performance.now() - startTime).toFixed(1)}ms`
    });
  }

  // Batch 3: Render remaining pages in background (chunked to avoid blocking)
  const remainingPages = pageStates.filter(s => !s.rendered);

  if (remainingPages.length > 0) {
    // Use requestIdleCallback if available, otherwise setTimeout
    const scheduleWork = (callback: () => void) => {
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(callback, { timeout: 1000 });
      } else {
        setTimeout(callback, RENDER_CONFIG.BATCH_DELAY_MS);
      }
    };

    const renderBatch = async (startIdx: number) => {
      if (cancelToken.canceled) return;

      const batch = remainingPages.slice(startIdx, startIdx + RENDER_CONFIG.BATCH_SIZE);
      if (batch.length === 0) {
        pdfLogger.debug('All pages rendered', {
          total: pageStates.length,
          totalTime: `${(performance.now() - startTime).toFixed(1)}ms`
        });
        return;
      }

      await Promise.all(batch.map(renderPage));

      if (!cancelToken.canceled) {
        scheduleWork(() => renderBatch(startIdx + RENDER_CONFIG.BATCH_SIZE));
      }
    };

    // Start background rendering
    scheduleWork(() => renderBatch(0));
  }

  return { doc, metrics };
}


/**
 * Setup scroll-based lazy rendering observer.
 * Monitors scroll position and renders pages as they come into view.
 */
export function setupLazyPageRenderer(
  container: HTMLElement,
  doc: pdfjsLib.PDFDocumentProxy,
  pageStates: PageRenderState[],
  cancelToken: CancelToken
): () => void {
  let rafId: number | null = null;
  let isRendering = false;

  const checkAndRenderVisible = async () => {
    if (isRendering || cancelToken.canceled) return;

    isRendering = true;
    const visibleRange = getVisiblePageRange(container, pageStates);
    const visiblePages = pageStates.slice(visibleRange.start - 1, visibleRange.end);
    const unrendered = visiblePages.filter(s => !s.rendered);

    if (unrendered.length > 0) {
      pdfLogger.debug('Rendering pages on scroll', {
        range: `${visibleRange.start}-${visibleRange.end}`,
        count: unrendered.length
      });

      await Promise.all(unrendered.map(async (state) => {
        if (state.rendered || cancelToken.canceled) return;

        try {
          await renderSinglePage(doc, state.pageNum, state.canvas, state.viewport, cancelToken);

          if (!cancelToken.canceled) {
            state.rendered = true;
            state.canvas.style.opacity = '1';
            state.canvas.style.transition = 'opacity 150ms ease-in';
            state.placeholder.style.backgroundColor = 'transparent';
          }
        } catch (err) {
          if (!cancelToken.canceled) {
            pdfLogger.warn(`Failed to render page ${state.pageNum}`, err);
          }
        }
      }));
    }

    isRendering = false;
  };

  const handleScroll = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }

    rafId = requestAnimationFrame(() => {
      checkAndRenderVisible();
      rafId = null;
    });
  };

  container.addEventListener('scroll', handleScroll, { passive: true });

  // Cleanup function
  return () => {
    container.removeEventListener('scroll', handleScroll);
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
  };
}

/**
 * Legacy function for backward compatibility.
 * Uses the optimized progressive renderer internally.
 */
export async function renderPdfPagesLegacy(
  fileUrl: string,
  container: HTMLElement,
  renderScale = 1.0,
  cancelToken: CancelToken,
  savedScrollPosition?: SavedScrollPosition,
  programmaticScrollRef?: React.MutableRefObject<boolean>
): Promise<{ doc: pdfjsLib.PDFDocumentProxy; metrics: PageMetric[] }> {
  // Delegate to optimized renderer
  return renderPdfPages(fileUrl, container, renderScale, cancelToken, savedScrollPosition, programmaticScrollRef);
}
