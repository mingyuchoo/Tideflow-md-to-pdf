import React from 'react';
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

  return (
    <div className="tab-panel themes-tab">
      <h3>Theme Gallery</h3>
      <p className="helper-text theme-gallery-description">
        Choose a pre-designed theme as a starting point for your document
      </p>
      
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
            {Object.entries(customPresets).map(([id, preset]) => (
              <button
                key={id}
                type="button"
                className={`theme-card ${themeSelection === id ? 'active' : ''}`}
                onClick={() => handleThemeSelect(id)}
              >
                <div className="theme-preview">
                  <div 
                    className="theme-preview-fallback custom-preset"
                    style={{
                      backgroundColor: preset.preferences.page_bg_color,
                      borderColor: preset.preferences.accent_color,
                    }}
                  >
                    <div 
                      className="theme-preview-header"
                      style={{ 
                        color: preset.preferences.font_color,
                        fontFamily: preset.preferences.fonts.main,
                        opacity: 0.9
                      }}
                    >
                      ⭐
                    </div>
                    <div className="theme-preview-lines">
                      <div 
                        className="theme-preview-line"
                        style={{ backgroundColor: preset.preferences.font_color, opacity: 0.8 }}
                      />
                      <div 
                        className="theme-preview-line short"
                        style={{ backgroundColor: preset.preferences.font_color, opacity: 0.6 }}
                      />
                      <div 
                        className="theme-preview-line"
                        style={{ backgroundColor: preset.preferences.font_color, opacity: 0.7 }}
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
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default ThemesTab;
