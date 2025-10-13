import { useEffect, useRef, useState } from 'react';
import './DesignModal.css';
import { showOpenDialog, importImageFromPath } from '../api';
import type { ImageAlignment } from '../types';
import { deriveAltFromPath } from '../utils/image';

type LayoutPosition = 'image-left' | 'image-right';

interface FigureData {
  path: string;
  width: string;
  alignment: ImageAlignment;
  caption: string;
  alt: string;
}

interface ColumnsData {
  path: string;
  width: string;
  alignment: ImageAlignment;
  alt: string;
  columnText: string;
  underText?: string;
  position: LayoutPosition;
}

export type ImagePlusChoice =
  | { kind: 'figure'; data: FigureData }
  | { kind: 'columns'; data: ColumnsData };

interface ImagePlusModalProps {
  open: boolean;
  initialPath: string;
  defaultWidth: string;
  defaultAlignment: ImageAlignment;
  onCancel: () => void;
  onChoose: (choice: ImagePlusChoice) => void;
}

const COLUMN_PLACEHOLDER = 'Add accompanying text here.';

export function ImagePlusModal({
  open,
  initialPath,
  defaultWidth,
  defaultAlignment,
  onCancel,
  onChoose
}: ImagePlusModalProps) {
  const [mode, setMode] = useState<'figure' | 'columns'>('figure');
  const [path, setPath] = useState(initialPath);
  const [width, setWidth] = useState(defaultWidth);
  const [alignment, setAlignment] = useState<ImageAlignment>(defaultAlignment);
  const [caption, setCaption] = useState('');
  const [alt, setAlt] = useState(deriveAltFromPath(initialPath));
  const [altTouched, setAltTouched] = useState(false);
  const [columnText, setColumnText] = useState('');
  const [underText, setUnderText] = useState('');
  const [position, setPosition] = useState<LayoutPosition>('image-left');
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  // Initialize state when modal opens
  useEffect(() => {
    if (!open) return;
    
    // Batch state updates to avoid cascading renders
    setMode('figure');
    setPath(initialPath);
    setWidth(defaultWidth);
    setAlignment(defaultAlignment);
    setCaption('');
    setColumnText('');
    setUnderText('');
    setPosition('image-left');
    setAlt(deriveAltFromPath(initialPath));
    setAltTouched(false);

    requestAnimationFrame(() => {
      firstFieldRef.current?.focus();
      firstFieldRef.current?.select();
    });
  }, [open, initialPath, defaultWidth, defaultAlignment]);

  useEffect(() => {
    if (!open || altTouched) return;
    setAlt(deriveAltFromPath(path));
  }, [path, open, altTouched]);

  if (!open) return null;

  const handlePickImage = async () => {
    try {
      const selectedFile = await showOpenDialog([
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'] }
      ]);
      if (!selectedFile) return;

      const assetPath = await importImageFromPath(selectedFile);
      setPath(assetPath);
      if (!altTouched) {
        setAlt(deriveAltFromPath(assetPath));
      }
    } catch (err) {
      console.error('Failed to pick image:', err);
    }
  };

  const sanitizedPath = path.trim();
  const sanitizedWidth = width.trim();
  const sanitizedCaption = caption.trim();
  const sanitizedAlt = alt.trim();
  const sanitizedColumn = columnText.trim();
  const sanitizedUnder = underText.trim();
  const canInsert = sanitizedPath.length > 0;

  return (
    <div className="design-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="imgplus-modal-title">
      <div className="design-modal image-modal" onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}>
        <div className="design-modal-header">
          <h2 id="imgplus-modal-title">Insert Image+</h2>
        </div>

        <div className="design-section">
          <div className="form-grid one-col">
            <label htmlFor="imgplus-mode">Insert as
              <select
                id="imgplus-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as 'figure' | 'columns')}
              >
                <option value="figure">Figure with caption</option>
                <option value="columns">Image + text columns</option>
              </select>
            </label>
          </div>
        </div>

        <div className="design-section">
          <div className="form-grid">
            <label htmlFor="imgplus-path">Path
              <input
                ref={firstFieldRef}
                id="imgplus-path"
                type="text"
                placeholder="assets/example.png"
                value={path}
                onChange={(e) => setPath(e.target.value)}
              />
            </label>
            <label>
              Pick image
              <button type="button" onClick={handlePickImage}>
                Pick…
              </button>
            </label>
            <label htmlFor="imgplus-width">Width
              <input
                id="imgplus-width"
                type="text"
                placeholder="e.g. 80% or 320px or 5cm"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
              />
            </label>
            <label htmlFor="imgplus-align">Alignment
              <select
                id="imgplus-align"
                value={alignment}
                onChange={(e) => setAlignment(e.target.value as ImageAlignment)}
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
            <label htmlFor="imgplus-alt">Alt text
              <input
                id="imgplus-alt"
                type="text"
                placeholder="Describe the image"
                value={alt}
                onChange={(e) => {
                  setAltTouched(true);
                  setAlt(e.target.value);
                }}
              />
            </label>
          </div>
        </div>

        {mode === 'figure' && (
          <div className="design-section">
            <div className="form-grid one-col">
              <label htmlFor="imgplus-caption">Caption
                <input
                  id="imgplus-caption"
                  type="text"
                  placeholder="Figure caption"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                />
              </label>
            </div>
          </div>
        )}

        {mode === 'columns' && (
          <div className="design-section">
            <div className="form-grid one-col">
              <label htmlFor="imgplus-layout">Layout
                <select
                  id="imgplus-layout"
                  value={position}
                  onChange={(e) => setPosition(e.target.value as LayoutPosition)}
                >
                  <option value="image-left">Image left, text right</option>
                  <option value="image-right">Image right, text left</option>
                </select>
              </label>
              <label htmlFor="imgplus-column">Column text
                <textarea
                  id="imgplus-column"
                  placeholder={COLUMN_PLACEHOLDER}
                  value={columnText}
                  onChange={(e) => setColumnText(e.target.value)}
                  rows={4}
                />
              </label>
              <label htmlFor="imgplus-under">Under-image text (optional)
                <textarea
                  id="imgplus-under"
                  placeholder="Text to show directly below the image"
                  value={underText}
                  onChange={(e) => setUnderText(e.target.value)}
                  rows={2}
                />
              </label>
            </div>
          </div>
        )}

        <div className="design-footer">
          <div className="design-footer-actions">
            <button className="secondary" type="button" onClick={onCancel}>Cancel</button>
          </div>
          <button
            className="primary"
            type="button"
            disabled={!canInsert}
            onClick={() => {
              if (!canInsert) {
                return;
              }

              if (mode === 'figure') {
                onChoose({
                  kind: 'figure',
                  data: {
                    path: sanitizedPath,
                    width: sanitizedWidth,
                    alignment,
                    caption: sanitizedCaption,
                    alt: sanitizedAlt
                  }
                });
              } else {
                onChoose({
                  kind: 'columns',
                  data: {
                    path: sanitizedPath,
                    width: sanitizedWidth,
                    alignment,
                    alt: sanitizedAlt,
                    columnText: sanitizedColumn,
                    underText: sanitizedUnder,
                    position
                  }
                });
              }
            }}
          >
            Insert
          </button>
        </div>
      </div>
    </div>
  );
}

export default ImagePlusModal;
