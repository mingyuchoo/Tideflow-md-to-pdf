#let academic_theme = prefs => {
  set text(font: prefs.fonts.main, size: 11pt, lang: "en")
  show raw: set text(font: prefs.fonts.mono)

  show heading.where(level: 1): set text(
    font: prefs.fonts.main,
    weight: 700,
    size: 23pt,
    fill: rgb(33, 74, 55),
  )
  show heading.where(level: 2): set text(
    font: prefs.fonts.main,
    weight: 600,
    size: 17pt,
    fill: rgb(33, 74, 55),
  )
  show heading.where(level: 3): set text(
    font: prefs.fonts.main,
    weight: 600,
    size: 14pt,
    fill: rgb(33, 74, 55),
  )

  show heading: set block(spacing: 12pt)

  (
    accent: rgb(33, 74, 55),
  )
}
