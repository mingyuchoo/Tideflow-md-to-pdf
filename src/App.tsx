import { useEffect, useState } from 'react';
import { 
  Panel, 
  PanelGroup, 
  PanelResizeHandle 
} from 'react-resizable-panels';
import { type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from '@tauri-apps/api/window';
import { confirm } from '@tauri-apps/plugin-dialog';
import { useAppStore } from './store';
import { loadSession, saveSession } from './utils/session';
import { logger } from './utils/logger';
import './App.css';
import { INSTRUCTIONS_DOC } from './instructionsDoc';
import { useAppInitialization } from './hooks/useAppInitialization';

// Import components
import TabBar from './components/TabBar';
import Editor from './components/Editor';
import PDFPreview from './components/PDFPreview';
import PDFErrorBoundary from './components/PDFErrorBoundary';
import Toolbar from './components/Toolbar';
import StatusBar from './components/StatusBar';
import { ToastContainer } from './components/ToastContainer';

// Create scoped logger for App component
const appLogger = logger.createScoped('App');

function App() {
  const [loading, setLoading] = useState(true);
  const { previewVisible, editor, isTyping } = useAppStore();

  // Simple collapse flag; no persistence
  const previewCollapsed = !previewVisible;

  // Removed all panel persistence logic for fixed layout.

  // Initialize app with extracted hook
  useAppInitialization();

  // Window management and fullscreen logic
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

    const setupWindowManagement = async () => {
      try {
        // Listen for window close requests
        const appWindow = getCurrentWindow();
        const unlistenCloseRequested = await appWindow.onCloseRequested(async (event) => {
          appLogger.info('Close requested');
          
          // Always prevent default and handle close manually
          event.preventDefault();
          
          const state = useAppStore.getState();
          const { editor, preferences, setPreferences } = state;
          
          appLogger.debug('Close handler', { modified: editor.modified, confirm_exit_on_unsaved: preferences.confirm_exit_on_unsaved });
          
          // Save window state before potential exit
          const isMaximized = await appWindow.isMaximized();
          saveSession({ maximized: isMaximized });
          
          // Check if there are unsaved changes and confirmation is enabled
          if (editor.modified && preferences.confirm_exit_on_unsaved) {
            // Ask for confirmation using Tauri dialog
            const result = await confirm(
              'You have unsaved changes. Do you want to exit without saving?',
              {
                title: 'Unsaved Changes',
                kind: 'warning',
                okLabel: 'Exit',
                cancelLabel: 'Cancel'
              }
            );
            
            if (result) {
              appLogger.info('User confirmed exit');
              // Ask if they want to disable future confirmations
              const disableFuturePrompts = await confirm(
                'Do you want to disable exit confirmation prompts in the future? You can re-enable this in Design → Advanced.',
                {
                  title: 'Disable Future Prompts?',
                  kind: 'info',
                  okLabel: 'Never Ask Again',
                  cancelLabel: 'Keep Asking'
                }
              );
              
              if (disableFuturePrompts) {
                appLogger.info('Disabling future prompts');
                // Update preference to disable future prompts
                setPreferences({ ...preferences, confirm_exit_on_unsaved: false });
                // Also save to backend
                try {
                  const { setPreferences: apiSetPrefs } = await import('./api');
                  await apiSetPrefs({ ...preferences, confirm_exit_on_unsaved: false });
                } catch (e) {
                  appLogger.error('Failed to save preference', e);
                }
              }
              
              // User confirmed exit, save session and close
              appLogger.debug('Saving session and destroying window');
              saveSession({
                currentFile: editor.currentFile,
                openFiles: editor.openFiles,
                previewVisible: state.previewVisible,
              });
              // Destroy the window
              await appWindow.destroy();
              appLogger.debug('Window destroy called');
            }
            // If not confirmed, do nothing (window stays open)
          } else {
            appLogger.debug('No unsaved changes or confirmation disabled - closing immediately');
            // No unsaved changes or confirmation disabled, save session and close
            saveSession({
              currentFile: editor.currentFile,
              openFiles: editor.openFiles,
              previewVisible: state.previewVisible,
            });
            // Close the window
            appLogger.debug('Calling destroy on window');
            await appWindow.destroy();
            appLogger.debug('Window destroy called');
          }
        });
        register(unlistenCloseRequested);

        // Restore or set default window state
        const windowSession = loadSession();
        const shouldMaximize = windowSession?.maximized ?? true; // Default to maximized
        if (shouldMaximize) {
          await appWindow.maximize();
        }

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
                  try { await (win as { setFullscreen: (f: boolean) => Promise<void> }).setFullscreen(want); } catch (e) { appLogger.debug('setFullscreen failed', e); }
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
                appLogger.debug('DOM fullscreen toggle failed', e);
              }
            })();
          } catch (e) {
            void e;
          }
        };
        window.addEventListener('tideflow-request-fullscreen', onReqFs as EventListener);
        // unregister on cleanup
        register(() => window.removeEventListener('tideflow-request-fullscreen', onReqFs as EventListener));

        // Set loading to false and apply saved fullscreen
        if (!disposed) {
          setLoading(false);
          appLogger.info('window management setup complete');
          // Apply saved fullscreen if requested in session
          try {
            const s = loadSession();
            if (s?.fullscreen) {
              appLogger.debug('applying saved fullscreen');
              try {
                window.dispatchEvent(new CustomEvent('tideflow-request-fullscreen', { detail: { fullscreen: true } }));
              } catch (err) {
                appLogger.warn('failed to dispatch tideflow-request-fullscreen', err);
              }
            }
          } catch (err) {
            appLogger.warn('failed to read session for fullscreen', err);
          }
        }
      } catch (error) {
        appLogger.error('Window management setup failed', error);
        if (!disposed) {
          setLoading(false);
        }
      }
    };

    setupWindowManagement();

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
  const previewVisibleState = useAppStore(s => s.previewVisible);
  
  // Load instructions.md content when it's set as current file
  useEffect(() => {
    const loadInstructionsContent = async () => {
      if (currentFile === 'instructions.md' && useAppStore.getState().editor.content === '# Loading instructions...') {
        useAppStore.getState().setContent(INSTRUCTIONS_DOC);
      }
    };
    loadInstructionsContent();
  }, [currentFile]);
  
  useEffect(() => {
    // Debounce session saves to prevent high-frequency localStorage writes
    const timeoutId = setTimeout(() => {
      try {
        // Read current session once at the start for atomic update
        const currentSession = loadSession();
        saveSession({
          openFiles,
          currentFile,
          previewVisible: previewVisibleState,
          // Preserve fullscreen from current session (it's saved separately on fullscreen event)
          fullscreen: currentSession?.fullscreen ?? false,
        });
      } catch (error) {
        appLogger.warn('Failed to save session', error);
      }
    }, 500); // 500ms debounce
    
    return () => clearTimeout(timeoutId);
  }, [openFiles, currentFile, previewVisibleState]);

  // Simplified toggle: no remount side effects needed.
  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <div className="loading-text">Loading Tideflow...</div>
      </div>
    );
  }
  // Compute default sizes: if collapsed -> editor 100%, else restored or fallback (55/45)
  const defaultEditorSize = previewCollapsed ? 100 : 50;
  const defaultPreviewSize = previewCollapsed ? 0 : 50;
  const panelGroupKey = `pg-fixed-${previewCollapsed ? 'collapsed' : 'open'}`;

  return (
    <div className="app">
      <Toolbar />
      <TabBar />
      <div className="address-bar">
        <span className="current-file-path">{editor.currentFile || 'No file open'}</span>
        {isTyping && (
          <span className="typing-indicator">
            ⌨️ Typing
          </span>
        )}
      </div>
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
      <ToastContainer />
    </div>
  );
}

export default App;
