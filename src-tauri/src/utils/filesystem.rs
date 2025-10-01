//! Filesystem utilities for copying directories and sanitizing filenames.

use anyhow::Result;
use regex::Regex;
use std::fs;
use std::path::Path;

/// Copy directory contents with optional overwrite control.
/// 
/// If `force_overwrite` is true, existing files/directories at destination are removed first.
/// If false, only copies files that don't already exist at destination.
pub fn copy_directory(from: &Path, to: &Path, force_overwrite: bool) -> Result<()> {
    if !from.exists() {
        return Ok(());
    }
    
    // Prevent copying a directory into itself
    if from == to {
        return Ok(());
    }
    
    // If force overwrite and destination exists, remove it first
    if force_overwrite && to.exists() {
        fs::remove_dir_all(to)?;
    }
    
    // Create destination directory
    if !to.exists() {
        fs::create_dir_all(to)?;
    }
    
    // Copy all entries
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let source = entry.path();
        let destination = to.join(entry.file_name());
        
        if file_type.is_dir() {
            copy_directory(&source, &destination, force_overwrite)?;
        } else if force_overwrite || !destination.exists() {
            fs::copy(&source, &destination)?;
        }
    }
    
    Ok(())
}

/// Sanitize filename to be safe for file systems
pub fn sanitize_filename(filename: &str) -> String {
    // Remove any potentially dangerous characters
    let re = Regex::new(r"[^a-zA-Z0-9\-_.]+").unwrap();
    let sanitized = re.replace_all(filename, "-").to_string();
    
    // Ensure the filename is not empty
    if sanitized.is_empty() {
        return "file.txt".to_string();
    }
    
    sanitized
}
