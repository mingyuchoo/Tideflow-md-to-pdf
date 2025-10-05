import React, { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { useUIStore } from '../stores/uiStore';
import { usePreferencesStore, defaultPreferences } from '../stores/preferencesStore';
import { setPreferences as persistPreferences, renderTypst, debugPaths } from '../api';
import type { Preferences } from '../types';
import { themePresets } from '../themes'; // Import themes
import { logger } from '../utils/logger';
import { handleError } from '../utils/errorHandler';
import './DesignModal.css';

type TabSection = 'document' | 'typography' | 'spacing' | 'structure' | 'images' | 'presets' | 'advanced';

// Create scoped logger
const designLogger = logger.createScoped('DesignModal');

const DesignModal: React.FC = () => {
  const { preferences, setPreferences, themeSelection, setThemeSelection, customPresets, saveCustomPreset, deleteCustomPreset, renameCustomPreset } = usePreferencesStore();
  const { designModalOpen, setDesignModalOpen, addToast } = useUIStore();
  const setCompileStatus = useEditorStore(s => s.setCompileStatus);
  const [local, setLocal] = useState<Preferences>(preferences);
  const [dirty, setDirty] = useState(false);
  const [autoApply, setAutoApply] = useState(true);
  const [activeTab, setActiveTab] = useState<TabSection>('document');
  const [showPresetNameModal, setShowPresetNameModal] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState('');
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
        // Delete old cover image if it exists
        if (local.cover_image) {
          try {
            const { deleteFile } = await import('../api');
            await deleteFile(local.cover_image);
          } catch (err) {
            designLogger.warn('Failed to delete old cover image', err);
          }
        }
        
        // Import the image to assets directory and get relative path
        const { importImageFromPath } = await import('../api');
        const relativePath = await importImageFromPath(filePath);
        mutate({ cover_image: relativePath });
      }
    } catch (err) {
      designLogger.warn('Failed to browse for image', err);
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
    const { editor: { currentFile, content } } = useEditorStore.getState();
    if (!currentFile) return;
    // Always use renderTypst for live preview with current file context
    await renderTypst(content, 'pdf', currentFile);
  };

  const scheduleApply = (next: Preferences) => {
    if (!autoApply) return; // manual mode; only local state updates
    if (applyTimer.current) window.clearTimeout(applyTimer.current);
    const seq = ++applySeq.current;
    designLogger.debug('schedule', { seq, toc: next.toc, cover: next.cover_page });
    applyTimer.current = window.setTimeout(async () => {
      try {
        if (seq !== latestSeq()) {
          designLogger.debug('apply-skip-stale', { seq, current: latestSeq() });
          return;
        }
        designLogger.debug('apply-fire', { seq, toc: next.toc, cover: next.cover_page });
        setCompileStatus({ status: 'running' });
        setPreferences(next);            // update in-memory store
        await persistPreferences(next);  // persist to backend _prefs.json
        debugPaths().then(info => designLogger.debug('auto', info)).catch(()=>{});
        await rerenderCurrent();
      } catch (e) {
        designLogger.warn('auto apply failed', e);
        handleError(e, { operation: 'apply preferences', component: 'DesignModal' }, 'warning');
      }
    }, next.render_debounce_ms || 400);
  };

  const mutate = (patch: Partial<Preferences>) => {
    const next: Preferences = { ...local, ...patch } as Preferences;
    designLogger.debug('mutate', { from: { toc: local.toc, cover: local.cover_page }, to: { toc: next.toc, cover: next.cover_page } });
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
      designLogger.debug('immediate-structure-apply', { seq, toc: next.toc, cover: next.cover_page });
      (async () => {
        try {
          setCompileStatus({ status: 'running' });
          setPreferences(next);
          await persistPreferences(next);
          debugPaths().then(info => designLogger.debug('immediate-structure-meta', info)).catch(()=>{});
          await rerenderCurrent();
        } catch (e) {
          designLogger.warn('immediate structure apply failed', e);
          handleError(e, { operation: 'apply cover page changes', component: 'DesignModal' }, 'warning');
        }
      })();
    } else {
      scheduleApply(next);
    }
  };

  const handlePresetSelect = (id: string) => {
    // Prevent manually selecting "custom" - it should only be set automatically
    if (id === 'custom') {
      return;
    }
    
    setThemeSelection(id);
    
    // Check if it's a custom preset
    const customPreset = customPresets[id];
    if (customPreset) {
      const merged: Preferences = {
        ...customPreset.preferences,
        margin: { ...customPreset.preferences.margin },
        fonts: { ...customPreset.preferences.fonts },
      };
      setLocal(merged);
      setPreferences(merged);
      scheduleApply(merged);
      return;
    }
    
    // Otherwise it's a built-in theme
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
      debugPaths().then(info => designLogger.debug('save', info)).catch(()=>{});
      await rerenderCurrent();
      originalRef.current = local;
      setDirty(false);
      setDesignModalOpen(false);
    } catch (e) {
      designLogger.warn('save failed', e);
      handleError(e, { operation: 'save preferences', component: 'DesignModal' });
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
    
    // Apply default theme preferences
    const defaultTheme = themePresets['default'];
    if (defaultTheme) {
      const merged: Preferences = {
        ...defaultTheme.preferences,
        margin: { ...defaultTheme.preferences.margin },
        fonts: { ...defaultTheme.preferences.fonts },
      };
      setLocal(merged);
      
      if (autoApply) {
        try {
          setCompileStatus({ status: 'running' });
          setPreferences(merged);
          await persistPreferences(merged);
          debugPaths().then(info => designLogger.debug('reset', info)).catch(()=>{});
          await rerenderCurrent();
          setDirty(false);
        } catch (e) {
          designLogger.warn('reset apply failed', e);
        }
      }
    }
  };


  if (!designModalOpen) return null;

  const tabs: { id: TabSection; label: string; icon: string }[] = [
    { id: 'document', label: 'Document', icon: '📄' },
    { id: 'typography', label: 'Typography', icon: '🔤' },
    { id: 'spacing', label: 'Spacing & Layout', icon: '📐' },
    { id: 'structure', label: 'Structure', icon: '🗂️' },
    { id: 'images', label: 'Images', icon: '🖼️' },
    { id: 'presets', label: 'Presets', icon: '💾' },
    { id: 'advanced', label: 'Advanced', icon: '⚙️' },
  ];

  return (
    <div className="design-modal-overlay" onClick={() => setDesignModalOpen(false)}>
      <div className="design-modal design-modal-tabbed" onClick={e => e.stopPropagation()}>
        <div className="design-modal-header">
          <h2>Design & Layout</h2>
          <div className="theme-select-row">
            <label>
              Theme
              <select value={themeSelection} onChange={(e) => handlePresetSelect(e.target.value)}>
                {Object.entries(themePresets).map(([id, theme]) => (
                  <option key={id} value={id} title={theme.description}>{theme.name}</option>
                ))}
                {Object.keys(customPresets).length > 0 && <option disabled>──────────</option>}
                {Object.entries(customPresets).map(([id, preset]) => (
                  <option key={id} value={id}>{preset.name} ⭐</option>
                ))}
                {themeSelection === 'custom' && <option value="custom">Custom</option>}
              </select>
            </label>
          </div>
          <div className="design-header-controls">
            <label className="auto-apply-toggle">
              <input type="checkbox" checked={autoApply} onChange={e => setAutoApply(e.target.checked)} /> Auto apply
            </label>
            <button onClick={() => setDesignModalOpen(false)} title="Close" className="close-btn">✕</button>
          </div>
        </div>

        <div className="design-modal-body">
          <nav className="design-nav">
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`design-nav-item ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="nav-icon">{tab.icon}</span>
                <span className="nav-label">{tab.label}</span>
              </button>
            ))}
          </nav>

          <div className="design-content">
            {/* Document Tab */}
            {activeTab === 'document' && (
              <div className="tab-panel">
                <h3>Document Settings</h3>
                <div className="form-grid one-col">
                  <label>Paper Size
                    <select value={local.papersize} onChange={e => mutate({ papersize: e.target.value })}>
                      <option value="a4">A4 (210 × 297 mm)</option>
                      <option value="us-letter">US Letter (8.5 × 11 in)</option>
                      <option value="us-legal">US Legal (8.5 × 14 in)</option>
                    </select>
                  </label>
                  <label>Horizontal Margin
                    <div className="slider-group">
                      <input 
                        type="range" 
                        min="1" 
                        max="5" 
                        step="0.25" 
                        value={parseFloat(local.margin.x.replace('cm', '').replace('in',''))}
                        onChange={e => mutate({ margin: { ...local.margin, x: `${e.target.value}cm` } })}
                      />
                      <input
                        type="text"
                        className="slider-value-input"
                        value={local.margin.x}
                        onChange={e => mutate({ margin: { ...local.margin, x: e.target.value } })}
                      />
                    </div>
                    <div className="helper-text">Left and right page margins</div>
                  </label>
                  <label>Vertical Margin
                    <div className="slider-group">
                      <input 
                        type="range" 
                        min="1" 
                        max="5" 
                        step="0.25" 
                        value={parseFloat(local.margin.y.replace('cm', '').replace('in',''))}
                        onChange={e => mutate({ margin: { ...local.margin, y: `${e.target.value}cm` } })}
                      />
                      <input
                        type="text"
                        className="slider-value-input"
                        value={local.margin.y}
                        onChange={e => mutate({ margin: { ...local.margin, y: e.target.value } })}
                      />
                    </div>
                    <div className="helper-text">Top and bottom page margins</div>
                  </label>
                </div>
              </div>
            )}

            {/* Typography Tab */}
            {activeTab === 'typography' && (
              <div className="tab-panel">
                <h3>Typography</h3>
                <div className="form-grid one-col">
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
                    <div className="font-preview" data-font-role="body" data-font-value={local.fonts.main}>{`Aa Bb Cc 123 \u2014 ${local.fonts.main}`}</div>
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
                    <div className="font-preview" data-font-role="mono" data-font-value={local.fonts.mono}>{`code {sample} <tag/> \u2014 ${local.fonts.mono}`}</div>
                    <div className="helper-text">Used for code blocks and inline code</div>
                  </label>
                  <label>Font Size
                    <div className="slider-group">
                      <input 
                        type="range" 
                        min="8" 
                        max="18" 
                        step="0.5"
                        value={local.font_size}
                        onChange={e => mutate({ font_size: parseFloat(e.target.value) || 11 })}
                      />
                      <input
                        type="number"
                        className="slider-value-input"
                        min="8"
                        max="18"
                        step="0.5"
                        value={local.font_size}
                        onChange={e => mutate({ font_size: parseFloat(e.target.value) || 11 })}
                      />
                    </div>
                    <div className="helper-text">Base font size in points</div>
                  </label>
                  <label>Heading Scale
                    <div className="slider-group">
                      <input 
                        type="range" 
                        min="0.8" 
                        max="1.5" 
                        step="0.05"
                        value={local.heading_scale}
                        onChange={e => mutate({ heading_scale: parseFloat(e.target.value) })}
                      />
                      <input
                        type="number"
                        className="slider-value-input"
                        min="0.8"
                        max="1.5"
                        step="0.05"
                        value={local.heading_scale.toFixed(2)}
                        onChange={e => mutate({ heading_scale: parseFloat(e.target.value) || 1.2 })}
                      />
                    </div>
                    <div className="helper-text">How much larger headings are relative to body text</div>
                  </label>
                  <label>Page Background
                    <div className="color-group">
                      <input 
                        type="color"
                        value={local.page_bg_color}
                        onChange={e => mutate({ page_bg_color: e.target.value })}
                      />
                      <input
                        type="text"
                        className="color-hex-input"
                        value={local.page_bg_color}
                        onChange={e => mutate({ page_bg_color: e.target.value })}
                      />
                    </div>
                  </label>
                  <label>Font Color
                    <div className="color-group">
                      <input 
                        type="color"
                        value={local.font_color}
                        onChange={e => mutate({ font_color: e.target.value })}
                      />
                      <input
                        type="text"
                        className="color-hex-input"
                        value={local.font_color}
                        onChange={e => mutate({ font_color: e.target.value })}
                      />
                    </div>
                  </label>
                  <label>Accent Color
                    <div className="color-group">
                      <input 
                        type="color"
                        value={local.accent_color}
                        onChange={e => mutate({ accent_color: e.target.value })}
                      />
                      <input
                        type="text"
                        className="color-hex-input"
                        value={local.accent_color}
                        onChange={e => mutate({ accent_color: e.target.value })}
                      />
                    </div>
                    <div className="helper-text">Used for links and highlights</div>
                  </label>
                </div>
              </div>
            )}

            {/* Spacing & Layout Tab */}
            {activeTab === 'spacing' && (
              <div className="tab-panel">
                <h3>Spacing & Layout</h3>
                <div className="form-grid one-col">
                  <label>Line Height
                    <div className="slider-group">
                      <input 
                        type="range" 
                        min="1.0" 
                        max="2.5" 
                        step="0.1"
                        value={local.line_height}
                        onChange={e => mutate({ line_height: parseFloat(e.target.value) || 1.5 })}
                      />
                      <input
                        type="number"
                        className="slider-value-input"
                        min="1.0"
                        max="2.5"
                        step="0.1"
                        value={local.line_height}
                        onChange={e => mutate({ line_height: parseFloat(e.target.value) || 1.5 })}
                      />
                    </div>
                    <div className="helper-text">Space between lines of text</div>
                  </label>
                  <label>Paragraph Spacing
                    <div className="slider-group">
                      <input 
                        type="range" 
                        min="0" 
                        max="2.5" 
                        step="0.05"
                        value={parseFloat(local.paragraph_spacing.replace('em', ''))}
                        onChange={e => mutate({ paragraph_spacing: `${e.target.value}em` })}
                      />
                      <input
                        type="text"
                        className="slider-value-input"
                        value={local.paragraph_spacing}
                        onChange={e => mutate({ paragraph_spacing: e.target.value })}
                      />
                    </div>
                    <div className="helper-text">Space between paragraphs</div>
                  </label>
                  <label className="checkbox-label">
                    <input 
                      type="checkbox" 
                      checked={local.page_numbers}
                      onChange={e => mutate({ page_numbers: e.target.checked })}
                    /> 
                    <span>Page Numbers</span>
                  </label>
                  <label className="checkbox-label">
                    <input 
                      type="checkbox" 
                      checked={local.header_title}
                      onChange={e => mutate({ header_title: e.target.checked })}
                    /> 
                    <span>Document Title in Header</span>
                  </label>
                  {local.header_title && (
                    <label>Header Text
                      <input
                        placeholder="Enter header text"
                        value={local.header_text}
                        onChange={e => mutate({ header_text: e.target.value })}
                      />
                      <div className="helper-text">Text to display in page header</div>
                    </label>
                  )}
                </div>
              </div>
            )}

            {/* Structure Tab */}
            {activeTab === 'structure' && (
              <div className="tab-panel">
                <h3>Document Structure</h3>
                <div className="form-grid one-col">
                  <label className="checkbox-label">
                    <input type="checkbox" checked={local.number_sections} onChange={e => mutate({ number_sections: e.target.checked })} /> 
                    <span>Number Sections</span>
                  </label>
                  <label className="checkbox-label">
                    <input type="checkbox" checked={local.toc} onChange={e => mutate({ toc: e.target.checked })} /> 
                    <span>Table of Contents</span>
                  </label>
                  {local.toc && (
                    <label>TOC Title
                      <input
                        placeholder="Leave blank for no title"
                        value={local.toc_title}
                        onChange={e => mutate({ toc_title: e.target.value })}
                      />
                      <div className="helper-text">Optional heading above the table of contents</div>
                    </label>
                  )}
                  <label className="checkbox-label">
                    <input type="checkbox" checked={local.cover_page} onChange={e => mutate({ cover_page: e.target.checked })} /> 
                    <span>Cover Page</span>
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
                            placeholder="Relative path (e.g., assets/image.png)"
                            value={local.cover_image}
                            onChange={e => {
                              const newValue = e.target.value;
                              // If clearing the field, delete the old image
                              if (!newValue && local.cover_image) {
                                import('../api').then(({ deleteFile }) => {
                                  deleteFile(local.cover_image).catch(err => 
                                    designLogger.warn('Failed to delete cover image', err)
                                  );
                                });
                              }
                              mutate({ cover_image: newValue });
                            }}
                          />
                          <button
                            type="button"
                            onClick={handleBrowseCoverImage}
                          >
                            Browse…
                          </button>
                          {local.cover_image && (
                            <button
                              type="button"
                              onClick={() => {
                                import('../api').then(({ deleteFile }) => {
                                  deleteFile(local.cover_image).catch(err => 
                                    designLogger.warn('Failed to delete cover image', err)
                                  );
                                });
                                mutate({ cover_image: '' });
                              }}
                              title="Clear cover image"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                        <div className="helper-text">Browse to import image to assets, or provide relative path</div>
                      </label>
                      <label>Cover Image Width
                        <div className="slider-group">
                          <input 
                            type="range" 
                            min="10"
                            max="100"
                            step="5"
                            value={parseInt(local.cover_image_width.replace('%', '')) || 60}
                            onChange={e => mutate({ cover_image_width: `${e.target.value}%` })}
                          />
                          <input
                            type="number"
                            className="slider-value-input"
                            min="10"
                            max="100"
                            step="5"
                            value={parseInt(local.cover_image_width.replace('%', '')) || 60}
                            onChange={e => mutate({ cover_image_width: `${e.target.value}%` })}
                          />
                        </div>
                        <div className="helper-text">Size of the cover image as percentage of page width</div>
                      </label>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Images Tab */}
            {activeTab === 'images' && (
              <div className="tab-panel">
                <h3>Image Defaults</h3>
                <div className="form-grid one-col">
                  <label>Default Width
                    <div className="slider-group">
                      <input 
                        type="range" 
                        min="10"
                        max="100"
                        step="5"
                        value={parseInt(local.default_image_width.replace('%', '')) || 80}
                        onChange={e => mutate({ default_image_width: `${e.target.value}%` })}
                      />
                      <input
                        type="number"
                        className="slider-value-input"
                        min="10"
                        max="100"
                        step="5"
                        value={parseInt(local.default_image_width.replace('%', '')) || 80}
                        onChange={e => mutate({ default_image_width: `${e.target.value}%` })}
                      />
                    </div>
                    <div className="helper-text">Default width for images inserted into the document</div>
                  </label>
                  <label>Default Alignment
                    <select value={local.default_image_alignment} onChange={e => mutate({ default_image_alignment: e.target.value })}>
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                    <div className="helper-text">Where images are positioned by default</div>
                  </label>
                </div>
              </div>
            )}

            {/* Presets Tab */}
            {activeTab === 'presets' && (
              <div className="tab-panel">
                <h3>Custom Presets</h3>
                <div className="form-grid one-col">
                  <button
                    type="button"
                    className="btn-save-preset"
                    disabled={themeSelection !== 'custom'}
                    onClick={() => {
                      setPresetNameInput('');
                      setShowPresetNameModal(true);
                    }}
                  >
                    💾 Save Current Settings as Preset
                  </button>
                  <div className="helper-text">
                    {themeSelection !== 'custom' 
                      ? 'Switch to Custom theme to save your settings as a preset' 
                      : 'Save your current design settings as a reusable preset'}
                  </div>
                </div>

                {Object.keys(customPresets).length === 0 ? (
                  <div className="empty-presets">
                    <p>No custom presets saved yet.</p>
                    <p>Adjust your settings and save them as a reusable preset!</p>
                  </div>
                ) : (
                  <div className="presets-list">
                    <h4 className="presets-list-title">Saved Presets</h4>
                    {Object.entries(customPresets).map(([id, preset]) => (
                      <div key={id} className="preset-item">
                        <div className="preset-info">
                          <h4>{preset.name}</h4>
                          <p className="preset-details">
                            {preset.preferences.fonts.main} • {preset.preferences.font_size}pt • {preset.preferences.papersize.toUpperCase()}
                          </p>
                        </div>
                        <div className="preset-actions">
                          <button
                            type="button"
                            className="btn-preset-load"
                            onClick={() => {
                              setThemeSelection(id);
                              const merged: Preferences = {
                                ...preset.preferences,
                                margin: { ...preset.preferences.margin },
                                fonts: { ...preset.preferences.fonts },
                              };
                              setLocal(merged);
                              scheduleApply(merged);
                              addToast({ type: 'success', message: `Loaded preset "${preset.name}"` });
                            }}
                            title="Load this preset"
                          >
                            📂 Load
                          </button>
                          <button
                            type="button"
                            className="btn-preset-rename"
                            onClick={() => {
                              const newName = prompt('Enter new name:', preset.name);
                              if (newName && newName.trim() && newName !== preset.name) {
                                renameCustomPreset(id, newName.trim());
                                addToast({ type: 'success', message: `Preset renamed to "${newName.trim()}"` });
                              }
                            }}
                            title="Rename this preset"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            className="btn-preset-delete"
                            onClick={() => {
                              if (confirm(`Delete preset "${preset.name}"?`)) {
                                deleteCustomPreset(id);
                                if (themeSelection === id) {
                                  // Switch to "Custom" mode without changing settings
                                  setThemeSelection('custom');
                                }
                                addToast({ type: 'success', message: `Preset "${preset.name}" deleted` });
                              }
                            }}
                            title="Delete this preset"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Advanced Tab */}
            {activeTab === 'advanced' && (
              <div className="tab-panel">
                <h3>Advanced Settings</h3>
                <div className="form-grid one-col">
                  <label>Render Debounce
                    <div className="slider-group">
                      <input 
                        type="range" 
                        min="100"
                        max="2000"
                        step="100"
                        value={local.render_debounce_ms} 
                        onChange={e => mutate({ render_debounce_ms: parseInt(e.target.value || '400', 10) })} 
                      />
                      <input
                        type="number"
                        className="slider-value-input"
                        min="100"
                        max="2000"
                        step="100"
                        value={local.render_debounce_ms}
                        onChange={e => mutate({ render_debounce_ms: parseInt(e.target.value || '400', 10) })}
                      />
                    </div>
                    <div className="helper-text">Delay (in milliseconds) before re-rendering PDF while typing</div>
                  </label>
                  <label className="checkbox-label">
                    <input type="checkbox" checked={local.preserve_scroll_position} onChange={e => mutate({ preserve_scroll_position: e.target.checked })} /> 
                    <span>Preserve Scroll Position</span>
                  </label>
                  <label className="checkbox-label">
                    <input type="checkbox" checked={local.confirm_exit_on_unsaved} onChange={e => mutate({ confirm_exit_on_unsaved: e.target.checked })} /> 
                    <span>Confirm Exit on Unsaved Changes</span>
                  </label>
                </div>
              </div>
            )}
          </div>
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
            <button onClick={handleCancel} type="button" className="btn-cancel">Cancel</button>
            <button onClick={handleSave} type="button" disabled={!dirty} className="btn-primary">Save</button>
          </div>
        </div>
      </div>

      {/* Preset Name Modal */}
      {showPresetNameModal && (
        <div className="preset-name-modal-overlay" onClick={() => setShowPresetNameModal(false)}>
          <div className="preset-name-modal" onClick={e => e.stopPropagation()}>
            <h3>Save Preset</h3>
            <p className="preset-modal-description">Enter a name for your custom preset</p>
            <input
              type="text"
              className="preset-name-input"
              placeholder="e.g., My Report Template"
              value={presetNameInput}
              onChange={e => setPresetNameInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && presetNameInput.trim()) {
                  const id = `custom_${Date.now()}`;
                  saveCustomPreset(id, presetNameInput.trim(), local);
                  setThemeSelection(id);
                  addToast({ type: 'success', message: `Preset "${presetNameInput.trim()}" saved successfully` });
                  setShowPresetNameModal(false);
                } else if (e.key === 'Escape') {
                  setShowPresetNameModal(false);
                }
              }}
              autoFocus
            />
            <div className="preset-modal-actions">
              <button
                type="button"
                onClick={() => setShowPresetNameModal(false)}
                className="btn-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!presetNameInput.trim()}
                onClick={() => {
                  if (presetNameInput.trim()) {
                    const id = `custom_${Date.now()}`;
                    saveCustomPreset(id, presetNameInput.trim(), local);
                    setThemeSelection(id);
                    addToast({ type: 'success', message: `Preset "${presetNameInput.trim()}" saved successfully` });
                    setShowPresetNameModal(false);
                  }
                }}
                className="btn-primary"
              >
                Save Preset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DesignModal;
