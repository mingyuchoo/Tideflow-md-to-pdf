import { EditorView } from "@codemirror/view";
import { toggleInline } from "./helpers";

/**
 * Text formatting commands: bold, italic, strike, code, links, math, fonts
 */
export const formattingCommands = {
  /** Toggle bold formatting */
  bold: (view: EditorView) => toggleInline(view, "**", /^\*\*([\s\S]+)\*\*$/),
  
  /** Toggle italic formatting */
  italic: (view: EditorView) => toggleInline(view, "*", /^\*([\s\S]+)\*$/),
  
  /** Toggle strikethrough formatting */
  strike: (view: EditorView) => toggleInline(view, "~~", /^~~([\s\S]+)~~$/),
  
  /** Toggle inline code formatting */
  codeInline: (view: EditorView) => toggleInline(view, "`", /^`([\s\S]+)`$/),
  
  /** Insert/edit link with URL prompt */
  link: (view: EditorView) => {
    const s = view.state.selection.main;
    const text = view.state.sliceDoc(s.from, s.to) || "link";
    const url = prompt("Enter URL:") || "https://";
    view.dispatch({ 
      changes: { from: s.from, to: s.to, insert: `[${text}](${url})` },
      selection: { anchor: s.from + `[${text}](`.length, head: s.from + `[${text}](${url}`.length }
    });
  },

  /** Toggle inline math */
  inlineMath: (view: EditorView) => toggleInline(view, "$", /^\$([\s\S]+)\$$/),

  /** Apply local font change using Typst */
  fontLocal: (view: EditorView, font: string) => {
    const s = view.state.selection.main;
    const text = view.state.sliceDoc(s.from, s.to) || "Sample text";
    const cleanText = text.replace(/\s+/g, ' ').trim();
    const rawTypstComment = `<!--raw-typst #text(font: "${font}")[${cleanText}] -->`;
    view.dispatch({ changes: { from: s.from, to: s.to, insert: rawTypstComment } });
  },

  /** Apply local size change using Typst */
  sizeLocal: (view: EditorView, which: "small" | "normal" | "large") => {
    const s = view.state.selection.main;
    const text = view.state.sliceDoc(s.from, s.to) || "Sample text";
    
    if (which === "normal") {
      view.dispatch({ changes: { from: s.from, to: s.to, insert: text } });
      return;
    }
    
    const size = which === "small" ? "0.9em" : "1.2em";
    const block = `<!--raw-typst #text(size: ${size})[${text}] -->`;
    view.dispatch({ changes: { from: s.from, to: s.to, insert: block } });
  },

  /** Undo last change */
  undo: (view: EditorView) => {
    return view.dispatch({ changes: [], userEvent: "undo" });
  },

  /** Redo last undone change */
  redo: (view: EditorView) => {
    return view.dispatch({ changes: [], userEvent: "redo" });
  }
};
