#let prefs = json("prefs.json")

#set text(lang: "tr")
#set page(paper: prefs.papersize, margin: (x: prefs.margin.x, y: prefs.margin.y))
#show heading: it => if prefs.numberSections { set heading(numbering: "1.") } else { it }

// Table of contents with page break if enabled
#if prefs.toc {
  outline(title: [İçindekiler])
  pagebreak()
}

// Use raw text instead of cmarker for now
#read("content.md")
