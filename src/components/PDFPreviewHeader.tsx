import React from 'react';
import { saveSession } from '../utils/session';
import type { SyncMode } from '../types';

interface AnchorLike {
  id: string;
  editor?: unknown;
  pdf?: unknown;
}

interface Props {
  syncMode: string;
  setSyncMode: (m: SyncMode) => void;
  activeAnchorId: string | null;
  sourceMap?: { anchors: AnchorLike[] } | null;
  anchorOffsetsRef: { current: Map<string, number> };
  containerRef: React.RefObject<HTMLElement | null>;
  userManuallyPositionedPdfRef: { current: boolean };
  pdfZoom: number;
  setPdfZoom: (zoom: number) => void;
}

const PDFPreviewHeader: React.FC<Props> = ({ syncMode, setSyncMode, activeAnchorId, sourceMap, anchorOffsetsRef, containerRef, userManuallyPositionedPdfRef, pdfZoom, setPdfZoom }) => {
  const zoomLevels = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
  const currentZoomIndex = zoomLevels.indexOf(pdfZoom);
  
  return (
    <div className="pdf-preview-header">
      <h3>PDF Preview</h3>
      <div className="pdf-preview-actions sync-controls">
        <div className="zoom-controls">
          <button
            type="button"
            onClick={() => {
              const currentIndex = zoomLevels.indexOf(pdfZoom);
              if (currentIndex > 0) {
                setPdfZoom(zoomLevels[currentIndex - 1]);
              }
            }}
            title="Zoom out"
            className="zoom-btn"
            disabled={currentZoomIndex === 0}
          >
            −
          </button>
          <span className="zoom-display" title="Current zoom level">
            {Math.round(pdfZoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => {
              const currentIndex = zoomLevels.indexOf(pdfZoom);
              if (currentIndex < zoomLevels.length - 1) {
                setPdfZoom(zoomLevels[currentIndex + 1]);
              }
            }}
            title="Zoom in"
            className="zoom-btn"
            disabled={currentZoomIndex === zoomLevels.length - 1}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setPdfZoom(1.0)}
            title="Reset zoom to 100%"
            className="zoom-reset-btn"
            disabled={pdfZoom === 1.0}
          >
            Reset
          </button>
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              // Toggle fullscreen preference and persist it
              const cur = localStorage.getItem('tideflowSession');
              const parsed = cur ? JSON.parse(cur) : {};
              const next = !parsed.fullscreen;
              saveSession({ fullscreen: next });

              // Try to perform DOM fullscreen synchronously so the browser
              // recognizes the user gesture (avoids async gaps that block
              // requestFullscreen). This will succeed in normal browser
              // dev mode; Tauri's window.setFullscreen will be attempted
              // asynchronously afterwards and may override.
              try {
                if (next) {
                  if (document.documentElement.requestFullscreen) {
                    // requestFullscreen must be done in the user gesture
                    void document.documentElement.requestFullscreen();
                  }
                } else {
                  if (document.fullscreenElement) {
                    void document.exitFullscreen();
                  }
                }
              } catch (domErr) {
                void domErr;
              }

              // Try to call Tauri window API asynchronously; if not
              // available, dispatch an event as a fallback for other
              // listeners.
              try {
                // dynamic import to avoid build-time mismatches
                const mod = await import('@tauri-apps/api/window');
                // try several known entrypoints with mild typing to avoid `any`
                const modTyped = mod as { getCurrentWindow?: () => unknown; getCurrent?: () => unknown; appWindow?: unknown };
                const win = modTyped.getCurrentWindow?.() || modTyped.getCurrent?.() || modTyped.appWindow;
                if (win && typeof (win as { setFullscreen?: unknown }).setFullscreen === 'function') {
                  try { await (win as { setFullscreen: (f: boolean) => Promise<void> }).setFullscreen(next); } catch (err) { console.debug('[PDFPreviewHeader] setFullscreen failed', err); }
                } else {
                  try { window.dispatchEvent(new CustomEvent('tideflow-request-fullscreen', { detail: { fullscreen: next } })); } catch (e) { console.warn('[PDFPreviewHeader] event dispatch failed', e); }
                }
              } catch (err) {
                // fallback to dispatching an event
                console.debug('[PDFPreviewHeader] dynamic import/window API failed, dispatching event', err);
                try { window.dispatchEvent(new CustomEvent('tideflow-request-fullscreen', { detail: { fullscreen: next } })); } catch (e) { console.warn('[PDFPreviewHeader] event dispatch failed', e); }
              }
            } catch (err) {
              console.warn('[PDFPreviewHeader] fullscreen toggle failed', err);
            }
          }}
          title="Toggle fullscreen"
          className="resync-btn"
        >
          Fullscreen
        </button>
        <button
          type="button"
          onClick={() => {
            const newMode = syncMode === 'two-way' ? 'auto' : 'two-way';
            setSyncMode(newMode as SyncMode);
            
            // Debug: Test scroll event when enabling two-way mode
            if (newMode === 'two-way' && process.env.NODE_ENV !== 'production') {
              setTimeout(() => {
                const container = containerRef.current;
                if (container) {
                  console.debug('[PDFPreviewHeader] Testing two-way mode - current state:', {
                    mode: newMode,
                    scrollTop: container.scrollTop,
                    scrollHeight: container.scrollHeight,
                    hasEventListener: 'scroll event should be attached'
                  });
                }
              }, 100);
            }
          }}
          title={syncMode === 'two-way' ? 'Switch to one-way sync (editor → PDF only)' : 'Enable two-way sync (PDF ↔ editor)'}
          className={`resync-btn ${syncMode === 'two-way' ? 'active' : ''}`}
        >
          {syncMode === 'two-way' ? '↕ Two-Way' : '↓ One-Way'}
        </button>
        <button
          type="button"
          onClick={() => {
            userManuallyPositionedPdfRef.current = false;
            const targetAnchor = activeAnchorId ?? sourceMap?.anchors[0]?.id;
            if (targetAnchor) {
              // delegate to PDFPreview's scrollToAnchor via event (kept simple)
              const ev = new CustomEvent('pdf-preview-resume-sync', { detail: { anchor: targetAnchor } });
              window.dispatchEvent(ev);
            }
          }}
          title="Release scroll lock and resume sync"
          className="resync-btn"
          disabled={syncMode !== 'auto' || !userManuallyPositionedPdfRef.current}
        >
          Release Lock
        </button>
        <button
          type="button"
          onClick={() => {
            try {
              const anchors = sourceMap?.anchors ?? [];
              const sampleAnchors = anchors.slice(0, 5).map((a) => ({ id: a.id, editor: a.editor, hasPdf: !!a.pdf }));
              const offsets = Array.from(anchorOffsetsRef.current.entries()).slice(0, 10);
              const top = containerRef.current?.scrollTop ?? null;
              const clientH = containerRef.current?.clientHeight ?? null;
              const container = containerRef.current;
              
              console.log('[PDFPreview][DebugDump] activeAnchorId=', activeAnchorId, 'anchors=', anchors.length, 'sampleAnchors=', sampleAnchors, 'offsetsSample=', offsets, 'scrollTop=', top, 'clientH=', clientH);
              
              // Test manual scroll event
              if (container) {
                console.log('[DebugDump] Triggering test scroll event...');
                container.scrollTop = container.scrollTop + 1;
                container.dispatchEvent(new Event('scroll'));
                setTimeout(() => {
                  container.scrollTop = container.scrollTop - 1;
                  container.dispatchEvent(new Event('scroll'));
                }, 100);
              }
            } catch (e) {
              console.error('[PDFPreview][DebugDump] failed', e);
            }
          }}
          title="Dump sync state and test scroll events"
          className="resync-btn"
        >
          Test Scroll
        </button>
        {syncMode === 'auto' && userManuallyPositionedPdfRef.current && (
          <div className="sync-paused-badge" title="Preview scroll is locked. Navigate in editor or click Release Lock.">
            🔒 Locked
          </div>
        )}
        {syncMode === 'two-way' && (
          <div className="sync-paused-badge two-way-badge" title="Two-way sync: editor ↔ preview">
            ↕ Two-Way
          </div>
        )}
      </div>
    </div>
  );
};

export default PDFPreviewHeader;
