import React from 'react';
import { saveSession } from '../utils/session';

interface AnchorLike {
  id: string;
  editor?: unknown;
  pdf?: unknown;
}

interface Props {
  syncMode: string;
  setSyncMode: (m: 'auto' | 'locked-to-pdf') => void;
  activeAnchorId: string | null;
  sourceMap?: { anchors: AnchorLike[] } | null;
  anchorOffsetsRef: { current: Map<string, number> };
  containerRef: React.RefObject<HTMLElement | null>;
}

const PDFPreviewHeader: React.FC<Props> = ({ syncMode, setSyncMode, activeAnchorId, sourceMap, anchorOffsetsRef, containerRef }) => {
  return (
    <div className="pdf-preview-header">
      <h3>PDF Preview</h3>
      <div className="pdf-preview-actions sync-controls">
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
            setSyncMode('auto');
            const targetAnchor = activeAnchorId ?? sourceMap?.anchors[0]?.id;
            if (targetAnchor) {
              // delegate to PDFPreview's scrollToAnchor via event (kept simple)
              const ev = new CustomEvent('pdf-preview-resume-sync', { detail: { anchor: targetAnchor } });
              window.dispatchEvent(ev);
            }
          }}
          title="Resume automatic sync with the editor"
          className="resync-btn"
        >
          Resume Sync
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
              console.log('[PDFPreview][DebugDump] activeAnchorId=', activeAnchorId, 'anchors=', anchors.length, 'sampleAnchors=', sampleAnchors, 'offsetsSample=', offsets, 'scrollTop=', top, 'clientH=', clientH);
            } catch (e) {
              console.error('[PDFPreview][DebugDump] failed', e);
            }
          }}
          title="Dump sync state to console"
          className="resync-btn"
        >
          Dump Sync
        </button>
        {syncMode === 'locked-to-pdf' && (
          <div className="sync-paused-badge" title="Preview is controlling scroll until you move the editor">
            Preview Locked
          </div>
        )}
      </div>
    </div>
  );
};

export default PDFPreviewHeader;
