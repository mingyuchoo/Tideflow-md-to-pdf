# Tideflow Codebase Analysis & Modernization Plan

_Last updated: 2025-09-09_

## 1. Project Snapshot
- Stack: React + Vite + TypeScript (frontend), Tauri 2 (Rust backend), Typst for PDF generation, pdf.js for in-app preview.
- Current Focus: **Phase 3 DISCOVERY** – Dark-mode + automated testing follow the completed theme system and scroll-sync work.
- Recent Achievements: Implemented anchor-based pre-processing pipeline, real Typst theme registry, cover-page preference, accessible image import modal, and Save As export dialog (Sept 9, 2025).
- Key Pain Points: Dark theme coverage, automated test harness, template gallery, and spellcheck remain open.

## 2. Existing Architecture Overview
### Rendering Paths
| Path | Trigger | Data Source | Output | Notes |
|------|---------|-------------|--------|-------|
| `render_typst` | Live (debounced) | In-memory editor content | temp_*.pdf | Always full render, caching disabled |
| `render_markdown` | (Not wired currently in UI) | File on disk | preview.pdf | Maintains last render timestamp per file |
| `export_markdown` | Intended final export | File on disk | <file>.pdf next to source | Uses same template |

### Template (`tideflow.typ`)
- Reads `prefs.json` and `content.md` from `.build` directory plus the selected theme partial from `content/themes/`.
- Applies: page size, margins, font families, TOC, section numbering, cover page, admonition styling, and theme palette tokens.
- Remaining gaps: dark/light color scheme switching and advanced token customization beyond bundled themes.

### Preferences & Design Surface
Design modal + toolbar expose live-editable preferences stored in Zustand and persisted through Tauri. Users can:
- Select built-in themes (default, classic, modern, academic, journal, colorful) or continue with custom tweaks.
- Toggle TOC, numbering, cover page, and adjust cover metadata.
- Configure paper, margin, font, debounce, and default image settings.

Changes trigger immediate re-renders and update `prefs.json` for Typst.

### Scroll Sync
- Rust preprocessor injects stable anchors with source offsets and runs `typst query` to obtain per-anchor page/position data.
- Zustand tracks `sourceMap`, `activeAnchorId`, and `syncMode` (`auto`, `locked-to-editor`, `locked-to-pdf`).
- Editor scroll updates publish anchor IDs; PDF preview maps them to pixel offsets and reciprocally updates the editor when the user scrolls the PDF.

### File Lifecycle
- Session bootstrap restores last-open document, preview visibility, and theme selection from persisted prefs.
- Save/Save As flows delegate to Tauri commands; unsaved buffers stay in memory until the user exports or chooses a path.
- Background cleanup trims temp PDFs after each render (keeps recent set, configurable via `cleanup_temp_pdfs`).

### Export
- Toolbar "Save PDF As" dialog persists the last location, invoking `save_pdf_as` to either copy the latest build artifact or trigger a compile-on-demand.
- Backend respects unsaved documents by rendering directly into the chosen destination when no disk source exists.

### Image Handling
- Paste/drag-drop/import flows share the `ImagePropsModal`, prompting for alt text, caption, layout, and width.
- Automatic alt-text suggestions and layout presets feed through the preferences store for consistency.

### Stability Gaps
- No dedicated error boundary around the pdf.js canvas (preview failure falls back to console warnings).
- Dark mode unavailable; all CSS tokens assume light backgrounds.
- Race possibilities when hiding/showing preview (unmounted state mid render) — mostly mitigated but still monitored.
- Excessive renders possible if debounce lowered (global render mutex prevents concurrency but can queue user latency).

## 3. Root Cause Mapping (Bugs)
| Issue | Cause | Planned Fix |
|-------|-------|-------------|
| Dark mode absent | Hard-coded light palette across CSS modules | Introduce CSS variable theme system + toggle tied to prefers-color-scheme |
| Scroll map churn on rapid edits | Anchors regenerated per render | Investigate diffing anchors in `preprocessor.rs` to preserve IDs when structure unchanged |
| Spellcheck missing | CodeMirror lacks dictionary integration | Evaluate `@codemirror/lint` or third-party spellcheck extensions with offline dictionaries |
| Template selection limited | Single Typst template available | Build template gallery + Typst switching pipeline |
| Testing blind spots | No automated coverage for preprocessor/store | Add Cargo + Vitest suites and wire into CI |

## 4. Feature Scope & Status
| Feature | Minimal Implementation | Future Enhancement | Status |
|---------|------------------------|--------------------|--------|
| Image insertion UI | Toolbar button -> file picker -> import dialog for width/alignment | Image asset manager panel, drag reorder | ✅ Shipped |
| Admonitions | `[!TYPE]` syntax transformed to Typst helper | Additional variants, custom icons | ✅ Shipped |
| Theme system | Theme registry + Typst partial import | User-exportable themes, palette editor | ✅ Shipped |
| Cover page | Preferences toggle + metadata fields | Multi-layout covers, template chooser | ✅ Shipped |
| Dark mode | CSS variables + prefers-color-scheme; invert panel backgrounds | Theme-aware Typst palettes | ⏳ In progress |
| Template gallery | Switch between multiple Typst base templates | Marketplace/import support | ⏳ Planned |
| Spellcheck | CodeMirror extension + toggle | Grammar suggestions | ⏳ Planned |

## 5. (Historical) Unified Design Panel
Earlier concepts for a comprehensive design/prefs panel (themes, typography, colors, tokens) were intentionally shelved to keep scope lean. The implementation roadmap no longer includes this feature in the near term; git history retains the details.

## 6. Implementation Phasing
| Phase | Focus | Deliverables | Status |
|-------|-------|--------------|--------|
| 0 | Critical bug fixes | Scroll fix, export Save As, preview toggle reliability, close/open stability | ✅ **COMPLETED** (Sept 8, 2025) |
| 1 | Image insertion UI + cleanup | Toolbar button, width/alignment prompt, temp PDF cleanup | ✅ **COMPLETED** (Sept 8, 2025) |
| 2 | Theme & preprocessing MVP | Theme registry, Typst partials, admonitions, anchor-based source map | ✅ **COMPLETED** (Sept 9, 2025) |
| 3 | Dark mode + visual polish | CSS variables, theme toggle, pdf.js theming | 🔍 **DISCOVERY** |
| 4 | Automated testing | Rust preprocessor tests, Vitest sync reducer coverage, golden PDFs | ⏳ **PENDING** |
| 5 | Template gallery & extensibility | Multiple Typst templates, gallery UI, import/export | ⏳ **PENDING** |

## 7. Scroll Sync Strategy Evolution
- ✅ **Current implementation**: Markdown preprocessor injects anchors + admonitions, Typst exports anchor positions via `typst query`, frontend shares a bidirectional state machine.
- 🔬 **Next iterations**: Explore coarse-grained diffing to preserve anchor IDs across renders for very large documents and consider lazy PDF page rendering to reduce scroll jitter.
- 🧭 **Future**: Add semantic anchors (figures, tables) to enable outline navigation and cross-surface syncing (e.g., exported PDF bookmarks).

## 8. Export Strategy
- ✅ `save_pdf_as` command copies the latest compiled PDF or triggers a fresh compile into the user-selected location.
- ✅ Toolbar "Save PDF As" remembers the last directory and routes through the backend guardrails.
- 🔜 Add queued exports + background notification when long compiles finish.

## 9. Temporary File Management
- After each successful new `temp_*.pdf` render, delete older temp files > N (persistent store of last N file names) OR time-based purge (files older than 30 min).
- Ensure not deleting active preview file.

## 10. Risk & Mitigation
| Risk | Impact | Mitigation |
|------|--------|-----------|
| Theme partial syntax errors | Rendering broken | Unit test compile themes once at build/dev start |
| Large docs slow render | UX lag | Keep debounced live render + optional manual mode toggle |
| Font not installed on system | Fallback to default font | Add frontend validation list & display warning badge |
| Over-aggressive temp cleanup | Broken preview | Track active output path & skip deletion |

## 11. Testing Plan (Incremental)
- Rust unit tests: preprocessor admonition conversion, anchor ID stability, cleanup scheduling.
- TypeScript unit tests: sync reducer state machine, API queue behavior, toolbar command snippets.
- Golden render tests: invoke Typst on fixtures via CI, diff PDF metadata + source maps.
- Visual/manual: dark mode coverage, cover page layout verification, pdf.js interaction audit.

## 12. File Changes Forecast
| Area | New / Modified Files |
|------|----------------------|
| Dark mode | `App.css`, `App.tsx`, component styles, Zustand preference plumbing |
| Scroll-sync resilience | `preprocessor.rs` diffing, `renderer.rs` anchor reuse, `PDFPreview.tsx` virtualization |
| Automated testing | `src-tauri/tests/*.rs`, `src/__tests__/*.test.ts`, CI scripts |
| Template gallery | `src-tauri/content/templates/*.typ`, new gallery UI component, store wiring |
| Spellcheck | `Editor.tsx` extensions, dictionary assets, toggle in store/UI |
| Image optimization | Rust image pipeline, `preferences.rs` toggles, background worker |

## 13. Immediate Action Checklist (Phase 3)
- [ ] CSS variable theming layer + light/dark palettes defined in `App.css` and shared component styles
- [ ] Toolbar toggle + system preference detection routed through Zustand
- [ ] pdf.js viewer theming + iconography audit for dark backgrounds
- [ ] Draft Vitest + Cargo test scaffolding for preprocessor and sync reducers

## 13.1. Phase 2 Completion Status (Sept 9, 2025)
- [x] **Anchor-based scroll sync** – Stable IDs injected in Rust with bidirectional lock state machine in the UI
- [x] **Admonition pipeline** – `[!TYPE]` syntax converted to Typst helpers with toolbar insertion commands
- [x] **Theme registry** – Bundled Typst partials copied per render, theme selection persisted end-to-end
- [x] **Cover page preference** – Optional front matter with metadata + hero image ahead of TOC
- [x] **Accessible image import modal** – Alt-text focus management, defaults, and sanitised markup output

**Key Implementations:**
- `preprocessor.rs` transforms admonitions, injects anchors, and produces source-map payloads
- `renderer.rs` orchestrates Typst compile + `typst query` and ships PDF path + source map
- `PDFPreview.tsx` and `Editor.tsx` coordinate via anchor offsets with explicit sync-mode handling
- Theme partials under `src-tauri/content/themes/` loaded dynamically based on `preferences.theme_id`

## 14. Acceptance Criteria (Phase 3)
- Dark theme automatically follows OS preference, persists explicit overrides, and keeps contrast AA compliant.
- Scroll sync remains stable after toggling themes, resizing panes, or compiling >10 page documents.
- Initial Vitest + Cargo test suites run in CI, covering preprocessor transformations and sync reducers.
- Cover page + theme selection survive app relaunch (prefs.json round-trip validation).

## 15. Open Questions
- Should dark mode be theme-aware (distinct Typst palettes) or purely UI shell level?
- How do we package dictionaries for offline spellcheck without bloating install size?
- What UX communicates template gallery vs. theme presets most clearly (single modal vs. multi-step)?
- Do we need anchor persistence across sessions to support PDF outline/bookmark exports?

## 16. Follow-up
Document remains the canonical engineering plan until a formal ROADMAP.md replaces Sections 6–15. Continue appending changelog entries and decision logs as features graduate between phases.

## 17. Recent Changes (Changelog)
**September 9, 2025 – Theme & Scroll Sync Launch:**
- ✅ **Anchor-aware render pipeline** – `preprocessor.rs` + `typst query` generate PDF source maps for perfect sync
- ✅ **Admonitions & toolbar support** – `[!NOTE]` syntax transforms with Typst styling
- ✅ **Theme registry & cover page** – Bundled Typst partials, persisted `theme_id`, optional hero cover ahead of TOC
- ✅ **Image import accessibility** – Alt-text autofocus, intelligent defaults, sanitized markup output

**September 8, 2025 – Major Overhaul & Phase 1 Completion:**
- ✅ **Comprehensive codebase cleanup**: Removed all dead code, standardized error handling
- ✅ **Phase 0 completion**: Enhanced scroll mapping with TOC-awareness, verified existing functionality
- ✅ **Phase 1 implementation**:
  - Image insertion toolbar button (🖼️) with file picker integration
  - Automated temp PDF cleanup utility (keeps last 10, purges >30min old)
  - Centralized error handling utility (`errorHandler.ts`)
  - TOC-aware scroll mapping for better document navigation

**Technical Debt Eliminated:**
- Removed unused functions across Rust and TypeScript codebases
- Standardized error handling patterns
- Simplified font controls (selection-only mode)
- Enhanced scroll synchronization with intelligent TOC offset (now superseded by anchor mapping)

---
_Reference anchor: ANALYSIS.md v2_
