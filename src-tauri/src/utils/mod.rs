//! Utility modules for the Tideflow application.
//!
//! This module provides essential utilities organized by domain:
//! - `paths`: Directory path resolution (app, content, assets, templates, styles, typst binary)
//! - `filesystem`: File operations (directory copying, filename sanitization)
//! - `initialization`: Application setup (directory creation, resource copying, default configs)
//! - `typst`: Typst-specific utilities (image path rewriting for Markdown/HTML/Typst)

pub mod filesystem;
pub mod initialization;
pub mod paths;
pub mod typst;

// Re-export commonly used functions for backward compatibility
pub use filesystem::sanitize_filename;
pub use initialization::initialize_app_directories;
pub use paths::{
    get_app_dir, get_assets_dir, get_content_dir,
    get_templates_dir, get_typst_path,
};
pub use typst::rewrite_image_paths_in_markdown;

// Make copy_user_images_to_assets available but not re-exported at top level
// It's used directly via utils::typst::copy_user_images_to_assets
