import React, { useEffect, useState } from 'react';
import type { TabProps } from './types';
import { getSystemFonts } from '../../api';

const TypographyTab: React.FC<TabProps> = ({ local, mutate }) => {
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [monoFonts, setMonoFonts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadFonts = async () => {
      try {
        const fonts = await getSystemFonts();
        
        // Common monospace font names to filter
        const monoKeywords = ['mono', 'console', 'courier', 'code', 'terminal', 'fixed', 'typewriter'];
        
        const mono = fonts.filter(font => 
          monoKeywords.some(keyword => font.toLowerCase().includes(keyword))
        );
        
        setSystemFonts(fonts);
        setMonoFonts(mono.length > 0 ? mono : fonts);
      } catch (error) {
        console.error('Failed to load system fonts:', error);
        // Fallback to default fonts
        setSystemFonts([
          'Arial', 'Calibri', 'Cambria', 'Candara', 'Comic Sans MS',
          'Constantia', 'Corbel', 'Georgia', 'Palatino Linotype',
          'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'
        ]);
        setMonoFonts(['Consolas', 'Courier New', 'Lucida Console']);
      } finally {
        setLoading(false);
      }
    };
    
    loadFonts();
  }, []);

  return (
    <div className="tab-panel">
      <h3>Typography</h3>
      <div className="form-grid one-col">
        <label>Body Font
          <select
            value={local.fonts.main}
            onChange={e => mutate({ fonts: { ...local.fonts, main: e.target.value } })}
            disabled={loading}
          >
            {loading ? (
              <option>Loading fonts...</option>
            ) : (
              systemFonts.map(font => (
                <option key={font} value={font}>{font}</option>
              ))
            )}
          </select>
          <div className="font-preview" data-font-role="body" data-font-value={local.fonts.main}>{`Aa Bb Cc 123 \u2014 ${local.fonts.main}`}</div>
        </label>
        <label>Code / Monospace Font
          <select
            value={local.fonts.mono}
            onChange={e => mutate({ fonts: { ...local.fonts, mono: e.target.value } })}
            disabled={loading}
          >
            {loading ? (
              <option>Loading fonts...</option>
            ) : (
              monoFonts.map(font => (
                <option key={font} value={font}>{font}</option>
              ))
            )}
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
  );
};

export default TypographyTab;
