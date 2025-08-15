Locked. Here is the **general-purpose** design doc, updated for a single fat SKU using **Tauri + Typst only**, no TTRPG or domain-specific blocks.

# Tideflow - Design Doc v3

*Tauri + Typst. Markdown in, real PDF out. General use.*

## 1) Product statement

Tideflow is a desktop editor that turns Markdown into print-accurate PDFs. The preview shows the actual compiled PDF. Images drop in with width and alignment. Styles are controlled by simple preferences and swappable Typst themes. One fat build that works offline on Windows, macOS, and Linux.

## 2) Goals and non-goals

**Goals**

* Edit `.md` and compile to PDF with Typst
* Preview the exact PDF in-app
* Drag or paste images with width and left-center-right alignment
* Project preferences for paper size, margins, TOC, section numbering, fonts, theme
* Template styles you can switch without touching content

**Non-goals**

* Citations, cross-refs, HTML or EPUB
* Cloud collaboration
* Domain-specific blocks like statblocks or bespoke game boxes

## 3) Principles

* The PDF is the single source of truth in preview and export
* Markdown first, with a few generic helpers for layout
* Zero setup after install, since Typst is bundled

## 4) Single SKU - fat minimal

* Bundle Typst CLI per platform under app resources
* No network at runtime
* No auto updater in v1 to keep moving parts minimal

## 5) User stories

* As a writer I drop PNGs and they appear aligned right at 40 percent width
* As an editor I flip A4 vs Letter, set margins, toggle TOC and numbering, and all docs follow it
* As a casual user I trust that preview and exported PDF match exactly

## 6) Architecture

**Frontend** - React + TypeScript + Vite

* FileTree, Editor (CodeMirror 6), Toolbar, PDFPreview, PrefsModal

**Backend** - Tauri + Rust

* File CRUD, asset import, preferences, preview and export commands

**Renderer** - Typst CLI only

* One Typst template reads `prefs.json` and `content.md`
* Preview and export call the same `typst compile` with different outputs

## 7) Directory model

```
tideflow/
  content/
    tideflow.typ           - main template
    prefs.json             - written by the UI
    assets/                - images
    sample.md
  styles/
    modern.typ             - theme module: apply(prefs)
    classic.typ
  src/                     - React UI
  src-tauri/
    resources/bin/typst/<platform>/typst[.exe]
    src/main.rs
```

## 8) Preferences schema

```json
{
  "papersize": "a4",
  "margin": { "x": "2cm", "y": "2.5cm" },
  "toc": true,
  "numberSections": true,
  "columns": 1,
  "font": { "main": "Noto Serif", "mono": "JetBrains Mono", "size": "11pt" },
  "theme": "modern",
  "accent": "#1d78c1",
  "imageDefault": { "width": "60%", "align": "center" }
}
```

## 9) Typst template and themes

### `content/tideflow.typ`

Reads prefs and Markdown, applies theme, optional 2 columns, TOC. Only generic helpers.

```typst
#import "@preview/cmarker:0.1.7": cmark
#let prefs = json("prefs.json")

// themes expose apply(prefs)
#import "../styles/modern.typ": apply as modern
#import "../styles/classic.typ": apply as classic
#let theme = if prefs.theme == "classic" { classic } else { modern }
#theme(prefs)

// optional columns
#let flow(body) = if prefs.columns == 2 {
  grid(columns: (1fr, 0.8cm, 1fr), gutter: 0pt)[#place(loc: (1,1))[#body]]
} else { body }

// generic image helper
#let fig(path, w: 60%, align: "center", cap: none) = {
  let place = if align == "left" { left } else if align == "right" { right } else { center }
  figure(image(path, width: w), caption: cap, placement: place)
}

// TOC
#if prefs.toc { #outline(title: [İçindekiler]) #pagebreak() }

// body
#set text(lang: "tr")  // adjust default language here
#flow[ #cmark(read("content.md")) ]
```

### Theme example `styles/modern.typ`

```typst
#let apply(prefs) = {
  set page(paper: prefs.papersize, margin: (x: prefs.margin.x, y: prefs.margin.y))
  set text(font: prefs.font.main, size: prefs.font.size)
  show raw: set text(font: prefs.font.mono)
  show heading: it => if prefs.numberSections { set heading(numbering: "1.") } else { it }
}
```

### Theme example `styles/classic.typ`

```typst
#let apply(prefs) = {
  set page(paper: prefs.papersize, margin: (x: prefs.margin.x, y: prefs.margin.y))
  set text(font: prefs.font.main, size: prefs.font.size)
  show raw: set text(font: prefs.font.mono)
  show heading: it => { set text(size: 1.15em); if prefs.numberSections { set heading(numbering: "1.") } else { it } }
}
```

## 10) Rendering pipeline

1. User edits `some.md`
2. Backend writes to `content/.build/`

   * `prefs.json` from UI
   * `content.md` copied from current doc
   * `tideflow.typ` copied from `content/`
3. Run bundled Typst

   * preview: `typst compile tideflow.typ preview.pdf` in `.build`
   * export: `typst compile tideflow.typ <final>.pdf` to `content/`
4. Frontend loads preview path with `convertFileSrc(path)`

## 11) Backend commands

* `list_files() -> string[]`
* `read_file(rel) -> string`
* `write_file(rel, text) -> bool`
* `save_asset(fileName, bytes[]) -> "assets/name.png"`
* `get_prefs() -> Prefs`
* `set_prefs(Prefs) -> bool`
* `compile_preview(mdRel: string) -> absPdfPath`
* `export_pdf(mdRel: string) -> absPdfPath`

Resolve bundled Typst at:

* Windows `resources/bin/typst/windows/typst.exe`
* macOS `resources/bin/typst/macos/typst`
* Linux `resources/bin/typst/linux/typst`

## 12) Frontend preview

* Subscribe to `compiled` or await `compile_preview`
* Use `convertFileSrc(absPath) + "#toolbar=0&navpanes=0"` in an iframe
* Debounce preview trigger 300 to 600 ms after edit or on Save
* Optional later: pdf.js viewer with per-page hash diff to repaint only changed pages

## 13) Editor features

* Markdown formatting: bold, italic, code, headings, lists, blockquote
* Toolbar inserts Markdown, no domain-specific blocks
* Font and size

  * Global via prefs and theme
  * Optional small or large text via tiny Typst helpers if you want buttons:

    ```typst
    #let small(body) = text(size: 0.9em)[body]
    #let large(body) = text(size: 1.2em)[body]
    ```

    The editor can insert a minimal Typst block on demand:

    ```markdown
    ::: typst
    #small[This paragraph is smaller]
    :::
    ```
  * Keep this optional to stay general

## 14) Image handling

* Drag or paste image file

  * Sanitize name and copy to `assets/`
  * Insert plain Markdown `![](assets/pic.png)`
* Width and alignment

  * Provide an inline control that inserts a minimal Typst block only when needed:

    ```markdown
    ::: typst
    #fig("assets/pic.png", w: 40%, align: "right")
    :::
    ```
  * Optional pre-pass later: map `![](img){width="40%" fig-align="right"}` to `#fig(...)`

## 15) Performance

* Debounce preview compiles to 300 to 600 ms
* Preload fonts or document Noto install to avoid cold font hits
* Keep viewer stable with preserved scroll and current page

## 16) Testing

**Golden PDFs**

* 5 fixtures rendered on CI for Windows, macOS, Linux
* Strip metadata before hashing

**Unit**

* Prefs round trip to `prefs.json`
* Asset path sanitization
* Typst path resolver

**Manual**

* 20 page doc with 5 images, TOC on and off, margins change, export

## 17) Packaging

* Build 3 installers with bundled Typst
* No reliance on PATH
* Third party notices include Typst license and any fonts you ship

## 18) Risks and mitigations

* Fonts differ across OS - choose robust families and allow override in prefs
* Very large images may bloat PDFs - warn on import, add downscale in v1.1
* Markdown features beyond CommonMark - rely on cmarker and tiny Typst blocks when needed

## 19) Acceptance criteria

* New user installs, writes in Markdown, adds images, toggles TOC and margins, exports a PDF that matches preview exactly
* Works offline on all platforms
* No external tools after install

## 20) Copy blocks for prompts

**One line brief**
Use Typst only: bundle Typst, template `tideflow.typ` reads `prefs.json` and `content.md`, run `typst compile` for preview and export, and load the absolute PDF path with `convertFileSrc` in the viewer.

**Preview command**

```
typst compile tideflow.typ .build/preview.pdf
```

**Export command**

```
typst compile tideflow.typ content/output.pdf
```

**Prefs JSON**

```json
{"papersize":"a4","margin":{"x":"2cm","y":"2.5cm"},"toc":true,"numberSections":true,"columns":1,"font":{"main":"Noto Serif","mono":"JetBrains Mono","size":"11pt"},"theme":"modern","accent":"#1d78c1","imageDefault":{"width":"60%","align":"center"}}
```

**Generic image helper**

```typst
#fig("assets/pic.png", w: 60%, align: "center")
```

This is now fully general use. No statblocks, no bespoke game components. If you want, I can add a tiny attribute pre-pass so users never see Typst blocks even when changing image width or alignment.
