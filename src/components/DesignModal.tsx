import React, { useEffect, useRef, useState } from 'react';
import { useAppStore, defaultPreferences } from '../store';
import { setPreferences as persistPreferences, renderMarkdown, renderTypst, debugPaths } from '../api';
import type { Preferences } from '../types';
import { themePresets } from '../themes'; // Import themes
import './DesignModal.css';

const DesignModal: React.FC = () => {
  const { preferences, setPreferences, designModalOpen, setDesignModalOpen, themeSelection, setThemeSelection, lastCustomPreferences } = useAppStore();
  const setCompileStatus = useAppStore(s => s.setCompileStatus);
  const [local, setLocal] = useState<Preferences>(preferences);
  const [dirty, setDirty] = useState(false);
  const [autoApply, setAutoApply] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const originalRef = useRef<Preferences | null>(null);
  const applyTimer = useRef<number | null>(null);
  const applySeq = useRef(0);

  const handleBrowseCoverImage = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const result = await open({ 
        multiple: false, 
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg'] }] 
      });
      const filePath = Array.isArray(result) ? result?.[0] : result;
      if (filePath) {
        // Extract just the filename or relative path
        const fileName = filePath.split(/[\\/]/).pop() || filePath;
        mutate({ cover_image: fileName });
      }
    } catch (err) {
      console.warn('[DesignModal] Failed to browse for image', err);
    }
  };

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
    console.log('[DesignModal][schedule]', { seq, toc: next.toc, cover: next.cover_page });
    applyTimer.current = window.setTimeout(async () => {
      try {
        if (seq !== latestSeq()) {
          console.log('[DesignModal][apply-skip-stale]', { seq, current: latestSeq() });
          return;
        }
        console.log('[DesignModal][apply-fire]', { seq, toc: next.toc, cover: next.cover_page });
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
    console.log('[DesignModal][mutate]', { from: { toc: local.toc, cover: local.cover_page }, to: { toc: next.toc, cover: next.cover_page } });
    setLocal(next);
    setDirty(true);
    if (themeSelection !== 'custom') setThemeSelection('custom');
    // Only cover_page triggers immediate apply; TOC is now debounced
    if (Object.prototype.hasOwnProperty.call(patch, 'cover_page')) {
      if (applyTimer.current) {
        window.clearTimeout(applyTimer.current);
        applyTimer.current = null;
      }
      const seq = ++applySeq.current;
      console.log('[DesignModal][immediate-structure-apply]', { seq, toc: next.toc, cover: next.cover_page });
      (async () => {
        try {
          setCompileStatus({ status: 'running' });
          setPreferences(next);
          await persistPreferences(next);
          debugPaths().then(info => console.log('[DesignModal][immediate-structure-meta]', info)).catch(()=>{});
          await rerenderCurrent();
        } catch (e) {
          console.warn('[DesignModal] immediate structure apply failed', e);
        }
      })();
    } else {
      scheduleApply(next);
    }
  };

  const handlePresetSelect = (id: string) => {
    setThemeSelection(id);
    if (id === 'custom') {
      const snapshot: Preferences = {
        ...lastCustomPreferences,
        margin: { ...lastCustomPreferences.margin },
        fonts: { ...lastCustomPreferences.fonts },
      };
      setLocal(snapshot);
      scheduleApply(snapshot);
      return;
    }
    const preset = themePresets[id];
    if (preset) {
      const merged: Preferences = {
        ...preset.preferences,
        margin: { ...preset.preferences.margin },
        fonts: { ...preset.preferences.fonts },
      };
      setLocal(merged);
      setPreferences(merged); // Directly update preferences
      scheduleApply(merged);
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
    const base: Preferences = {
      ...defaultPreferences,
      margin: { ...defaultPreferences.margin },
      fonts: { ...defaultPreferences.fonts },
    };
    setLocal(base);
    setDirty(true);
    setThemeSelection('default'); // Reset theme to default
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
                {Object.entries(themePresets).map(([id, theme]) => (
                  <option key={id} value={id} title={theme.description}>{theme.name}</option>
                ))}
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
                <option value="us-letter">US Letter</option>
                <option value="us-legal">US Legal</option>
              </select>
            </label>
            <label>Margin X (cm)
              <input 
                type="range" 
                min="1" 
                max="5" 
                step="0.25" 
                value={parseFloat(local.margin.x.replace('cm', '').replace('in',''))}
                onChange={e => mutate({ margin: { ...local.margin, x: `${e.target.value}cm` } })}
              />
              <span className="range-value">{local.margin.x}</span>
            </label>
            <label>Margin Y (cm)
              <input 
                type="range" 
                min="1" 
                max="5" 
                step="0.25" 
                value={parseFloat(local.margin.y.replace('cm', '').replace('in',''))}
                onChange={e => mutate({ margin: { ...local.margin, y: `${e.target.value}cm` } })}
              />
              <span className="range-value">{local.margin.y}</span>
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
                <option value="Segoe UI">Segoe UI</option>
                <option value="Arial">Arial</option>
                <option value="Calibri">Calibri</option>
                <option value="Cambria">Cambria</option>
                <option value="Candara">Candara</option>
                <option value="Constantia">Constantia</option>
                <option value="Corbel">Corbel</option>
                <option value="Georgia">Georgia</option>
                <option value="Palatino Linotype">Palatino Linotype</option>
                <option value="Tahoma">Tahoma</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Trebuchet MS">Trebuchet MS</option>
                <option value="Verdana">Verdana</option>
              </select>
              <div className="helper-text">Widely available cross‑platform fonts.</div>
              <div className="font-preview" data-font-role="body" data-font-value={local.fonts.main}>{`Aa Bb Cc 123 — preview (${local.fonts.main})`}</div>
            </label>
            <label>Code / Monospace Font
              <select
                value={local.fonts.mono}
                onChange={e => mutate({ fonts: { ...local.fonts, mono: e.target.value } })}
              >
                <option value="Consolas">Consolas</option>
                <option value="Courier New">Courier New</option>
                <option value="Lucida Console">Lucida Console</option>
              </select>
              <div className="helper-text">Used for code blocks / fixed width text.</div>
              <div className="font-preview" data-font-role="mono" data-font-value={local.fonts.mono}>{`code {sample} <tag/> (${local.fonts.mono})`}</div>
            </label>
          </div>
        </div>

        <div className="design-section">
          <h3>Colors & Typography</h3>
          <div className="form-grid">
            <label>Font Size (pt)
              <input 
                type="number" 
                min="8" 
                max="18" 
                step="0.5"
                value={local.font_size}
                onChange={e => mutate({ font_size: parseFloat(e.target.value) || 11 })}
              />
              <span className="range-value">{local.font_size}pt</span>
            </label>
            <label>Heading Scale
              <input 
                type="range" 
                min="0.8" 
                max="1.5" 
                step="0.05"
                value={local.heading_scale}
                onChange={e => mutate({ heading_scale: parseFloat(e.target.value) })}
              />
              <span className="range-value">{local.heading_scale.toFixed(2)}×</span>
            </label>
            <label>Page Background
              <input 
                type="color"
                value={local.page_bg_color}
                onChange={e => mutate({ page_bg_color: e.target.value })}
              />
              <span className="range-value">{local.page_bg_color}</span>
            </label>
            <label>Font Color
              <input 
                type="color"
                value={local.font_color}
                onChange={e => mutate({ font_color: e.target.value })}
              />
              <span className="range-value">{local.font_color}</span>
            </label>
            <label>Accent Color
              <input 
                type="color"
                value={local.accent_color}
                onChange={e => mutate({ accent_color: e.target.value })}
              />
              <span className="range-value">{local.accent_color}</span>
            </label>
          </div>
        </div>

        <div className="design-section">
          <h3>Spacing & Layout</h3>
          <div className="form-grid">
            <label>Line Height
              <input 
                type="range" 
                min="1.0" 
                max="2.5" 
                step="0.1"
                value={1.5}
                onChange={() => {}}
                disabled
              />
              <span className="range-value">1.5 (Coming Soon)</span>
              <div className="helper-text">Space between lines of text</div>
            </label>
            <label>Paragraph Spacing
              <input 
                type="range" 
                min="0.5" 
                max="2.5" 
                step="0.1"
                value={1.0}
                onChange={() => {}}
                disabled
              />
              <span className="range-value">1.0em (Coming Soon)</span>
              <div className="helper-text">Space between paragraphs</div>
            </label>
          </div>
        </div>

        <div className="design-section">
          <h3>Header & Footer</h3>
          <div className="form-grid">
            <label className="checkbox-label">
              <input 
                type="checkbox" 
                checked={false}
                onChange={() => {}}
                disabled
              /> 
              Page Numbers (Coming Soon)
            </label>
            <label className="checkbox-label">
              <input 
                type="checkbox" 
                checked={false}
                onChange={() => {}}
                disabled
              /> 
              Document Title in Header (Coming Soon)
            </label>
          </div>
        </div>

        <div className="design-section">
          <h3>Structure</h3>
          <div className="form-grid two-col">
            <label className="checkbox-label">
              <input type="checkbox" checked={local.number_sections} onChange={e => mutate({ number_sections: e.target.checked })} /> Number Sections
            </label>
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
            <label className="checkbox-label">
              <input type="checkbox" checked={local.cover_page} onChange={e => mutate({ cover_page: e.target.checked })} /> Cover Page
            </label>
            {local.cover_page && (
              <>
                <label>Cover Title
                  <input
                    placeholder="Document title"
                    value={local.cover_title}
                    onChange={e => mutate({ cover_title: e.target.value })}
                  />
                </label>
                <label>Cover Writer
                  <input
                    placeholder="Author or organization"
                    value={local.cover_writer}
                    onChange={e => mutate({ cover_writer: e.target.value })}
                  />
                </label>
                <label>Cover Image
                  <div className="input-with-button">
                    <input
                      placeholder="Relative path or filename"
                      value={local.cover_image}
                      onChange={e => mutate({ cover_image: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={handleBrowseCoverImage}
                    >
                      Browse...
                    </button>
                  </div>
                  <div className="helper-text">Select an image or provide a relative path</div>
                </label>
              </>
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
          <h3 
            className="collapsible-header"
            onClick={() => setShowAdvanced(!showAdvanced)} 
            title="Click to expand/collapse"
          >
            Advanced {showAdvanced ? '▼' : '▶'}
          </h3>
          {showAdvanced && (
            <div className="form-grid">
              <label>Render Debounce (ms)
                <input 
                  type="number" 
                  value={local.render_debounce_ms} 
                  onChange={e => mutate({ render_debounce_ms: parseInt(e.target.value || '400', 10) })} 
                  min="100"
                  max="2000"
                  step="100"
                />
                <div className="helper-text">Delay before re-rendering PDF while typing</div>
              </label>
              <label className="checkbox-label">
                <input type="checkbox" checked={local.preserve_scroll_position} onChange={e => mutate({ preserve_scroll_position: e.target.checked })} /> Preserve Scroll
                <div className="helper-text">Remember scroll position when switching files</div>
              </label>
            </div>
          )}
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
