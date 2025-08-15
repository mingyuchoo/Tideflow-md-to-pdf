import React, { useRef } from 'react';
import { useAppStore } from '../store';
import { readMarkdownFile, createFile, writeMarkdownFile } from '../api';
import { open } from '@tauri-apps/plugin-dialog';
import './TabBar.css';

const TabBar: React.FC = () => {
  const { 
    editor: { openFiles, currentFile, modified },
    setCurrentFile,
    setContent,
    addOpenFile,
    removeOpenFile,
    closeAllFiles
  } = useAppStore();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleOpenFile = async () => {
    try {
      console.log('🔍 Opening file dialog directly...');
      const result = await open({ multiple: false, filters: [{ name: 'Markdown Files', extensions: ['md'] }] });
      console.log('🔍 Dialog result:', result, 'Type:', typeof result);
      
      const filePath = Array.isArray(result) ? result?.[0] : result;
      console.log('🔍 Processed filePath:', filePath);
      
      if (filePath) {
        console.log('📁 Selected file:', filePath);
        
        try {
          console.log('🔍 About to read file...');
          const content = await readMarkdownFile(filePath);
          console.log('📄 File content loaded:', { length: content.length, preview: content.substring(0, 100) });
          
          // Add to open files list and set as current
          console.log('🔍 Adding to open files...');
          addOpenFile(filePath);
          console.log('🔍 Setting current file...');
          setCurrentFile(filePath);
          
          // Set content with a delay to ensure proper state updates
          console.log('🔍 Setting content with delay...');
          setTimeout(() => {
            setContent(content);
            console.log('✅ State updated with file and content');
          }, 100);
          return;
        } catch (readError) {
          console.error('❌ Failed to read file:', readError);
          alert(`Failed to read file: ${readError}`);
        }
      } else {
        console.log('❌ No file selected or dialog cancelled');
      }
    } catch (err) {
      console.error('❌ Plugin dialog failed, falling back to native input:', err);
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
      console.error('Fallback open failed:', e2);
      alert('Failed to open file');
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
      console.error('Failed to create file:', err);
    }
  };

  const handleTabClick = async (filePath: string) => {
    if (currentFile === filePath) return;
    
    try {
      const content = await readMarkdownFile(filePath);
      setCurrentFile(filePath);
      
      // Set content with a slight delay
      setTimeout(() => {
        setContent(content);
      }, 100);
    } catch (err) {
      console.error('Failed to switch to file:', err);
    }
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
            <button 
              className="close-tab" 
              onClick={(e) => handleCloseTab(e, file)}
              title="Close tab"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="tab-actions">
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
