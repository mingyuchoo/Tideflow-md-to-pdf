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
import { handleError } from './utils/errorHandler';
import './App.css';
import { SAMPLE_DOC } from './sampleDoc';

// Import components
import TabBar from './components/TabBar';
import Editor from './components/Editor';
import PDFPreview from './components/PDFPreview';
import Toolbar from './components/Toolbar';
import StatusBar from './components/StatusBar';

function App() {
  const [loading, setLoading] = useState(true);
  const { 
    setPreferences, 
    previewVisible, 
  
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
    setContent(SAMPLE_DOC);
    setSampleDocContent(SAMPLE_DOC);
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
        const unlistenCompiled = await listen<string>("compiled", (evt) => {
          useAppStore.getState().setCompileStatus({ status: 'ok', pdf_path: evt.payload });
        });

        const unlistenCompileError = await listen<string>("compile-error", (evt) => {
          useAppStore.getState().setCompileStatus({ status: 'error', message: 'Compile failed', details: evt.payload });
        });

        const unlistenPrefsDump = await listen<string>("prefs-dump", (evt) => {
          try {
            const json = JSON.parse(evt.payload);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            console.log('[PrefsDump] toc:', (json as any).toc, 'numberSections:', (json as any).numberSections, 'papersize:', (json as any).papersize, 'margin:', (json as any).margin);
          } catch {
            console.log('[PrefsDump] raw:', evt.payload);
          }
        });

        const unlistenRenderDebug = await listen<string>("render-debug", (evt) => {
          console.log('[RenderDebug]', evt.payload);
        });

        const unlistenTemplateInspect = await listen<string>("template-inspect", (evt) => {
          console.log('[TemplateInspect]', evt.payload);
        });
        const unlistenTemplateWarning = await listen<string>("template-warning", (evt) => {
          console.warn('[TemplateWarning]', evt.payload);
        });

        const unlistenPrefsWrite = await listen<string>("prefs-write", (evt) => {
          console.log('[PrefsWrite]', evt.payload);
        });

        const unlistenPrefsRead = await listen<string>("prefs-read", (evt) => {
          console.log('[PrefsRead]', evt.payload);
        });

        // Cleanup listeners on component unmount
        return () => {
          unlistenCompiled();
          unlistenCompileError();
          unlistenPrefsDump();
          unlistenRenderDebug();
          unlistenTemplateInspect();
          unlistenTemplateWarning();
          unlistenPrefsWrite();
          unlistenPrefsRead();
        };
      } catch (error) {
        handleError(error, { operation: 'initialize app', component: 'App' });
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
    </div>
  );
}

export default App;
