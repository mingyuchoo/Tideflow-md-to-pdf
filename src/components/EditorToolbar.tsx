import React from 'react';
import { EditorView } from 'codemirror';
import { cmd } from './commands';
import { FONT_OPTIONS } from './MarkdownToolbar';

interface EditorToolbarProps {
  currentFile: string | null;
  modified: boolean;
  isSaving: boolean;
  isActivelyTyping: boolean;
  preferences: {
    render_debounce_ms: number;
    default_image_width: string;
    default_image_alignment: string;
  };
  selectedFont: string;
  calloutType: 'box' | 'info' | 'tip' | 'warn';
  editorView: EditorView | null;
  onSave: () => void;
  onRender: () => void;
  onFontChange: (font: string) => void;
  onImageInsert: () => void;
  onImagePlusOpen: () => void;
  onCalloutTypeChange: (type: 'box' | 'info' | 'tip' | 'warn') => void;
  onImageWidthChange: (width: string) => void;
}

const EditorToolbar: React.FC<EditorToolbarProps> = ({
  currentFile,
  modified,
  isSaving,
  isActivelyTyping,
  preferences,
  selectedFont,
  calloutType,
  editorView,
  onSave,
  onRender,
  onFontChange,
  onImageInsert,
  onImagePlusOpen,
  onCalloutTypeChange,
  onImageWidthChange,
}) => {
  return (
    <>
      <div className="editor-toolbar">
        <span className="file-path">{currentFile}</span>
        <div className="editor-status">
          {isActivelyTyping && (
            <span className="typing-indicator">
              ⌨️ Typing
            </span>
          )}
          <span className="debounce-info">
            {preferences.render_debounce_ms}ms debounce
          </span>
        </div>
        <div className="editor-actions">
          <button
            onClick={onSave}
            disabled={!modified || isSaving}
            title="Save File"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={onRender}
            title="Render PDF"
          >
            Render
          </button>
        </div>
      </div>

      {/* Simple Markdown Toolbar */}
      <div className="simple-markdown-toolbar">
        <button onClick={() => cmd.bold(editorView!)} title="Bold (Ctrl+B)">
          <strong>B</strong>
        </button>
        <button onClick={() => cmd.italic(editorView!)} title="Italic (Ctrl+I)">
          <em>I</em>
        </button>
        <button onClick={() => cmd.strike(editorView!)} title="Strikethrough">
          <s>S</s>
        </button>
        <button onClick={() => cmd.codeInline(editorView!)} title="Inline Code (Ctrl+`)">
          {'</>'}
        </button>
        <button onClick={() => cmd.link(editorView!)} title="Link (Ctrl+K)">
          🔗
        </button>
        <div className="toolbar-divider" />
        <button onClick={() => cmd.heading(editorView!, 1)} title="Heading 1 (Ctrl+Alt+1)">
          H1
        </button>
        <button onClick={() => cmd.heading(editorView!, 2)} title="Heading 2 (Ctrl+Alt+2)">
          H2
        </button>
        <button onClick={() => cmd.heading(editorView!, 3)} title="Heading 3 (Ctrl+Alt+3)">
          H3
        </button>
        <button onClick={() => cmd.quote(editorView!)} title="Blockquote (Ctrl+Shift+Q)">
          ""
        </button>
        <div className="toolbar-divider" />
        <button onClick={() => cmd.ul(editorView!)} title="Bullet List (Ctrl+Shift+8)">
          • List
        </button>
        <button onClick={() => cmd.ol(editorView!)} title="Numbered List (Ctrl+Shift+7)">
          1. List
        </button>
        <button onClick={() => cmd.task(editorView!)} title="Task List (Ctrl+Shift+9)">
          ☐ Task
        </button>
        <div className="toolbar-divider" />
        <button onClick={() => cmd.table(editorView!)} title="Insert Table">
          ▦
        </button>
        <button onClick={() => cmd.hr(editorView!)} title="Horizontal Rule">
          —
        </button>
        <button onClick={() => cmd.pagebreak(editorView!)} title="Page Break">
          ⤓⤒
        </button>
        <button onClick={() => cmd.vspace(editorView!, '8pt')} title="Vertical Space">
          ↕
        </button>
        <button onClick={onImageInsert} title="Insert Image">
          🖼️
        </button>
        <button
          onClick={onImagePlusOpen}
          title="Image+ (Figure / Image + Text)"
        >
          🖼️+
        </button>
        {/* Quick image width selector: updates nearest <img> before the cursor */}
        <label className="inline-label">Img W:</label>
        <select
          className="inline-select"
          onChange={(e) => onImageWidthChange(e.target.value)}
          defaultValue={preferences.default_image_width || '80%'}
          title="Quick image width: updates the nearest <img> before the cursor"
        >
          <option value="25%">25%</option>
          <option value="40%">40%</option>
          <option value="60%">60%</option>
          <option value="80%">80%</option>
          <option value="100%">100%</option>
        </select>
        {/* Callout variants: choose type, then click Insert */}
        <label className="inline-label">Callout:</label>
        <select
          className="inline-select"
          onChange={(e) => onCalloutTypeChange(e.target.value as 'box' | 'info' | 'tip' | 'warn')}
          value={calloutType}
          title="Choose a callout type"
        >
          <option value="box">Note</option>
          <option value="info">Info</option>
          <option value="tip">Tip</option>
          <option value="warn">Warn</option>
        </select>
        <button
          title="Insert callout"
          onClick={() => {
            if (!editorView) return;
            const t = calloutType;
            if (t === 'box') cmd.noteBox(editorView);
            else if (t === 'info') cmd.noteInfo(editorView);
            else if (t === 'tip') cmd.noteTip(editorView);
            else if (t === 'warn') cmd.noteWarn(editorView);
          }}
        >
          ☰
        </button>
        <button onClick={() => cmd.footnote(editorView!)} title="Footnote">
          ⁵
        </button>
        <button onClick={() => cmd.columnsNoBorder(editorView!)} title="Insert 2 Columns (no border)">
          ⫴ Columns
        </button>
        <button onClick={() => cmd.alignBlock(editorView!, 'center')} title="Center Align Block">
          ⊕
        </button>
        <div className="toolbar-divider" />

        {/* Font Controls */}
        <div className="font-controls">
          <div className="font-selector">
            <label>Font (Selection):</label>
            <select
              value={selectedFont}
              onChange={(e) => onFontChange(e.target.value)}
              title="Apply font to selected text"
            >
              {FONT_OPTIONS.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </>
  );
};

export default EditorToolbar;