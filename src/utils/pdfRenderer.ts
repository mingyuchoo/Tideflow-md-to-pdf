import * as pdfjsLib from 'pdfjs-dist';

export interface CancelToken { canceled: boolean }
export interface PageMetric { page: number; height: number; scale: number }

/**
 * Render PDF pages into the provided container and return the pdf doc and
 * collected page metrics. Renders pages in parallel and supports early
 * cancellation via the cancel token.
 */
export async function renderPdfPages(fileUrl: string, container: HTMLElement, renderScale = 1.0, cancelToken: CancelToken): Promise<{ doc: pdfjsLib.PDFDocumentProxy; metrics: PageMetric[] }> {
  const doc = await pdfjsLib.getDocument({ url: fileUrl }).promise;
  if (cancelToken.canceled) throw new Error('canceled');

  const frag = document.createDocumentFragment();
  const tmpWrap = document.createElement('div');
  tmpWrap.style.display = 'contents';
  const metrics: PageMetric[] = [];
  const pagePromises: Promise<void>[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    if (cancelToken.canceled) break;
    const pNum = pageNum;
    const p = (async () => {
      if (cancelToken.canceled) return;
      const page = await doc.getPage(pNum);
      if (cancelToken.canceled) return;
      const viewport = page.getViewport({ scale: renderScale });
      metrics.push({ page: pNum, height: viewport.height, scale: renderScale });
      const canvas = document.createElement('canvas');
      canvas.className = 'pdfjs-page-canvas';
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      tmpWrap.appendChild(canvas);
      await page.render({ canvasContext: ctx, viewport }).promise;
    })();
    pagePromises.push(p);
  }

  await Promise.all(pagePromises);
  frag.appendChild(tmpWrap);
  // Safely replace container children. It's possible the container
  // was removed from the DOM during a fast document switch or
  // unmount; guard against that and avoid calling removeChild on
  // nodes that aren't present.
  try {
    if (cancelToken.canceled) throw new Error('canceled');
    if (!container.isConnected) {
      // Container no longer in DOM; abort appending fragment.
      return { doc, metrics };
    }
    // Prefer iterative removeChild which is safer across browsers
    // than assigning innerHTML when nodes may be mid-mutation.
    try {
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    } catch {
      // Fallback to innerHTML clear if removeChild fails for any reason.
      try { container.innerHTML = ''; } catch { /* swallow */ }
    }
    container.appendChild(frag);
  } catch (e) {
    // If cancellation was requested, propagate; otherwise just
    // return gracefully without attempting DOM operations.
    if (e instanceof Error && e.message === 'canceled') throw e;
    return { doc, metrics };
  }
  return { doc, metrics };
}
