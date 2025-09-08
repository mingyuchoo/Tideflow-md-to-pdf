import React, { useRef } from 'react';
import { useAppStore } from '../store';
import { readMarkdownFile, createFile, writeMarkdownFile } from '../api';
import { open } from '@tauri-apps/plugin-dialog';
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
    closeAllFiles,
    sampleDocContent
  } = useAppStore();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleOpenFile = async () => {
    try {
      const result = await open({ multiple: false, filters: [{ name: 'Markdown Files', extensions: ['md'] }] });
      
      const filePath = Array.isArray(result) ? result?.[0] : result;
      
      if (filePath) {
        
        try {
          const content = await readMarkdownFile(filePath);
          
          // Add to open files list and set as current then set content immediately
          addOpenFile(filePath);
          setCurrentFile(filePath);
          setContent(content);
          return;
        } catch (readError) {
          handleError(readError, { operation: 'read file', component: 'TabBar' });
        }
      }
    } catch {
      // trigger fallback
      fileInputRef.current?.click();
    }
  };

  const handleFallbackChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const safeName = file.name.endsWith('.md') ? file.name : file.name + '.md';
      const newPath = await createFile(safeName);
      await writeMarkdownFile(newPath, text);
      
      // Add to open files and set as current
      addOpenFile(newPath);
      setCurrentFile(newPath);
      setContent(text);
    } catch (e2) {
      handleError(e2, { operation: 'open file', component: 'TabBar' });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleNewFile = async () => {
    try {
      const name = prompt('Enter file name (with .md extension):');
      if (!name) return;
      
      // Add extension if not provided
      const fileName = name.includes('.') ? name : `${name}.md`;
      
      const newContent = `# ${name.replace('.md', '')}\n\nStart writing your document.`;
      const filePath = await createFile(fileName);
      await writeMarkdownFile(filePath, newContent);
      
      // Add to open files and set as current
      addOpenFile(filePath);
      setCurrentFile(filePath);
      setContent(newContent);
    } catch (err) {
      handleError(err, { operation: 'create file', component: 'TabBar' });
    }
  };

  const handleTabClick = async (filePath: string) => {
    if (currentFile === filePath) return;
    
    try {
      if (filePath === 'sample.md') {
        // Use in-memory sample content fallback or regenerate minimal sample if missing
        const sample = sampleDocContent ?? SAMPLE_DOC;
        setCurrentFile(filePath);
        setContent(sample);
      } else {
        const content = await readMarkdownFile(filePath);
        setCurrentFile(filePath);
        setContent(content);
      }
    } catch (err) {
      handleError(err, { operation: 'switch to file', component: 'TabBar' });
    }
  };

  // Explicitly (re)open the in-memory sample document
  const handleOpenSample = () => {
    const sampleName = 'sample.md';
    const sample = sampleDocContent ?? SAMPLE_DOC;
    addOpenFile(sampleName);
    setCurrentFile(sampleName);
    setContent(sample);
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
      <label htmlFor="hidden-file-input" className="visually-hidden">Open Markdown File</label>
      <input
        id="hidden-file-input"
        ref={fileInputRef}
        type="file"
        accept=".md,.txt,.markdown"
        onChange={handleFallbackChange}
        className="hidden-file-input"
        aria-hidden="true"
        tabIndex={-1}
      />
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
            title="Open sample document"
          >
            Sample
          </button>
        )}
        <button 
          onClick={handleNewFile}
          className="tab-button"
          title="Create new file"
        >
          New
        </button>
        <button 
          onClick={handleOpenFile}
          className="tab-button"
          title="Open markdown file"
        >
          Open
        </button>
        {openFiles.length > 0 && (
          <button 
            onClick={closeAllFiles}
            className="tab-button"
            title="Close all tabs"
          >
            Close All
          </button>
        )}
      </div>
    </div>
  );
};

export default TabBar;
