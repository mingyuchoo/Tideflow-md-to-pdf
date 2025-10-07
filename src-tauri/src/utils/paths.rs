//! Path resolution utilities for app directories.

use anyhow::{anyhow, Result};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Get the app's base directory
pub fn get_app_dir(app_handle: &AppHandle) -> Result<PathBuf> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| anyhow!("Failed to get app directory: {}", e))?;
    
    Ok(app_dir)
}

/// Get the content directory
pub fn get_content_dir(app_handle: &AppHandle) -> Result<PathBuf> {
    let app_dir = get_app_dir(app_handle)?;
    let content_dir = app_dir.join("content");
    
    if !content_dir.exists() {
        fs::create_dir_all(&content_dir)?;
    }
    
    Ok(content_dir)
}

/// Get the assets directory
pub fn get_assets_dir(app_handle: &AppHandle) -> Result<PathBuf> {
    let content_dir = get_content_dir(app_handle)?;
    let assets_dir = content_dir.join("assets");
    
    if !assets_dir.exists() {
        fs::create_dir_all(&assets_dir)?;
    }
    
    Ok(assets_dir)
}

/// Get the templates directory
pub fn get_templates_dir(app_handle: &AppHandle) -> Result<PathBuf> {
    let app_dir = get_app_dir(app_handle)?;
    let templates_dir = app_dir.join("templates");
    
    if !templates_dir.exists() {
        fs::create_dir_all(&templates_dir)?;
    }
    
    Ok(templates_dir)
}

/// Get the styles directory
pub fn get_styles_dir(app_handle: &AppHandle) -> Result<PathBuf> {
    let app_dir = get_app_dir(app_handle)?;
    let styles_dir = app_dir.join("styles");
    
    if !styles_dir.exists() {
        fs::create_dir_all(&styles_dir)?;
    }
    
    Ok(styles_dir)
}

/// Get the Typst binary path based on platform
pub fn get_typst_path(app_handle: &AppHandle) -> Result<PathBuf> {
    // First, try to find typst on the system PATH
    if let Ok(path) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path) {
            let typst_path = if cfg!(target_os = "windows") {
                dir.join("typst.exe")
            } else {
                dir.join("typst")
            };

            if typst_path.exists() {
                return Ok(typst_path);
            }
        }
    }

    // Fall back to bundled binary in resource directory
    let resource_dir = app_handle
        .path()
        .resource_dir()
        .map_err(|e| anyhow!("Failed to get resource directory: {}", e))?;

    // Search inside bin/typst/<platform>
    let platform_dir = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    };

    let platform_base = resource_dir.join("bin").join("typst").join(platform_dir);
    let mut attempted: Vec<PathBuf> = Vec::new();
    let mut candidates: Vec<PathBuf> = Vec::new();

    if cfg!(target_os = "windows") {
        candidates.push(platform_base.join("typst.exe"));
    } else {
        candidates.push(platform_base.join("typst"));
    }

    for c in &candidates {
        attempted.push(c.clone());
        if c.exists() {
            return Ok(c.clone());
        }
    }

    let attempted_list = attempted
        .iter()
        .map(|p| p.display().to_string())
        .collect::<Vec<_>>()
        .join(", ");

    Err(anyhow!(
        "Typst binary not found. Download Typst binary and place in appropriate platform directory, or install Typst system-wide. Looked for: {}",
        attempted_list
    ))
}
