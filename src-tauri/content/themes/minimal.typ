// Minimal Theme
// Ultra-clean sans-serif with spacious typography

#let minimal_theme(prefs, doc) = {
  let main-font = prefs.fonts.at("main", default: "Verdana")
  let mono-font = prefs.fonts.at("mono", default: "Courier New")
  let font-size = prefs.at("font_size", default: 12) * 1pt
  let page-bg = rgb(prefs.at("page_bg_color", default: "#fafafa"))
  let font-color = rgb(prefs.at("font_color", default: "#1a1a1a"))
  let accent = rgb(prefs.at("accent_color", default: "#787878"))
  let heading-scale = prefs.at("heading_scale", default: 1.1)
  
  set page(
    paper: prefs.papersize,
    margin: (x: 4cm, y: 4.5cm),
    fill: page-bg,
  )
  set text(font: main-font, size: font-size, lang: "en", fill: font-color, fallback: true)
  set par(leading: 1em, spacing: 1.4em, justify: false)
  show raw: set text(font: mono-font, size: font-size * 0.9, fallback: true)
  
  // Code blocks barely there
  show raw.where(block: true): block.with(
    inset: 12pt,
    fill: rgb(252, 252, 252),
    radius: 2pt
  )

  // Headings: minimal weight, generous spacing, no bold
  show heading.where(level: 1): it => {
    set text(
      font: main-font,
      weight: 300,
      size: 28pt * heading-scale,
      fill: accent.lighten(20%),
    )
    block(above: 40pt, below: 24pt)[#it]
  }
  
  show heading.where(level: 2): it => {
    set text(
      font: main-font,
      weight: 300,
      size: 18pt * heading-scale,
      fill: accent,
    )
    block(above: 28pt, below: 16pt)[#it]
  }
  
  show heading.where(level: 3): it => {
    set text(
      font: main-font,
      weight: 400,
      size: 12pt * heading-scale,
      fill: accent.darken(10%),
    )
    block(above: 20pt, below: 12pt)[#it]
  }

  // Separator as minimal dots
  show line: it => block(
    above: 16pt,
    below: 16pt,
  )[
    #align(center)[
      #text(size: 18pt, fill: rgb(200, 200, 200))[• • •]
    ]
  ]

  // Blockquotes almost invisible
  show quote: it => [
    #set text(style: "italic", size: 9.5pt, fill: rgb(140, 140, 140))
    #pad(left: 20pt, right: 20pt, top: 10pt, bottom: 10pt)[
      #it
    ]
  ]

  // Lists minimal
  set list(indent: 16pt, body-indent: 8pt, marker: ([–], [•], [·]))
  set enum(indent: 16pt, body-indent: 8pt)

  // Links barely visible
  show link: it => text(fill: rgb(120, 120, 120))[#it]

  // Subtle emphasis
  show emph: it => text(style: "italic", fill: rgb(120, 120, 120))[#it]
  show strong: it => text(weight: 500, fill: rgb(80, 80, 80))[#it]

  doc
}
