import React from 'react';
import type { PDFViewerProps } from './types';

const PDFViewer: React.FC<PDFViewerProps> = ({ 
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
      <p>No PDF to preview.</p>
      <p>Save (Ctrl+S) or click Render to generate a PDF.</p>
    </div>
  );
};

export default PDFViewer;
