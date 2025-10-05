/**
 * Shared types for PDFPreview components
 */

export interface ThumbnailData {
  pageNum: number;
  dataUrl: string;
}

export interface PDFViewerProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  rendering: boolean;
  compileStatus: {
    status: 'idle' | 'queued' | 'running' | 'ok' | 'error';
    pdf_path?: string;
    message?: string;
    details?: string;
  };
  pdfError: string | null;
}

export interface ThumbnailsProps {
  thumbnails: Map<number, string>;
  currentPage: number;
  totalPages: number;
  onPageClick: (pageNum: number) => void;
}

export interface ErrorDisplayProps {
  type: 'compile' | 'load';
  message?: string;
  details?: string;
}
