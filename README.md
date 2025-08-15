# Tideflow - Markdown to PDF Converter

A modern desktop application that converts Markdown files to high-quality PDFs using Typst. Built with Tauri, React, and TypeScript.

## Features

- **Real-time PDF Preview**: See your document rendered as you type
- **Markdown Editor**: Full-featured editor with syntax highlighting (CodeMirror 6)
- **Image Support**: Drag & drop or paste images directly into documents
- **Customizable Styling**: Adjust paper size, margins, fonts, and layout
- **Table of Contents**: Automatic TOC generation with section numbering
- **Cross-platform**: Works on Windows, macOS, and Linux
- **Offline**: No internet connection required after installation

## Technology Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Tauri (Rust)
- **PDF Engine**: Typst (bundled)
- **Editor**: CodeMirror 6
- **UI**: React Resizable Panels

## Installation

### Prerequisites

- Node.js 18+ 
- Rust (latest stable)
- Tauri CLI: `cargo install tauri-cli`

### Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/BDenizKoca/Md-to-PDF.git
   cd Md-to-PDF
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start development server:
   ```bash
   npm run tauri:dev
   ```

### Building for Production

```bash
npm run tauri:build
```

## Usage

1. **Create/Open Documents**: Use the toolbar to create new files or open existing Markdown documents
2. **Edit Content**: Write in the left panel using standard Markdown syntax
3. **Preview**: Real-time PDF preview appears in the right panel
4. **Customize**: Open preferences to adjust paper size, margins, fonts, and styling
5. **Export**: Save your final PDF using the export button

## Markdown Features Supported

- Headers (H1-H6) with optional numbering
- **Bold** and *italic* text
- Code blocks with syntax highlighting
- Tables
- Lists (ordered and unordered)
- Links and images
- Blockquotes
- Math expressions (LaTeX syntax)

## Configuration

Access preferences to customize:

- **Paper Size**: A4, Letter, Legal, etc.
- **Margins**: Adjustable page margins
- **Fonts**: Main text and monospace fonts
- **Table of Contents**: Enable/disable with numbering
- **Image Defaults**: Default width and alignment for images

## File Structure

```
tideflow/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── store.ts           # State management (Zustand)
│   └── api.ts             # Tauri API bindings
├── src-tauri/             # Rust backend
│   ├── src/               # Rust source code
│   ├── content/           # Typst templates
│   └── styles/            # Theme files
└── public/                # Static assets
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make changes and test
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions, please use the GitHub Issues page.
