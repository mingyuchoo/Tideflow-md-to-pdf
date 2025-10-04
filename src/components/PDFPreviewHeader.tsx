import React from 'react';
import { useAppStore } from '../store';
import type { SyncMode, Preferences } from '../types';
import { themePresets } from '../themes';
import { setPreferences as persistPreferences, renderMarkdown, renderTypst, openPdfInViewer } from '../api';

interface Props {
  pdfZoom: number;
  setPdfZoom: (zoom: number) => void;
}

const PDFPreviewHeader: React.FC<Props> = ({ pdfZoom, setPdfZoom }) => {
  const syncMode = useAppStore((state) => state.syncMode);
  const setSyncMode = useAppStore((state) => state.setSyncMode);
  const syncEnabled = useAppStore((state) => state.syncEnabled);
  const setSyncEnabled = useAppStore((state) => state.setSyncEnabled);
  const addToast = useAppStore((state) => state.addToast);
  const thumbnailsVisible = useAppStore((state) => state.thumbnailsVisible);
  const setThumbnailsVisible = useAppStore((state) => state.setThumbnailsVisible);
  const compileStatus = useAppStore((state) => state.editor.compileStatus);
  const {
    themeSelection,
    setThemeSelection,
    setPreferences,
    setDesignModalOpen,
    setCompileStatus,
  } = useAppStore();
  
  const zoomLevels = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
  const currentZoomIndex = zoomLevels.indexOf(pdfZoom);
  
  const rerenderCurrent = async () => {
    const { editor: { currentFile, content } } = useAppStore.getState();
    if (!currentFile) return;
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

    const preset = themePresets[value];
    if (preset) {
      try {
        setCompileStatus({ status: 'running' });
        setPreferences(preset.preferences);
        await persistPreferences(preset.preferences);
        await rerenderCurrent();
      } catch (e) {
        console.warn('[Toolbar] theme apply failed', e);
      }
    }
  };
  
  return (
    <div className="pdf-preview-header">
      <div className="pdf-preview-actions sync-controls">
        <div className="zoom-controls">
          <button
            type="button"
            onClick={() => {
              const currentIndex = zoomLevels.indexOf(pdfZoom);
              if (currentIndex > 0) {
                setPdfZoom(zoomLevels[currentIndex - 1]);
              }
            }}
            title="Zoom out"
            className="zoom-btn"
            disabled={currentZoomIndex === 0}
          >
            −
          </button>
          <span className="zoom-display" title="Current zoom level">
            {Math.round(pdfZoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => {
              const currentIndex = zoomLevels.indexOf(pdfZoom);
              if (currentIndex < zoomLevels.length - 1) {
                setPdfZoom(zoomLevels[currentIndex + 1]);
              }
            }}
            title="Zoom in"
            className="zoom-btn"
            disabled={currentZoomIndex === zoomLevels.length - 1}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setPdfZoom(1.0)}
            title="Reset zoom to 100%"
            className="zoom-reset-btn"
            disabled={pdfZoom === 1.0}
          >
            Reset
          </button>
        </div>
        <div className="toolbar-separator"></div>
        <button
          onClick={() => setDesignModalOpen(true)}
          title="Open Design & Layout (Ctrl+,)"
        >
          🎨 Design
        </button>
        <select
          value={themeSelection}
          onChange={(e) => handleThemeSelect(e.target.value)}
          title="Select Theme"
          className="toolbar-select"
        >
          {Object.entries(themePresets).map(([id, theme]) => (
            <option key={id} value={id} title={theme.description}>{theme.name}</option>
          ))}
          <option value="custom">Custom…</option>
        </select>
        <div className="toolbar-button-group">
          <button
            onClick={async () => {
              const prefs = useAppStore.getState().preferences;
              const newSize = Math.max(8, prefs.font_size - 0.5);
              const updated = { ...prefs, font_size: newSize };
              try {
                setCompileStatus({ status: 'running' });
                setThemeSelection('custom');
                setPreferences(updated);
                await persistPreferences(updated);
                await rerenderCurrent();
              } catch (e) {
                console.warn('[Toolbar] font size change failed', e);
              }
            }}
            title="Decrease font size"
          >
            A−
          </button>
          <button
            onClick={async () => {
              const prefs = useAppStore.getState().preferences;
              const newSize = Math.min(18, prefs.font_size + 0.5);
              const updated = { ...prefs, font_size: newSize };
              try {
                setCompileStatus({ status: 'running' });
                setThemeSelection('custom');
                setPreferences(updated);
                await persistPreferences(updated);
                await rerenderCurrent();
              } catch (e) {
                console.warn('[Toolbar] font size change failed', e);
              }
            }}
            title="Increase font size"
          >
            A+
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            const newMode: SyncMode = syncMode === 'two-way' ? 'auto' : 'two-way';
            setSyncMode(newMode);
            addToast({ 
              type: 'success', 
              message: newMode === 'two-way' ? 'Two-way sync enabled' : 'One-way sync enabled' 
            });
          }}
          title={syncMode === 'two-way' ? 'Switch to one-way sync' : 'Enable two-way sync (PDF scroll updates editor)'}
          className="sync-mode-btn"
        >
          {syncMode === 'two-way' ? '⇅' : '⇊'}
        </button>
        <button
          type="button"
          onClick={() => {
            const newEnabled = !syncEnabled;
            setSyncEnabled(newEnabled);
            addToast({ 
              type: 'info', 
              message: newEnabled ? 'Scroll sync enabled' : 'Scroll sync disabled' 
            });
          }}
          title={syncEnabled ? 'Disable scroll synchronization' : 'Enable scroll synchronization'}
          className={`sync-toggle-btn ${syncEnabled ? 'sync-enabled' : 'sync-disabled'}`}
        >
          {syncEnabled ? '🔗' : '⛓️‍💥'}
        </button>
        <div className="toolbar-separator"></div>
        <button
          type="button"
          onClick={async () => {
            // Send PDF directly to default printer
            const pdfPath = compileStatus.pdf_path;
            if (pdfPath) {
              try {
                await openPdfInViewer(pdfPath);
                addToast({ 
                  type: 'success', 
                  message: 'PDF sent to printer' 
                });
              } catch (error) {
                addToast({ 
                  type: 'error', 
                  message: `Failed to print PDF: ${error}` 
                });
              }
            } else {
              addToast({ 
                type: 'error', 
                message: 'No PDF available to print' 
              });
            }
          }}
          title="Print PDF to default printer"
          className="sync-mode-btn"
          disabled={!compileStatus.pdf_path || compileStatus.status !== 'ok'}
        >
          🖨️
        </button>
        <button
          type="button"
          onClick={() => setThumbnailsVisible(!thumbnailsVisible)}
          title={thumbnailsVisible ? 'Hide page thumbnails' : 'Show page thumbnails'}
          className="sync-mode-btn"
        >
          📑
        </button>
      </div>
    </div>
  );
};

export default PDFPreviewHeader;
