use anyhow::{anyhow, Result};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use regex::Regex;

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
    // Use resource directory for bundled binaries
    let resource_dir = app_handle
        .path()
        .resource_dir()
        .map_err(|e| anyhow!("Failed to get resource directory: {}", e))?;
    
    // Search inside bin/typst/<platform>
    let platform_dir = if cfg!(target_os = "windows") { "windows" } else if cfg!(target_os = "macos") { "macos" } else { "linux" };
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
        if c.exists() { return Ok(c.clone()); }
    }

    let attempted_list = attempted.iter().map(|p| p.display().to_string()).collect::<Vec<_>>().join(", ");
    Err(anyhow!("Typst binary not found. Download Typst binary and place in appropriate platform directory. Looked for: {}", attempted_list))
}

/// Initialize app directories
pub fn initialize_app_directories(app_handle: &AppHandle) -> Result<()> {
    // Create content directory and subdirectories
    let content_dir = get_content_dir(app_handle)?;
    let assets_dir = content_dir.join("assets");
    let build_dir = content_dir.join(".build");
    
    fs::create_dir_all(&content_dir)?;
    fs::create_dir_all(&assets_dir)?;
    fs::create_dir_all(&build_dir)?;
    
    // Create templates directory
    let templates_dir = get_templates_dir(app_handle)?;
    fs::create_dir_all(&templates_dir)?;
    
    // Create styles directory
    let styles_dir = get_styles_dir(app_handle)?;
    fs::create_dir_all(&styles_dir)?;
    
    // Copy template files if they don't exist
    let resource_dir = app_handle
        .path()
        .resource_dir()
        .map_err(|e| anyhow!("Failed to get resource directory: {}", e))?;
    let app_templates_dir = resource_dir.join("templates");
    
    if app_templates_dir.exists() {
        copy_directory_contents(&app_templates_dir, &templates_dir)?;
    }
    
    // Copy Typst template(s) from resources/content to user content dir if missing
    let user_typst_template = content_dir.join("tideflow.typ");
    if !user_typst_template.exists() {
        println!("🔍 Looking for tideflow.typ template...");
        
        // Try different possible locations for the template
        let mut template_sources = Vec::new();
        
        // 1. Try resource directory (for production builds)
        let resource_content_dir = resource_dir.join("content");
        template_sources.push(resource_content_dir.join("tideflow.typ"));
        
        // 2. Try relative to current directory (for development)
        if let Ok(current_dir) = std::env::current_dir() {
            template_sources.push(current_dir.join("src-tauri").join("content").join("tideflow.typ"));
            template_sources.push(current_dir.join("content").join("tideflow.typ"));
        }
        
        // 3. Try relative to executable directory
        if let Ok(exe_dir) = std::env::current_exe().and_then(|p| Ok(p.parent().unwrap().to_path_buf())) {
            template_sources.push(exe_dir.join("content").join("tideflow.typ"));
            template_sources.push(exe_dir.join("..").join("content").join("tideflow.typ"));
        }
        
        let mut copied = false;
        for src in &template_sources {
            println!("🔍 Checking template source: {}", src.display());
            if src.exists() {
                match fs::copy(src, &user_typst_template) {
                    Ok(_) => {
                        println!("✅ Copied tideflow.typ from {} to {}", src.display(), user_typst_template.display());
                        copied = true;
                        break;
                    }
                    Err(e) => {
                        println!("❌ Failed to copy template from {}: {}", src.display(), e);
                    }
                }
            }
        }
        
        if !copied {
            println!("⚠️ Could not find tideflow.typ template in any location. Searched:");
            for src in &template_sources {
                println!("   - {}", src.display());
            }
        }
    } else {
        println!("✅ tideflow.typ already exists at {}", user_typst_template.display());
    }

    // Copy all .typ style files from resources/styles to user styles dir if missing
    let resource_styles_dir = resource_dir.join("styles");
    if resource_styles_dir.exists() {
        for entry in fs::read_dir(&resource_styles_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().map(|e| e == "typ").unwrap_or(false) {
                let file_name = path.file_name().unwrap();
                let dest = styles_dir.join(file_name);
                if !dest.exists() {
                    fs::copy(&path, &dest)?;
                    println!("📄 Copied style {} to {}", file_name.to_string_lossy(), dest.display());
                }
            }
        }
    }

    // Create default prefs.json if it doesn't exist
    create_default_config_files(app_handle)?;

    Ok(())
}

/// Copy contents from one directory to another
fn copy_directory_contents(from: &Path, to: &Path) -> Result<()> {
    if !to.exists() {
        fs::create_dir_all(to)?;
    }
    
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let source = entry.path();
        let destination = to.join(entry.file_name());
        
        if file_type.is_dir() {
            copy_directory_contents(&source, &destination)?;
        } else if !destination.exists() {
            fs::copy(&source, &destination)?;
        }
    }
    
    Ok(())
}

/// Create default configuration files
fn create_default_config_files(app_handle: &AppHandle) -> Result<()> {
    let content_dir = get_content_dir(app_handle)?;
    let prefs_json_path = content_dir.join("_prefs.json");
    
    // Create default _prefs.json if it doesn't exist
    if !prefs_json_path.exists() {
        let default_prefs_json = r#"{
  "papersize": "a4",
  "margin": {
    "x": "2cm",
    "y": "2.5cm"
  },
  "toc": true,
  "numberSections": true,
  "default_image_width": "60%",
  "default_image_alignment": "center",
  "fonts": {
    "main": "New Computer Modern",
    "mono": "Liberation Mono"
  },
  "render_debounce_ms": 400,
  "focused_preview_enabled": true,
  "preserve_scroll_position": true
}"#;
        fs::write(prefs_json_path, default_prefs_json)?;
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
