import { useEffect, useState, useRef } from 'react';
import { listDocumentsDirectory, readMarkdownFile, deleteFile, renameFile, createFile } from '../api';
import { useEditorStore } from '../stores/editorStore';
import { useUIStore } from '../stores/uiStore';
import type { FileEntry } from '../types';
import './FileBrowser.css';

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  file: FileEntry | null;
  isEmptySpace: boolean;
}

export default function FileBrowser() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    file: null,
    isEmptySpace: false
  });
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState('');
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const addOpenFile = useEditorStore((state) => state.addOpenFile);
  const setCurrentFile = useEditorStore((state) => state.setCurrentFile);
  const setContent = useEditorStore((state) => state.setContent);
  const removeOpenFile = useEditorStore((state) => state.removeOpenFile);
  const currentFile = useEditorStore((state) => state.editor.currentFile);

  const fileBrowserRefreshTrigger = useUIStore((state) => state.fileBrowserRefreshTrigger);

  useEffect(() => {
    loadFiles();
  }, [fileBrowserRefreshTrigger]);

  // Close context menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu({ visible: false, x: 0, y: 0, file: null, isEmptySpace: false });
      }
    };

    if (contextMenu.visible) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu.visible]);

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

  const handleContextMenu = (e: React.MouseEvent, file: FileEntry | null = null) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      file,
      isEmptySpace: file === null
    });
  };

  const handleRename = (file: FileEntry) => {
    setRenamingFile(file.path);
    setNewFileName(file.name);
    setContextMenu({ visible: false, x: 0, y: 0, file: null, isEmptySpace: false });
  };

  const handleRenameSubmit = async (oldPath: string) => {
    if (!newFileName.trim() || newFileName === oldPath.split('/').pop()) {
      setRenamingFile(null);
      return;
    }

    try {
      const newPath = await renameFile(oldPath, newFileName);

      // Update open files if the renamed file was open
      if (currentFile === oldPath) {
        setCurrentFile(newPath);
        removeOpenFile(oldPath);
        addOpenFile(newPath);
      }

      await loadFiles();
      setRenamingFile(null);
    } catch (err) {
      alert(`파일 Rename 실패: ${err instanceof Error ? err.message : String(err)}`);
      setRenamingFile(null);
    }
  };

  const handleDelete = async (file: FileEntry) => {
    const confirmMsg = file.is_dir
      ? `Would you like to delete the folder "${file.name}" and all files inside it?`
      : `Would you like to delete the file "${file.name}"?`;

    if (!confirm(confirmMsg)) {
      setContextMenu({ visible: false, x: 0, y: 0, file: null, isEmptySpace: false });
      return;
    }

    try {
      await deleteFile(file.path);

      // Remove from open files if it was open
      if (currentFile === file.path) {
        setCurrentFile(null);
        setContent('');
      }
      removeOpenFile(file.path);

      await loadFiles();
      setContextMenu({ visible: false, x: 0, y: 0, file: null, isEmptySpace: false });
    } catch (err) {
      alert(`Failed delete: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const renderFileTree = (fileList: FileEntry[], level = 0) => {
    return fileList.map((file) => {
      const isExpanded = expandedDirs.has(file.path);
      const hasChildren = file.is_dir && file.children && file.children.length > 0;
      const isRenaming = renamingFile === file.path;

      return (
        <div key={file.path} style={{ marginLeft: `${level * 16}px` }}>
          <div
            className={`file-item ${file.is_dir ? 'directory' : 'file'}`}
            onClick={() => !isRenaming && handleFileClick(file)}
            onContextMenu={(e) => handleContextMenu(e, file)}
          >
            {file.is_dir && (
              <span className="folder-icon">{isExpanded ? '�s' : '📁'}</span>
            )}
            {!file.is_dir && <span className="file-icon">📄</span>}
            {isRenaming ? (
              <input
                type="text"
                className="rename-input"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                onBlur={() => handleRenameSubmit(file.path)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRenameSubmit(file.path);
                  } else if (e.key === 'Escape') {
                    setRenamingFile(null);
                  }
                }}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="file-name">{file.name}</span>
            )}
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
      <div
        className="file-browser-content"
        onContextMenu={(e) => handleContextMenu(e, null)}
      >
        {files.length === 0 ? (
          <div className="empty-state">No files found</div>
        ) : (
          renderFileTree(files)
        )}
      </div>

      {contextMenu.visible && (
        <div
          ref={contextMenuRef}
          className="context-menu"
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
          }}
        >
          <div className="context-menu-item" onClick={() => contextMenu.file && handleRename(contextMenu.file)}>
            ✏️ Rename
          </div>
          <div className="context-menu-item delete" onClick={() => contextMenu.file && handleDelete(contextMenu.file)}>
            🗑️ Delete
          </div>
        </div>
      )}
    </div>
  );
}
