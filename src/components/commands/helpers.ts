import { EditorView } from "@codemirror/view";
import type { ChangeSpec } from "@codemirror/state";

/**
 * Wrap the current selection with before/after text
 */
export function wrapSel(view: EditorView, before: string, after = before) {
  const s = view.state.selection.main;
  const text = view.state.sliceDoc(s.from, s.to) || "";
  view.dispatch({ 
    changes: { from: s.from, to: s.to, insert: before + text + after },
    selection: { anchor: s.from + before.length, head: s.from + before.length + text.length }
  });
}

/**
 * Toggle inline formatting (e.g., bold, italic) with regex detection
 */
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

/**
 * Toggle prefix at the beginning of each selected line
 */
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

/**
 * Check if current selection contains an image
 */
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

/**
 * Insert text at cursor with proper selection handling
 */
export function insertAtCursor(view: EditorView, text: string) {
  const sel = view.state.selection.main;
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: text },
    selection: { anchor: sel.from + text.length }
  });
}

/**
 * Escape special characters in Typst strings
 */
export function escapeTypstString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Escape special characters in HTML
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Convert plain text to HTML paragraphs with line breaks
 */
export function htmlFromText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';

  return trimmed
    .split(/\n{2,}/)
    .map((paragraph) => {
      const lines = paragraph
        .split(/\n/)
        .map((line) => escapeHtml(line.trim()))
        .join('<br />');
      return `<p>${lines}</p>`;
    })
    .join('\n');
}

/**
 * Insert an admonition/callout block with proper quoting
 */
export function insertAdmonition(view: EditorView, kind: string, fallback: string) {
  const sel = view.state.selection.main;
  const raw = view.state.sliceDoc(sel.from, sel.to) || fallback;
  const lines = raw.split('\n');
  const quoted = lines
    .map((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 ? `> ${trimmed}` : '>';
    })
    .join('\n');
  const block = `> [!${kind.toUpperCase()}]\n${quoted}\n`;
  view.dispatch({ changes: { from: sel.from, to: sel.to, insert: block } });
}
