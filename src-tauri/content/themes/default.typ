#let default_theme = prefs => {
  set text(font: prefs.fonts.main, size: 11pt, lang: "en")
  show raw: set text(font: prefs.fonts.mono)

  show heading.where(level: 1): set text(
    font: prefs.fonts.main,
    weight: 700,
    size: 22pt,
    fill: rgb(45, 62, 80),
  )
  show heading.where(level: 2): set text(
    font: prefs.fonts.main,
    weight: 600,
    size: 16pt,
    fill: rgb(45, 62, 80),
  )
  show heading.where(level: 3): set text(
    font: prefs.fonts.main,
    weight: 600,
    size: 13pt,
    fill: rgb(45, 62, 80),
  )

  show heading: set block(spacing: 12pt)

  (
    accent: rgb(45, 62, 80),
  )
}
