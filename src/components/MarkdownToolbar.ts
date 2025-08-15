export type ToolbarItem =
  | { type: "button"; id: string; label: string; hotkey?: string; tooltip?: string }
  | { type: "select"; id: string; label: string; options: string[]; tooltip?: string }
  | { type: "divider" };

export const TOOLBAR_CONFIG: ToolbarItem[] = [
  // Text formatting
  { type: "button", id: "bold", label: "B", hotkey: "Ctrl-B", tooltip: "Bold" },
  { type: "button", id: "italic", label: "I", hotkey: "Ctrl-I", tooltip: "Italic" },
  { type: "button", id: "strike", label: "S", tooltip: "Strikethrough" },
  { type: "button", id: "codeInline", label: "</> ", hotkey: "Ctrl-`", tooltip: "Inline code" },
  { type: "button", id: "link", label: "🔗", hotkey: "Ctrl-K", tooltip: "Link" },
  
  { type: "divider" },
  
  // Paragraph styles
  { type: "select", id: "paraStyle", label: "Paragraph", options: ["Paragraph","H1","H2","H3","Blockquote","Code block"], tooltip: "Paragraph style" },
  
  { type: "divider" },
  
  // Lists
  { type: "button", id: "ul", label: "• List", hotkey: "Ctrl-Shift-8", tooltip: "Bullet list" },
  { type: "button", id: "ol", label: "1. List", hotkey: "Ctrl-Shift-7", tooltip: "Numbered list" },
  { type: "button", id: "task", label: "☐ Task", hotkey: "Ctrl-Shift-9", tooltip: "Task list" },
  { type: "button", id: "indent", label: "→", tooltip: "Indent" },
  { type: "button", id: "outdent", label: "←", tooltip: "Outdent" },
  
  { type: "divider" },
  
  // Insert
  { type: "button", id: "image", label: "🖼", tooltip: "Insert image" },
  { type: "button", id: "table", label: "▦", tooltip: "Insert table" },
  { type: "button", id: "hr", label: "—", tooltip: "Horizontal rule" },
  
  { type: "divider" },
  
  // Layout helpers
  { type: "select", id: "align", label: "Align", options: ["Left","Center","Right"], tooltip: "Align content" },
  { type: "select", id: "width", label: "Width", options: ["25%","40%","60%","100%"], tooltip: "Image width" },
  { type: "button", id: "pagebreak", label: "⤓⤒", tooltip: "Page break" },
  
  { type: "divider" },
  
  // Font and size
  { type: "select", id: "fontMode", label: "Apply", options: ["Selection","Document"], tooltip: "Font apply mode" },
  { type: "select", id: "font", label: "Font", options: [], tooltip: "Font family" }, // Will be populated at runtime
  { type: "select", id: "size", label: "Size", options: ["Normal","Small","Large"], tooltip: "Text size" },
  
  { type: "divider" },
  
  // Actions
  { type: "button", id: "undo", label: "↶", tooltip: "Undo" },
  { type: "button", id: "redo", label: "↷", tooltip: "Redo" },
  { type: "button", id: "save", label: "💾", hotkey: "Ctrl-S", tooltip: "Save" },
  { type: "button", id: "render", label: "🔄", hotkey: "Ctrl-R", tooltip: "Render PDF" }
];

// Curated font list for the dropdown
export const FONT_OPTIONS = [
  "New Computer Modern",
  "Inter", 
  "Arial",
  "Helvetica",
  "Times New Roman",
  "Georgia",
  "Verdana",
  "Trebuchet MS",
  "Palatino",
  "Garamond",
  "Source Sans Pro",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat"
];
