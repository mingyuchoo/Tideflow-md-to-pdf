#let modern_theme = prefs => {
  set text(font: prefs.fonts.main, size: 11pt, lang: "en")
  show raw: set text(font: prefs.fonts.mono)

  show heading.where(level: 1): set text(
    font: prefs.fonts.main,
    weight: 700,
    size: 22pt,
    fill: rgb(18, 111, 165),
  )
  show heading.where(level: 2): set text(
    font: prefs.fonts.main,
    weight: 600,
    size: 17pt,
    fill: rgb(18, 111, 165),
  )
  show heading.where(level: 3): set text(
    font: prefs.fonts.main,
    weight: 600,
    size: 14pt,
    fill: rgb(18, 111, 165),
  )

  show heading: set block(spacing: 10pt)

  (
    accent: rgb(18, 111, 165),
  )
}
