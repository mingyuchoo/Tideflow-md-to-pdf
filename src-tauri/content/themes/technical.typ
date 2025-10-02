// Technical Theme
// Monospace body for code-heavy technical documents

#let technical_theme(prefs, doc) = {
  let main-font = prefs.fonts.at("main", default: "Courier New")
  let mono-font = prefs.fonts.at("mono", default: "Courier New")
  let font-size = prefs.at("font_size", default: 10) * 1pt
  let page-bg = rgb(prefs.at("page_bg_color", default: "#f5f5f5"))
  let font-color = rgb(prefs.at("font_color", default: "#1e293b"))
  let accent = rgb(prefs.at("accent_color", default: "#006496"))
  let heading-scale = prefs.at("heading_scale", default: 1.0)
  
  set page(
    paper: prefs.papersize,
    margin: (x: 2cm, y: 2.5cm),
    fill: page-bg,
  )
  set text(font: main-font, size: font-size, lang: "tr", fill: font-color)
  set par(leading: 0.7em, spacing: 0.85em, justify: false)
  show raw: set text(font: mono-font, size: font-size * 0.95)
  show raw.where(block: true): block.with(inset: 10pt, fill: page-bg.darken(3%), stroke: 1.5pt + accent, radius: 3pt)

  // Headings: bold monospace with prominent borders
  show heading.where(level: 1): it => {
    set text(
      font: main-font,
      weight: 800,
      size: 16pt * heading-scale,
      fill: accent,
    )
    block(above: 22pt, below: 16pt)[
      #box(
        fill: accent.lighten(85%),
        inset: 10pt,
        width: 100%,
        stroke: 3pt + accent,
        radius: 2pt,
      )[#it]
    ]
  }
  
  show heading.where(level: 2): it => {
    set text(
      font: main-font,
      weight: 700,
      size: 12pt * heading-scale,
      fill: accent.lighten(10%),
    )
    block(above: 18pt, below: 12pt)[
      #box(
        fill: accent.lighten(90%),
        inset: 8pt,
        width: 100%,
        stroke: 2pt + accent.lighten(10%),
        radius: 2pt,
      )[#it]
    ]
  }
  
  show heading.where(level: 3): it => {
    set text(
      font: main-font,
      weight: 700,
      size: 10pt * heading-scale,
      fill: accent.lighten(20%),
    )
    block(above: 14pt, below: 10pt)[
      #text(fill: accent)[▶▶] #h(6pt) #it
    ]
  }

  // Separator as dashed line
  show line: it => block(
    width: 100%,
    above: 10pt,
    below: 10pt,
    stroke: (top: 2pt + accent)
  )[#v(0pt)]

  // Blockquotes in code style
  show quote: it => [
    #set text(font: mono-font, size: 9pt, fill: accent)
    #block(
      width: 100%,
      inset: 10pt,
      fill: rgb(248, 250, 252),
      stroke: (left: 3pt + accent),
      radius: 2pt,
      above: 12pt,
      below: 12pt,
    )[#it]
  ]

  // Lists with technical markers
  set list(indent: 10pt, body-indent: 6pt, marker: ([›], [•], [·]))
  set enum(indent: 10pt, body-indent: 6pt)

  // Links in accent
  show link: it => text(fill: accent, weight: 700)[#it]

  // Code-like emphasis
  show emph: it => text(style: "italic", fill: accent)[#it]
  show strong: set text(weight: 700)

  doc
}
