import React from 'react';
import type { TabProps } from './types';

const AdvancedTab: React.FC<TabProps> = ({ local, mutate }) => {
  return (
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
  );
};

export default AdvancedTab;
