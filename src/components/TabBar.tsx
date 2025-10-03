import React from 'react';
import { useAppStore } from '../store';
import { readMarkdownFile } from '../api';
import { handleError } from '../utils/errorHandler';
import './TabBar.css';
import { SAMPLE_DOC } from '../sampleDoc';

const TabBar: React.FC = () => {
  const { 
    editor: { openFiles, currentFile, modified },
    setCurrentFile,
    setContent,
    addOpenFile,
    removeOpenFile,
    addRecentFile,
  } = useAppStore();

  const handleTabClick = async (filePath: string) => {
    if (currentFile === filePath) return;
    
    try {
      if (filePath === 'sample.md') {
        // Use in-memory sample content
        setCurrentFile(filePath);
        setContent(SAMPLE_DOC);
      } else {
        const content = await readMarkdownFile(filePath);
        setCurrentFile(filePath);
        setContent(content);
        addRecentFile(filePath);
      }
    } catch (err) {
      handleError(err, { operation: 'switch to file', component: 'TabBar' });
    }
  };

  // Explicitly (re)open the in-memory sample document
  const handleOpenSample = () => {
    const sampleName = 'sample.md';
    addOpenFile(sampleName);
    setCurrentFile(sampleName);
    setContent(SAMPLE_DOC);
  };

  const handleCloseTab = (e: React.MouseEvent, filePath: string) => {
    e.stopPropagation();
    removeOpenFile(filePath);
  };

  const getFileName = (path: string): string => {
    return path.split(/[/\\]/).pop() || path;
  };

  return (
    <div className="tab-bar">
      <div className="tab-container">
        {openFiles.map((file: string) => (
          <div 
            key={file} 
            className={`tab ${currentFile === file ? 'active' : ''} ${modified && currentFile === file ? 'modified' : ''}`}
            onClick={() => handleTabClick(file)}
          >
            <span className="tab-name">{getFileName(file)}</span>
            {/* Allow closing sample.md, but user can now reopen via Sample button */}
            <button
              className="close-tab"
              onClick={(e) => handleCloseTab(e, file)}
              title={file === 'sample.md' ? 'Close sample (you can reopen with Sample button)' : 'Close tab'}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="tab-actions">
        {/* Reopen sample.md if it's not currently open */}
        {!openFiles.includes('sample.md') && (
          <button
            onClick={handleOpenSample}
            className="tab-button"
            title="Reopen sample document"
          >
            📘 Sample
          </button>
        )}
      </div>
    </div>
  );
};

export default TabBar;
