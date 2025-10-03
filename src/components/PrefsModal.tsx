import React from 'react';
import { useAppStore } from '../store';
import { clearSession } from '../utils/session';
import { handleError } from '../utils/errorHandler';
import KeyboardShortcutsModal from './KeyboardShortcutsModal';
import './DesignModal.css'; // Reuse design modal styles

interface PrefsModalProps {
  onClose: () => void;
}

const PrefsModal: React.FC<PrefsModalProps> = ({ onClose }) => {
  const { preferences, setPreferences, addToast } = useAppStore();
  const { clearCache } = useAppStore.getState();
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);

  const handleReset = () => {
    if (!confirm('Reset session? This will close open tabs, clear the current PDF, and restore the sample document. Preferences stay intact.')) return;
    try {
      clearSession();
      clearCache();
      addToast({ type: 'success', message: 'Session reset successfully' });
      onClose();
    } catch (e) {
      addToast({ type: 'error', message: 'Failed to reset session' });
      handleError(e, { operation: 'reset session', component: 'PrefsModal' });
    }
  };

  return (
    <div className="design-modal-overlay" onClick={onClose}>
      <div className="design-modal prefs-modal" onClick={e => e.stopPropagation()}>
        <div className="design-modal-header">
          <h2>⚙️ Settings</h2>
          <div className="design-header-controls">
            <button onClick={onClose} title="Close">✕</button>
          </div>
        </div>

        <div className="design-section">
          <h3>Appearance</h3>
          <div className="form-grid">
            <label className="checkbox-label">
              <input 
                type="checkbox" 
                checked={false} 
                onChange={() => {
                  addToast({ type: 'info', message: 'Dark mode coming soon!' });
                }}
              /> 
              Dark Mode (Coming Soon)
            </label>
          </div>
        </div>

        <div className="design-section">
          <h3>Performance</h3>
          <div className="form-grid">
            <label>
              Render Debounce (ms)
              <input 
                type="number" 
                value={preferences.render_debounce_ms} 
                onChange={e => setPreferences({ ...preferences, render_debounce_ms: parseInt(e.target.value || '400', 10) })}
                min="100"
                max="2000"
                step="100"
              />
              <div className="helper-text">Delay before re-rendering PDF while typing</div>
            </label>
            <label className="checkbox-label">
              <input 
                type="checkbox" 
                checked={preferences.preserve_scroll_position} 
                onChange={e => setPreferences({ ...preferences, preserve_scroll_position: e.target.checked })}
              /> 
              Preserve Scroll Position
              <div className="helper-text">Remember scroll position when switching files</div>
            </label>
          </div>
        </div>

        <div className="design-section">
          <h3>Session Management</h3>
          <div className="form-grid">
            <button 
              onClick={handleReset}
              type="button" 
              className="btn-reset-session"
            >
              ♻️ Reset Session
            </button>
            <div className="helper-text">
              Closes all tabs, clears PDF cache, and restores the sample document. Your theme and design preferences will be preserved.
            </div>
          </div>
        </div>

        <div className="design-section">
          <h3>Help</h3>
          <div className="form-grid">
            <button 
              onClick={() => setShortcutsOpen(true)}
              type="button" 
              className="btn-secondary"
            >
              ⌨️ View Keyboard Shortcuts
            </button>
          </div>
        </div>

        <div className="design-footer">
          <div></div>
          <div className="design-footer-actions">
            <button onClick={onClose} type="button" className="btn-primary">Close</button>
          </div>
        </div>
      </div>
      
      {shortcutsOpen && (
        <KeyboardShortcutsModal 
          isOpen={shortcutsOpen} 
          onClose={() => setShortcutsOpen(false)}
        />
      )}
    </div>
  );
};

export default PrefsModal;
