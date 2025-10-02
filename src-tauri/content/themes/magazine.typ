// Magazine Theme
// Bold editorial style with dramatic typography

#let magazine_theme(prefs, doc) = {
  let main-font = prefs.fonts.at("main", default: "Trebuchet MS")
  let mono-font = prefs.fonts.at("mono", default: "Courier New")
  let font-size = prefs.at("font_size", default: 11) * 1pt
  let page-bg = rgb(prefs.at("page_bg_color", default: "#ffffff"))
  let font-color = rgb(prefs.at("font_color", default: "#0a0a0a"))
  let accent = rgb(prefs.at("accent_color", default: "#0064b4"))
  let heading-scale = prefs.at("heading_scale", default: 1.3)
  
  set page(
    paper: prefs.papersize,
    margin: (x: 1.5cm, y: 1.8cm),
    fill: page-bg,
  )
  set text(font: main-font, size: font-size, lang: "en", fill: font-color)
  set par(leading: 0.65em, spacing: 0.85em, justify: true)
  show raw: set text(font: mono-font, size: font-size * 0.85)
  
  // Code blocks with blue accent
  show raw.where(block: true): block.with(
    inset: 8pt,
    fill: rgb(250, 250, 255),
    stroke: 2pt + rgb(0, 120, 180),
    radius: 2pt
  )

  // Headings: dramatic and bold with heavy styling
  show heading.where(level: 1): it => {
    set text(
      font: main-font,
      weight: 900,
      size: 40pt * heading-scale,
      fill: accent,
    )
    pagebreak(weak: true)
    block(above: 20pt, below: 18pt)[
      #box(
        width: 100%,
        inset: (x: 0pt, y: 12pt),
      )[
        #align(left)[
          #upper(it)
        ]
      ]
      #block(
        width: 100%,
        height: 6pt,
        fill: gradient.linear(accent, accent.darken(30%)),
      )
    ]
  }
  
  show heading.where(level: 2): it => {
    set text(
      font: main-font,
      weight: 800,
      size: 22pt * heading-scale,
      fill: accent.lighten(10%),
    )
    block(above: 20pt, below: 14pt)[
      #box(
        inset: (left: 16pt, y: 6pt),
        stroke: (left: 6pt + accent.lighten(20%)),
      )[#it]
    ]
  }
  
  show heading.where(level: 3): it => {
    set text(
      font: main-font,
      weight: 700,
      size: 15pt,
      fill: accent,
    )
    block(above: 16pt, below: 10pt)[
      #it.body
    ]
  }

  // Separator as bold gradient bar
  show line: it => {
    v(14pt)
    block(
      width: 100%,
      height: 4pt,
      fill: gradient.linear(
        accent,
        accent.darken(20%),
        accent
      )
    )
    v(14pt)
  }

  // Blockquotes with pull-quote feel
  show quote: it => [
    #set text(size: 12pt, style: "italic", weight: 600, fill: accent)
    #block(
      width: 100%,
      inset: 14pt,
      stroke: (left: 5pt + accent),
      fill: rgb(250, 250, 255),
      above: 12pt,
      below: 12pt,
    )[#it]
  ]

  // Lists with dramatic markers
  set list(indent: 12pt, body-indent: 8pt, marker: ([■], [▪], [•]))
  set enum(indent: 12pt, body-indent: 8pt)

  // Links styled
  show link: it => text(fill: accent, weight: 700)[#it]

  // Dramatic emphasis
  show emph: it => text(
    style: "italic",
    weight: 600,
    fill: accent,
  )[#it]
  
  show strong: it => text(
    weight: 900,
    fill: accent,
  )[#it]

  doc
}
