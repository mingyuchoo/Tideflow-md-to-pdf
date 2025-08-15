import React, { useEffect, useState } from 'react';
import { convertFileSrc } from "@tauri-apps/api/core";
import { useAppStore } from '../store';
import './PDFPreview.css';

const PDFPreview: React.FC = () => {
  const { editor } = useAppStore();
  const { compileStatus } = editor;
  
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);

  // Update PDF URL when PDF path changes
  useEffect(() => {
    if (compileStatus.status === 'ok' && compileStatus.pdf_path) {
      // Use convertFileSrc for proper Tauri webview URL
      const url = convertFileSrc(compileStatus.pdf_path) + "#toolbar=0&navpanes=0";
      setPdfUrl(url);
      
      // Regenerate iframe key to force reload
      setIframeKey(prev => prev + 1);
    } else {
      setPdfUrl(null);
    }
  }, [compileStatus]);

  return (
    <div className="pdf-preview">
      <div className="pdf-preview-header">
        <h3>PDF Preview</h3>
        {compileStatus.status === 'error' && (
          <div className="error-badge">Error</div>
        )}
      </div>
      
      <div className="pdf-preview-content">
        {compileStatus.status === 'running' ? (
          <div className="loading-message">Rendering PDF...</div>
        ) : compileStatus.status === 'error' ? (
          <div className="error-message">
            <h4>Rendering Failed</h4>
            <p>{compileStatus.message}</p>
            {compileStatus.details && (
              <pre className="error-details">{compileStatus.details}</pre>
            )}
          </div>
        ) : pdfUrl ? (
          <iframe
            key={iframeKey}
            src={pdfUrl}
            className="pdf-iframe"
            title="PDF Preview"
          />
        ) : (
          <div className="no-pdf-message">
            <p>No PDF to preview.</p>
            <p>Save and render a file to see the preview here.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PDFPreview;
