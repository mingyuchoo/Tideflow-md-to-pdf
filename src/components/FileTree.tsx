import React, { useEffect, useState, useRef } from 'react';
import { useAppStore } from '../store';
import { listFiles, createFile, readMarkdownFile, writeMarkdownFile } from '../api';
import { open } from '@tauri-apps/plugin-dialog';
import type { FileEntry } from '../types';
import './FileTree.css';

const FileTree: React.FC = () => {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { setCurrentFile, setContent, editor } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load files on component mount
  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    try {
      setLoading(true);
      const fileList = await listFiles();
      setFiles(fileList);
      setError(null);
    } catch (err) {
      console.error('Failed to load files:', err);
      setError('Failed to load files');
    } finally {
      setLoading(false);
    }
  };

  const handleFileClick = async (file: FileEntry) => {
    if (file.is_dir) {
      return;
    }

    try {
      // Only load if it's a different file
      if (editor.currentFile !== file.path) {
        console.log('📁 Clicked file:', file.path);
        const content = await readMarkdownFile(file.path);
        console.log('📄 File content loaded:', { length: content.length, preview: content.substring(0, 100) });
        
        // Set file first, then content after a delay
        setCurrentFile(file.path);
        setTimeout(() => {
          setContent(content);
          console.log('✅ State updated with file and content');
        }, 100);
      }
    } catch (err) {
      console.error('Failed to open file:', err);
      // Show error to user
    }
  };

  const handleNewFile = async () => {
    try {
      const name = prompt('Enter file name (with .md extension):');
      if (!name) return;
      
      // Add extension if not provided
      const fileName = name.includes('.') ? name : `${name}.md`;
      
      const newContent = `# ${fileName}\n\nStart writing your document.`;
      const filePath = await createFile(fileName);
      await writeMarkdownFile(filePath, newContent);
      await loadFiles();
      
      // Open the new file
      setCurrentFile(filePath);
      setContent(newContent);
    } catch (err) {
      console.error('Failed to create file:', err);
      // Show error to user
    }
  };

  const handleOpenFile = async () => {
    try {
      console.log('Opening file dialog directly...');
      const result = await open({ multiple: false, filters: [{ name: 'Markdown Files', extensions: ['md'] }] });
      const filePath = Array.isArray(result) ? result?.[0] : result;
      if (filePath) {
        console.log('📁 Selected file:', filePath);
        const content = await readMarkdownFile(filePath);
        console.log('📄 File content loaded:', { length: content.length, preview: content.substring(0, 100) });
        
        // Set file first, then content after a longer delay to ensure proper state updates
        setCurrentFile(filePath);
        setTimeout(() => {
          setContent(content);
          console.log('✅ State updated with file and content');
        }, 100);
        return;
      }
      console.log('No file selected or dialog cancelled');
    } catch (err) {
      console.warn('Plugin dialog failed, falling back to native input:', err);
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
      await loadFiles();
      setCurrentFile(newPath);
      setContent(text);
    } catch (e2) {
      console.error('Fallback open failed:', e2);
      alert('Failed to open file');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const renderFileTree = (entries: FileEntry[], level = 0) => {
    return (
      <ul className={`file-list ${level ? 'nested' : ''}`}>
        {entries.map((entry) => {
          const isActive = entry.path === editor.currentFile;
          return (
            <li key={entry.path}>
              <div
                className={`file-entry ${isActive ? 'active' : ''} ${entry.is_dir ? 'directory' : 'file'}`}
                onClick={() => handleFileClick(entry)}
              >
                {entry.is_dir ? '📁 ' : '📄 '}
                {entry.name}
              </div>
              {entry.is_dir && entry.children && entry.children.length > 0 && renderFileTree(entry.children, level + 1)}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="file-tree">
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
      <div className="file-tree-header">
        <h3>Files</h3>
        <div className="file-actions">
          <button onClick={handleNewFile} title="New File">
            New
          </button>
          <button onClick={handleOpenFile} title="Open File">
            Open
          </button>
          <button onClick={loadFiles} title="Refresh">
            ↻
          </button>
        </div>
      </div>
      
      <div className="file-tree-content">
        {loading ? (
          <div className="loading">Loading files...</div>
        ) : error ? (
          <div className="error">{error}</div>
        ) : files.length === 0 ? (
          <div className="empty-message">No files found</div>
        ) : (
          renderFileTree(files)
        )}
      </div>
    </div>
  );
};

export default FileTree;
