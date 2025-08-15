#let prefs = json("prefs.json")

#set text(lang: "tr")

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

// Temporary: Use raw text instead of cmarker until we fix the package issue
#raw(read("content.md"), lang: "markdown")
