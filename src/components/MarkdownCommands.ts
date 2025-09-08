import { EditorView } from "@codemirror/view";
import type { ChangeSpec } from "@codemirror/state";

// Helper functions for text manipulation
export function wrapSel(view: EditorView, before: string, after = before) {
  const s = view.state.selection.main;
  const text = view.state.sliceDoc(s.from, s.to) || "";
  view.dispatch({ 
    changes: { from: s.from, to: s.to, insert: before + text + after },
    selection: { anchor: s.from + before.length, head: s.from + before.length + text.length }
  });
}

export function toggleInline(view: EditorView, wrapper: string, re: RegExp) {
  const s = view.state.selection.main;
  const text = view.state.sliceDoc(s.from, s.to) || "";
  const m = re.exec(text);
  const out = m ? text.replace(re, "$1") : `${wrapper}${text || "text"}${wrapper}`;
  const offset = m ? -wrapper.length : wrapper.length;
  
  view.dispatch({ 
    changes: { from: s.from, to: s.to, insert: out },
    selection: { anchor: s.from + offset, head: s.from + out.length - offset }
  });
}

export function toggleLinePrefix(view: EditorView, prefix: string) {
  const sel = view.state.selection.main;
  const doc = view.state.doc;
  const fromLine = doc.lineAt(sel.from).number;
  const toLine = doc.lineAt(sel.to).number;
  const changes: ChangeSpec[] = [];
  
  for (let n = fromLine; n <= toLine; n++) {
    const line = doc.line(n);
    const has = line.text.startsWith(prefix);
    const insert = has ? line.text.slice(prefix.length) : prefix + line.text;
    changes.push({ from: line.from, to: line.to, insert });
  }
  
  view.dispatch({ changes });
}

// Check if current selection contains an image
export function getImageAtCursor(view: EditorView): { path: string; line: number } | null {
  const sel = view.state.selection.main;
  const line = view.state.doc.lineAt(sel.from);
  const imageRegex = /!\[.*?\]\((.*?)\)/;
  const match = imageRegex.exec(line.text);
  
  if (match) {
    return { path: match[1], line: line.number };
  }
  return null;
}

// Insert text at cursor with proper selection handling
export function insertAtCursor(view: EditorView, text: string) {
  const sel = view.state.selection.main;
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: text },
    selection: { anchor: sel.from + text.length }
  });
}

// All markdown editing commands
export const cmd = {
  // Text formatting
  bold: (view: EditorView) => toggleInline(view, "**", /^\*\*([\s\S]+)\*\*$/),
  italic: (view: EditorView) => toggleInline(view, "*", /^\*([\s\S]+)\*$/),
  strike: (view: EditorView) => toggleInline(view, "~~", /^~~([\s\S]+)~~$/),
  codeInline: (view: EditorView) => toggleInline(view, "`", /^`([\s\S]+)`$/),
  
  link: (view: EditorView) => {
    const s = view.state.selection.main;
    const text = view.state.sliceDoc(s.from, s.to) || "link";
    const url = prompt("Enter URL:") || "https://";
    view.dispatch({ 
      changes: { from: s.from, to: s.to, insert: `[${text}](${url})` },
      selection: { anchor: s.from + `[${text}](`.length, head: s.from + `[${text}](${url}`.length }
    });
  },

  // Heading commands
  heading: (view: EditorView, level: 1 | 2 | 3) => {
    const hashes = "#".repeat(level) + " ";
    const sel = view.state.selection.main;
    const doc = view.state.doc;
    const fromLine = doc.lineAt(sel.from).number;
    const toLine = doc.lineAt(sel.to).number;
    const changes: ChangeSpec[] = [];
    
    for (let n = fromLine; n <= toLine; n++) {
      const line = doc.line(n);
      const stripped = line.text.replace(/^#{1,6}\s+/, "");
      const current = line.text.startsWith(hashes);
      changes.push({ 
        from: line.from, 
        to: line.to, 
        insert: current ? stripped : hashes + stripped 
      });
    }
    view.dispatch({ changes });
  },

  // Paragraph styles
  paragraph: (view: EditorView) => {
    const sel = view.state.selection.main;
    const doc = view.state.doc;
    const fromLine = doc.lineAt(sel.from).number;
    const toLine = doc.lineAt(sel.to).number;
    const changes: ChangeSpec[] = [];
    
    for (let n = fromLine; n <= toLine; n++) {
      const line = doc.line(n);
      // Remove heading markers, blockquote markers
      const cleaned = line.text.replace(/^(#{1,6}\s+|>\s+)/, "");
      changes.push({ from: line.from, to: line.to, insert: cleaned });
    }
    view.dispatch({ changes });
  },

  quote: (view: EditorView) => toggleLinePrefix(view, "> "),

  codeBlock: (view: EditorView) => {
    const s = view.state.selection.main;
    const text = view.state.sliceDoc(s.from, s.to) || "code";
    const lang = prompt("Language (optional):") || "";
    view.dispatch({ 
      changes: { 
        from: s.from, 
        to: s.to, 
        insert: `\`\`\`${lang}\n${text}\n\`\`\`` 
      }
    });
  },

  // Lists
  ul: (view: EditorView) => toggleLinePrefix(view, "- "),
  ol: (view: EditorView) => toggleLinePrefix(view, "1. "),
  task: (view: EditorView) => toggleLinePrefix(view, "- [ ] "),

  indent: (view: EditorView) => {
    const sel = view.state.selection.main;
    const doc = view.state.doc;
    const fromLine = doc.lineAt(sel.from).number;
    const toLine = doc.lineAt(sel.to).number;
    const changes: ChangeSpec[] = [];
    
    for (let n = fromLine; n <= toLine; n++) {
      const line = doc.line(n);
      changes.push({ from: line.from, insert: "  " });
    }
    view.dispatch({ changes });
  },

  outdent: (view: EditorView) => {
    const sel = view.state.selection.main;
    const doc = view.state.doc;
    const fromLine = doc.lineAt(sel.from).number;
    const toLine = doc.lineAt(sel.to).number;
    const changes: ChangeSpec[] = [];
    
    for (let n = fromLine; n <= toLine; n++) {
      const line = doc.line(n);
      const newText = line.text.startsWith("  ") 
        ? line.text.slice(2) 
        : line.text.replace(/^(\t)/, "");
      changes.push({ from: line.from, to: line.to, insert: newText });
    }
    view.dispatch({ changes });
  },

  // Insert elements
  hr: (view: EditorView) => {
    const s = view.state.selection.main;
    const line = view.state.doc.lineAt(s.from);
    const isAtStart = s.from === line.from;
    const prefix = isAtStart ? "" : "\n";
    const suffix = "\n";
    insertAtCursor(view, `${prefix}---${suffix}`);
  },

  table: (view: EditorView) => {
    const starter = `| Col 1 | Col 2 | Col 3 |
|:------|:-----:|------:|
|       |       |       |
|       |       |       |
`;
    insertAtCursor(view, starter);
  },

  // Layout helpers (Typst blocks)
  pagebreak: (view: EditorView) => {
    insertAtCursor(view, "<!--raw-typst #pagebreak() -->");
  },

  alignBlock: (view: EditorView, where: "left" | "center" | "right") => {
    const s = view.state.selection.main;
    const text = view.state.sliceDoc(s.from, s.to) || "Content";
    const block = `<!--raw-typst #align(${where})[\n${text}\n] -->`;
    view.dispatch({ changes: { from: s.from, to: s.to, insert: block } });
  },

  figForImage: (view: EditorView, path: string, w = "60%", align: "left" | "center" | "right" = "center") => {
    const s = view.state.selection.main;
    const block = `<!--raw-typst #fig("${path}", w: ${w}, align: "${align}") -->`;
    view.dispatch({ changes: { from: s.from, to: s.to, insert: block } });
  },

  // Font and size
  sizeLocal: (view: EditorView, which: "small" | "normal" | "large") => {
    const s = view.state.selection.main;
    const text = view.state.sliceDoc(s.from, s.to) || "Sample text";
    
    if (which === "normal") {
      // For normal, we could detect and strip existing #text(size: ...) wrappers
      view.dispatch({ changes: { from: s.from, to: s.to, insert: text } });
      return;
    }
    
    const size = which === "small" ? "0.9em" : "1.2em";
    const block = `<!--raw-typst #text(size: ${size})[${text}] -->`;
    view.dispatch({ changes: { from: s.from, to: s.to, insert: block } });
  },

  fontLocal: (view: EditorView, font: string) => {
    const s = view.state.selection.main;
    const text = view.state.sliceDoc(s.from, s.to) || "Sample text";
    // Clean the text: remove line breaks and excess whitespace for inline font commands
    const cleanText = text.replace(/\s+/g, ' ').trim();
    // Use cmarker's raw-typst HTML comment syntax
    const rawTypstComment = `<!--raw-typst #text(font: "${font}")[${cleanText}] -->`;
    view.dispatch({ changes: { from: s.from, to: s.to, insert: rawTypstComment } });
  },

  // Editor actions
  undo: (view: EditorView) => {
    // CodeMirror has built-in undo/redo
    return view.dispatch({ changes: [], userEvent: "undo" });
  },

  redo: (view: EditorView) => {
    return view.dispatch({ changes: [], userEvent: "redo" });
  }
};
