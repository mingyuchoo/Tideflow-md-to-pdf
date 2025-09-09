// Main Tideflow Typst template (lean, preference-driven)
#import "@preview/cmarker:0.1.6": render

#let prefs = json("prefs.json")

// Apply font preferences first; language set to English to prevent localized titles
#set text(font: prefs.fonts.main, size: 11pt, lang: "en")
#show raw: set text(font: prefs.fonts.mono)

// Safe margin parsing (supports cm/mm/in/pt or numeric fallback)
#let parse-length = it => if type(it) == str {
  if it.ends-with("cm") { float(it.slice(0, -2)) * 1cm }
  else if it.ends-with("mm") { float(it.slice(0, -2)) * 1mm }
  else if it.ends-with("in") { float(it.slice(0, -2)) * 1in }
  else if it.ends-with("pt") { float(it.slice(0, -2)) * 1pt }
  else {  // bare number interpret as cm for convenience
    float(it) * 1cm
  }
} else { it };

#let margin_x = parse-length(prefs.margin.x)
#let margin_y = parse-length(prefs.margin.y)

#set page(paper: prefs.papersize, margin: (x: margin_x, y: margin_y))

// CRITICAL: Disable any automatic outline generation by Typst or cmarker
#set outline(title: none)

// Read markdown content
#let md_content = read("content.md")

// Only add our controlled TOC if enabled in preferences
#if prefs.toc [
  #let has_custom_title = "toc_title" in prefs and prefs.toc_title.trim() != ""
  #if has_custom_title [
    #text(size: 16pt, weight: 600)[#prefs.toc_title]
    #v(6pt)
  ]
  
  // Generate outline explicitly here
  #outline(title: none, depth: 3)
  #pagebreak()
]

// Render markdown content with explicit outline suppression
#show outline: none
#render(md_content, scope: (
  // Ensure image paths resolve relative to our project/build directory,
  // not the cmarker package root. See cmarker docs: "Resolving Paths Correctly".
  image: (path, alt: none) => image(path, alt: alt)
))
