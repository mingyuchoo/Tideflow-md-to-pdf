#let colorful_theme = prefs => {
  set text(font: prefs.fonts.main, size: 11pt, lang: "tr")
  show raw: set text(font: prefs.fonts.mono)

  show heading.where(level: 1): set text(
    font: prefs.fonts.main,
    weight: 800,
    size: 22pt,
    fill: rgb(236, 72, 153),
  )
  show heading.where(level: 2): set text(
    font: prefs.fonts.main,
    weight: 700,
    size: 18pt,
    fill: rgb(14, 165, 233),
  )
  show heading.where(level: 3): set text(
    font: prefs.fonts.main,
    weight: 700,
    size: 14pt,
    fill: rgb(34, 197, 94),
  )

  show heading: set block(spacing: 10pt)

  (
    accent: rgb(236, 72, 153),
  )
}
