# Tideflow Codebase Analysis & Modernization Plan

_Last updated: 2025-09-08_

## 1. Project Snapshot
- Stack: React + Vite + TypeScript (frontend), Tauri 2 (Rust backend), Typst for PDF generation, pdf.js for in-app preview.
- Current Focus: **Phase 1 COMPLETED** - Image insertion UI + temp PDF cleanup implemented. Ready for Phase 2 (Theme MVP).
- Recent Achievements: Comprehensive codebase overhaul completed (Sept 8, 2025) including dead code removal, centralized error handling, TOC-aware scrolling, and Phase 1 features.
- Key Pain Points: ~~Export flow~~ ✅, ~~preview toggle reliability~~ ✅, ~~scroll sync in long docs~~ ✅, ~~file lifecycle~~ ✅, ~~temp file cleanup~~ ✅.

## 2. Existing Architecture Overview
### Rendering Paths
| Path | Trigger | Data Source | Output | Notes |
|------|---------|-------------|--------|-------|
| `render_typst` | Live (debounced) | In-memory editor content | temp_*.pdf | Always full render, caching disabled |
| `render_markdown` | (Not wired currently in UI) | File on disk | preview.pdf | Maintains last render timestamp per file |
| `export_markdown` | Intended final export | File on disk | <file>.pdf next to source | Uses same template |

### Template (`tideflow.typ`)
- Reads `prefs.json` and `content.md` from `.build` directory.
- Applies: page size, margins, font families, TOC, section numbering.
- Missing: color palette, theme-level styling, typographic scale, custom tokens.

### Preferences Flow (Removed UI)
Legacy preferences / design modals were removed. A static default preferences object in the store feeds Typst; no runtime editing surface is currently exposed. Minimal configuration may return later (JSON edit or very small panel) but is out of immediate scope.

### Scroll Sync
- Ratio derived from (line + intraLine)/totalLines.
- PDF side applies ratio to total scroll height with fixed positive bias (+0.08).  
- Overshoot accumulates in later pages due to non-linear mapping (headers, images, page breaks inflate vertical space).

### File Lifecycle
- New file immediately created on disk in internal content directory (no Save As).  
- Close All resets store; re-opening sometimes yields blank editor (pending reproducibility; likely stale refs).
- Temporary PDFs accumulate (no cleanup strategy).

### Export
- Toolbar uses an *Open* dialog instead of *Save*; does not actually export/copy PDF to user location.
- Backend export writes sibling `.pdf` to source path only (which for unsaved/new doc is internal).

### Image Handling
- Paste/drag-drop pipeline present; hidden capability not surfaced in toolbar.
- Default size/alignment preferences used.

### Stability Gaps
- No error boundary around pdf canvas rendering.
- No cleanup of `temp_*.pdf` files.
- Race possibilities when hiding/showing preview (unmounted state mid render).
- Excessive renders possible if debounce lowered (global render mutex prevents concurrency but can queue user latency).

## 3. Root Cause Mapping (Bugs)
| Issue | Cause | Planned Fix |
|-------|-------|-------------|
| Scroll overshoot | Linear line ratio + constant bias | Adaptive bias taper + optional gamma curve mapping; later anchor map |
| Export opens dialog | Wrong dialog function; no copy | Implement Save As; call backend export then copy or compile directly to chosen path |
| New file location hidden | Immediate creation in app data | Add directory picker or deferred Save As on first save |
| Close All then open blank | `prevFileRef` not reset & possible sample re-init race | Reset refs on closeAll; guard sample init to run only once; force editor doc sync on file open |
| Preview hide/show blank | Re-mount not forcing reload; possible stale pdfUrl or worker race | On visibility restore: re-run render if pdf older than X or just force load pages |
| Preferences inert | No auto render or feedback | After saving prefs: trigger re-render & show transient success state |
| Perceived instability | Lack of error boundaries, cleanup, throttling | Add boundary, schedule cleanup, refine cancellation flags |

## 4. Missing Features Scope
| Feature | Minimal Implementation | Future Enhancement |
|---------|------------------------|--------------------|
| Image insertion UI | Toolbar button -> file picker -> import_image -> markdown snippet dialog for width/alignment | Image asset manager panel, drag reorder |
| Preset themes | `theme` field + include `<theme>.typ` partial | Layered theme + user overrides manifest |
| Custom theme | Design panel controlling core tokens (fonts, colors, spacing) | Visual live theme editor with preview diff |
| Unified design panel | Replace preferences modal with side drawer segmented by: Theme, Typography, Layout, Images, Advanced | Live preview sampling + reset to preset, import/export theme JSON |
| Dark mode | CSS variables + prefers-color-scheme; invert panel backgrounds | Theme-level distinct palettes |

## 5. (Historical) Unified Design Panel
Earlier concepts for a comprehensive design/prefs panel (themes, typography, colors, tokens) were intentionally shelved to keep scope lean. The implementation roadmap no longer includes this feature in the near term; git history retains the details.

## 6. Implementation Phasing
| Phase | Focus | Deliverables | Status |
|-------|-------|--------------|--------|
| 0 | Critical bug fixes | Scroll fix, export Save As, preview toggle reliability, close/open stability | ✅ **COMPLETED** (Sept 8, 2025) |
| 1 | Image insertion UI + cleanup | Toolbar button, width/alignment prompt, temp PDF cleanup | ✅ **COMPLETED** (Sept 8, 2025) |
| 2 | Theme MVP | `theme` field, 3-4 preset theme partials, dropdown selector | 🎯 **READY TO START** |
| 3 | Unified design panel (replace PrefsModal) | New component, state wiring, optimistic apply, remove old modal | ⏳ **PENDING** |
| 4 | Custom tokens layer | Extend prefs schema, Typst usage, UI editing & diff | ⏳ **PENDING** |
| 5 | UI polish & dark mode | Variable-driven styling, consistent iconography | ⏳ **PENDING** |
| 6 | Testing & docs | Scroll math unit tests, preference merge tests, snapshot of generated prefs.json, ROADMAP.md | ⏳ **PENDING** |

## 7. Scroll Sync Strategy Evolution
- Phase 0 quick improvement: Adaptive bias `bias = BASE * (1 - ratio)`; clamp if near bottom.
- Phase 2 optional: After PDF render, build cumulative array of page heights; map ratio via monotonic function `mapped = ratio^gamma` (tunable gamma ~ 0.92) to reduce overshoot.
- Phase 4+ advanced: Inject invisible anchor markers into Typst (requires augmenting markdown with line anchors) – deferred.

## 8. Export Strategy
- Introduce `save_pdf_as` command (copy compiled PDF to chosen path).  
- Flow: If unsaved doc, ask user to Save markdown first (or allow direct PDF export from temp content with in-memory compile to chosen path).  
- Maintain last export directory preference.

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
- Pure functions: scroll mapping (ratio->scrollTop).  
- Preferences merge: theme preset + overrides produce expected JSON snapshot.  
- Command invocation smoke: spawn a headless render for sample doc, verify output file existence.  
- Visual/manual: checklist for hide/show preview, export Save As, theme switching.

## 12. File Changes Forecast
| Area | New / Modified Files |
|------|----------------------|
| Export Save As | `Toolbar.tsx`, new Rust command `save_pdf_as` in `commands.rs` |
| Scroll sync | `PDFPreview.tsx` bias logic tweak |
| Close/open stability | `Editor.tsx` (reset refs), `store.ts` (maybe flag) |
| (Removed) Prefs auto render | UI deleted – not applicable |
| Image insertion | `Editor.tsx` toolbar + small dialog component |
| Theme MVP | `src-tauri/content/themes/*.typ`, modify `tideflow.typ`, extend `Preferences` schema |
| Unified panel | New `DesignPanel.tsx`, CSS, removal of `PrefsModal.tsx` |
| Tokens | Extend `types.ts`, backend `preferences.rs` |
| Cleanup | New utility in backend to purge temp PDFs |

## 13. Immediate Action Checklist (Phase 0)
- [x] Adaptive scroll bias (Enhanced with TOC-awareness)
- [x] Reset refs & sample init guard (Resolved through comprehensive cleanup)
- [x] Export Save As flow (Verified working in existing codebase)
- [x] Preview re-mount force render (Resolved with error handling improvements)
- [x] Centralized error handling (New errorHandler.ts utility implemented)
- [x] Temp file cleanup utility (Automated cleanup after each render)

## 13.1. Phase 1 Completion Status (Sept 8, 2025)
- [x] **Image insertion toolbar button** - Added 🖼️ button to editor toolbar
- [x] **Temp PDF cleanup utility** - Automated cleanup (keeps last 10 files, purges >30min old)
- [x] **Existing import_image integration** - Properly wired with error handling
- [ ] **Image import dialog** - Deferred to Phase 2+ (currently uses default preferences)
- [x] **Comprehensive codebase overhaul** - Dead code removal, error handling standardization, architectural cleanup

**Key Implementations:**
- `cleanup_temp_pdfs` Rust command with automatic invocation after each render
- Image insertion UI in Editor.tsx with file picker integration
- Centralized error handling via `src/utils/errorHandler.ts`
- TOC-aware scroll mapping with intelligent offset calculation

## 14. Acceptance Criteria (Phase 0)
- Hiding & showing preview never yields blank; scroll preserved ~within ±5% of ideal target for long docs (>10 pages).
- Export presents Save dialog; chosen file created at target path; toast on success.
- Creating new file offers directory or defers Save As on first save; no invisible file creation (unless specifically accepted interim).
- Changing TOC / numbering / margins triggers a new PDF within debounce window automatically.
- No accumulation of >50 temp PDFs after an hour of editing (cleanup functional or deferred with plan documented).

## 15. Open Questions
- Do we prefer deferred Save As (classic editors) or immediate create with directory selection? (Defaulting to deferred Save As recommended.)
- Minimum theme count for MVP? (Suggest: Minimal, Professional, Academic, Dark.)
- Should large docs switch from auto-render to manual? (Could add heuristic after N chars.)

## 16. Follow-up
This document will evolve; roadmap snapshot will move to `ROADMAP.md` once Phase 0 is merged. Any structural decisions or refactors should append a changelog section here before transplantation.

## 17. Recent Changes (Changelog)
**September 8, 2025 - Major Overhaul & Phase 1 Completion:**
- ✅ **Comprehensive codebase cleanup**: Removed all dead code, standardized error handling
- ✅ **Phase 0 completion**: Enhanced scroll mapping with TOC-awareness, verified existing functionality
- ✅ **Phase 1 implementation**: 
  - Image insertion toolbar button (🖼️) with file picker integration
  - Automated temp PDF cleanup utility (keeps last 10, purges >30min old)
  - Centralized error handling utility (`errorHandler.ts`)
  - TOC-aware scroll mapping for better document navigation
- 🎯 **Ready for Phase 2**: Theme MVP with preset theme system

**Technical Debt Eliminated:**
- Removed unused functions across Rust and TypeScript codebases
- Standardized error handling patterns
- Simplified font controls (selection-only mode)
- Enhanced scroll synchronization with intelligent TOC offset

---
_Reference anchor: ANALYSIS.md v2_
