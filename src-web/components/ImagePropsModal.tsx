import { useEffect, useRef, useState } from 'react';
import './DesignModal.css';
import type { ImageAlignment } from '../types';

export interface ImageProps {
  width: string; // e.g., "60%", "300px", "5cm"
  alignment: ImageAlignment;
  alt: string;
}

export function ImagePropsModal({
  open,
  initial,
  onCancel,
  onSave,
  title = 'Image properties'
}: {
  open: boolean;
  initial: ImageProps;
  onCancel: () => void;
  onSave: (props: ImageProps) => void;
  title?: string;
}) {
  const [width, setWidth] = useState(initial.width);
  const [alignment, setAlignment] = useState<ImageAlignment>(initial.alignment);
  const [alt, setAlt] = useState(initial.alt);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  // Parse width to get numeric value and unit
  const parseWidth = (w: string): { value: number; unit: string } => {
    const match = w.trim().match(/^(\d+(?:\.\d+)?)\s*(%|px|cm|mm|in|pt|em)?$/);
    if (match) {
      return { value: parseFloat(match[1]), unit: match[2] || '%' };
    }
    return { value: 60, unit: '%' };
  };

  const widthParts = parseWidth(width);
  const [sliderValue, setSliderValue] = useState(widthParts.value);
  const [unit, setUnit] = useState(widthParts.unit);

  useEffect(() => {
    setWidth(initial.width);
    setAlignment(initial.alignment);
    setAlt(initial.alt);
    const parts = parseWidth(initial.width);
    setSliderValue(parts.value);
    setUnit(parts.unit);
  }, [initial]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        firstFieldRef.current?.focus();
        firstFieldRef.current?.select();
      });
    }
  }, [open]);

  // Update width when slider or unit changes
  const handleSliderChange = (value: number) => {
    setSliderValue(value);
    setWidth(`${value}${unit}`);
  };

  const handleWidthInputChange = (value: string) => {
    setWidth(value);
    const parts = parseWidth(value);
    setSliderValue(parts.value);
    setUnit(parts.unit);
  };

  const handleSave = () => {
    // Ensure width has a unit
    let finalWidth = width.trim();
    if (finalWidth && !/(%|px|cm|mm|in|pt|em)$/.test(finalWidth)) {
      finalWidth = `${finalWidth}%`;
    }
    onSave({ width: finalWidth, alignment, alt: alt.trim() });
  };

  if (!open) return null;

  return (
    <div className="design-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="img-modal-title">
      <div className="design-modal image-modal" onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}>
        <div className="design-modal-header">
          <h2 id="img-modal-title">{title}</h2>
        </div>
        <div className="design-section">
          <div className="form-grid">
            <label htmlFor="img-width-slider">Width: {sliderValue}{unit}
              <div className="width-controls">
                <input
                  id="img-width-slider"
                  type="range"
                  min="10"
                  max="100"
                  value={sliderValue}
                  onChange={(e) => handleSliderChange(parseFloat(e.target.value))}
                  className="width-slider"
                />
                <input
                  ref={firstFieldRef}
                  id="img-width"
                  type="text"
                  placeholder="e.g. 60% or 320px"
                  value={width}
                  onChange={(e) => handleWidthInputChange(e.target.value)}
                  className="width-input"
                />
              </div>
            </label>
            <label htmlFor="img-align">Alignment
              <select
                id="img-align"
                value={alignment}
                onChange={(e) => setAlignment(e.target.value as ImageAlignment)}
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
            <label htmlFor="img-alt">Alt text
              <input
                id="img-alt"
                type="text"
                placeholder="Describe the image for screen readers"
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
              />
            </label>
          </div>
        </div>
        <div className="design-footer">
          <div className="design-footer-actions">
            <button className="secondary" onClick={onCancel}>Cancel</button>
          </div>
          <button
            className="primary"
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default ImagePropsModal;
