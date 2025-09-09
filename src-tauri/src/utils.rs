use anyhow::{anyhow, Result};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use regex::Regex;
use std::borrow::Cow;

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
    
    // Copy Typst template(s) from resources/content to user content dir, updating if different
    let user_typst_template = content_dir.join("tideflow.typ");
    
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
            // Check if we need to copy/update the template
            let should_copy = if !user_typst_template.exists() {
                println!("📄 Template doesn't exist, will copy");
                true
            } else {
                // Check if source is different from destination
                match (fs::read_to_string(src), fs::read_to_string(&user_typst_template)) {
                    (Ok(src_content), Ok(dst_content)) => {
                        if src_content != dst_content {
                            println!("🔄 Template content differs, will update");
                            true
                        } else {
                            println!("✅ Template is up to date");
                            false
                        }
                    }
                    _ => {
                        println!("⚠️ Could not compare templates, will copy");
                        true
                    }
                }
            };
            
            if should_copy {
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
            } else {
                copied = true; // Don't need to copy, but mark as successful
                break;
            }
        }
    }
    
    if !copied {
        println!("⚠️ Could not find tideflow.typ template in any location. Searched:");
        for src in &template_sources {
            println!("   - {}", src.display());
        }
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
        let legacy_path = content_dir.join("_prefs.json");
        let prefs_json_path = content_dir.join("prefs.json");

        // Migrate legacy file if present and new one missing
        if legacy_path.exists() && !prefs_json_path.exists() {
                if let Err(e) = std::fs::copy(&legacy_path, &prefs_json_path) {
                        println!("⚠️ Failed to migrate legacy _prefs.json: {}", e);
                } else {
                        println!("✅ Migrated legacy _prefs.json to prefs.json");
                }
        }

        // Create default prefs.json if it doesn't exist
        if !prefs_json_path.exists() {
        let default_prefs_json = r#"{
  "papersize": "a4",
  "margin": {
    "x": "2cm",
    "y": "2.5cm"
  },
    "toc": false,
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

/// Rewrite image sources in Markdown and HTML to absolute, normalized paths.
/// This helps Typst resolve images when we compile from a different working directory.
///
/// Rules:
/// - Skip http(s), data:, and file: URIs
/// - Resolve relative paths against `base_dir`
/// - Normalize Windows paths to use forward slashes
/// - If a path contains spaces or parentheses, wrap in angle brackets in Markdown form
pub fn rewrite_image_paths_in_markdown(input: &str, base_dir: &Path, assets_root: Option<&Path>) -> String {
    // Helper to decide if a path is a URL-like that we should not touch
    fn is_external(p: &str) -> bool {
        let lower = p.to_ascii_lowercase();
        lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("data:") || lower.starts_with("file:")
    }

    // Normalize a file path to absolute with forward slashes.
    fn absolute_norm<'a>(base: &'a Path, raw: &'a str, assets_root: Option<&'a Path>, wrap_for_markdown: bool) -> Cow<'a, str> {
        if is_external(raw) {
            return Cow::Borrowed(raw);
        }

        // Handle angle-bracket wrapped markdown paths like <path with spaces>
        let trimmed = raw.trim();
        let (unwrapped, had_angle) = if trimmed.starts_with('<') && trimmed.ends_with('>') {
            (&trimmed[1..trimmed.len() - 1], true)
        } else { (trimmed, false) };

        // Normalize input to forward slashes
        let normalized_unwrapped = unwrapped.replace('\\', "/");

        // If path starts with assets/, emit root-relative /assets/... so Typst resolves from --root
        if normalized_unwrapped.starts_with("assets/") || normalized_unwrapped == "assets" {
            let mut root_rel = format!("/{}", normalized_unwrapped.trim_start_matches('/'));
            // Re-wrap for markdown if needed
            if wrap_for_markdown && (had_angle || root_rel.contains(' ') || root_rel.contains('(') || root_rel.contains(')')) {
                root_rel = format!("<{}>", root_rel);
            }
            return Cow::Owned(root_rel);
        }

        // Compute content root from assets_root (its parent)
        let content_root_opt: Option<&Path> = assets_root.and_then(|p| p.parent());

        // Detect Windows absolute (e.g., C:\ or C:/) or POSIX absolute starting with /
        let is_abs = Path::new(unwrapped).is_absolute()
            || unwrapped.chars().nth(1) == Some(':');

        // Join relative paths against base; keep absolutes as-is
        let joined = if is_abs { PathBuf::from(&normalized_unwrapped) } else { base.join(&normalized_unwrapped) };

        // Try canonicalize to collapse .. segments; fall back if it fails
        let abs = joined.canonicalize().unwrap_or(joined);

        // Convert to forward slashes and strip UNC verbatim prefix
        let mut path_str = abs.to_string_lossy().replace('\\', "/");
        if path_str.starts_with("//?/") { path_str = path_str.trim_start_matches("//?/").to_string(); }

        // If inside content root, convert to root-relative with leading '/'
        if let Some(content_root) = content_root_opt {
            let mut content_root_str = content_root.to_string_lossy().replace('\\', "/");
            if content_root_str.ends_with('/') { content_root_str.pop(); }
            if path_str.starts_with(&content_root_str) {
                let mut rel = path_str[content_root_str.len()..].to_string();
                if !rel.starts_with('/') { rel = format!("/{}", rel); }
                // Ensure markdown wrapping if needed
                if wrap_for_markdown && (had_angle || rel.contains(' ') || rel.contains('(') || rel.contains(')')) {
                    rel = format!("<{}>", rel);
                }
                return Cow::Owned(rel);
            }
        }

        // Fallback: leave as absolute OS path (may be blocked by --root if outside)

        // Re-wrap if original had angle brackets, or add if spaces/parens present
        if wrap_for_markdown {
            if had_angle || path_str.contains(' ') || path_str.contains('(') || path_str.contains(')') {
                path_str = format!("<{}>", path_str);
            }
        }

        Cow::Owned(path_str)
    }

    // Replace Markdown image syntax: ![alt](path "title")
    // We'll conservatively capture inside the parentheses and split off a title if present.
    let re_md_img = Regex::new(r"!\[[^\]]*\]\(([^)]+)\)").unwrap();
    let result = re_md_img.replace_all(input, |caps: &regex::Captures| {
        let inside = caps.get(1).map(|m| m.as_str()).unwrap_or("").trim();

        // Extract path and optional title: path [whitespace title]
        let mut path_part = inside;
        let mut title_part: Option<&str> = None;

        // Handle quoted title variants
        let mut in_quotes = false;
        let mut split_idx: Option<usize> = None;
        for (i, ch) in inside.char_indices() {
            match ch {
                '"' => in_quotes = !in_quotes,
                ' ' | '\t' if !in_quotes => { split_idx = Some(i); break; }
                _ => {}
            }
        }
        if let Some(idx) = split_idx {
            path_part = inside[..idx].trim();
            title_part = Some(inside[idx..].trim());
        }

        let abs = absolute_norm(base_dir, path_part, assets_root, true);
        if let Some(title) = title_part {
            format!("![]({} {})", abs, title)
        } else {
            format!("![]({})", abs)
        }
    });

    // Replace HTML <img ... src="..."> occurrences
    let re_html_img = Regex::new(r#"<img([^>]*?)\s+src=([\"'])([^\"']+)([\"'])([^>]*)>"#).unwrap();
    let result = re_html_img.replace_all(&result, |caps: &regex::Captures| {
        let before = caps.get(1).map(|m| m.as_str()).unwrap_or("");
        let quote = caps.get(2).map(|m| m.as_str()).unwrap_or("\"");
        let src = caps.get(3).map(|m| m.as_str()).unwrap_or("");
        let after_quote = caps.get(4).map(|m| m.as_str()).unwrap_or("\"");
        let after = caps.get(5).map(|m| m.as_str()).unwrap_or("");
        let abs = absolute_norm(base_dir, src, assets_root, false);
        format!("<img{} src={}{}{}{}>", before, quote, abs, after_quote, after)
    });

    // Replace raw Typst calls: #fig("path" ...) and #image('path' ...)
    let re_raw_typst = Regex::new(r#"#(fig|image)\(\s*([\"'])([^\"']+)([\"'])"#).unwrap();
    let result = re_raw_typst.replace_all(&result, |caps: &regex::Captures| {
        let func = caps.get(1).map(|m| m.as_str()).unwrap_or("fig");
        let quote = caps.get(2).map(|m| m.as_str()).unwrap_or("\"");
        let path = caps.get(3).map(|m| m.as_str()).unwrap_or("");
        let abs = absolute_norm(base_dir, path, assets_root, false);
        format!("#{}({}{}{}", func, quote, abs, quote)
    });

    result.into_owned()
}
