// Default Typst template for Tideflow
// Provides basic styling for headers, footers, and fonts

#let tideflow-template(title: "", author: "", date: none, body) = {
  // Set document properties
  set document(title: title, author: author)
  
  // Set default text properties
  set text(font: "New Computer Modern", size: 11pt)
  
  // Set heading properties
  set heading(numbering: "1.1")
  
  // Create simple header
  set page(
    header: [
      #smallcaps[#title]
      #h(1fr)
      #if date != none {
        date
      }
    ]
  )
  
  // Create simple footer with page numbers
  set page(
    footer: [
      #h(1fr)
      #counter(page).display("1")
      #h(1fr)
    ]
  )
  
  // Display the title, author, and date
  align(center)[
    #block(text(weight: "bold", size: 18pt)[#title])
    #if author != "" {
      block(text(size: 14pt)[#author])
    }
    #if date != none {
      block(text(size: 12pt)[#date])
    }
  ]
  
  // Add some space after the title block
  v(2em)
  
  // Display the main content
  body
}
