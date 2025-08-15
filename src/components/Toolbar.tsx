import React from 'react';
import { useAppStore } from '../store';
import { showOpenDialog, renderTypst } from '../api';
import './Toolbar.css';

const Toolbar: React.FC = () => {
  const { 
    previewVisible, 
    setPreviewVisible, 
    setPrefsModalOpen,
    editor
  } = useAppStore();

  const handleTogglePreview = () => {
    setPreviewVisible(!previewVisible);
  };

  const handleOpenPreferences = () => {
    setPrefsModalOpen(true);
  };

  const handleTestRender = async () => {
    try {
      console.log('Testing PDF render...');
      const testContent = `# Test Document

This is a **test document** to verify PDF rendering works.

## Features
- *Markdown formatting*
- **Bold text**
- Lists

Generated at: ${new Date().toLocaleString()}`;

      const result = await renderTypst(testContent, 'pdf');
      console.log('Render successful:', result);
    } catch (error) {
      console.error('Render failed:', error);
    }
  };

  const handleExportPDF = async () => {
    if (!editor.compileStatus.pdf_path) {
      alert('No PDF available to export. Please render a document first.');
      return;
    }

    try {
      const savePath = await showOpenDialog(
        [{ name: 'PDF Files', extensions: ['pdf'] }],
        false
      );
      
      if (savePath) {
        // File save dialog will handle the actual saving
        console.log('PDF would be saved to:', savePath);
        // In a real app, we would copy the PDF to the selected location
      }
    } catch (err) {
      console.error('Failed to export PDF:', err);
    }
  };

  return (
    <div className="toolbar">
      <div className="toolbar-logo">
        <h1>Tideflow</h1>
      </div>
      
      <div className="toolbar-actions">
        <button 
          onClick={handleTestRender}
          title="Test PDF Render"
          style={{ backgroundColor: '#28a745', color: 'white' }}
        >
          Test PDF
        </button>
        
        <button 
          onClick={handleTogglePreview}
          className={previewVisible ? 'active' : ''}
          title={previewVisible ? 'Hide Preview' : 'Show Preview'}
        >
          {previewVisible ? 'Hide Preview' : 'Show Preview'}
        </button>
        
        <button 
          onClick={handleExportPDF}
          disabled={!editor.compileStatus.pdf_path}
          title="Export PDF"
        >
          Export PDF
        </button>
        
        <button 
          onClick={handleOpenPreferences}
          title="Preferences"
        >
          Preferences
        </button>
      </div>
    </div>
  );
};

export default Toolbar;
