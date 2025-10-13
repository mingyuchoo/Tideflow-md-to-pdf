//! Tauri command handlers organized by domain.
//!
//! This module exposes all application commands through submodules:
//! - `file_ops`: File CRUD operations (read, write, list, create, delete,
//!   rename)
//! - `image_ops`: Image import and management
//! - `render_ops`: Markdown/Typst compilation to PDF
//! - `cache_ops`: Cache management and cleanup
//! - `debug_ops`: Diagnostics and debugging utilities
//! - `pdf_ops`: PDF serving operations
//! - `font_ops`: System font enumeration

pub mod cache_ops;
pub mod debug_ops;
pub mod file_ops;
pub mod font_ops;
pub mod image_ops;
pub mod pdf_ops;
pub mod render_ops;

// Re-export all commands for convenient registration
pub use cache_ops::*;
pub use debug_ops::*;
pub use file_ops::*;
pub use font_ops::*;
pub use image_ops::*;
pub use pdf_ops::*;
pub use render_ops::*;
