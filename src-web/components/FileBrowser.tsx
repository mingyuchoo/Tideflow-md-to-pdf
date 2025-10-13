import { useEffect, useState } from 'react';
import { listDocumentsDirectory, readMarkdownFile } from '../api';
import { useEditorStore } from '../stores/editorStore';
import type { FileEntry } from '../types';
import './FileBrowser.css';

export default function FileBrowser() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  const addOpenFile = useEditorStore((state) => state.addOpenFile);
  const setCurrentFile = useEditorStore((state) => state.setCurrentFile);
  const setContent = useEditorStore((state) => state.setContent);

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    try {
      setLoading(true);
      setError(null);
      const fileList = await listDocumentsDirectory();
      setFiles(fileList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  };

  const toggleDirectory = async (path: string) => {
    const newExpanded = new Set(expandedDirs);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedDirs(newExpanded);
  };

  const handleFileClick = async (file: FileEntry) => {
    if (file.is_dir) {
      toggleDirectory(file.path);
    } else if (file.name.endsWith('.md')) {
      try {
        const content = await readMarkdownFile(file.path);
        addOpenFile(file.path);
        setCurrentFile(file.path);
        setContent(content);
      } catch (err) {
        console.error('Failed to open file:', err);
      }
    }
  };

  const renderFileTree = (fileList: FileEntry[], level = 0) => {
    return fileList.map((file) => {
      const isExpanded = expandedDirs.has(file.path);
      const hasChildren = file.is_dir && file.children && file.children.length > 0;

      return (
        <div key={file.path} style={{ marginLeft: `${level * 16}px` }}>
          <div
            className={`file-item ${file.is_dir ? 'directory' : 'file'}`}
            onClick={() => handleFileClick(file)}
          >
            {file.is_dir && (
              <span className="folder-icon">{isExpanded ? '📂' : '📁'}</span>
            )}
            {!file.is_dir && <span className="file-icon">📄</span>}
            <span className="file-name">{file.name}</span>
          </div>
          {file.is_dir && isExpanded && hasChildren && (
            <div className="children">
              {renderFileTree(file.children!, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  if (loading) {
    return (
      <div className="file-browser">
        <div className="file-browser-header">
          <h3>Documents</h3>
        </div>
        <div className="file-browser-content loading">
          <div>Loading files...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="file-browser">
        <div className="file-browser-header">
          <h3>Documents</h3>
        </div>
        <div className="file-browser-content error">
          <div>Error: {error}</div>
          <button onClick={loadFiles}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="file-browser">
      <div className="file-browser-header">
        <h3>Documents</h3>
        <button className="refresh-btn" onClick={loadFiles} title="Refresh">
          🔄
        </button>
      </div>
      <div className="file-browser-content">
        {files.length === 0 ? (
          <div className="empty-state">No files found</div>
        ) : (
          renderFileTree(files)
        )}
      </div>
    </div>
  );
}
