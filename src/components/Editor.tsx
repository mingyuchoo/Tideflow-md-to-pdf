import React, { useEffect, useRef, useState, useCallback } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { keymap } from '@codemirror/view';
import { useAppStore } from '../store';
import { writeMarkdownFile, importImage, generateImageMarkdown, renderTypst, setPreferences as savePreferences, applyPreferences } from '../api';
// import MarkdownToolbar from './MarkdownToolbar';
import { cmd } from './MarkdownCommands';
import { FONT_OPTIONS } from './MarkdownToolbar';
import './Editor.css';

// Helper function to extract the current section around cursor position
const getCurrentSection = (content: string, cursorPosition: number): string => {
  const lines = content.split('\n');
  let totalChars = 0;
  let currentLineIndex = 0;
  
  // Find which line the cursor is on
  for (let i = 0; i < lines.length; i++) {
    if (totalChars + lines[i].length >= cursorPosition) {
      currentLineIndex = i;
      break;
    }
    totalChars += lines[i].length + 1; // +1 for newline
  }
  
  // Find the current section bounds (between headers)
  let sectionStart = 0;
  let sectionEnd = lines.length - 1;
  
  // Look backward for a header
  for (let i = currentLineIndex; i >= 0; i--) {
    if (lines[i].trim().startsWith('#')) {
      sectionStart = i;
      break;
    }
  }
  
  // Look forward for next header
  for (let i = currentLineIndex + 1; i < lines.length; i++) {
    if (lines[i].trim().startsWith('#')) {
      sectionEnd = i - 1;
      break;
    }
  }
  
  // Extract the section content
  const sectionLines = lines.slice(sectionStart, sectionEnd + 1);
  return sectionLines.join('\n');
};

// Wrap section content for focused preview
const createFocusedPreview = (sectionContent: string, globalFrontMatter: string = ''): string => {
  // Extract any front matter from global content
  let frontMatter = globalFrontMatter;
  if (!frontMatter && sectionContent.trim().startsWith('---')) {
    const parts = sectionContent.split('---');
    if (parts.length >= 3) {
      frontMatter = `---${parts[1]}---`;
      sectionContent = parts.slice(2).join('---');
    }
  }
  
  // If no front matter exists, create minimal one
  if (!frontMatter) {
    frontMatter = '---\nformat: pdf\ngeometry: margin=1in\n---';
  }
  
  return `${frontMatter}\n\n${sectionContent}`;
};

const Editor: React.FC = () => {
  const editorRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [focusedPreviewMode, setFocusedPreviewMode] = useState(false);
  const [isActivelyTyping, setIsActivelyTyping] = useState(false);
  const [fontMode, setFontMode] = useState<"Selection" | "Document">("Selection");
  const [selectedFont, setSelectedFont] = useState<string>("New Computer Modern");
  const contentChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingDetectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUserTypingRef = useRef(false); // Track if user is actively typing
  const lastLoadedContentRef = useRef<string>(''); // Track last loaded content
  const globalFrontMatterRef = useRef<string>(''); // Cache front matter for focused mode
  
  const { 
    editor: { currentFile, content, modified },
    setContent,
    setModified,
    setCompileStatus,
    preferences,
    setPreferences
  } = useAppStore();

  // Smart auto-render function with focused preview support
  const handleAutoRender = useCallback(async (content: string, useFocusedMode: boolean = false) => {
    try {
      setCompileStatus({ status: 'running' });
      
      let renderContent = content;
      
      // Use focused preview if enabled and in focused mode
      if (useFocusedMode && preferences.focused_preview_enabled && editorViewRef.current) {
        const cursorPos = editorViewRef.current.state.selection.main.from;
        const currentSection = getCurrentSection(content, cursorPos);
        renderContent = createFocusedPreview(currentSection, globalFrontMatterRef.current);
      }
      
      const pdfPath = await renderTypst(renderContent, 'pdf');
      setCompileStatus({ 
        status: 'ok', 
        pdf_path: pdfPath 
      });
    } catch (err) {
      setCompileStatus({ 
        status: 'error', 
        message: 'Auto-render failed', 
        details: String(err) 
      });
    }
  }, [setCompileStatus, preferences.focused_preview_enabled]);

  // Extract global front matter for focused preview mode
  useEffect(() => {
    if (content.trim().startsWith('---')) {
      const parts = content.split('---');
      if (parts.length >= 3) {
        globalFrontMatterRef.current = `---${parts[1]}---`;
      }
    }
  }, [content]);

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
              const newContent = update.state.doc.toString();
              setContent(newContent);
              setModified(true);
              
              // Clear existing timeouts
              if (contentChangeTimeoutRef.current) {
                clearTimeout(contentChangeTimeoutRef.current);
              }
              if (typingDetectionTimeoutRef.current) {
                clearTimeout(typingDetectionTimeoutRef.current);
              }
              
              // Typing detection timeout (shorter)
              typingDetectionTimeoutRef.current = setTimeout(() => {
                setIsActivelyTyping(false);
              }, 150);
              
              // Smart debounced render
              const debounceMs = preferences.render_debounce_ms;
              const shouldUseFocusedMode = isActivelyTyping && preferences.focused_preview_enabled;
              
              contentChangeTimeoutRef.current = setTimeout(() => {
                handleAutoRender(newContent, shouldUseFocusedMode);
                isUserTypingRef.current = false; // Reset flag
                
                // If we used focused mode, schedule a full render after a pause
                if (shouldUseFocusedMode) {
                  setTimeout(() => {
                    if (!isUserTypingRef.current) {
                      handleAutoRender(newContent, false);
                    }
                  }, 2000); // 2 second pause before full render
                }
              }, debounceMs);
            }
          }),
        ],
        parent: editorRef.current
      });
      
      editorViewRef.current = view;
    }
    
    return () => {
      if (editorViewRef.current) {
        editorViewRef.current.destroy();
        editorViewRef.current = null;
      }
      if (contentChangeTimeoutRef.current) {
        clearTimeout(contentChangeTimeoutRef.current);
      }
      if (typingDetectionTimeoutRef.current) {
        clearTimeout(typingDetectionTimeoutRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally empty to prevent recreation

  // Update editor content when currentFile changes or content is loaded
  useEffect(() => {
    
    if (editorViewRef.current && (content !== lastLoadedContentRef.current || lastLoadedContentRef.current === '')) {
      // Clear any pending timeouts
      if (contentChangeTimeoutRef.current) {
        clearTimeout(contentChangeTimeoutRef.current);
      }
      
      // Force update with a slight delay to ensure state is settled
      setTimeout(() => {
        if (editorViewRef.current) {
          editorViewRef.current.dispatch({
            changes: {
              from: 0,
              to: editorViewRef.current.state.doc.length,
              insert: content
            }
          });
          lastLoadedContentRef.current = content;
          
          // Auto-render the content when switching tabs
          if (currentFile) {
            handleAutoRender(content, false);
          }
        }
      }, 50);
    }
  }, [currentFile, content, handleAutoRender]);

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
      console.error('Failed to save file:', err);
      // Show error to user
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
    
    if (fontMode === "Document") {
      // Update document font preference
      const newPrefs = {
        ...preferences,
        fonts: {
          ...preferences.fonts,
          main: font
        }
      };
      
      // Save to backend first
      try {
        await savePreferences(newPrefs);
        
        // Update local state
        setPreferences(newPrefs);
        
        // Apply preferences to generate prefs.json for Typst
        await applyPreferences();
        
        // Re-render with new font
        handleRender(); 
      } catch (error) {
        console.error('Failed to save preferences:', error);
      }
    } else {
      // Apply to selection
      cmd.fontLocal(editorViewRef.current, font);
    }
  };

  // Handle font mode change
  const handleFontModeChange = (mode: "Selection" | "Document") => {
    setFontMode(mode);
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
          console.error('Failed to process pasted image:', err);
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
          console.error('Failed to process dropped image:', err);
        }
      }
    }
  };

  return (
    <div 
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
                  {focusedPreviewMode ? '🎯 Focused' : '⌨️ Typing'}
                </span>
              )}
              <span className="debounce-info">
                {preferences.render_debounce_ms}ms debounce
              </span>
            </div>
            <div className="editor-actions">
              <button 
                onClick={() => setFocusedPreviewMode(!focusedPreviewMode)}
                className={`toggle-button ${focusedPreviewMode ? 'active' : ''}`}
                title={`${focusedPreviewMode ? 'Disable' : 'Enable'} focused section preview for ultra-fast feedback`}
              >
                🎯 Focused
              </button>
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
            <div className="toolbar-divider" />
            
            {/* Font Controls */}
            <div className="font-controls">
              <div className="font-mode-selector">
                <label>Apply:</label>
                <select 
                  value={fontMode} 
                  onChange={(e) => handleFontModeChange(e.target.value as "Selection" | "Document")}
                  title="Choose whether to apply font to selection or entire document"
                >
                  <option value="Selection">Selection</option>
                  <option value="Document">Document</option>
                </select>
              </div>
              
              <div className="font-selector">
                <label>Font:</label>
                <select 
                  value={selectedFont} 
                  onChange={(e) => handleFontChange(e.target.value)}
                  title="Select font family"
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
