import React, { useMemo } from 'react';
import { themePresets } from '../../themes';
import type { Preferences, Toast } from '../../types';

interface ThemesTabProps {
  themeSelection: string;
  setThemeSelection: (theme: string) => void;
  customPresets: Record<string, { name: string; preferences: Preferences }>;
  setLocal: (prefs: Preferences) => void;
  scheduleApply: (prefs: Preferences) => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
}

const sanitizeCssValue = (value: string | undefined, fallback: string) => {
  if (!value) {
    return fallback;
  }
  return value.replace(/[^#%(),.\-a-zA-Z0-9\s]/g, '').trim() || fallback;
};

const createClassSlug = (id: string, index: number) => {
  const base = id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `custom-preset-${base || 'preset'}-${index}`;
};

const ThemesTab: React.FC<ThemesTabProps> = ({ 
  themeSelection, 
  setThemeSelection,
  customPresets,
  setLocal,
  scheduleApply,
  addToast
}) => {
  const handleThemeSelect = (themeId: string) => {
    setThemeSelection(themeId);
    
    // Check if it's a custom preset or built-in theme
    const customPreset = customPresets[themeId];
    const builtInTheme = themePresets[themeId];
    
    if (customPreset) {
      const merged: Preferences = {
        ...customPreset.preferences,
        margin: { ...customPreset.preferences.margin },
        fonts: { ...customPreset.preferences.fonts },
      };
      setLocal(merged);
      scheduleApply(merged);
      addToast({ type: 'success', message: `Applied "${customPreset.name}" preset` });
    } else if (builtInTheme) {
      const merged: Preferences = {
        ...builtInTheme.preferences,
        margin: { ...builtInTheme.preferences.margin },
        fonts: { ...builtInTheme.preferences.fonts },
      };
      setLocal(merged);
      scheduleApply(merged);
      addToast({ type: 'success', message: `Applied "${builtInTheme.name}" theme` });
    }
  };

  const customPresetEntries = useMemo(() => {
    return Object.entries(customPresets).map(([id, preset], index) => {
      const classSlug = createClassSlug(id, index);
      const pageBg = sanitizeCssValue(preset.preferences.page_bg_color, '#ffffff');
      const accent = sanitizeCssValue(preset.preferences.accent_color, '#1d4ed8');
      const fontColor = sanitizeCssValue(preset.preferences.font_color, '#1f2937');
      const fontMain = sanitizeCssValue(preset.preferences.fonts?.main, 'Inter, sans-serif');

      const cssRule = `.${classSlug} {
  --page-bg-color: ${pageBg};
  --accent-color: ${accent};
  --font-color: ${fontColor};
  --main-font: ${fontMain};
}`;

      return {
        id,
        preset,
        className: classSlug,
        cssRule,
      };
    });
  }, [customPresets]);

  const customPresetCss = useMemo(() => {
    return customPresetEntries.map(entry => entry.cssRule).join('\n');
  }, [customPresetEntries]);

  return (
    <div className="tab-panel themes-tab">
      <h3>Theme Gallery</h3>
      <p className="helper-text theme-gallery-description">
        Choose a pre-designed theme as a starting point for your document
      </p>

      {customPresetCss && (
        <style>{customPresetCss}</style>
      )}
      
      <div className="theme-gallery">
        {Object.entries(themePresets).map(([id, theme]) => {
          return (
            <button
              key={id}
              type="button"
              className={`theme-card ${themeSelection === id ? 'active' : ''}`}
              onClick={() => handleThemeSelect(id)}
              title={theme.description}
            >
              <div className="theme-preview">
                <img 
                  src={`/theme-thumbnails/${id}.jpg`}
                  alt={`${theme.name} preview`}
                  className="theme-thumbnail"
                />
              </div>
              <div className="theme-card-info">
                <h4>{theme.name}</h4>
              </div>
              {themeSelection === id && (
                <div className="theme-card-badge">✓</div>
              )}
            </button>
          );
        })}
      </div>

      {Object.keys(customPresets).length > 0 && (
        <>
          <h3 className="custom-presets-heading">Custom Presets</h3>
          <div className="theme-gallery">
            {customPresetEntries.map(({ id, preset, className }) => (
              <div
                key={id}
                className={className}
              >
                <button
                  type="button"
                  className={`theme-card ${themeSelection === id ? 'active' : ''}`}
                  onClick={() => handleThemeSelect(id)}
                >
                <div className="theme-preview">
                  <div 
                    className="theme-preview-fallback custom-preset"
                  >
                    <div 
                      className="theme-preview-header"
                    >
                      ⭐
                    </div>
                    <div className="theme-preview-lines">
                      <div 
                        className="theme-preview-line"
                      />
                      <div 
                        className="theme-preview-line short"
                      />
                      <div 
                        className="theme-preview-line"
                      />
                    </div>
                  </div>
                </div>
                <div className="theme-card-info">
                  <h4>{preset.name}</h4>
                </div>
                {themeSelection === id && (
                  <div className="theme-card-badge">✓</div>
                )}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default ThemesTab;
