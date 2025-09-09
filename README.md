<div align="center">

# Tideflow

**Fast, offline-first Markdown → PDF desktop app powered by Typst**  
Write on the left, get a beautifully typeset PDF on the right – instantly.

</div>

## Why I Built It
I wanted a dead-simple, elegant writing tool that outputs print‑ready PDFs **without relying on a web service**, LaTeX toolchains, or heavy exports. Typst provides expressive, modern typesetting; Tauri keeps the footprint tiny; React + CodeMirror makes the editing experience fluid. Tideflow is the glue.

## Features
* Real‑time PDF rendering (Typst under the hood)
* Clean, distraction‑lite editor (CodeMirror 6) with smart debounced compilation
* Automatic Table of Contents & optional section numbering
* Image paste & drag‑drop (auto saves into managed assets directory)
* Math (inline / block) via LaTeX-style syntax
* Theme dropdown (placeholders) + Design modal with core layout & image settings (auto-applies)
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
| Quote | Ctrl+Shift+Q |
| Code Block | Ctrl+Shift+C |
| Save | Ctrl+S |
| Force Render | Ctrl+R |

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
4. Export or copy the generated PDF (Save As coming soon)

## Supported Markdown / Extras
* Headings, emphasis, strike, code, block + inline math
* Lists (ordered / unordered / tasks)
* Tables
* Images (auto asset management)
* Horizontal rules, page breaks (custom command)
* TOC + numbering (via Typst template)

## Preferences / Configuration
A lightweight Design modal now provides basic editable settings (paper size, margins, fonts, TOC, numbering, default image width/alignment, debounce). A theme dropdown lists placeholder presets (Classic, Mono, Serif) plus Custom. Selecting or editing any field auto-applies and switches the selection to Custom. Planned tokens (accent color, heading scale, metadata) appear as placeholders.

## Architecture Overview
```
┌────────────┐   keystrokes   ┌───────────────┐   invoke (IPC)   ┌────────────┐
│ CodeMirror │ ─────────────▶ │  Zustand Store │ ───────────────▶ │  Rust/Tauri │
└────────────┘    state set    └───────────────┘    spawn Typst    └─────┬──────┘
       ▲                               │                             PDF path
       │  iframe reload (pdf_path)     │ update compileStatus             │
       └───────────────  PDFPreview ◀──┴──────────────────────────────────┘
```

## File Layout
```
Md-to-PDF/
├── src/
│   ├── components/        # Editor, PDFPreview, Toolbar, TabBar, etc.
│   ├── store.ts           # Zustand app state
│   ├── api.ts             # Tauri invoke bindings
│   └── types.ts           # Shared TypeScript interfaces
├── src-tauri/
│   ├── src/               # Rust commands (render, export, prefs)
│   ├── content/           # Templates (e.g. tideflow.typ, sample docs)
│   ├── styles/            # Typst style files
│   └── bin/typst/         # Bundled Typst binaries per platform
└── public/                # Static assets
```

## Roadmap
* [ ] PDF export dialog with destination picker
* [ ] Dark theme + high-contrast mode
* [ ] Incremental / partial rendering optimization
* [ ] Minimal config surface (fonts / page / debounce)
* [ ] Built-in template gallery (report, memo, article)
* [ ] Image optimization pipeline (resize/compress)
* [ ] Spellcheck + grammar hooks
* [ ] PDF annotation / outline navigation
* [ ] Plugin system (postprocessors)

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
| No re-render | Force render with Ctrl+R (debounce is internal for now) |
| Fonts not applied | Currently fixed defaults; customization not yet reintroduced |


## License
MIT – use, modify, distribute with attribution.

## Connect
Email: **b.denizkoca@gmail.com**  
GitHub: [@BDenizKoca](https://github.com/BDenizKoca)

---
If you build something cool with Tideflow or adapt the Typst pipeline, let me know!
