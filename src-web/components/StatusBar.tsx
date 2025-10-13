import React from 'react';
import { useEditorStore } from '../stores/editorStore';
import { usePreferencesStore } from '../stores/preferencesStore';
import './StatusBar.css';

const StatusBar: React.FC = React.memo(() => {
  // Selective subscriptions - only subscribe to what we need
  const currentFile = useEditorStore((state) => state.editor.currentFile);
  const modified = useEditorStore((state) => state.editor.modified);
  const compileStatus = useEditorStore((state) => state.editor.compileStatus);
  const content = useEditorStore((state) => state.editor.content);
  const scrollLocked = useEditorStore((state) => state.scrollLocked);
  
  // Only subscribe to specific preference fields
  const papersize = usePreferencesStore((state) => state.preferences.papersize);
  const margin = usePreferencesStore((state) => state.preferences.margin);
  const toc = usePreferencesStore((state) => state.preferences.toc);
  const cover_page = usePreferencesStore((state) => state.preferences.cover_page);

  // Memoize expensive calculations
  const wordCount = React.useMemo(() => {
    return content ? content.trim().split(/\s+/).filter(w => w.length > 0).length : 0;
  }, [content]);
  
  const charCount = React.useMemo(() => {
    return content ? content.length : 0;
  }, [content]);

  const getStatusText = () => {
    if (!currentFile) {
      return 'No file open';
    }
    
    if (compileStatus.status === 'running') {
      return 'Rendering PDF...';
    }
    
    if (compileStatus.status === 'error') {
      return 'Render failed - check preview for details';
    }
    
    if (modified) {
      return 'Unsaved changes';
    }
    
    return 'Ready';
  };

  const getStatusClass = () => {
    if (compileStatus.status === 'error') {
      return 'status-error';
    }
    
    if (compileStatus.status === 'running') {
      return 'status-running';
    }
    
    if (modified) {
      return 'status-modified';
    }
    
    return 'status-ok';
  };

  return (
    <div className="status-bar">
      <div className={`status-indicator ${getStatusClass()}`}>
        {getStatusText()}
        {currentFile && (
          <span className="status-counts">
            • {wordCount.toLocaleString()} words • {charCount.toLocaleString()} chars
          </span>
        )}
      </div>
      
      <div className="status-info">
        {scrollLocked && (
          <span className="status-item status-scroll-locked">
            Scroll Locked
          </span>
        )}
        <span className="status-item">
          Paper: {papersize.toUpperCase()}
        </span>
        <span className="status-item">
          Margins: {margin.x} × {margin.y}
        </span>
        <span className="status-item">
          TOC: {toc ? 'On' : 'Off'}
        </span>
        <span className="status-item">
          Cover: {cover_page ? 'On' : 'Off'}
        </span>
      </div>
    </div>
  );
});

export default StatusBar;
