import React from 'react';
import { useAppStore } from '../store';
import './StatusBar.css';

const StatusBar: React.FC = () => {
  const { editor, preferences } = useAppStore();
  const { currentFile, modified, compileStatus } = editor;

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
      </div>
      
      <div className="status-info">
        <span className="status-item">
          Paper: {preferences.papersize.toUpperCase()}
        </span>
        <span className="status-item">
          Margins: {preferences.margin.x} × {preferences.margin.y}
        </span>
        <span className="status-item">
          TOC: {preferences.toc ? 'On' : 'Off'}
        </span>
        <span className="status-item">
          Numbered Sections: {preferences.number_sections ? 'On' : 'Off'}
        </span>
      </div>
    </div>
  );
};

export default StatusBar;
