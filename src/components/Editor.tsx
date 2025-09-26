import React, { useEffect, useRef, useState, useCallback } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { keymap } from '@codemirror/view';
import { useAppStore } from '../store';
import {
  writeMarkdownFile,
  importImage,
  importImageFromPath,
  generateImageMarkdown,
  renderTypst,
  showOpenDialog,
  cleanupTempPdfs,
} from '../api';
import { showSuccess } from '../utils/errorHandler';
import { cmd } from './MarkdownCommands';
import { FONT_OPTIONS } from './MarkdownToolbar';
import type { SourceAnchor, SourceMap, SyncMode } from '../types';
import { handleError } from '../utils/errorHandler';
import { deriveAltFromPath } from '../utils/image';
import './Editor.css';
import ImagePropsModal, { type ImageProps } from './ImagePropsModal';
import ImagePlusModal, { type ImagePlusChoice } from './ImagePlusModal';

const Editor: React.FC = () => {
  const editorRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isActivelyTyping, setIsActivelyTyping] = useState(false);
  const [selectedFont, setSelectedFont] = useState<string>("New Computer Modern");
  const contentChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingDetectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollIdleTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Debounce editor scroll
  const programmaticScrollRef = useRef(false);
  const anchorUpdateFromEditorRef = useRef(false);
  const sourceMapRef = useRef<SourceMap | null>(null);
  const activeAnchorIdRef = useRef<string | null>(null);
  const syncModeRef = useRef<SyncMode>('auto');
  const isUserTypingRef = useRef(false); // Track if user is actively typing
  const lastLoadedContentRef = useRef<string>(''); // Track last loaded content
  const prevFileRef = useRef<string | null>(null); // Track previously opened file to avoid resetting editor on each keystroke
  const openFilesRef = useRef<string[]>([]);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const imageModalResolveRef = useRef<((props: ImageProps | null) => void) | null>(null);
  const [calloutType, setCalloutType] = useState<'box' | 'info' | 'tip' | 'warn'>('box');
  const [imagePlusOpen, setImagePlusOpen] = useState(false);
  const [imagePlusPath, setImagePlusPath] = useState('assets/');

  // Helper: open image modal and resolve with chosen values or null on cancel
  const promptImageProps = useCallback((initial: ImageProps): Promise<ImageProps | null> => {
    return new Promise((resolve) => {
      imageModalResolveRef.current = resolve;
      setImageModalOpen(true);
      // store initial via state in modal props below
      setImageInitial(initial);
    });
  }, []);

  const [imageInitial, setImageInitial] = useState<ImageProps>({ width: '60%', alignment: 'center', alt: '' });

  const {
    editor: { currentFile, content, modified, openFiles },
    setContent,
    setModified,
    setCompileStatus,
    preferences,
    setSampleDocContent,
    sourceMap,
    setSourceMap,
    activeAnchorId,
    setActiveAnchorId,
    syncMode,
    setSyncMode,
    isTyping,
    setIsTyping
  } = useAppStore();

  useEffect(() => {
    sourceMapRef.current = sourceMap;
  }, [sourceMap]);

  useEffect(() => {
    activeAnchorIdRef.current = activeAnchorId;
  }, [activeAnchorId]);

  useEffect(() => {
    syncModeRef.current = syncMode;
  }, [syncMode]);

  const isTypingStoreRef = useRef(isTyping);
  useEffect(() => {
    isTypingStoreRef.current = isTyping;
  }, [isTyping]);

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
      const document = await renderTypst(content, 'pdf');
      setSourceMap(document.sourceMap);
      setCompileStatus({
        status: 'ok',
        pdf_path: document.pdfPath,
        source_map: document.sourceMap,
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
      setSourceMap(null);
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

      // Add scroll listener to compute active anchor based on viewport
      const scrollEl = (view as unknown as { scrollDOM: HTMLElement }).scrollDOM;
      const computeAnchorFromViewport = () => {
        if (!scrollEl) return;
        if (programmaticScrollRef.current) return;
        if (isUserTypingRef.current || isTypingStoreRef.current) return;
        const map = sourceMapRef.current;
        if (!map || map.anchors.length === 0) return;

        const top = scrollEl.scrollTop;
        const bottom = top + scrollEl.clientHeight;
        const topBlock = view.lineBlockAtHeight(Math.max(0, top));
        const bottomHeight = Math.max(0, Math.min(scrollEl.scrollHeight - 1, bottom));
        const bottomBlock = view.lineBlockAtHeight(bottomHeight);
        const topLine = Math.max(0, view.state.doc.lineAt(topBlock.from).number - 1);
        const bottomLine = Math.max(0, view.state.doc.lineAt(bottomBlock.to).number - 1);
        const centerLine = Math.max(0, Math.floor((topLine + bottomLine) / 2));

        let closest: SourceAnchor | null = null;
        let closestDiff = Number.POSITIVE_INFINITY;
        for (const anchor of map.anchors) {
          const diff = Math.abs(anchor.editor.line - centerLine);
          if (
            diff < closestDiff ||
            (diff === closestDiff && anchor.editor.offset < (closest?.editor.offset ?? Number.POSITIVE_INFINITY))
          ) {
            closest = anchor;
            closestDiff = diff;
          }
        }

        if (!closest) return;

        if (syncModeRef.current === 'locked-to-pdf') {
          setSyncMode('auto');
        }

        if (closest.id !== activeAnchorIdRef.current) {
          anchorUpdateFromEditorRef.current = true;
          setActiveAnchorId(closest.id);
        }
      };

      const handleScroll = () => {
        if (scrollIdleTimeoutRef.current) {
          clearTimeout(scrollIdleTimeoutRef.current);
        }
        scrollIdleTimeoutRef.current = setTimeout(() => {
          computeAnchorFromViewport();
        }, 80);
      };

      scrollEl.addEventListener('scroll', handleScroll, { passive: true });
      computeAnchorFromViewport();
      (scrollEl as unknown as { _tideflowScrollHandler?: () => void })._tideflowScrollHandler = handleScroll;
    }
    
    return () => {
      // Capture refs locally (lint appeasement; values only used for clearing primitives)
      const timeoutId = contentChangeTimeoutRef.current;
      const typingId = typingDetectionTimeoutRef.current;
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
      if (scrollIdleId) clearTimeout(scrollIdleId);
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

  useEffect(() => {
    if (!editorViewRef.current) return;
    if (!sourceMap) return;
    if (!activeAnchorId) return;
    if (anchorUpdateFromEditorRef.current) {
      anchorUpdateFromEditorRef.current = false;
      return;
    }
    if (isTypingStoreRef.current) return;
    if (syncModeRef.current !== 'locked-to-pdf') return;

    const anchor = sourceMap.anchors.find((candidate) => candidate.id === activeAnchorId);
    if (!anchor) return;

    const view = editorViewRef.current;
    programmaticScrollRef.current = true;
    const effect = EditorView.scrollIntoView(anchor.editor.offset, { y: 'center' });
    view.dispatch({ effects: effect });
    requestAnimationFrame(() => {
      programmaticScrollRef.current = false;
    });
  }, [activeAnchorId, sourceMap]);

  useEffect(() => {
    const anchors = sourceMap?.anchors ?? [];
    if (anchors.length === 0) {
      if (activeAnchorId !== null) {
        setActiveAnchorId(null);
      }
      return;
    }
    if (activeAnchorId && anchors.some((anchor) => anchor.id === activeAnchorId)) {
      return;
    }
    anchorUpdateFromEditorRef.current = true;
    setActiveAnchorId(anchors[0].id);
  }, [sourceMap, activeAnchorId, setActiveAnchorId]);

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
        // Ask for width/alignment before inserting
        const initial: ImageProps = {
          width: preferences.default_image_width,
          alignment: preferences.default_image_alignment as ImageProps['alignment'],
          alt: deriveAltFromPath(assetPath)
        };
        const chosen = await promptImageProps(initial);
        if (!chosen) return; // cancelled
        const imageMarkdown = generateImageMarkdown(
          assetPath,
          chosen.width,
          chosen.alignment,
          chosen.alt
        );
        insertSnippet(imageMarkdown);
        // Seed Image+ modal path for convenience
        setImagePlusPath(assetPath);
        console.info('[Editor] Inserted image asset path:', assetPath);
        showSuccess(`Inserted image: ${assetPath}`);
      } catch (err) {
        handleError(err, { operation: 'import image file', component: 'Editor' });
      }
    } catch (err) {
      handleError(err, { operation: 'open image file picker', component: 'Editor' });
    }
  };
  // Regex helpers to parse markdown image at cursor

  // Render the current content to PDF (not from file)
  const handleRender = async () => {
    try {
      setCompileStatus({ status: 'running' });
      const document = await renderTypst(content, 'pdf');
      setSourceMap(document.sourceMap);
      setCompileStatus({
        status: 'ok',
        pdf_path: document.pdfPath,
        source_map: document.sourceMap,
      });
    } catch (err) {
      setCompileStatus({
        status: 'error',
        message: 'Rendering failed',
        details: String(err)
      });
      setSourceMap(null);
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
              preferences.default_image_alignment,
              'Pasted image'
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
              preferences.default_image_alignment,
              deriveAltFromPath(file.name)
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
            <button onClick={() => cmd.vspace(editorViewRef.current!, '8pt')} title="Vertical Space">
              ↕
            </button>
            <button onClick={handleImageInsert} title="Insert Image">
              🖼️
            </button>
            <button
              onClick={() => setImagePlusOpen(true)}
              title="Image+ (Figure / Image + Text)"
            >
              🖼️+
            </button>
            {/* Quick image width selector: updates nearest <img> before the cursor */}
            <label className="inline-label">Img W:</label>
            <select
              className="inline-select"
              onChange={(e) => {
                const value = e.target.value;
                if (editorViewRef.current) {
                  cmd.imageWidth(editorViewRef.current, value);
                }
              }}
              defaultValue={preferences.default_image_width || '80%'}
              title="Quick image width: updates the nearest <img> before the cursor"
            >
              <option value="25%">25%</option>
              <option value="40%">40%</option>
              <option value="60%">60%</option>
              <option value="80%">80%</option>
              <option value="100%">100%</option>
            </select>
            {/* Callout variants: choose type, then click Insert */}
            <label className="inline-label">Callout:</label>
            <select
              className="inline-select"
              onChange={(e) => {
                const v = e.target.value as 'box' | 'info' | 'tip' | 'warn';
                setCalloutType(v || 'box');
              }}
              value={calloutType}
              title="Choose a callout type"
            >
              <option value="box">Note</option>
              <option value="info">Info</option>
              <option value="tip">Tip</option>
              <option value="warn">Warn</option>
            </select>
            <button
              title="Insert callout"
              onClick={() => {
                if (!editorViewRef.current) return;
                const t = calloutType;
                if (t === 'box') cmd.noteBox(editorViewRef.current);
                else if (t === 'info') cmd.noteInfo(editorViewRef.current);
                else if (t === 'tip') cmd.noteTip(editorViewRef.current);
                else if (t === 'warn') cmd.noteWarn(editorViewRef.current);
              }}
            >
              ☰
            </button>
            <button onClick={() => cmd.footnote(editorViewRef.current!)} title="Footnote">
              ⁵
            </button>
            <button onClick={() => cmd.columnsNoBorder(editorViewRef.current!)} title="Insert 2 Columns (no border)">
              ⫴ Columns
            </button>
            <button onClick={() => cmd.alignBlock(editorViewRef.current!, 'center')} title="Center Align Block">
              ⊕
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
          {/* Image properties modal */}
          <ImagePropsModal
            open={imageModalOpen}
            initial={imageInitial}
            onCancel={() => {
              setImageModalOpen(false);
              imageModalResolveRef.current?.(null);
              imageModalResolveRef.current = null;
            }}
            onSave={(props) => {
              setImageModalOpen(false);
              imageModalResolveRef.current?.(props);
              imageModalResolveRef.current = null;
            }}
          />
          {/* Image+ modal */}
          <ImagePlusModal
            open={imagePlusOpen}
            initialPath={imagePlusPath}
            defaultWidth={preferences.default_image_width}
            defaultAlignment={preferences.default_image_alignment as ImageProps['alignment']}
            onCancel={() => setImagePlusOpen(false)}
            onChoose={(choice: ImagePlusChoice) => {
              setImagePlusOpen(false);
              if (!editorViewRef.current) return;
              if (choice.kind === 'figure') {
                const { path, width, alignment, caption, alt } = choice.data;
                // Insert Typst figure with caption and accessible alt text
                cmd.figureWithCaption(editorViewRef.current, path, width, alignment, caption, alt);
              } else {
                const { path, width, alignment, columnText, alt, underText, position } = choice.data;
                // Insert HTML table with image + text columns (optional under-image text) and layout position
                cmd.imageWithTextColumns(editorViewRef.current, path, width, alignment, columnText, alt, underText, position);
              }
              // seed future openings
              setImagePlusPath(choice.data.path);
            }}
          />
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
