# Tideflow: Markdown to Beautiful PDFs

A modern desktop application that transforms Markdown into professionally formatted PDFs with live preview and customizable themes.

## Features

- **Live Preview**: See your PDF update in real-time as you type
- **Multiple Themes**: Choose from Modern, Serif, and Notebook styles
- **Rich Markdown Support**: Full support for headings, lists, tables, code blocks, quotes, and more
- **Custom Styling**: Fine-tune fonts, margins, colors, and layout
- **Image Support**: Automatic detection and handling of PNG, JPEG, GIF, WebP, and BMP images
- **Table of Contents**: Automatic TOC generation with section numbering
- **Cross-Platform**: Built with Tauri for Windows, macOS, and Linux

## Quick Start

1. **Open or Type**: Load a Markdown file or start typing in the editor
2. **Live Preview**: Watch your PDF update automatically (toggle with `Ctrl+P`)
3. **Customize Design**: Use the Design panel to adjust themes and styling
4. **Export**: Save your finished PDF with `Ctrl+E`

## Installation

### Prerequisites

**Linux users** need GTK development libraries:

```bash
# Ubuntu/Debian
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
sudo apt install fuse3 libfuse3-3 libfuse3-dev

# Fedora
sudo dnf install webkit2gtk4.1-devel gtk3-devel libappindicator-gtk3-devel librsvg2-devel
sudo dnf install fuse fuse-libs

# Arch Linux
sudo pacman -S webkit2gtk-4.1 gtk3 libappindicator-gtk3 librsvg
sudo pacman -S fuse3
```

### Building from Source

1. Install [Rust](https://rustup.rs/) and [Node.js](https://nodejs.org/)
2. Clone the repository
3. Install dependencies and build:

```bash
# Install frontend dependencies
pnpm install

# Build the application
pnpm run tauri build
```

## Supported Markdown Features

- **Typography**: Headings (H1-H6), bold, italic, strikethrough
- **Lists**: Bullet points and numbered lists with nesting
- **Code**: Inline code and syntax-highlighted code blocks
- **Links**: Clickable hyperlinks with custom styling
- **Images**: Automatic format detection and embedding
- **Tables**: Full table support with borders and alignment
- **Quotes**: Blockquotes with theme-specific styling
- **Horizontal Rules**: Section dividers

## Themes

### Modern Theme
Clean, contemporary design with sans-serif typography and subtle colors.

### Serif Theme  
Classic academic style with traditional serif fonts and elegant spacing.

### Notebook Theme
Vintage manuscript appearance with aged paper textures and ornamental elements.

## Configuration

Tideflow uses a `prefs.json` file for customization:

```json
{
  "toc": true,
  "numberSections": true,
  "papersize": "a4",
  "theme": "modern"
}
```

## Architecture

Built with:
- **Frontend**: HTML/CSS/JavaScript
- **Backend**: Rust with Tauri framework
- **PDF Generation**: Typst typesetting system
- **Markdown Processing**: Custom pipeline with image handling

Key components:
- `render_pipeline.rs`: Core PDF generation logic
- Theme files: Typst templates for different styles
- Asset management: Automatic theme and image synchronization

## Development

```bash
# Start development server
pnpm run tauri dev

# Run tests
cargo test

# Format code
cargo fmt
pnpm run format
```
