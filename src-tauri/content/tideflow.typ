// Import CommonMark parser for proper markdown rendering
#import "@preview/cmarker:0.1.6": render

#let prefs = json("prefs.json")

// Apply font preferences from the UI BEFORE setting language
#set text(font: prefs.fonts.main, size: 11pt, lang: "tr")
#show raw: set text(font: prefs.fonts.mono)

// Convert string margins to lengths
#let margin_x = if type(prefs.margin.x) == str {
  eval(prefs.margin.x)
} else {
  prefs.margin.x
}

#let margin_y = if type(prefs.margin.y) == str {
  eval(prefs.margin.y)
} else {
  prefs.margin.y
}

#set page(paper: prefs.papersize, margin: (x: margin_x, y: margin_y))
#show heading: it => if prefs.numberSections { set heading(numbering: "1.") } else { it }

// Table of contents with page break if enabled
#if prefs.toc {
  outline(title: [İçindekiler])
  pagebreak()
}

// Render markdown content with proper CommonMark parsing
#render(read("content.md"))
