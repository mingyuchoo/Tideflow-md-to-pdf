#import "default.typ": default_theme
#import "minimal.typ": minimal_theme
#import "compact.typ": compact_theme
#import "elegant.typ": elegant_theme
#import "technical.typ": technical_theme
#import "magazine.typ": magazine_theme
#import "academic.typ": academic_theme
#import "creative.typ": creative_theme
#import "modern.typ": modern_theme
#import "serif.typ": serif_theme
#import "notebook.typ": notebook_theme
#import "dark.typ": dark_theme

#let theme-map = (
  "default": default_theme,
  "minimal": minimal_theme,
  "compact": compact_theme,
  "elegant": elegant_theme,
  "technical": technical_theme,
  "magazine": magazine_theme,
  "academic": academic_theme,
  "creative": creative_theme,
  "modern": modern_theme,
  "serif": serif_theme,
  "notebook": notebook_theme,
  "dark": dark_theme,
)

#let get-theme(id) = {
  theme-map.at(id, default: default_theme)
}
