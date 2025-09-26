#let journal_theme = prefs => {
  set text(font: prefs.fonts.main, size: 11pt, lang: "en")
  show raw: set text(font: prefs.fonts.mono)

  show heading.where(level: 1): set text(
    font: prefs.fonts.main,
    weight: 700,
    size: 24pt,
    fill: rgb(95, 63, 141),
  )
  show heading.where(level: 2): set text(
    font: prefs.fonts.main,
    weight: 600,
    size: 18pt,
    fill: rgb(95, 63, 141),
  )
  show heading.where(level: 3): set text(
    font: prefs.fonts.main,
    weight: 600,
    size: 14pt,
    fill: rgb(95, 63, 141),
  )

  show heading: set block(spacing: 14pt)

  (
    accent: rgb(164, 107, 231),
  )
}
