<!--
  Friendly in-app guide. Tone: conversational, practical.
  This file is opened on first launch and can be re-opened via the Help tab button.
-->

# Welcome

This app lets you write plain Markdown (with a sprinkle of Typst super‑powers) on the left and watch a clean PDF take shape on the right — instantly. No export dance. No guessing. Just write, adjust, repeat.

Use it for reports, briefs, study notes, handouts, articles, knowledge base docs, or anything that deserves better than a raw `.md` file.

---

## 1. The Big Idea (Why this exists)
Plain text stays future‑proof. Markdown keeps you fast. Typst gives you professional layout tricks. This editor stitches them together so you can:
- Stay in one window (edit + design + preview)
- Keep flow while still seeing the final document
- Add structure (figures, math, columns, footnotes) without fighting a word processor
- Nudge visual design when needed — not obsess over it up front

---

## 2. Core Concepts (Good to know early)
| Concept | What It Means |
|---------|---------------|
| Source vs PDF | Left pane = editable Markdown+Typst wrappers. Right pane = rendered PDF snapshot. |
| Live-ish Render | Renders after short pauses in typing (debounced). Manual triggers still possible. |
| Sync Modes | One-way = editor drives PDF. Two-way = clicking/scrolling PDF jumps editor too. |
| Raw Typst Wrappers | Little HTML comments like `<!--raw-typst #figure[...] -->` inserted for features Markdown doesn’t natively support. |
| Virtual File | The help document (this one) and new unsaved tabs until you save them. |
| Sessions | Open tabs + preferences restore next launch. |

---

## 3. Quick Start
1. Click Open (📂) or just start a New tab.
2. Type a heading, a paragraph, maybe a list.
3. Glance right to make sure layout feels right.
4. Drop in an image or add inline math if needed.
5. Adjust theme or margins later — don’t stall on design first.

That’s it. You’re already “using the system.”

---

## 4. Workspace Tour
### Tabs & Files
- Tabs sit top-left. Middle‑click or use Close to remove.
- Recent list helps reopen things fast.
- Help button (❓) appears only when this guide isn’t open.

### Editor Pane (Left)
- Syntax highlighting, soft wrapping, multi-line selections.
- Keyboard shortcuts for nearly everything (see bottom cheat sheet).
- Inline and block math supported.

### PDF Pane (Right)
- Click a paragraph to jump the editor.
- Zoom controls: − / % / + / Reset.
- Page thumbnails (📑) toggle.
- Print (🖨️) opens the generated PDF externally (then you print there).

### Design & Theme
- 🎨 opens design modal (structure + cover + spacing + fonts).
- Theme dropdown switches presets; choosing “Custom…” captures a snapshot you can tweak.
- A− / A+ adjust base font size quickly.

### Sync & Scroll
- ⇅ / ⇊ toggles two‑way vs one‑way mode.
- 🔗 enables scroll coupling; ⛓️‍💥 breaks it temporarily.

### Toolbars (Formatting Flow)
1. Text styling: **B I S `</>` 🔗**
2. Structure: H1 H2 H3 Quote
3. Lists & nesting: • 1. ☐ → ←
4. Math: $x$  $$
5. History: ↶ ↷
6. Inserts & helpers: divider, em dash, super/sub, images, image+
7. Extras: image width default, footnote, TOC toggle, add tab, font picker

### Modals
- Image+ (detailed figure, alignment, caption)
- Image Props (tweak width of nearest previous image tag)
- Search (Ctrl+F) / Replace (Ctrl+H)
- Keyboard Shortcuts overview
- Design & Preferences combined styling surface

---

## 5. Writing & Formatting (Everyday stuff)
| Action | How | Result |
|--------|-----|--------|
| Bold | Ctrl+B or toolbar | `**text**` |
| Italic | Ctrl+I | `*text*` |
| Strike | Button S | `~~text~~` |
| Inline code | Ctrl+` | `` `code` `` |
| Link | Ctrl+K | `[label](https://…)` prompt |
| Heading 1/2/3 | Ctrl+Alt+1/2/3 | Adds / toggles `#`, `##`, `###` |
| Quote | Ctrl+Shift+Q | `> ` prefix toggle |
| Bullet list | Ctrl+Shift+8 | `- ` lines toggle |
| Numbered list | Ctrl+Shift+7 | `1. ` pattern toggle |
| Task list | Ctrl+Shift+9 | `- [ ] ` toggle |
| Indent / Outdent | → / ← buttons | Adds / removes leading spaces |
| Horizontal rule | ▦ | Inserts `---` |
| Superscript / Subscript | ⤓⤒ / ↕ | Wrap with Typst or inline pattern |
| Undo / Redo | Ctrl+Z / Ctrl+Y | History travel |

Tip: If something toggles weirdly, check you didn’t include leading/trailing spaces in selection.

---

## 6. Math (Keep it readable)
- Inline: `$a^2 + b^2$` — short expressions inside sentences.
- Block:
  ```
  $$
  E = mc^2
  $$
  ```
- Keep block math on its own blank lines above and below.
- Don’t overuse math for plain text — readability first.

---

## 7. Images & Figures
| Feature | Use When | How |
|---------|----------|-----|
| Basic image | Simple inline illustration | 🖼️ button → select file or drop into editor |
| Figure with caption | You need alignment / caption | 🖼️+ → fill form → inserts Typst wrapper |
| Image + text columns | Side-by-side layout | Image+ with column option or columns helper |
| Adjust width | Tweak last image | Change default width or use Image Props |
| Under‑image text | Additional explanation | Fill “under text” in Image+ modal |

Accessibility: Always add meaningful alt text unless decorative.

---

## 8. Layout & Advanced Blocks
- Tables: start simple; refine later. Basic Markdown table templates are fastest.
- Columns: use preset or Typst grid for controllable proportional layouts.
- Page break: Insert when starting a major section you want isolated.
- Vertical space: Use sparingly; content hierarchy should carry spacing.
- Footnotes: Great for citations or side remarks. Don’t turn them into mini essays.
- Alignment block: Center or right align a block without abusing spaces.
- Avoid nesting wrappers inside wrappers unless absolutely needed (clean edits later).

---

## 9. Themes, Design & Typography
You can ignore design until content stabilizes. When ready:
1. Pick a preset that’s “close.”
2. Switch to Custom if you need to fine‑tune.
3. Adjust margins, fonts, line height, optional TOC, cover page.
4. Re‑render happens automatically after changes (short delay).

Font size matters more than font family; choose readability over novelty.

---

## 10. Sync & Navigation
- One-way (⇊): Editor drives; PDF scroll is passive.
- Two-way (⇅): Scroll or click either side to follow along.
- Scroll link (🔗) off? You can compare distant sections manually.
- Thumbnails help when scanning structure.

If jumps feel off, ensure headings are properly spaced (blank line before).

---

## 11. Rendering, Saving & PDF
- Saving (Ctrl+S) writes the source + triggers a render when needed.
- PDF path appears after successful compile; printing opens it externally.
- If something doesn’t appear: check syntax (unclosed code fences often block renders).

---

## 12. Preferences & Persistence
The app remembers:
- Open tabs
- Last selected theme / custom snapshot
- Default image width
- Sync mode

If you want a “clean slate,” Close All then reopen only what matters.

---

## 13. Keyboard Shortcuts (Essentials)
| Category | Shortcut | Action |
|----------|----------|--------|
| File | Ctrl+O | Open file |
|  | Ctrl+S | Save |
|  | Ctrl+Shift+S | Save As |
| Editing | Ctrl+B / I | Bold / Italic |
|  | Ctrl+` | Inline code |
|  | Ctrl+K | Link prompt |
| Structure | Ctrl+Alt+1/2/3 | H1 / H2 / H3 |
| Lists | Ctrl+Shift+8/7/9 | Bullet / Number / Task |
| Quote | Ctrl+Shift+Q | Toggle blockquote |
| Blocks | Ctrl+Shift+C | Code block |
| Nav | Ctrl+F / H | Find / Replace |
| Undo/Redo | Ctrl+Z / Y | Undo / Redo |
| Render | Ctrl+R | Manual render trigger |
| View | F11 | Fullscreen |

---

## 14. Markdown Best Practices (Makes life easier later)
1. One H1 per document (title). Don’t skip heading levels.
2. Blank line between paragraphs, lists, and headings.
3. Keep lists tight: avoid stray trailing spaces.
4. Tables: start minimal; align columns only when stable.
5. Image widths: be consistent (e.g., 60% for medium, 100% for full-width banners).
6. Avoid giant inline math; move long expressions to block form.
7. Limit bold to labels and emphasis; italic for nuance.
8. Use footnotes for references, not entire paragraphs.
9. Review raw wrappers occasionally—remove obsolete ones.
10. Before final export: skim PDF at 80% zoom to catch spacing & orphan lines.

---

## 15. Troubleshooting
| Issue | Try This |
|-------|----------|
| PDF not updating | Save again; check for unclosed ``` fences; look for stray `<!--raw-typst` not closed. |
| Scroll sync off | Ensure sync toggle active; verify you’re not in one-way mode. |
| Image not showing | Path correct? Relative to file? No spaces at end? |
| Math renders wrong | Check for missing `$` or extra backticks. |
| Broken layout | Remove experimental wrappers; rebuild section cleanly. |
| Slow typing lag | Large doc: disable two-way sync or thumbnails temporarily. |

---

## 16. Quick Reference Card
Bold: Ctrl+B · Italic: Ctrl+I · Code: Ctrl+` · Link: Ctrl+K · H1/H2/H3: Ctrl+Alt+1/2/3 · Lists: Ctrl+Shift+8/7/9 · Quote: Ctrl+Shift+Q · Code Block: Ctrl+Shift+C · Find: Ctrl+F · Replace: Ctrl+H · Save: Ctrl+S · Render: Ctrl+R · Undo/Redo: Ctrl+Z / Ctrl+Y · Fullscreen: F11

---

## 17. Typst Wrappers (Short Note)
Those comment blocks are temporary “power inserts.” You can still edit inside them. If things look messy, you can remove the outer wrapper and re-insert via the proper button.

---

Need more? External references:
- General Markdown: https://www.markdownguide.org
- Extended Pandoc Markdown: https://pandoc.org/MANUAL.html
- Typst docs: https://typst.app/docs/

Enjoy the flow. Focus on words first; polish later. ✍️

