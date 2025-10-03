<div align="center">

# Tideflow

**Fast, offline-first Markdown → PDF desktop app powered by Typst**  
Write on the left, get a beautifully typeset PDF on the right – instantly.

</div>

## Why I Built It
I wanted a dead-simple, elegant writing tool that outputs print‑ready PDFs **without relying on a web service**, LaTeX toolchains, or heavy exports. Typst provides expressive, modern typesetting; Tauri keeps the footprint tiny; React + CodeMirror makes the editing experience fluid. Tideflow is the glue.

## Features
* Real‑time Typst rendering with pixel-perfect, two-way scroll sync between editor & PDF preview
* Clean, distraction‑lite editor (CodeMirror 6) with smart debounced compilation & scroll-lock controls
* Automatic Table of Contents, optional section numbering, and configurable cover page
* Image paste, drag‑drop, and import dialogs with accessible metadata capture
* Math (inline / block) via LaTeX-style syntax
* **12 beautiful themes**: Default, Minimal, Compact, Elegant, Technical, Magazine, Academic, Creative, Modern, Serif, Notebook, Dark
* Full blockquote support with theme-appropriate backgrounds
* Admonitions (callouts) with color-coded styling
* Offline: once installed, **no network required**
* Cross‑platform (Windows / macOS / Linux)
* Fast startup: no giant runtime or Electron bloat

## Demo (Preview Flow)
1. Type Markdown
2. App debounces & renders via Typst
3. PDF preview refreshes in place
4. Export when ready (or just copy the generated PDF path)

## Keyboard Shortcuts
| Action | Shortcut |
| ------ | -------- |
| Bold | Ctrl+B |
| Italic | Ctrl+I |
| Inline Code | Ctrl+` |
| Link | Ctrl+K |
| Heading 1 / 2 / 3 | Ctrl+Alt+1 / 2 / 3 |
| Bullet List | Ctrl+Shift+8 |
| Numbered List | Ctrl+Shift+7 |
| Task List | Ctrl+Shift+9 |
| Quote | Ctrl+Shift+. |
| Code Block | Ctrl+Shift+C |
| Horizontal Rule | Ctrl+Shift+- |
| Save | Ctrl+S |
| Save As | Ctrl+Shift+S |
| Open File | Ctrl+O |
| New File | Ctrl+N |
| Export PDF | Ctrl+E |
| Force Render | Ctrl+R |
| Search | Ctrl+F |
| Find & Replace | Ctrl+H |
| Toggle Preview | Ctrl+P |
| Design Modal | Ctrl+D |
| Preferences | Ctrl+, |

## Tech Stack
**Core**
* React 19 + TypeScript + Vite
* Tauri (Rust) shell & command layer
* Typst (bundled binary) for PDF

**Editor**
* CodeMirror 6 + custom Markdown commands (bold, headings, lists, etc.)

**State & Logic**
* Zustand store (single slice: editor state, preferences, UI flags)

**UI & Layout**
* react-resizable-panels (simplified fixed 50/50 split with optional preview toggle)

**Rendering Flow**
1. User edits Markdown → content in Zustand
2. Debounced timer triggers `renderTypst(content)` (Tauri invoke)
3. Rust backend writes temp markdown + preferences JSON
4. Typst binary compiles → PDF path returned
5. Store `compileStatus.pdf_path` updates → `PDFPreview` component reloads iframe (pdf.js optional later)

## Installation
### Prerequisites
* Node.js 18+
* Rust (stable)
* Tauri CLI (`cargo install tauri-cli`)

### Clone & Run
```bash
git clone https://github.com/BDenizKoca/Md-to-PDF.git
cd Md-to-PDF
npm install
npm run tauri:dev
```

### Build (Release Bundle)
```bash
npm run tauri:build
```

## Usage
1. New / Open a file (or start with the sample)
2. Write Markdown (math, code, images all supported)
3. Watch instant PDF updates (debounce respects your preferences)
4. Export or copy the generated PDF (use **Save PDF As** to pick a destination)

## Supported Markdown / Extras
* Headings (H1-H6), emphasis (bold, italic, strikethrough)
* Code (inline and fenced blocks with syntax highlighting via Typst)
* Math (inline `$...$` and block `$$...$$` via LaTeX-style syntax)
* Lists (ordered, unordered, task lists with `- [ ]` / `- [x]`)
* Blockquotes (single and multi-line with `>`)
* Admonitions / Callouts (`> [!note]`, `> [!warning]`, `> [!tip]`, etc.)
* Tables (with alignment support)
* Images (paste, drag-drop, import with metadata)
* Horizontal rules (`---` or `***`)
* Page breaks (via `#pagebreak()` or `<!--raw-typst #pagebreak() -->`)
* Links (inline and reference-style)
* HTML comments for Typst directives

## Preferences / Configuration
Open the **Design** modal from the toolbar to adjust layout, typography, and document chrome without leaving the editor.

* **Themes** – Pick from the bundled Typst themes or continue with your saved custom tweaks.
* **Layout** – Configure paper size, margins, TOC, numbering, and new cover-page metadata (title, author, hero image).
* **Images** – Set default width/alignment plus alt-text defaults for imports.
* **Debounce & rendering** – Fine-tune compile cadence or temporarily pause auto renders.

Changes apply instantly and persist via the shared preferences pipeline across Rust + TypeScript.

## Architecture Overview
```
┌────────────┐   keystrokes   ┌───────────────┐   invoke (IPC)   ┌────────────┐
│ CodeMirror │ ─────────────▶ │  Zustand Store │ ───────────────▶ │  Rust/Tauri │
└────────────┘    state set    └───────────────┘    spawn Typst    └─────┬──────┘
       ▲                               │                          PDF path +
       │         anchor updates        │                     scroll source-map
       └───────────────  PDFPreview ◀──┴──────────────────────────────────┘
```

## File Layout
```
Md-to-PDF/
├── src/
│   ├── components/        # Editor, PDFPreview, Toolbar, Design modal, etc.
│   ├── store.ts           # Zustand app state + scroll-sync machine
│   ├── api.ts             # Tauri invoke bindings & render queue
│   └── types.ts           # Shared TypeScript interfaces
├── src-tauri/
│   ├── src/               # Rust commands (render, export, prefs)
│   ├── content/           # Templates & theme partials (tideflow.typ, themes/*.typ)
│   ├── styles/            # Typst style files
│   └── bin/typst/         # Bundled Typst binaries per platform
└── public/                # Static assets
```

## Roadmap
**Completed:**
* [x] PDF export dialog with destination picker
* [x] Full theme system with 12 polished Typst themes
* [x] Anchor-based scroll sync with bidirectional lock controls
* [x] Cover page toggle + metadata editor (title, author, date, logo)
* [x] Blockquote rendering with theme-appropriate backgrounds
* [x] Admonitions / callouts with color-coded styling
* [x] Image paste, drag-drop, and metadata capture
* [x] Multi-tab document management
* [x] Recent files list with persistence
* [x] Search & replace functionality
* [x] Keyboard shortcuts for all major operations

**In Progress:**
* [ ] Dark mode for editor UI (themes already support dark PDFs)
* [ ] PDF thumbnail sidebar for quick page navigation

**Future:**
* [ ] Built-in template gallery (report, memo, article, resume)
* [ ] Image optimization pipeline (resize/compress before embedding)
* [ ] Spellcheck integration
* [ ] PDF annotation / outline navigation
* [ ] Plugin system for custom postprocessors
* [ ] Collaborative editing support

## Contributing
PRs welcome. Please:
1. Fork
2. Branch: `feat/thing`
3. Keep changes focused
4. `npm run tauri:dev` for local testing
5. Open PR with clear summary + screenshots if UI

## Troubleshooting
| Issue | Fix |
| ----- | --- |
| Blank PDF preview | Ensure Typst binary present in `src-tauri/bin/typst/<platform>` |
| No re-render on edit | Force render with Ctrl+R, or check debounce settings in preferences |
| Blockquotes not rendering | Ensure you're using standard `>` syntax at the start of lines |
| Images not showing | Check that image paths are relative to the document or use absolute paths |
| Theme not applying | Switch themes via the toolbar dropdown, changes apply instantly |
| App won't start | Check that all dependencies are installed: `npm install` then `npm run tauri:dev` |


## License
MIT – use, modify, distribute with attribution.

## Connect
Email: **b.denizkoca@gmail.com**  
GitHub: [@BDenizKoca](https://github.com/BDenizKoca)

---
If you build something cool with Tideflow or adapt the Typst pipeline, let me know!
