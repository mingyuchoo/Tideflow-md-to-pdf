import React from 'react';
import { useAppStore } from '../store';
import type { Preferences } from '../types';
import DesignModal from './DesignModal';
import { clearSession } from '../utils/session';
// Removed showOpenDialog (export now uses save dialog directly)
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { handleError, showSuccess } from '../utils/errorHandler';
import { themePresets } from '../themes';
import { setPreferences as persistPreferences, renderMarkdown, renderTypst } from '../api';
import './Toolbar.css';

const Toolbar: React.FC = () => {
  const { 
    previewVisible, 
    setPreviewVisible,
    editor,
    designModalOpen, setDesignModalOpen,
    themeSelection, setThemeSelection,
    setPreferences,
    setCompileStatus
  } = useAppStore();
  const { clearCache } = useAppStore.getState();

  const handleTogglePreview = () => {
    setPreviewVisible(!previewVisible);
  };

  // Unified re-render that supports the in-memory sample document (which has no on-disk path)
  const rerenderCurrent = async () => {
    const { editor: { currentFile, content } } = useAppStore.getState();
    if (!currentFile) return;
    // Detect virtual sample file (no path separators) or explicit 'sample.md'
    const isVirtual = currentFile === 'sample.md' || (!currentFile.includes('/') && !currentFile.includes('\\'));
    if (isVirtual) {
      await renderTypst(content, 'pdf');
    } else {
      await renderMarkdown(currentFile);
    }
  };

  const handleThemeSelect = async (value: string) => {
    setThemeSelection(value);
    if (value === 'custom') {
      const { lastCustomPreferences } = useAppStore.getState();
      const snapshot: Preferences = {
        ...lastCustomPreferences,
        margin: { ...lastCustomPreferences.margin },
        fonts: { ...lastCustomPreferences.fonts },
      };
      try {
        setCompileStatus({ status: 'running' });
        setPreferences(snapshot);
        await persistPreferences(snapshot);
        await rerenderCurrent();
      } catch (e) {
        console.warn('[Toolbar] custom apply failed', e);
      }
      setDesignModalOpen(true);
      return;
    }

    // Apply theme immediately like the design modal does
    const preset = themePresets[value];
    if (preset) {
      try {
        setCompileStatus({ status: 'running' });
        setPreferences(preset.preferences); // Update in-memory store
        await persistPreferences(preset.preferences); // Persist to backend _prefs.json
        await rerenderCurrent(); // Trigger re-render
      } catch (e) {
        console.warn('[Toolbar] theme apply failed', e);
      }
    }
  };

  const handleExportPDF = async () => {
    try {
      const pdfSource = editor.compileStatus.pdf_path;
      if (!pdfSource) {
        handleError(new Error('No PDF available to export'), 
          { operation: 'export PDF', component: 'Toolbar' }, 'warning');
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
      showSuccess(`Exported PDF to: ${dest}`);
    } catch (err) {
      handleError(err, { operation: 'export PDF', component: 'Toolbar' });
    }
  };

  const handleReset = () => {
    if (!confirm('Reset session? This will close open tabs, clear the current PDF, and restore the sample document. Preferences stay intact.')) return;
    try {
      clearSession();
      clearCache();
    } catch (e) {
      handleError(e, { operation: 'reset session', component: 'Toolbar' });
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
          title="Select Theme"
        >
          {Object.entries(themePresets).map(([id, theme]) => (
            <option key={id} value={id} title={theme.description}>{theme.name}</option>
          ))}
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
