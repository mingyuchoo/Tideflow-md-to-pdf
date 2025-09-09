import { useEffect, useRef, useState } from 'react';
import './DesignModal.css';

export type ImageAlignment = 'left' | 'center' | 'right';

export interface ImageProps {
  width: string; // e.g., "60%", "300px", "5cm"
  alignment: ImageAlignment;
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
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setWidth(initial.width);
    setAlignment(initial.alignment);
  }, [initial]);

  if (!open) return null;

  return (
    <div className="design-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="img-modal-title">
      <div className="design-modal image-modal" onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}>
        <div className="design-modal-header">
          <h2 id="img-modal-title">{title}</h2>
        </div>
  <div className="design-section">
          <div className="form-grid">
            <label htmlFor="img-width">Width
              <input
                ref={firstFieldRef}
                id="img-width"
                type="text"
                placeholder="e.g. 60% or 320px or 5cm"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
              />
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
          </div>
        </div>
        <div className="design-footer">
          <div className="design-footer-actions">
            <button className="secondary" onClick={onCancel}>Cancel</button>
          </div>
          <button className="primary" onClick={() => onSave({ width, alignment })}>Save</button>
        </div>
      </div>
    </div>
  );
}

export default ImagePropsModal;
