import React, { useState } from 'react';
import { EditorView } from "@codemirror/view";
import { TOOLBAR_CONFIG, FONT_OPTIONS } from './MarkdownToolbar';
import type { ToolbarItem } from './MarkdownToolbar';
import { cmd, getImageAtCursor } from './MarkdownCommands';
import './MarkdownToolbar.css';

interface MarkdownToolbarProps {
  editorView: EditorView | null;
  onSave?: () => void;
  onRender?: () => void;
}

const MarkdownToolbar: React.FC<MarkdownToolbarProps> = ({ editorView, onSave, onRender }) => {
  const [selectedFont, setSelectedFont] = useState<string>("New Computer Modern");
  const [selectedSize, setSelectedSize] = useState<string>("Normal");
  const [selectedAlign, setSelectedAlign] = useState<string>("Left");
  const [selectedWidth, setSelectedWidth] = useState<string>("60%");
  const [paraStyle, setParaStyle] = useState<string>("Paragraph");

  // Handle button clicks
  const handleButtonClick = (id: string) => {
    if (!editorView) return;

    switch (id) {
      case "bold":
        cmd.bold(editorView);
        break;
      case "italic":
        cmd.italic(editorView);
        break;
      case "strike":
        cmd.strike(editorView);
        break;
      case "codeInline":
        cmd.codeInline(editorView);
        break;
      case "link":
        cmd.link(editorView);
        break;
      case "ul":
        cmd.ul(editorView);
        break;
      case "ol":
        cmd.ol(editorView);
        break;
      case "task":
        cmd.task(editorView);
        break;
      case "indent":
        cmd.indent(editorView);
        break;
      case "outdent":
        cmd.outdent(editorView);
        break;
      case "image":
        handleImageInsert();
        break;
      case "table":
        cmd.table(editorView);
        break;
      case "hr":
        cmd.hr(editorView);
        break;
      case "pagebreak":
        cmd.pagebreak(editorView);
        break;
      case "undo":
        cmd.undo(editorView);
        break;
      case "redo":
        cmd.redo(editorView);
        break;
      case "save":
        onSave?.();
        break;
      case "render":
        onRender?.();
        break;
    }
    
    // Refocus editor after command
    editorView.focus();
  };

  // Handle dropdown changes
  const handleSelectChange = (id: string, value: string) => {
    console.log('🔄 Select changed:', id, '=', value);
    if (!editorView) return;

    switch (id) {
      case "paraStyle":
        setParaStyle(value);
        handleParagraphStyle(value);
        break;
      case "align":
        setSelectedAlign(value);
        handleAlign(value);
        break;
      case "width":
        setSelectedWidth(value);
        handleWidth(value);
        break;
      case "font":
        console.log('🎯 Font select triggered, calling handleFont...');
        setSelectedFont(value);
        handleFont(value);
        break;
      case "size":
        setSelectedSize(value);
        handleSize(value);
        break;
    }
    
    editorView.focus();
  };

  // Handle paragraph style changes
  const handleParagraphStyle = (style: string) => {
    if (!editorView) return;

    switch (style) {
      case "H1":
        cmd.heading(editorView, 1);
        break;
      case "H2":
        cmd.heading(editorView, 2);
        break;
      case "H3":
        cmd.heading(editorView, 3);
        break;
      case "Blockquote":
        cmd.quote(editorView);
        break;
      case "Code block":
        cmd.codeBlock(editorView);
        break;
      case "Paragraph":
        cmd.paragraph(editorView);
        break;
    }
  };

  // Handle alignment
  const handleAlign = (align: string) => {
    if (!editorView) return;
    
    const alignValue = align.toLowerCase() as "left" | "center" | "right";
    const image = getImageAtCursor(editorView);
    
    if (image) {
      // For images, convert to Typst fig
      cmd.figForImage(editorView, image.path, selectedWidth, alignValue);
    } else {
      // For text, use align block
      cmd.alignBlock(editorView, alignValue);
    }
  };

  // Handle width changes (for images)
  const handleWidth = (width: string) => {
    if (!editorView) return;
    
    const image = getImageAtCursor(editorView);
    if (image) {
      const alignValue = selectedAlign.toLowerCase() as "left" | "center" | "right";
      cmd.figForImage(editorView, image.path, width, alignValue);
    }
  };

  // Handle font changes
  const handleFont = async (font: string) => {
    console.log('🎨 Font changed to:', font, 'Mode: Selection');
    if (!editorView) return;

    // Apply to selection only - document font is changed through Design menu
    cmd.fontLocal(editorView, font);
  };

  // Handle size changes
  const handleSize = (size: string) => {
    if (!editorView) return;
    
    const sizeValue = size.toLowerCase() as "small" | "normal" | "large";
    cmd.sizeLocal(editorView, sizeValue);
  };

  // Handle image insertion
  const handleImageInsert = async () => {
    // For now, just insert a placeholder - we'll integrate with file picker later
    const filename = prompt("Image filename (will be saved to assets/):");
    if (filename && editorView) {
      const path = `assets/${filename}`;
      const s = editorView.state.selection.main;
      editorView.dispatch({
        changes: { from: s.from, to: s.to, insert: `![](${path})` }
      });
    }
  };

  // Render a toolbar item
  const renderToolbarItem = (item: ToolbarItem, index: number) => {
    if (item.type === "divider") {
      return <div key={index} className="toolbar-divider" />;
    }

    if (item.type === "button") {
      return (
        <button
          key={item.id}
          className="toolbar-button"
          onClick={() => handleButtonClick(item.id)}
          title={item.tooltip || item.label}
          disabled={!editorView}
        >
          {item.label}
        </button>
      );
    }

    if (item.type === "select") {
      let options = item.options;
      let value = "";

      // Populate options and current value based on select type
      switch (item.id) {
        case "font":
          options = FONT_OPTIONS;
          value = selectedFont;
          console.log('🎨 Rendering font dropdown with options:', options.length, 'selected:', value);
          break;
        case "size":
          value = selectedSize;
          break;
        case "align":
          value = selectedAlign;
          break;
        case "width":
          value = selectedWidth;
          break;
        case "paraStyle":
          value = paraStyle;
          break;
        default:
          value = options[0] || "";
      }

      return (
        <div key={item.id} className="toolbar-select-wrapper">
          <label className="toolbar-select-label">{item.label}</label>
          <select
            className="toolbar-select"
            value={value}
            onChange={(e) => {
              console.log('📋 Raw dropdown onChange fired:', item.id, e.target.value);
              handleSelectChange(item.id, e.target.value);
            }}
            disabled={!editorView}
            title={item.tooltip}
          >
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="markdown-toolbar">
      {TOOLBAR_CONFIG.map((item, index) => renderToolbarItem(item, index))}
    </div>
  );
};

export default MarkdownToolbar;
