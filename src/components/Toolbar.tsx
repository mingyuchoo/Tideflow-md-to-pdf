import React from 'react';
import { useAppStore } from '../store';
// Removed showOpenDialog (export now uses save dialog directly)
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
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

  const handleExportPDF = async () => {
    try {
      const pdfSource = editor.compileStatus.pdf_path;
      if (!pdfSource) {
        alert('No PDF available to export. Please render a document first.');
        return;
      }

      // Use save dialog (if available via plugin)
      let dest = await save({
        title: 'Save PDF As',
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
        defaultPath: 'document.pdf'
      }).catch(() => null);

      if (!dest) {
        // Fallback: open dialog hack (user selects folder and we append name) - skipped for now
        return;
      }
      if (!dest.toLowerCase().endsWith('.pdf')) dest = dest + '.pdf';

      // If source is a temp PDF from in-memory render, we can copy directly.
      // Call backend command save_pdf_as which handles md->pdf export if needed.
      await invoke('save_pdf_as', { filePath: pdfSource, destination: dest });
      alert('Exported PDF to: ' + dest);
    } catch (err) {
      console.error('Failed to export PDF:', err);
      alert('Export failed: ' + err);
    }
  };

  return (
    <div className="toolbar">
      <div className="toolbar-logo">
        <h1>Tideflow</h1>
      </div>
      
      <div className="toolbar-actions">
        <button 
          onClick={handleTogglePreview}
          className={previewVisible ? 'active' : ''}
          title={previewVisible ? 'Hide Preview' : 'Show Preview'}
        >
          {previewVisible ? '👁️ Hide Preview' : '👁️‍🗨️ Show Preview'}
        </button>
        
        <button 
          onClick={handleExportPDF}
          disabled={!editor.compileStatus.pdf_path}
          title="Export PDF"
        >
          📄 Export PDF
        </button>
        
        <button 
          onClick={handleOpenPreferences}
          title="Preferences"
        >
          ⚙️ Preferences
        </button>
      </div>
    </div>
  );
};

export default Toolbar;
