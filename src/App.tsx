import { useEffect, useState } from 'react';
import { 
  Panel, 
  PanelGroup, 
  PanelResizeHandle 
} from 'react-resizable-panels';
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from './store';
import { getPreferences, listenForFileChanges, readMarkdownFile } from './api';
import { loadSession, saveSession } from './utils/session';
import './App.css';

// Import components
import TabBar from './components/TabBar';
import Editor from './components/Editor';
import PDFPreview from './components/PDFPreview';
import Toolbar from './components/Toolbar';
import PrefsModal from './components/PrefsModal';
import StatusBar from './components/StatusBar';

function App() {
  const [loading, setLoading] = useState(true);
  const { 
    setPreferences, 
    previewVisible, 
    prefsModalOpen,
    editor,
    setCurrentFile,
    setContent,
    addOpenFile,
    initialSampleInjected,
    setInitialSampleInjected,
    setSampleDocContent
  } = useAppStore();

  // Simple collapse flag; no persistence
  const previewCollapsed = !previewVisible;

  // Removed all panel persistence logic for fixed layout.

  // Initialize app
  useEffect(() => {
    const init = async () => {
      try {
        console.log('[App] init start');
        // Attempt to load previous session before anything else
        const session = loadSession();

        // Load preferences
        const prefs = await getPreferences();
        setPreferences(prefs);
        console.log('[App] preferences loaded', prefs);
        
        // Restore session if present and not yet injected
        if (session && !initialSampleInjected) {
          try {
            // Restore open files (filter duplicates)
            const restored = Array.from(new Set(session.openFiles || []));
            if (restored.length > 0) {
              for (const f of restored) {
                if (f === 'sample.md') continue; // sample handled separately
                // Try reading file; skip if unreadable
                try {
                  const content = await readMarkdownFile(f);
                  addOpenFile(f);
                  if (f === session.currentFile) {
                    setCurrentFile(f);
                    setContent(content);
                  }
                } catch (e) {
                  console.warn('[Session] Skipped unreadable file', f, e);
                }
              }
            }
            // Restore sample content (only add if there are no real files or currentFile is sample)
            if (session.sampleDocContent) {
              setSampleDocContent(session.sampleDocContent);
            }
            if (session.currentFile === 'sample.md' || (restored.length === 0 && !editor.currentFile)) {
              setCurrentFile('sample.md');
              addOpenFile('sample.md');
              const content = session.sampleDocContent ?? '# Sample Document\n\nStart writing...';
              setContent(content);
            }
            // Preview visibility
            if (typeof session.previewVisible === 'boolean') {
              // We only have setter for previewVisible (already in store). Use direct call.
            }
            setInitialSampleInjected(true);
          } catch (e) {
            console.warn('[Session] Failed to restore session, falling back to sample.', e);
          }
        }

        // Initialize with default content if still nothing open
        if (!editor.currentFile && !initialSampleInjected) {
          setCurrentFile('sample.md');
          addOpenFile('sample.md');
          const sampleText = `# Welcome to MarkdownToPDF

This is a sample document to get you started.

## Features

- **Real-time PDF rendering**: Changes automatically render to PDF
- **Markdown support**: Full CommonMark and extended syntax
- **Image support**: Drag & drop or paste images
- **Tables**: Easy table creation and editing

## Getting Started

1. Start typing in this editor
2. Watch the PDF preview update automatically
3. Use the toolbar buttons for common elements
4. Save your work with Ctrl+S

## Math Support

You can include mathematical expressions:

Inline math: $E = mc^2$

Block math:
$$
\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
$$

## Code Blocks

\`\`\`python
def hello_world():
    print("Hello, World!")
\`\`\`

Happy writing!
`;
      setContent(sampleText);
      setSampleDocContent(sampleText);
      setInitialSampleInjected(true);
        }
        
        // Setup file change listener
        await listenForFileChanges((filePath) => {
          if (filePath === editor.currentFile) {
            // Notify about file change if it's the current file
            // Could trigger reload or render here
          }
        });

        // Setup compile event listeners
        const unlistenCompiled = await listen<string>("compiled", () => {
          // The PDFPreview component will pick this up via the store's compileStatus
        });

        const unlistenCompileError = await listen<string>("compile-error", () => {
          // The PDFPreview component will show the error
        });

        // Cleanup listeners on component unmount
        return () => {
          unlistenCompiled();
          unlistenCompileError();
        };
      } catch (error) {
        console.error('Failed to initialize app:', error);
      } finally {
        setLoading(false);
        console.log('[App] init complete');
      }
    };
    
    init();
  }, [editor.currentFile, setPreferences, setCurrentFile, setContent, addOpenFile, initialSampleInjected, setInitialSampleInjected, setSampleDocContent]);

  // Autosave session when key state changes
  const { openFiles, currentFile } = useAppStore(s => s.editor);
  const sampleDocContent = useAppStore(s => s.sampleDocContent);
  const previewVisibleState = useAppStore(s => s.previewVisible);
  useEffect(() => {
    saveSession({
      openFiles,
      currentFile,
      sampleDocContent,
      previewVisible: previewVisibleState
    });
  }, [openFiles, currentFile, sampleDocContent, previewVisibleState]);

  // Simplified toggle: no remount side effects needed.
  if (loading) {
    return <div className="loading">Loading...</div>;
  }
  // Compute default sizes: if collapsed -> editor 100%, else restored or fallback (55/45)
  const defaultEditorSize = previewCollapsed ? 100 : 50;
  const defaultPreviewSize = previewCollapsed ? 0 : 50;
  const panelGroupKey = `pg-fixed-${previewCollapsed ? 'collapsed' : 'open'}`;

  return (
    <div className="app">
      <Toolbar />
      <TabBar />
      <div className="main-content">
        <PanelGroup key={panelGroupKey} direction="horizontal" style={{ height: '100%', overflow: 'hidden' }}>
          <Panel
            defaultSize={defaultEditorSize}
            minSize={25}
            maxSize={previewCollapsed ? 100 : 75}
            style={{ overflow: 'hidden', minWidth: 0 }}
          >
            <Editor />
          </Panel>
          <PanelResizeHandle className="resize-handle" />
          <Panel
            // When collapsed, force a tiny size
            defaultSize={defaultPreviewSize}
            minSize={previewCollapsed ? 0 : 20}
            maxSize={previewCollapsed ? 0 : 75}
            style={{ 
              overflow: 'hidden', 
              minWidth: 0, 
              display: previewCollapsed ? 'none' : 'block' 
            }}
          >
            {/* Only mount PDFPreview when not collapsed to avoid wasted renders */}
            {!previewCollapsed && <PDFPreview />}
          </Panel>
        </PanelGroup>
      </div>
      <StatusBar />
      {prefsModalOpen && <PrefsModal />}
    </div>
  );
}

export default App;
