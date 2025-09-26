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

function escapeTypstString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function htmlFromText(text: string): string {
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

function insertAdmonition(view: EditorView, kind: string, fallback: string) {
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

  // Insert figure with caption using Typst figure helper and optional alignment/alt text
  figureWithCaption: (
    view: EditorView,
    path: string,
    width: string,
    align: 'left' | 'center' | 'right',
    caption: string,
    alt = ''
  ) => {
    const s = view.state.selection.main;
    const sanitizedCaption = caption.trim().replace(/\n+/g, ' ');
    const captionBlock = sanitizedCaption.length > 0
      ? `caption: [${sanitizedCaption.replace(/\[/g, '(').replace(/\]/g, ')')}]`
      : '';

    const normalizedWidth = width.trim();
    let widthArg = '';
    if (normalizedWidth) {
      if (normalizedWidth.toLowerCase() === 'auto') {
        widthArg = ', width: auto';
      } else {
        widthArg = `, width: parse-length("${escapeTypstString(normalizedWidth)}")`;
      }
    }

    const altArg = alt.trim().length > 0 ? `, alt: "${escapeTypstString(alt.trim())}"` : '';
    const imageCall = `#image("${escapeTypstString(path)}"${widthArg}${altArg})`;
    const figurePrefix = captionBlock ? `#figure(${captionBlock})` : '#figure';
    const figure = `${figurePrefix}[${imageCall}]`;
    const aligned = align === 'center'
      ? `#align(center, ${figure})`
      : align === 'right'
        ? `#align(right, ${figure})`
        : figure;

    const block = `\n<!--raw-typst ${aligned} -->\n`;
    view.dispatch({ changes: { from: s.from, to: s.to, insert: block } });
  },

  // Insert image + text columns (HTML table for robustness)
  imageWithTextColumns: (
    view: EditorView,
    path: string,
    width: string,
    align: 'left' | 'center' | 'right',
    columnText: string,
    alt = '',
    underText: string = '',
    position: 'image-left' | 'image-right' = 'image-left'
  ) => {
    const s = view.state.selection.main;
    const alignAttr = ` data-align="${align}"`;
    const widthAttr = width.trim().length > 0 ? ` width="${escapeHtml(width.trim())}"` : '';
    const img = `<img src="${escapeHtml(path)}" alt="${escapeHtml(alt.trim())}"${widthAttr}${alignAttr} />`;
    const underHtml = htmlFromText(underText);
    const imageBlock = underHtml
      ? `${img}\n<div data-role="image-under-text">${underHtml}</div>`
      : img;
    const columnHtml = htmlFromText(columnText) || '&nbsp;';
    const firstCell = position === 'image-left' ? imageBlock : columnHtml;
    const secondCell = position === 'image-left' ? columnHtml : imageBlock;
    // Emit a plain HTML table with explicit borderless hints on table and cells
    const block = `\n<table border="0" cellspacing="0" cellpadding="0" role="presentation" data-borderless="1" data-layout="${position}" style="border-collapse: collapse; border: 0">\n  <tr>\n    <td style="border: 0; vertical-align: top;">${firstCell}</td>\n    <td style="border: 0; vertical-align: top;">${secondCell}</td>\n  </tr>\n</table>\n\n`;
    view.dispatch({ changes: { from: s.from, to: s.to, insert: block } });
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

  // Math
  inlineMath: (view: EditorView) => toggleInline(view, "$", /^\$([\s\S]+)\$$/),
  blockMath: (view: EditorView) => {
    const s = view.state.selection.main;
    const text = view.state.sliceDoc(s.from, s.to) || "a^2 + b^2 = c^2";
    const block = `$$\n${text}\n$$`;
    view.dispatch({ changes: { from: s.from, to: s.to, insert: block } });
  },

  // Footnote (Typst inline)
  footnote: (view: EditorView) => {
    const s = view.state.selection.main;
    const note = prompt("Footnote text:") || "Footnote";
    const insert = `<!--raw-typst #footnote[${note}] -->`;
    view.dispatch({ changes: { from: s.from, to: s.to, insert } });
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

  // Spacing (Typst)
  vspace: (view: EditorView, size: string = "1em") => {
    insertAtCursor(view, `<!--raw-typst #v(${size}) -->`);
  },

  // Callout/Note box (Typst block)
  noteBox: (view: EditorView) => {
    insertAdmonition(view, 'note', 'Note content');
  },

  // Callout variants
  noteInfo: (view: EditorView) => {
    insertAdmonition(view, 'info', 'Additional information');
  },
  noteTip: (view: EditorView) => {
    insertAdmonition(view, 'tip', 'Helpful tip');
  },
  noteWarn: (view: EditorView) => {
    insertAdmonition(view, 'warning', 'Warning details');
  },

  // Layout helpers (Typst blocks)
  pagebreak: (view: EditorView) => {
    insertAtCursor(view, "<!--raw-typst #pagebreak() -->");
  },

  // Insert a simple two-column block as a Markdown table (images work inside)
  columns2: (view: EditorView) => {
    const s = view.state.selection.main;
    const right = view.state.sliceDoc(s.from, s.to) || "Right column content";
    const block = `\n| Left | Right |\n|:---- | :---- |\n| Place image here | ${right} |\n\n`;
    view.dispatch({ changes: { from: s.from, to: s.to, insert: block } });
  },

  // Insert a columns table with header indicating ratio (visual guide)
  columnsPreset: (view: EditorView, leftPct: number, rightPct: number) => {
    const s = view.state.selection.main;
    const right = view.state.sliceDoc(s.from, s.to) || "Right column content";
    const block = `\n| Left (${leftPct}%) | Right (${rightPct}%) |\n|:---- | :---- |\n| Place image here | ${right} |\n\n`;
    view.dispatch({ changes: { from: s.from, to: s.to, insert: block } });
  },

  // Insert a Typst grid with real width ratios
  columnsGridPreset: (view: EditorView, leftPct: number, rightPct: number) => {
    const s = view.state.selection.main;
    const right = view.state.sliceDoc(s.from, s.to) || "Right column content";
    const l = Math.max(0, Math.min(100, leftPct));
    const r = Math.max(0, Math.min(100, rightPct));
    const block = `\n<!--raw-typst #grid(columns: (${l}% + 0pt, ${r}% + 0pt), gutter: 12pt)[\n[Place image here]\n[${right}]\n] -->\n`;
    view.dispatch({ changes: { from: s.from, to: s.to, insert: block } });
  },

  // Insert side-by-side text columns using a simple HTML table (no header, no rule; images work inside)
  columnsNoBorder: (view: EditorView) => {
    const s = view.state.selection.main;
    const hadSelection = s.from !== s.to;
    const rightText = view.state.sliceDoc(s.from, s.to) || "Right column text";
    const leftText = "Left column text";
  const block = `\n<table border="0" cellspacing="0" cellpadding="0" role="presentation" data-borderless="1" style="border-collapse: collapse; border: 0">\n  <tr>\n    <td style="border: 0">${leftText}</td>\n    <td style="border: 0">${rightText}</td>\n  </tr>\n</table>\n\n`;
    // Compute selection to land on the right cell content
    let rightIdx = block.indexOf(`>${rightText}<`);
    if (rightIdx >= 0) {
      rightIdx += 1; // move inside the '>'
    } else {
      rightIdx = block.indexOf(rightText);
    }
    const insertFrom = s.from;
    const insertTo = s.to;
    let anchor = insertFrom;
    let head = insertFrom;
    if (rightIdx >= 0) {
      const startOfRight = insertFrom + rightIdx;
      if (hadSelection) {
        // Place caret at end of right text
        anchor = startOfRight + rightText.length;
        head = anchor;
      } else {
        // Select the placeholder so typing replaces it
        anchor = startOfRight;
        head = startOfRight + rightText.length;
      }
    }
    view.dispatch({ 
      changes: { from: insertFrom, to: insertTo, insert: block },
      selection: { anchor, head }
    });
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
  },

  // Update the nearest preceding <img> tag's width attribute
  imageWidth: (view: EditorView, width: string) => {
    const sel = view.state.selection.main;
    const doc = view.state.doc;
    const docText = doc.toString();
    const cursor = sel.from;
    // Find last <img before the cursor
    const upto = docText.slice(0, cursor);
    const tagStart = upto.lastIndexOf("<img");
    if (tagStart < 0) {
      return; // No image tag found before cursor
    }
    const tagEnd = docText.indexOf('>', tagStart);
    if (tagEnd < 0) {
      return; // Malformed tag, bail out
    }
    const original = docText.slice(tagStart, tagEnd + 1);
    // Replace or insert width attribute
    let updated = original;
    const widthRe = /\swidth\s*=\s*(["'])(.*?)\1/;
    if (widthRe.test(updated)) {
      updated = updated.replace(widthRe, ` width="$2"`.replace('$2', width));
      // The above is a bit awkward; better to replace with function
      updated = original.replace(widthRe, (_m, q) => ` width=${q}${width}${q}`);
    } else {
      // Insert before closing '/>' or '>'
      const insertAt = updated.endsWith('/>')
        ? updated.lastIndexOf('/>')
        : updated.lastIndexOf('>');
      if (insertAt > -1) {
        updated = `${updated.slice(0, insertAt)} width="${width}"${updated.slice(insertAt)}`;
      }
    }
    if (updated !== original) {
      view.dispatch({
        changes: { from: tagStart, to: tagEnd + 1, insert: updated },
        selection: { anchor: sel.anchor, head: sel.head }
      });
    }
  }
};
