import React, { useEffect, useRef, useState, useCallback } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { keymap } from '@codemirror/view';
import { useAppStore } from '../store';
import { writeMarkdownFile, importImage, importImageFromPath, generateImageMarkdown, renderTypst, showOpenDialog, cleanupTempPdfs } from '../api';
import { showSuccess } from '../utils/errorHandler';
// import MarkdownToolbar from './MarkdownToolbar';
import { cmd } from './MarkdownCommands';
import { FONT_OPTIONS } from './MarkdownToolbar';
import { handleError } from '../utils/errorHandler';
import './Editor.css';

const Editor: React.FC = () => {
  const editorRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isActivelyTyping, setIsActivelyTyping] = useState(false);
  const [selectedFont, setSelectedFont] = useState<string>("New Computer Modern");
  const contentChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingDetectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollIdleTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Debounce editor scroll
  const scrollSyncRafRef = useRef<number | null>(null);
  const isUserTypingRef = useRef(false); // Track if user is actively typing
  const lastLoadedContentRef = useRef<string>(''); // Track last loaded content
  const prevFileRef = useRef<string | null>(null); // Track previously opened file to avoid resetting editor on each keystroke
  const openFilesRef = useRef<string[]>([]);
  
  const { 
    editor: { currentFile, content, modified, openFiles },
    setContent,
    setModified,
    setCompileStatus,
    preferences,
    setEditorScrollRatio,
    setSampleDocContent,
    isTyping,
    setIsTyping
  } = useAppStore();

  // Track openFiles to detect transition to zero and reset refs
  useEffect(() => {
    openFilesRef.current = openFiles;
    if (openFiles.length === 0) {
      // Clear previous file reference so next opened file dispatches content
      prevFileRef.current = null;
    }
  }, [openFiles]);

  // Auto-render function (always full content)
  const autoRenderInFlightRef = useRef(false);
  const pendingRenderRef = useRef<string | null>(null);
  const handleAutoRender = useCallback(async (content: string) => {
    try {
      if (autoRenderInFlightRef.current) {
        // A render is already in progress; remember the latest content to render afterwards.
        pendingRenderRef.current = content;
        return;
      }
      autoRenderInFlightRef.current = true;
      setCompileStatus({ status: 'running' });
      const pdfPath = await renderTypst(content, 'pdf');
      setCompileStatus({ 
        status: 'ok', 
        pdf_path: pdfPath 
      });
      
      // Clean up old temp PDFs after successful render
      try {
        await cleanupTempPdfs(10); // Keep last 10 temp PDFs
      } catch (err) {
        // Don't fail the render if cleanup fails
        console.warn('Failed to cleanup temp PDFs:', err);
      }
    } catch (err) {
      setCompileStatus({ 
        status: 'error', 
        message: 'Auto-render failed', 
        details: String(err) 
      });
    } finally {
      autoRenderInFlightRef.current = false;
      // If there is a pending update queued during render, render once more with latest snapshot
      const pending = pendingRenderRef.current;
      pendingRenderRef.current = null;
      if (pending) {
        // Fire-and-forget; guard will re-enter to in-flight again
        handleAutoRender(pending);
      }
    }
  }, [setCompileStatus]);

  // Focused preview removed: always render entire document

  // Initialize CodeMirror when the component mounts (once)
  useEffect(() => {
    if (editorRef.current && !editorViewRef.current) {
      const view = new EditorView({
        doc: content,
        extensions: [
          basicSetup,
          markdown(),
          EditorView.lineWrapping,
          EditorView.theme({
            '.cm-content': {
              'white-space': 'pre-wrap',
              'word-wrap': 'break-word',
              'overflow-wrap': 'break-word'
            },
            '.cm-line': {
              'white-space': 'pre-wrap',
              'word-wrap': 'break-word',
              'overflow-wrap': 'break-word'
            }
          }),
          keymap.of([
            // Text formatting shortcuts
            {
              key: "Ctrl-b",
              run: (view) => { cmd.bold(view); return true; },
              preventDefault: true
            },
            {
              key: "Ctrl-i", 
              run: (view) => { cmd.italic(view); return true; },
              preventDefault: true
            },
            {
              key: "Ctrl-`",
              run: (view) => { cmd.codeInline(view); return true; },
              preventDefault: true
            },
            {
              key: "Ctrl-k",
              run: (view) => { cmd.link(view); return true; },
              preventDefault: true
            },
            // Heading shortcuts
            {
              key: "Ctrl-Alt-1",
              run: (view) => { cmd.heading(view, 1); return true; },
              preventDefault: true
            },
            {
              key: "Ctrl-Alt-2",
              run: (view) => { cmd.heading(view, 2); return true; },
              preventDefault: true
            },
            {
              key: "Ctrl-Alt-3",
              run: (view) => { cmd.heading(view, 3); return true; },
              preventDefault: true
            },
            // List shortcuts
            {
              key: "Ctrl-Shift-8",
              run: (view) => { cmd.ul(view); return true; },
              preventDefault: true
            },
            {
              key: "Ctrl-Shift-7",
              run: (view) => { cmd.ol(view); return true; },
              preventDefault: true
            },
            {
              key: "Ctrl-Shift-9",
              run: (view) => { cmd.task(view); return true; },
              preventDefault: true
            },
            // Other shortcuts
            {
              key: "Ctrl-Shift-q",
              run: (view) => { cmd.quote(view); return true; },
              preventDefault: true
            },
            {
              key: "Ctrl-Shift-c",
              run: (view) => { cmd.codeBlock(view); return true; },
              preventDefault: true
            },
            {
              key: "Ctrl-s",
              run: () => { handleSave(); return true; },
              preventDefault: true
            },
            {
              key: "Ctrl-r",
              run: () => { handleRender(); return true; },
              preventDefault: true
            }
          ]),
          EditorView.updateListener.of(update => {
            if (update.docChanged) {
              isUserTypingRef.current = true; // Mark as user input
              setIsActivelyTyping(true);
              setIsTyping(true);
              const newContent = update.state.doc.toString();
              setContent(newContent);
              setModified(true);
              if (currentFile === 'sample.md') {
                setSampleDocContent(newContent);
              }
              
              // Clear existing timeouts
              if (contentChangeTimeoutRef.current) {
                clearTimeout(contentChangeTimeoutRef.current);
              }
              if (typingDetectionTimeoutRef.current) {
                clearTimeout(typingDetectionTimeoutRef.current);
              }
              
              // Typing detection timeout (longer to avoid inter-keystroke sync)
              typingDetectionTimeoutRef.current = setTimeout(() => {
                setIsActivelyTyping(false);
                setIsTyping(false);
              }, 1200); // Increased idle threshold further to reduce premature sync while typing
              
              // Smart trailing-only debounced render: one render after the last change
              const debounceMs = preferences.render_debounce_ms;
              contentChangeTimeoutRef.current = setTimeout(() => {
                handleAutoRender(newContent);
                isUserTypingRef.current = false; // Reset flag
              }, debounceMs);
            }
            // Remove caret-based scroll sync; handled by scroll listener below
          }),
        ],
        parent: editorRef.current
      });
      
      editorViewRef.current = view;

      // Add scroll listener for ratio based on actual scroll position
  const scrollEl = (view as unknown as { scrollDOM: HTMLElement }).scrollDOM;
      const handleScroll = () => {
        if (!scrollEl) return;
        if (isUserTypingRef.current || isTyping) return; // Suppress during active typing
  // Do NOT auto-resume allowAutoSync here; user must click Resume Sync explicitly
        const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
        if (maxScroll <= 0) {
          if (scrollIdleTimeoutRef.current) clearTimeout(scrollIdleTimeoutRef.current);
          scrollIdleTimeoutRef.current = setTimeout(() => setEditorScrollRatio(0), 120);
          return;
        }
        const ratio = scrollEl.scrollTop / maxScroll;
        // Debounce to only publish after user pauses scrolling ~120ms
        if (scrollIdleTimeoutRef.current) clearTimeout(scrollIdleTimeoutRef.current);
        scrollIdleTimeoutRef.current = setTimeout(() => {
          setEditorScrollRatio(ratio);
        }, 120);
      };
      scrollEl.addEventListener('scroll', handleScroll, { passive: true });
      // Initial ratio
      handleScroll();
      // Attach handler symbolically for cleanup
      (scrollEl as unknown as { _tideflowScrollHandler?: () => void })._tideflowScrollHandler = handleScroll;
    }
    
    return () => {
      // Capture refs locally (lint appeasement; values only used for clearing primitives)
      const timeoutId = contentChangeTimeoutRef.current;
      const typingId = typingDetectionTimeoutRef.current;
  const rafId = scrollSyncRafRef.current;
  const scrollIdleId = scrollIdleTimeoutRef.current;

      if (editorViewRef.current) {
        // Remove scroll listener before destroy
        try {
          const ev = editorViewRef.current as unknown as { scrollDOM?: (HTMLElement & { _tideflowScrollHandler?: () => void }) };
          const el = ev?.scrollDOM;
          if (el && el._tideflowScrollHandler) {
            el.removeEventListener('scroll', el._tideflowScrollHandler);
            delete el._tideflowScrollHandler;
          }
        } catch { /* ignore */ }
        editorViewRef.current.destroy();
        editorViewRef.current = null;
      }
      if (timeoutId) clearTimeout(timeoutId);
      if (typingId) clearTimeout(typingId);
      if (rafId !== null) {
        try { cancelAnimationFrame(rafId); } catch { /* ignore */ }
      }
      if (scrollIdleId) clearTimeout(scrollIdleId);
      scrollSyncRafRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally empty to prevent recreation

  // Load file content ONLY when switching to a different file, not on every keystroke.
  // Previous implementation re-dispatched the entire document on every content store update
  // (which happens for each keystroke) causing the scroll position to jump to top and cursor flicker.
  // We now detect file changes and only replace the document in that scenario.
  useEffect(() => {
    if (!editorViewRef.current) return;
    // When a new file is selected
    if (currentFile && currentFile !== prevFileRef.current) {
      // Replace document content with the file's content
      editorViewRef.current.dispatch({
        changes: {
          from: 0,
          to: editorViewRef.current.state.doc.length,
          insert: content
        }
      });
      lastLoadedContentRef.current = content;
      prevFileRef.current = currentFile;
      handleAutoRender(content);
    }
  }, [currentFile, content, handleAutoRender]);

  // If content in store changes for current file (e.g., loaded asynchronously) and differs from editor doc, update it.
  useEffect(() => {
    if (!editorViewRef.current) return;
    if (!currentFile) return;
    const currentDoc = editorViewRef.current.state.doc.toString();
    if (content !== currentDoc && currentFile === prevFileRef.current) {
      editorViewRef.current.dispatch({
        changes: {
          from: 0,
          to: editorViewRef.current.state.doc.length,
          insert: content
        }
      });
      lastLoadedContentRef.current = content;
    }
  }, [content, currentFile]);

  // Save the file
  const handleSave = async () => {
    if (!currentFile || !modified) return;
    
    try {
      setIsSaving(true);
      await writeMarkdownFile(currentFile, content);
      setModified(false);
      
      // After saving, render the file
      await handleRender();
    } catch (err) {
      handleError(err, { operation: 'save file', component: 'Editor' });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle font changes
  const handleFontChange = async (font: string) => {
    if (!editorViewRef.current) {
      return;
    }

    setSelectedFont(font);
    
    // Apply to selection only - document font is changed through Design menu
    cmd.fontLocal(editorViewRef.current, font);
  };

  // Handle image insertion from file picker
  const handleImageInsert = async () => {
    try {
      // Open file picker for images
      const selectedFile = await showOpenDialog([{
        name: 'Images',
        extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg']
      }]);

      if (!selectedFile) return; // User cancelled
      
      // Copy the selected file into the app's assets directory via backend
      try {
        const assetPath = await importImageFromPath(selectedFile);
        const imageMarkdown = generateImageMarkdown(
          assetPath,
          preferences.default_image_width,
          preferences.default_image_alignment
        );
        insertSnippet(imageMarkdown);
        console.info('[Editor] Inserted image asset path:', assetPath);
        showSuccess(`Inserted image: ${assetPath}`);
      } catch (err) {
        handleError(err, { operation: 'import image file', component: 'Editor' });
      }
    } catch (err) {
      handleError(err, { operation: 'open image file picker', component: 'Editor' });
    }
  };

  // Render the current content to PDF (not from file)
  const handleRender = async () => {
    try {
      setCompileStatus({ status: 'running' });
      
      const pdfPath = await renderTypst(content, 'pdf');
      setCompileStatus({ 
        status: 'ok', 
        pdf_path: pdfPath 
      });
    } catch (err) {
      setCompileStatus({ 
        status: 'error', 
        message: 'Rendering failed', 
        details: String(err) 
      });
    }
  };

  // Insert a template snippet
  const insertSnippet = (snippet: string) => {
    if (!editorViewRef.current) return;
    
    const selection = editorViewRef.current.state.selection.main;
    editorViewRef.current.dispatch({
      changes: { from: selection.from, to: selection.to, insert: snippet }
    });
  };

  // Handle paste events for images
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      if (item.type.indexOf('image') === 0) {
        e.preventDefault();
        
        const blob = item.getAsFile();
        if (!blob) continue;
        
        try {
          // Convert blob to base64
          const reader = new FileReader();
          reader.onload = async (event) => {
            if (!event.target?.result) return;
            
            const base64data = event.target.result.toString();
            const assetPath = await importImage(base64data);
            
            // Insert image markdown with default preferences
            const imageMarkdown = generateImageMarkdown(
              assetPath,
              preferences.default_image_width,
              preferences.default_image_alignment
            );
            
            insertSnippet(imageMarkdown);
          };
          
          reader.readAsDataURL(blob);
        } catch (err) {
          handleError(err, { operation: 'process pasted image', component: 'Editor' });
        }
      }
    }
  };

  // Handle drop events for images
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    
    if (e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      
      if (file.type.startsWith('image/')) {
        try {
          // Convert file to base64
          const reader = new FileReader();
          reader.onload = async (event) => {
            if (!event.target?.result) return;
            
            const base64data = event.target.result.toString();
            const assetPath = await importImage(base64data, file.name);
            
            // Insert image markdown with default preferences
            const imageMarkdown = generateImageMarkdown(
              assetPath,
              preferences.default_image_width,
              preferences.default_image_alignment
            );
            
            insertSnippet(imageMarkdown);
          };
          
          reader.readAsDataURL(file);
        } catch (err) {
          handleError(err, { operation: 'process dropped image', component: 'Editor' });
        }
      }
    }
  };

  // Force remount of the inner editor UI after a full close-all followed by opening a new file.
  // We track a generation that increments when transitioning from no open files to having one again.
  const generationRef = useRef(0);
  const hadNoFilesRef = useRef(false);
  useEffect(() => {
    if (openFiles.length === 0) {
      hadNoFilesRef.current = true;
    } else if (hadNoFilesRef.current && openFiles.length === 1) {
      // First file after close-all
      generationRef.current += 1;
      hadNoFilesRef.current = false;
      if (process.env.NODE_ENV !== 'production') {
        console.log('[Editor] Remounting editor after close-all. Generation =', generationRef.current);
      }
    }
  }, [openFiles]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Editor] Mounted generation', generationRef.current);
    }
    // Run once per mount (keyed by generation via outer div key)
  }, []);

  return (
    <div 
      key={generationRef.current}
      className="editor-container" 
      onPaste={handlePaste}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      {currentFile ? (
        <>
          <div className="editor-toolbar">
            <span className="file-path">{currentFile}</span>
            <div className="editor-status">
              {isActivelyTyping && (
                <span className="typing-indicator">
                  ⌨️ Typing
                </span>
              )}
              <span className="debounce-info">
                {preferences.render_debounce_ms}ms debounce
              </span>
            </div>
            <div className="editor-actions">
              <button 
                onClick={handleSave} 
                disabled={!modified || isSaving}
                title="Save File"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button 
                onClick={handleRender}
                title="Render PDF"
              >
                Render
              </button>
            </div>
          </div>
          
          {/* Simple Markdown Toolbar */}
          <div className="simple-markdown-toolbar">
            <button onClick={() => cmd.bold(editorViewRef.current!)} title="Bold (Ctrl+B)">
              <strong>B</strong>
            </button>
            <button onClick={() => cmd.italic(editorViewRef.current!)} title="Italic (Ctrl+I)">
              <em>I</em>
            </button>
            <button onClick={() => cmd.strike(editorViewRef.current!)} title="Strikethrough">
              <s>S</s>
            </button>
            <button onClick={() => cmd.codeInline(editorViewRef.current!)} title="Inline Code (Ctrl+`)">
              {'</>'}
            </button>
            <button onClick={() => cmd.link(editorViewRef.current!)} title="Link (Ctrl+K)">
              🔗
            </button>
            <div className="toolbar-divider" />
            <button onClick={() => cmd.heading(editorViewRef.current!, 1)} title="Heading 1 (Ctrl+Alt+1)">
              H1
            </button>
            <button onClick={() => cmd.heading(editorViewRef.current!, 2)} title="Heading 2 (Ctrl+Alt+2)">
              H2
            </button>
            <button onClick={() => cmd.heading(editorViewRef.current!, 3)} title="Heading 3 (Ctrl+Alt+3)">
              H3
            </button>
            <button onClick={() => cmd.quote(editorViewRef.current!)} title="Blockquote (Ctrl+Shift+Q)">
              ""
            </button>
            <div className="toolbar-divider" />
            <button onClick={() => cmd.ul(editorViewRef.current!)} title="Bullet List (Ctrl+Shift+8)">
              • List
            </button>
            <button onClick={() => cmd.ol(editorViewRef.current!)} title="Numbered List (Ctrl+Shift+7)">
              1. List
            </button>
            <button onClick={() => cmd.task(editorViewRef.current!)} title="Task List (Ctrl+Shift+9)">
              ☐ Task
            </button>
            <div className="toolbar-divider" />
            <button onClick={() => cmd.table(editorViewRef.current!)} title="Insert Table">
              ▦
            </button>
            <button onClick={() => cmd.hr(editorViewRef.current!)} title="Horizontal Rule">
              —
            </button>
            <button onClick={() => cmd.pagebreak(editorViewRef.current!)} title="Page Break">
              ⤓⤒
            </button>
            <button onClick={handleImageInsert} title="Insert Image">
              🖼️
            </button>
            <div className="toolbar-divider" />
            
            {/* Font Controls */}
            <div className="font-controls">              
              <div className="font-selector">
                <label>Font (Selection):</label>
                <select 
                  value={selectedFont} 
                  onChange={(e) => handleFontChange(e.target.value)}
                  title="Apply font to selected text"
                >
                  {FONT_OPTIONS.map((font) => (
                    <option key={font} value={font}>
                      {font}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          
          <div className="editor-content" ref={editorRef} />
        </>
      ) : (
        <div className="no-file-message">
          <p>No file open. Please select or create a file from the file tree.</p>
        </div>
      )}
    </div>
  );
};

export default Editor;
