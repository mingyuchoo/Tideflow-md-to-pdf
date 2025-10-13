import React from 'react';
import type { PDFViewerProps } from './types';

const PDFViewer: React.FC<PDFViewerProps> = React.memo(({ 
  containerRef, 
  rendering, 
  compileStatus, 
  pdfError 
}) => {
  if (compileStatus.status === 'error') {
    return (
      <div className="error-message">
        <h4>Rendering Failed</h4>
        <p>{compileStatus.message}</p>
        {compileStatus.details && (
          <pre className="error-details">{compileStatus.details}</pre>
        )}
      </div>
    );
  }

  if (pdfError) {
    return (
      <div className="error-message">
        <h4>PDF Load Failed</h4>
        <pre className="error-details">{pdfError}</pre>
      </div>
    );
  }

  if (compileStatus.status === 'ok' && compileStatus.pdf_path) {
    return (
      <>
        <div ref={containerRef} className="pdfjs-scroll-container" />
        {rendering && (
          <div className="pdfjs-loading-overlay">Rendering pages...</div>
        )}
      </>
    );
  }

  return (
    <div className="no-pdf-message">
      <p>📄 No document open</p>
      <p>Open a markdown file to see the PDF preview</p>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for shallow equality check
  return (
    prevProps.rendering === nextProps.rendering &&
    prevProps.pdfError === nextProps.pdfError &&
    prevProps.compileStatus.status === nextProps.compileStatus.status &&
    prevProps.compileStatus.pdf_path === nextProps.compileStatus.pdf_path &&
    prevProps.compileStatus.message === nextProps.compileStatus.message &&
    prevProps.compileStatus.details === nextProps.compileStatus.details
  );
});

export default PDFViewer;
