// Elegant Theme
// Sophisticated serif with refined typography

#let elegant_theme(prefs, doc) = {
  let main-font = prefs.fonts.at("main", default: "Georgia")
  let mono-font = prefs.fonts.at("mono", default: "Courier New")
  let font-size = prefs.at("font_size", default: 12) * 1pt
  let page-bg = rgb(prefs.at("page_bg_color", default: "#fffef8"))
  let font-color = rgb(prefs.at("font_color", default: "#2d2d2d"))
  let accent = rgb(prefs.at("accent_color", default: "#192337"))
  let heading-scale = prefs.at("heading_scale", default: 1.15)
  
  set page(
    paper: prefs.papersize,
    margin: (x: 3.5cm, y: 4cm),
    fill: page-bg,
  )
  set text(font: main-font, size: font-size, lang: "en", fill: font-color, fallback: true)
  set par(leading: 0.85em, spacing: 1.15em, justify: true, first-line-indent: 1.2em)
  show raw: set text(font: mono-font, size: font-size * 0.85, fallback: true)
  
  // Code blocks with cream background
  show raw.where(block: true): block.with(
    inset: 12pt,
    fill: rgb(252, 252, 250),
    stroke: 1pt + rgb(220, 215, 200),
    radius: 3pt
  )

  // Headings: elegant with refined colors and decorations
  show heading.where(level: 1): it => {
    set text(
      font: main-font,
      weight: 400,
      size: 32pt * heading-scale,
      fill: accent,
    )
    set align(center)
    pagebreak(weak: true)
    block(above: 48pt, below: 28pt)[
      #it
      #v(6pt)
      #line(length: 35%, stroke: 1pt + accent)
    ]
  }
  
  show heading.where(level: 2): it => {
    set text(
      font: main-font,
      weight: 400,
      size: 19pt * heading-scale,
      fill: accent.lighten(15%),
    )
    block(above: 30pt, below: 18pt)[
      #smallcaps(it)
    ]
  }
  
  show heading.where(level: 3): it => {
    set text(
      font: main-font,
      weight: 500,
      style: "italic",
      size: 14pt * heading-scale,
      fill: accent.lighten(25%),
    )
    block(above: 22pt, below: 14pt)[#it]
  }

  // Separator as ornamental line
  show line: it => block(
    above: 18pt,
    below: 18pt,
  )[
    #align(center)[
      #box(
        width: 40%,
        stroke: (top: 0.5pt + rgb(25, 35, 55))
      )[#v(0pt)]
    ]
  ]

  // Blockquotes with elegant cream background
  show quote: it => block(
    fill: rgb(252, 252, 248),
    stroke: (left: 2pt + accent.lighten(30%)),
    inset: (left: 24pt, rest: 14pt),
    radius: 2pt,
    width: 100%,
  )[
    #set text(style: "italic", size: 11pt, fill: rgb(50, 65, 90))
    #set par(first-line-indent: 0pt)
    #it
  ]

  // Lists refined
  set list(indent: 14pt, body-indent: 10pt, marker: ([—], [–], [•]))
  set enum(indent: 14pt, body-indent: 10pt)

  // Links elegant
  show link: it => text(fill: rgb(35, 50, 75))[#it]

  // Refined emphasis
  show emph: it => text(style: "italic", fill: rgb(50, 65, 90))[#it]
  show strong: it => text(weight: 600, fill: rgb(25, 35, 55))[#it]

  doc
}
