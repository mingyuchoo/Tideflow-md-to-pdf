#import "default.typ": default_theme
#import "classic.typ": classic_theme
#import "modern.typ": modern_theme
#import "academic.typ": academic_theme
#import "journal.typ": journal_theme
#import "colorful.typ": colorful_theme

#let theme-map = (
  "default": default_theme,
  "classic": classic_theme,
  "modern": modern_theme,
  "academic": academic_theme,
  "journal": journal_theme,
  "colorful": colorful_theme,
)

#let apply-theme = (id, prefs) => {
  let theme = theme-map.at(id, default: default_theme)
  theme(prefs)
}
