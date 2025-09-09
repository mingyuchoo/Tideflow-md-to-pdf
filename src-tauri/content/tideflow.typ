// Main Tideflow Typst template (lean, preference-driven)
#import "@preview/cmarker:0.1.6": render

#let prefs = json("prefs.json")

// Apply font preferences first; language set to English to prevent localized titles
#set text(font: prefs.fonts.main, size: 11pt, lang: "en")
#show raw: set text(font: prefs.fonts.mono)

// Capture built-in image to avoid recursive overrides
#let builtin-image = image

// Safe margin parsing (supports cm/mm/in/pt or numeric fallback)
#let parse-length = it => if type(it) == str {
  if it.ends-with("%") { float(it.slice(0, -1)) * 1% }
  else if it.ends-with("px") { float(it.slice(0, -2)) * 0.75pt } // approx CSS px→pt at 96dpi
  else if it.ends-with("cm") { float(it.slice(0, -2)) * 1cm }
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
#render(md_content,
  html: (
    // Handle <img src width data-align> so we can control size and alignment
    img: ("void", attrs => {
      // Use safe dictionary access for HTML attributes
      let path = attrs.at("src")
      // Read width safely; consider empty string as none
      let wraw = attrs.at("width", default: none)
      let w = if type(wraw) == str and wraw.trim() != "" { wraw } else { none }
      let im = if w != none { builtin-image(path, width: parse-length(w)) } else { builtin-image(path) }
      // Alignment: data-align takes precedence, then align, default to center
      let a = attrs.at("data-align", default: attrs.at("align", default: "center"))
      if a == "center" { align(center, im) }
      else if a == "right" { align(right, im) }
      else { im }
    })
  ),
  scope: (
    // Ensure image paths resolve relative to our project/build directory,
    // not the cmarker package root. See cmarker docs: "Resolving Paths Correctly".
    image: (path, alt: none, ..n) => builtin-image(path, alt: alt, ..n)
  )
)
