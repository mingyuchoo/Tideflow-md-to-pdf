import React from 'react';
import { useAppStore } from '../store';
import DesignModal from './DesignModal';
import { clearSession } from '../utils/session';
// Removed showOpenDialog (export now uses save dialog directly)
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import './Toolbar.css';

const Toolbar: React.FC = () => {
  const { 
    previewVisible, 
    setPreviewVisible,
    editor,
    designModalOpen, setDesignModalOpen,
    themeSelection, setThemeSelection
  } = useAppStore();
  const { clearCache } = useAppStore.getState();

  const handleTogglePreview = () => {
    setPreviewVisible(!previewVisible);
  };

  const handleThemeSelect = (value: string) => {
    setThemeSelection(value);
    if (value === 'custom') setDesignModalOpen(true);
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

  const handleReset = () => {
    if (!confirm('Reset session? This will close open tabs, clear the current PDF, and restore the sample document. Preferences stay intact.')) return;
    try {
      clearSession();
      clearCache();
    } catch (e) {
      console.error('Reset failed', e);
      alert('Failed to reset: ' + e);
    }
  };

  return (
    <div className="toolbar">
      <div className="toolbar-logo">
        <h1>Tideflow</h1>
      </div>
      
      <div className="toolbar-actions">
        <select
          value={themeSelection}
          onChange={(e) => handleThemeSelect(e.target.value)}
          title="Theme (placeholders)"
        >
          <option value="default">Default</option>
          <option value="classic">Classic</option>
          <option value="mono">Mono</option>
          <option value="serif">Serif</option>
          <option value="custom">Custom…</option>
        </select>

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
          onClick={() => setDesignModalOpen(true)}
          title="Open Design & Layout"
        >🎨 Design</button>
        <button
          onClick={handleReset}
          title="Clear session and restore sample document"
        >♻ Reset</button>
      </div>
      {designModalOpen && <DesignModal />}
    </div>
  );
};

export default Toolbar;
