// Touch comment to force rebuild (clearing stale HMR state)
import React, { useEffect, useRef, useState } from 'react';
import { useAppStore, defaultPreferences } from '../store';
import { setPreferences as persistPreferences, renderMarkdown, renderTypst, debugPaths } from '../api';
import type { Preferences } from '../types';
import './DesignModal.css';

interface ThemePresetDef { name: string; description: string; apply: (base: Preferences)=>Partial<Preferences>; }
const THEME_PRESETS: Record<string, ThemePresetDef> = {
  default: { name: 'Default', description: 'Balanced defaults', apply: () => ({}) },
  classic: { name: 'Classic', description: 'Serif body (placeholder)', apply: (b) => ({ fonts: { ...b.fonts, main: 'Times New Roman' } }) },
  mono: { name: 'Mono', description: 'Monospaced look (placeholder)', apply: (b) => ({ fonts: { ...b.fonts, main: b.fonts.mono } }) },
  serif: { name: 'Serif Wide', description: 'Wider margins (placeholder)', apply: () => ({ margin: { x: '3cm', y: '3cm' } }) },
  custom: { name: 'Custom', description: 'Your overrides', apply: () => ({}) }
};

const DesignModal: React.FC = () => {
  const { preferences, setPreferences, designModalOpen, setDesignModalOpen, themeSelection, setThemeSelection, lastCustomPreferences } = useAppStore();
  const setCompileStatus = useAppStore(s => s.setCompileStatus);
  const [local, setLocal] = useState<Preferences>(preferences);
  const [dirty, setDirty] = useState(false);
  const [autoApply, setAutoApply] = useState(true);
  const originalRef = useRef<Preferences | null>(null);
  const applyTimer = useRef<number | null>(null);
  const applySeq = useRef(0);

  // Snapshot ONLY when the modal just opened (not on every preferences mutation)
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (designModalOpen && !prevOpenRef.current) {
      setLocal(preferences);
      originalRef.current = preferences; // snapshot for cancel
      setDirty(false);
    }
    prevOpenRef.current = designModalOpen;
  }, [designModalOpen, preferences]);

  const latestSeq = () => applySeq.current;

  // Unified re-render that supports the in-memory sample document (which has no on-disk path)
  const rerenderCurrent = async () => {
    const { editor: { currentFile, content } } = useAppStore.getState();
    if (!currentFile) return;
    // Detect virtual sample file (no path separators) or explicit 'sample.md'
    const isVirtual = currentFile === 'sample.md' || (!currentFile.includes('/') && !currentFile.includes('\\'));
    if (isVirtual) {
      await renderTypst(content, 'pdf');
    } else {
      await renderMarkdown(currentFile);
    }
  };

  const scheduleApply = (next: Preferences) => {
    if (!autoApply) return; // manual mode; only local state updates
    if (applyTimer.current) window.clearTimeout(applyTimer.current);
    const seq = ++applySeq.current;
  console.log('[DesignModal][schedule]', { seq, toc: next.toc });
    applyTimer.current = window.setTimeout(async () => {
      try {
        if (seq !== latestSeq()) {
          console.log('[DesignModal][apply-skip-stale]', { seq, current: latestSeq() });
          return;
        }
  console.log('[DesignModal][apply-fire]', { seq, toc: next.toc });
        setCompileStatus({ status: 'running' });
  setPreferences(next);            // update in-memory store
  await persistPreferences(next);  // persist to backend _prefs.json
  debugPaths().then(info => console.log('[DesignModal][auto]', info)).catch(()=>{});
        await rerenderCurrent();
      } catch (e) {
        // swallow for now; could surface a toast
        console.warn('[DesignModal] auto apply failed', e);
      }
    }, next.render_debounce_ms || 400);
  };

  const mutate = (patch: Partial<Preferences>) => {
    const next: Preferences = { ...local, ...patch } as Preferences;
  console.log('[DesignModal][mutate]', { from: { toc: local.toc }, to: { toc: next.toc } });
    setLocal(next);
    setDirty(true);
    if (themeSelection !== 'custom') setThemeSelection('custom');
    // Immediate apply for TOC (race prone) else debounced
  if (Object.prototype.hasOwnProperty.call(patch, 'toc')) {
      // Cancel pending timer
      if (applyTimer.current) {
        window.clearTimeout(applyTimer.current);
        applyTimer.current = null;
      }
      const seq = ++applySeq.current;
      console.log('[DesignModal][immediate-toc-apply]', { seq, toc: next.toc });
      (async () => {
        try {
          setCompileStatus({ status: 'running' });
          setPreferences(next);
          await persistPreferences(next);
          debugPaths().then(info => console.log('[DesignModal][immediate-toc-meta]', info)).catch(()=>{});
          await rerenderCurrent();
        } catch (e) {
          console.warn('[DesignModal] immediate toc apply failed', e);
        }
      })();
    } else {
      scheduleApply(next);
    }
  };

  const handlePresetSelect = (id: string) => {
    setThemeSelection(id);
    if (id === 'custom') {
      setLocal(lastCustomPreferences);
      scheduleApply(lastCustomPreferences);
      return;
    }
    const base = { ...preferences };
    const preset = THEME_PRESETS[id];
    if (preset) {
      const merged: Preferences = { ...base, ...preset.apply(base) } as Preferences;
      setLocal(merged);
      setPreferences(merged);
    }
  };

  const handleSave = async () => {
    try {
      setCompileStatus({ status: 'running' });
  setPreferences(local);             // update store
  await persistPreferences(local);    // API handles backend field mapping
  debugPaths().then(info => console.log('[DesignModal][save]', info)).catch(()=>{});
      await rerenderCurrent();
      originalRef.current = local;
      setDirty(false);
      setDesignModalOpen(false);
    } catch (e) {
      console.warn('[DesignModal] save failed', e);
    }
  };

  const handleCancel = () => {
    if (originalRef.current) {
      setPreferences(originalRef.current);
      setLocal(originalRef.current);
    }
    setDirty(false);
    setDesignModalOpen(false);
  };

  const handleReset = async () => {
    const base = { ...defaultPreferences };
    setLocal(base);
    setDirty(true);
    if (themeSelection !== 'custom') setThemeSelection('custom');
    if (autoApply) {
      try {
        setCompileStatus({ status: 'running' });
  setPreferences(base);
  await persistPreferences(base);
  debugPaths().then(info => console.log('[DesignModal][reset]', info)).catch(()=>{});
        await rerenderCurrent();
        setDirty(false); // since applied immediately
      } catch (e) {
        console.warn('[DesignModal] reset apply failed', e);
      }
    }
  };

  if (!designModalOpen) return null;

  return (
    <div className="design-modal-overlay" onClick={() => setDesignModalOpen(false)}>
      <div className="design-modal" onClick={e => e.stopPropagation()}>
        <div className="design-modal-header">
          <h2>Design & Layout</h2>
          <div className="theme-select-row">
            <label>
              Theme:
              <select value={themeSelection} onChange={(e) => handlePresetSelect(e.target.value)}>
                <option value="default">Default</option>
                <option value="classic">Classic (placeholder)</option>
                <option value="mono">Mono (placeholder)</option>
                <option value="serif">Serif (placeholder)</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <div className="design-header-controls">
              <label className="auto-apply-toggle">
                <input type="checkbox" checked={autoApply} onChange={e => setAutoApply(e.target.checked)} /> Auto apply
              </label>
              <button onClick={() => setDesignModalOpen(false)} title="Close">✕</button>
            </div>
          </div>
        </div>

        <div className="design-section">
          <h3>Document</h3>
          <div className="form-grid">
            <label>Paper Size
              <select value={local.papersize} onChange={e => mutate({ papersize: e.target.value })}>
                <option value="a4">A4</option>
                <option value="letter">Letter</option>
                <option value="legal">Legal</option>
              </select>
            </label>
            <label>Margin X (cm)
              <input value={local.margin.x} onChange={e => mutate({ margin: { ...local.margin, x: e.target.value } })} />
            </label>
            <label>Margin Y (cm)
              <input value={local.margin.y} onChange={e => mutate({ margin: { ...local.margin, y: e.target.value } })} />
            </label>
          </div>
        </div>

        <div className="design-section">
          <h3>Fonts</h3>
          <div className="form-grid">
            <label>Body Font
              <select
                value={local.fonts.main}
                onChange={e => mutate({ fonts: { ...local.fonts, main: e.target.value } })}
              >
                <option value="system-ui">System UI</option>
                <option value="Arial">Arial</option>
                <option value="Helvetica">Helvetica</option>
                <option value="Verdana">Verdana</option>
                <option value="Tahoma">Tahoma</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Georgia">Georgia</option>
                <option value="Garamond">Garamond</option>
                <option value="Palatino">Palatino</option>
                <option value="Trebuchet MS">Trebuchet MS</option>
                <option value="Courier New">Courier New</option>
                <option value="Segoe UI">Segoe UI</option>
              </select>
              <div className="helper-text">Widely available cross‑platform fonts.</div>
              <div className="font-preview" data-font-role="body" data-font-value={local.fonts.main}>{`Aa Bb Cc 123 — preview (${local.fonts.main})`}</div>
            </label>
            <label>Code / Monospace Font
              <select
                value={local.fonts.mono}
                onChange={e => mutate({ fonts: { ...local.fonts, mono: e.target.value } })}
              >
                <option value="Courier New">Courier New</option>
                <option value="Consolas">Consolas</option>
                <option value="Lucida Console">Lucida Console</option>
                <option value="Monaco">Monaco</option>
                <option value="Menlo">Menlo</option>
                <option value="DejaVu Sans Mono">DejaVu Sans Mono</option>
                <option value="Source Code Pro">Source Code Pro</option>
                <option value="ui-monospace">ui-monospace</option>
              </select>
              <div className="helper-text">Used for code blocks / fixed width text.</div>
              <div className="font-preview" data-font-role="mono" data-font-value={local.fonts.mono}>{`code {sample} <tag/> (${local.fonts.mono})`}</div>
            </label>
          </div>
        </div>

        <div className="design-section">
          <h3>Structure</h3>
          <div className="form-grid two-col">
            <label className="checkbox-label">
              <input type="checkbox" checked={local.toc} onChange={e => mutate({ toc: e.target.checked })} /> TOC
            </label>
            {local.toc && (
              <label>TOC Title
                <input
                  placeholder="(leave blank for no title)"
                  value={local.toc_title}
                  onChange={e => mutate({ toc_title: e.target.value })}
                />
              </label>
            )}
          </div>
        </div>

        <div className="design-section">
          <h3>Images</h3>
          <div className="form-grid">
            <label>Default Width
              <input value={local.default_image_width} onChange={e => mutate({ default_image_width: e.target.value })} />
            </label>
            <label>Alignment
              <select value={local.default_image_alignment} onChange={e => mutate({ default_image_alignment: e.target.value })}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
          </div>
        </div>

        <div className="design-section">
          <h3>Performance</h3>
          <div className="form-grid">
            <label>Render Debounce (ms)
              <input type="number" value={local.render_debounce_ms} onChange={e => mutate({ render_debounce_ms: parseInt(e.target.value || '400', 10) })} />
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={local.preserve_scroll_position} onChange={e => mutate({ preserve_scroll_position: e.target.checked })} /> Preserve Scroll
            </label>
          </div>
        </div>

        <div className="design-section placeholders">
          <h3>Planned (Placeholders)</h3>
          <ul>
            <li>Heading Scale (planned)</li>
            <li>Accent Color (planned)</li>
            <li>Cover Page Options (planned)</li>
            <li>Export Metadata (planned)</li>
          </ul>
        </div>

        <div className="design-footer">
          <div>
            {dirty && (
              <div className="dirty-indicator">
                {autoApply ? 'Changes applied live (Custom theme)' : 'Unsaved changes'}
              </div>
            )}
          </div>
          <div className="design-footer-actions">
            <button onClick={handleReset} type="button" className="btn-reset">Reset</button>
            <button onClick={handleCancel} type="button">Cancel</button>
            <button onClick={handleSave} type="button" disabled={!dirty} className="btn-primary">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DesignModal;
