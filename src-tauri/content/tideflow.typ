// Main Tideflow Typst template (lean, preference-driven)
#import "@preview/cmarker:0.1.6": render
#import "themes/registry.typ": apply-theme

#let prefs = json("prefs.json")

#let theme-id = if "theme_id" in prefs { prefs.theme_id } else { "default" }
#let theme-config = apply-theme(theme-id, prefs)
#let accent-color = theme-config.at("accent", default: rgb(45, 62, 80))

// Theme hooks apply their own typography; ensure language defaults to English
#set text(lang: "en")

// Capture built-in image to avoid recursive overrides
#let builtin-image = image

#let anchor(id) = {
  label(id)
  box(width: 0pt, height: 0pt)
}

#let admonition-colors = (
  "note": (fill: mix(accent-color, rgb(255, 255, 255), 85%), stroke: accent-color),
  "info": (fill: rgb(224, 242, 254), stroke: rgb(186, 230, 253)),
  "tip": (fill: rgb(220, 252, 231), stroke: rgb(187, 247, 208)),
  "warning": (fill: rgb(254, 249, 195), stroke: rgb(253, 224, 71)),
  "important": (fill: rgb(254, 243, 199), stroke: rgb(251, 191, 36))
)

#let admonition-titles = (
  "note": "Note",
  "info": "Info",
  "tip": "Tip",
  "warning": "Warning",
  "important": "Important"
)

#let admonition(kind: str, body) = {
  let key = kind.lower()
  let palette = admonition-colors.at(key, default: admonition-colors.at("note"))
  let title = admonition-titles.at(key, default: kind.upper())
  block(
    fill: palette.fill,
    stroke: 0.5pt + palette.stroke,
    inset: 10pt,
    radius: 8pt,
    spacing: 12pt,
  )[
    text(weight: 600)[#title]
    v(4pt)
    body
  ]
}

#let sanitize-str = it => if type(it) == str { it.trim() } else { "" }

#let cover-enabled = {
  if "cover_page" in prefs {
    if type(prefs.cover_page) == bool { prefs.cover_page } else { false }
  } else { false }
}

#let cover-title = sanitize-str(if "cover_title" in prefs { prefs.cover_title } else { "" })
#let cover-writer = sanitize-str(if "cover_writer" in prefs { prefs.cover_writer } else { "" })
#let cover-image = sanitize-str(if "cover_image" in prefs { prefs.cover_image } else { "" })

#let render-cover-page = {
  if !cover-enabled { return none }
  let has-title = cover-title != ""
  let has-writer = cover-writer != ""
  let has-image = cover-image != ""

  box(width: 100%)[
    #set text(align: center)
    #v(5cm)
    #if has-image {
      #align(center, builtin-image(cover-image, width: 60%))
      #v(24pt)
    }
    #if has-title {
      #text(size: 28pt, weight: 700)[#cover-title]
      #v(12pt)
    }
    #if has-writer {
      #text(size: 16pt, fill: mix(accent-color, rgb(0, 0, 0), 60%))[#cover-writer]
      #v(12pt)
    }
  ]
}

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

#if cover-enabled [
  #render-cover-page
  #pagebreak()
]

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
