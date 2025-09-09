import { useEffect, useRef, useState } from 'react';
import './DesignModal.css';
import { showOpenDialog, importImageFromPath } from '../api';

export type ImageAlignment = 'left' | 'center' | 'right';

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
  rightText: string;
  alt: string;
  leftText?: string;
  position?: 'image-left' | 'image-right';
}

export type ImagePlusChoice =
  | { kind: 'figure'; data: FigureData }
  | { kind: 'columns'; data: ColumnsData };

export function ImagePlusModal({
  open,
  initialPath,
  defaultWidth,
  defaultAlignment,
  onCancel,
  onChoose
}: {
  open: boolean;
  initialPath: string;
  defaultWidth: string;
  defaultAlignment: ImageAlignment;
  onCancel: () => void;
  onChoose: (choice: ImagePlusChoice) => void;
}) {
  const [mode, setMode] = useState<'figure' | 'columns'>('figure');
  const [path, setPath] = useState(initialPath);
  const [width, setWidth] = useState(defaultWidth);
  const [alignment, setAlignment] = useState<ImageAlignment>(defaultAlignment);
  const [caption, setCaption] = useState('');
  const [alt, setAlt] = useState('');
  const [rightText, setRightText] = useState('Right column text');
  const [leftText, setLeftText] = useState('');
  const [position, setPosition] = useState<'image-left' | 'image-right'>('image-left');
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setPath(initialPath);
    setWidth(defaultWidth);
    setAlignment(defaultAlignment);
  }, [initialPath, defaultWidth, defaultAlignment]);

  if (!open) return null;

  return (
    <div className="design-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="imgplus-modal-title">
      <div className="design-modal image-modal" onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}>
        <div className="design-modal-header">
          <h2 id="imgplus-modal-title">Insert Image+</h2>
        </div>
        <div className="design-section">
          <div className="form-grid one-col">
            <label htmlFor="imgplus-mode">Insert as
              <select id="imgplus-mode" value={mode} onChange={(e) => setMode(e.target.value as 'figure' | 'columns')}>
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
              <button
                onClick={async () => {
                  try {
                    const selectedFile = await showOpenDialog([
                      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'] },
                    ]);
                    if (!selectedFile) return;
                    const assetPath = await importImageFromPath(selectedFile);
                    setPath(assetPath);
                  } catch (err) {
                    console.error('Failed to pick image:', err);
                  }
                }}
              >
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
                placeholder="Short description"
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
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
                  onChange={(e) => setPosition(e.target.value as 'image-left' | 'image-right')}
                >
                  <option value="image-left">Image left, text right</option>
                  <option value="image-right">Image right, text left</option>
                </select>
              </label>
              {position === 'image-right' ? (
                <>
                  <label htmlFor="imgplus-right">Left column text
                    <textarea
                      id="imgplus-right"
                      placeholder="Text to appear to the left of the image"
                      value={rightText}
                      onChange={(e) => setRightText(e.target.value)}
                      rows={4}
                    />
                  </label>
                  <label htmlFor="imgplus-left">Under-image text (optional; shown below the image)
                    <textarea
                      id="imgplus-left"
                      placeholder="Text to appear directly under the image"
                      value={leftText}
                      onChange={(e) => setLeftText(e.target.value)}
                      rows={2}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label htmlFor="imgplus-left">Under-image text (optional; shown below the image)
                    <textarea
                      id="imgplus-left"
                      placeholder="Text to appear directly under the image"
                      value={leftText}
                      onChange={(e) => setLeftText(e.target.value)}
                      rows={2}
                    />
                  </label>
                  <label htmlFor="imgplus-right">Right column text
                    <textarea
                      id="imgplus-right"
                      placeholder="Text to appear to the right of the image"
                      value={rightText}
                      onChange={(e) => setRightText(e.target.value)}
                      rows={4}
                    />
                  </label>
                </>
              )}
            </div>
          </div>
        )}

        <div className="design-footer">
          <div className="design-footer-actions">
            <button className="secondary" onClick={onCancel}>Cancel</button>
          </div>
          <button
            className="primary"
            onClick={() => {
              if (mode === 'figure') {
                onChoose({ kind: 'figure', data: { path, width, alignment, caption, alt } });
              } else {
                onChoose({ kind: 'columns', data: { path, width, alignment, rightText, alt, leftText, position } });
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
