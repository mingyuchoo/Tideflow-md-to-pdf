import { useEffect, useState } from 'react';
import { 
  Panel, 
  PanelGroup, 
  PanelResizeHandle 
} from 'react-resizable-panels';
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useAppStore } from './store';
import { getPreferences, listenForFileChanges, readMarkdownFile } from './api';
import { loadSession, saveSession } from './utils/session';
import { handleError } from './utils/errorHandler';
import './App.css';
import { SAMPLE_DOC } from './sampleDoc';
import type { BackendRenderedDocument } from './types';

// Import components
import TabBar from './components/TabBar';
import Editor from './components/Editor';
import PDFPreview from './components/PDFPreview';
import PDFErrorBoundary from './components/PDFErrorBoundary';
import Toolbar from './components/Toolbar';
import { TIMING } from './constants/timing';
import StatusBar from './components/StatusBar';

function App() {
  const [loading, setLoading] = useState(true);
  const { previewVisible } = useAppStore();

  // Simple collapse flag; no persistence
  const previewCollapsed = !previewVisible;

  // Removed all panel persistence logic for fixed layout.

  // Initialize app
  useEffect(() => {
    let unsubscribes: UnlistenFn[] = [];
    let disposed = false;

    const register = (unlisten: UnlistenFn) => {
      if (disposed) {
        try {
          unlisten();
        } catch {
          // ignore cleanup failures for registrations that resolve after teardown
        }
      } else {
        unsubscribes.push(unlisten);
      }
    };

    const init = async () => {
      try {
        console.log('[App] init start');
        const session = loadSession();
        const store = useAppStore.getState();
        let sampleInjected = store.initialSampleInjected;

        const prefs = await getPreferences();
        store.setPreferences(prefs);
        store.setThemeSelection(prefs.theme_id ?? 'default');
        console.log('[App] preferences loaded', prefs);

        if (session && !sampleInjected) {
          try {
            const restored = Array.from(new Set(session.openFiles || []));
            for (const f of restored) {
              if (f === 'sample.md') continue;
              try {
                const content = await readMarkdownFile(f);
                store.addOpenFile(f);
                if (f === session.currentFile) {
                  store.setCurrentFile(f);
                  store.setContent(content);
                }
              } catch (e) {
                console.warn('[Session] Skipped unreadable file', f, e);
              }
            }

            if (session.sampleDocContent) {
              store.setSampleDocContent(session.sampleDocContent);
            }
            if (
              session.currentFile === 'sample.md' ||
              (restored.length === 0 && !store.editor.currentFile)
            ) {
              store.setCurrentFile('sample.md');
              store.addOpenFile('sample.md');
              const content = session.sampleDocContent ?? '# Sample Document\n\nStart writing...';
              store.setContent(content);
            }

            if (typeof session.previewVisible === 'boolean') {
              store.setPreviewVisible(session.previewVisible);
            }

            store.setInitialSampleInjected(true);
            sampleInjected = true;
          } catch (e) {
            console.warn('[Session] Failed to restore session, falling back to sample.', e);
          }
        }

        if (!store.editor.currentFile && !sampleInjected) {
          store.setCurrentFile('sample.md');
          store.addOpenFile('sample.md');
          store.setContent(SAMPLE_DOC);
          store.setSampleDocContent(SAMPLE_DOC);
          store.setInitialSampleInjected(true);
          sampleInjected = true;
        }

        try {
          const unlistenFiles = await listenForFileChanges((filePath) => {
            const { editor: currentEditor } = useAppStore.getState();
            if (filePath === currentEditor.currentFile) {
              // Placeholder for future reload logic.
            }
          });
          register(unlistenFiles);
        } catch (e) {
          console.warn('[App] Failed to register file-change listener', e);
        }

        const unlistenCompiled = await listen<BackendRenderedDocument>('compiled', (evt) => {
          const { pdf_path, source_map } = evt.payload;
          const state = useAppStore.getState();
          state.setCompileStatus({ status: 'ok', pdf_path, source_map });
          state.setSourceMap(source_map);
          state.setCompiledAt(Date.now());
          if (!state.activeAnchorId && source_map.anchors.length > 0) {
            state.setActiveAnchorId(source_map.anchors[0].id);
          }
          // Trigger a final sync pass in the preview once the backend has
          // delivered the compiled PDF and source map. This helps ensure
          // the preview performs a one-shot final render+refresh on app
          // startup rather than waiting for a subsequent document switch.
          try {
            // Delay a touch so the preview has a chance to mount and
            // wire listeners before the final sync event is consumed.
            setTimeout(() => {
              try { window.dispatchEvent(new CustomEvent('pdf-preview-final-sync')); } catch { /* ignore */ }
            }, TIMING.FINAL_SYNC_DELAY_MS);
          } catch {
            // ignore
          }
        });
        register(unlistenCompiled);

        const unlistenCompileError = await listen<string>('compile-error', (evt) => {
          const state = useAppStore.getState();
          state.setCompileStatus({ status: 'error', message: 'Compile failed', details: evt.payload });
          state.setSourceMap(null);
        });
        register(unlistenCompileError);

        const unlistenPrefsDump = await listen<string>('prefs-dump', (evt) => {
          try {
            const json = JSON.parse(evt.payload);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            console.log('[PrefsDump] toc:', (json as any).toc, 'numberSections:', (json as any).numberSections, 'papersize:', (json as any).papersize, 'margin:', (json as any).margin);
          } catch {
            console.log('[PrefsDump] raw:', evt.payload);
          }
        });
        register(unlistenPrefsDump);

        const unlistenRenderDebug = await listen<string>('render-debug', (evt) => {
          console.log('[RenderDebug]', evt.payload);
        });
        register(unlistenRenderDebug);

        const unlistenTypstStdErr = await listen<string>('typst-query-stderr', (evt) => {
          console.warn('[TypstQuery STDERR]', evt.payload);
        });
        register(unlistenTypstStdErr);

        const unlistenTypstStdOut = await listen<string>('typst-query-stdout', (evt) => {
          console.log('[TypstQuery STDOUT]', evt.payload);
        });
        register(unlistenTypstStdOut);

        const unlistenTypstFailed = await listen<string>('typst-query-failed', () => {
          console.warn('[TypstQuery] no positions found, falling back to PDF-text extraction');
          const st = useAppStore.getState();
          st.setTypstQueryFailed(true);
        });
        register(unlistenTypstFailed);

        // Listen for fullscreen requests dispatched from UI components.
        const onReqFs = (ev: Event) => {
          try {
            const ce = ev as CustomEvent<{ fullscreen?: boolean }>;
            const want = ce?.detail?.fullscreen;
            if (typeof want !== 'boolean') return;
            // Persist preference
            try { saveSession({ fullscreen: want }); } catch { /* ignore */ }
            // Try Tauri window API if available
            (async () => {
              try {
                const mod = await import('@tauri-apps/api/window');
                const modTyped = mod as { getCurrentWindow?: () => unknown; getCurrent?: () => unknown; appWindow?: unknown };
                const win = modTyped.getCurrentWindow?.() || modTyped.getCurrent?.() || modTyped.appWindow;
                if (win && typeof (win as { setFullscreen?: unknown }).setFullscreen === 'function') {
                  try { await (win as { setFullscreen: (f: boolean) => Promise<void> }).setFullscreen(want); } catch (e) { console.debug('[App] setFullscreen failed', e); }
                  return;
                }
              } catch (e) {
                void e; // dynamic import failed; fall through to DOM API
              }
              // Fallback: use DOM Fullscreen API on the document element
              try {
                if (want) {
                  if (document.documentElement.requestFullscreen) {
                    // requestFullscreen returns a Promise
                    void document.documentElement.requestFullscreen();
                  }
                } else {
                  if (document.fullscreenElement) {
                    void document.exitFullscreen();
                  }
                }
              } catch (e) {
                console.debug('[App] DOM fullscreen toggle failed', e);
              }
            })();
          } catch (e) {
            void e;
          }
        };
        window.addEventListener('tideflow-request-fullscreen', onReqFs as EventListener);
        // unregister on cleanup
        register(() => window.removeEventListener('tideflow-request-fullscreen', onReqFs as EventListener));

        // Template inspect/warning listeners removed - they only logged debug info
        // If needed for debugging, add them back temporarily
      } catch (error) {
        handleError(error, { operation: 'initialize app', component: 'App' });
      } finally {
        if (!disposed) {
          setLoading(false);
          console.log('[App] init complete');
          // Apply saved fullscreen if requested in session
          try {
            const s = loadSession();
            if (s?.fullscreen) {
              if (process.env.NODE_ENV !== 'production') console.debug('[App] applying saved fullscreen');
              try {
                window.dispatchEvent(new CustomEvent('tideflow-request-fullscreen', { detail: { fullscreen: true } }));
              } catch (err) {
                console.warn('[App] failed to dispatch tideflow-request-fullscreen', err);
              }
            }
          } catch (err) {
            console.warn('[App] failed to read session for fullscreen', err);
          }
        }
      }
    };

    init();

    return () => {
      disposed = true;
      for (const unlisten of unsubscribes) {
        try {
          unlisten();
        } catch {
          // ignore cleanup failures
        }
      }
      unsubscribes = [];
    };
  }, []);

  // Autosave session when key state changes (debounced to prevent corruption)
  const { openFiles, currentFile } = useAppStore(s => s.editor);
  const sampleDocContent = useAppStore(s => s.sampleDocContent);
  const previewVisibleState = useAppStore(s => s.previewVisible);
  
  useEffect(() => {
    // Debounce session saves to prevent high-frequency localStorage writes
    const timeoutId = setTimeout(() => {
      try {
        // Read current session once at the start for atomic update
        const currentSession = loadSession();
        saveSession({
          openFiles,
          currentFile,
          sampleDocContent,
          previewVisible: previewVisibleState,
          // Preserve fullscreen from current session (it's saved separately on fullscreen event)
          fullscreen: currentSession?.fullscreen ?? false,
        });
      } catch (error) {
        console.warn('[App] Failed to save session:', error);
      }
    }, 500); // 500ms debounce
    
    return () => clearTimeout(timeoutId);
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
            {!previewCollapsed && (
              <PDFErrorBoundary>
                <PDFPreview />
              </PDFErrorBoundary>
            )}
          </Panel>
        </PanelGroup>
      </div>
      <StatusBar />
    </div>
  );
}

export default App;
