use crate::renderer;
use crate::utils;
use crate::preferences;
use anyhow::Result;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct TypstDiagnostics {
    detected_binary: Option<String>,
    attempted_binary_paths: Vec<String>,
    error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
    children: Option<Vec<FileEntry>>,
}

#[tauri::command]
pub async fn read_markdown_file(path: &str) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn write_markdown_file(path: &str, content: &str) -> Result<(), String> {
    // Ensure parent directory exists
    if let Some(parent) = Path::new(path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_files(app_handle: AppHandle, dir_path: &str) -> Result<Vec<FileEntry>, String> {
    list_files_internal(app_handle, dir_path).await
}

async fn list_files_internal(app_handle: AppHandle, dir_path: &str) -> Result<Vec<FileEntry>, String> {
    let path = if dir_path.is_empty() {
        utils::get_content_dir(&app_handle)
            .map_err(|e| e.to_string())?
    } else {
        PathBuf::from(dir_path)
    };

    if !path.exists() {
        return Err(format!("Directory does not exist: {}", path.display()));
    }

    let entries = fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut files = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let file_name = entry
            .file_name()
            .to_string_lossy()
            .to_string();
        
        // Skip hidden files and the .build directory
        if file_name.starts_with('.') || file_name == ".build" {
            continue;
        }

        let path_str = entry.path().to_string_lossy().to_string();
        
        let children = if metadata.is_dir() {
            Some(Box::pin(list_files_internal(app_handle.clone(), &path_str)).await?)
        } else {
            None
        };

        files.push(FileEntry {
            name: file_name,
            path: path_str,
            is_dir: metadata.is_dir(),
            children,
        });
    }

    // Sort directories first, then files alphabetically
    files.sort_by(|a, b| {
        if a.is_dir && !b.is_dir {
            std::cmp::Ordering::Less
        } else if !a.is_dir && b.is_dir {
            std::cmp::Ordering::Greater
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(files)
}

#[tauri::command]
pub async fn create_file(
    app_handle: AppHandle,
    name: &str,
    template: Option<&str>,
    dir_path: Option<&str>,
) -> Result<String, String> {
    // Determine parent directory
    let parent_dir = match dir_path {
        Some(dir) => PathBuf::from(dir),
        None => utils::get_content_dir(&app_handle)
            .map_err(|e| e.to_string())?,
    };

    // Ensure parent directory exists
    fs::create_dir_all(&parent_dir).map_err(|e| e.to_string())?;

    // Create file path
    let file_path = parent_dir.join(name);

    // If file already exists, return error
    if file_path.exists() {
        return Err(format!("File already exists: {}", file_path.display()));
    }

    // Determine content to write
    let content = match template {
        Some(template_name) => {
            let templates_dir = utils::get_templates_dir(&app_handle)
                .map_err(|e| e.to_string())?;
            let template_path = templates_dir.join(template_name);
            
            if template_path.exists() {
                fs::read_to_string(template_path).map_err(|e| e.to_string())?
            } else {
                return Err(format!("Template not found: {}", template_name));
            }
        },
        None => {
            // Default minimal content for Typst
            "# New Document\n\nStart writing here...\n".to_string()
        }
    };

    // Write content to file
    fs::write(&file_path, content).map_err(|e| e.to_string())?;

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn delete_file(path: &str) -> Result<(), String> {
    let path = Path::new(path);
    
    if !path.exists() {
        return Err("File does not exist".into());
    }
    
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn rename_file(old_path: &str, new_name: &str) -> Result<String, String> {
    let old_path = Path::new(old_path);
    
    if !old_path.exists() {
        return Err("File does not exist".into());
    }
    
    let parent = old_path.parent()
        .ok_or_else(|| "Cannot determine parent directory".to_string())?;
    
    let new_path = parent.join(new_name);
    
    if new_path.exists() {
        return Err("Destination already exists".into());
    }
    
    fs::rename(old_path, &new_path).map_err(|e| e.to_string())?;
    
    Ok(new_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn import_image(
    app_handle: AppHandle,
    image_data: &str,
    file_name: Option<String>,
) -> Result<String, String> {
    // Extract base64 data (remove data:image/png;base64, prefix)
    let base64_data = if image_data.contains("base64,") {
        image_data.split("base64,").nth(1).unwrap_or(image_data)
    } else {
        image_data
    };
    
    // Decode base64 image data
    let image_bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| format!("Failed to decode image: {}", e))?;
    
    // Get assets directory
    let assets_dir = utils::get_assets_dir(&app_handle)
        .map_err(|e| e.to_string())?;
    
    // Ensure assets directory exists
    fs::create_dir_all(&assets_dir).map_err(|e| e.to_string())?;
    
    // Generate unique filename if not provided
    let filename = match file_name {
        Some(name) => utils::sanitize_filename(&name),
        None => {
            let uuid = Uuid::new_v4();
            format!("image-{}.png", uuid)
        }
    };
    
    // Construct full path
    let image_path = assets_dir.join(&filename);
    
    // Write image to file
    fs::write(&image_path, image_bytes).map_err(|e| e.to_string())?;
    
    // Return relative path for Markdown insertion
    Ok(format!("assets/{}", filename))
}

#[tauri::command]
pub async fn render_markdown(
    app_handle: AppHandle,
    file_path: &str,
) -> Result<String, String> {
    match renderer::render_markdown(&app_handle, file_path).await {
        Ok(pdf_path) => {
            // Emit the compiled event with the PDF path
            let _ = app_handle.emit("compiled", &pdf_path);
            Ok(pdf_path)
        }
        Err(e) => {
            // Emit compile error event
            let _ = app_handle.emit("compile-error", e.to_string());
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn export_markdown(
    app_handle: AppHandle,
    file_path: &str,
) -> Result<String, String> {
    match renderer::export_markdown(&app_handle, file_path).await {
        Ok(pdf_path) => {
            // Emit the exported event with the PDF path
            let _ = app_handle.emit("exported", &pdf_path);
            Ok(pdf_path)
        }
        Err(e) => {
            // Emit export error event
            let _ = app_handle.emit("export-error", e.to_string());
            Err(e.to_string())
        }
    }
}

/// Save (copy) an existing PDF (already rendered/exported) to a user-selected destination.
/// If the source is a markdown path, we compile first to ensure it's up to date, then copy.
#[tauri::command]
pub async fn save_pdf_as(
    app_handle: AppHandle,
    file_path: &str,
    destination: &str,
) -> Result<String, String> {
    let src_path = Path::new(file_path);
    let dest_path = Path::new(destination);

    // If user passed a markdown file, ensure export first
    let ext = src_path.extension().and_then(|e| e.to_str()).unwrap_or("");
    let mut pdf_source: PathBuf = src_path.to_path_buf();

    if ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("qmd") {
        // Export (compile) to sibling PDF, then copy that
        match renderer::export_markdown(&app_handle, file_path).await {
            Ok(p) => pdf_source = PathBuf::from(p),
            Err(e) => return Err(e.to_string()),
        }
    } else if ext.eq_ignore_ascii_case("pdf") {
        // Using PDF directly
    } else {
        return Err("Unsupported source file type for save_pdf_as".into());
    }

    if !pdf_source.exists() {
        return Err(format!("Source PDF does not exist: {}", pdf_source.display()));
    }

    // Ensure destination directory exists
    if let Some(parent) = dest_path.parent() {
        if let Err(e) = fs::create_dir_all(parent) { return Err(e.to_string()); }
    }

    fs::copy(&pdf_source, &dest_path).map_err(|e| e.to_string())?;
    Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn render_typst(
    app_handle: AppHandle,
    content: &str,
    format: &str,
) -> Result<String, String> {
    match renderer::render_typst(&app_handle, content, format).await {
        Ok(output_path) => {
            // Emit the compiled event with the output path
            let _ = app_handle.emit("compiled", &output_path);
            Ok(output_path)
        }
        Err(e) => {
            // Emit compile error event
            let _ = app_handle.emit("compile-error", e.to_string());
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn typst_diagnostics(app_handle: AppHandle) -> Result<TypstDiagnostics, String> {
    let mut attempted_paths: Vec<String> = Vec::new();
    let (detected, err_msg) = match utils::get_typst_path(&app_handle) {
        Ok(p) => (Some(p.display().to_string()), None),
        Err(e) => (None, Some(e.to_string()))
    };
    
    if detected.is_none() {
        // Reconstruct attempted paths like utils does
        if let Ok(app_dir) = utils::get_app_dir(&app_handle) {
            let platform_dir = if cfg!(target_os = "windows") { "windows" } else if cfg!(target_os = "macos") { "macos" } else { "linux" };
            let platform_base = app_dir.join("bin").join("typst").join(platform_dir);
            if cfg!(target_os = "windows") {
                attempted_paths.push(platform_base.join("typst.exe").display().to_string());
            } else {
                attempted_paths.push(platform_base.join("typst").display().to_string());
            }
        }
    }

    Ok(TypstDiagnostics {
        detected_binary: detected,
        attempted_binary_paths: attempted_paths,
        error: err_msg,
    })
}

#[derive(Debug, Serialize)]
pub struct CacheStats {
    cached_documents: usize,
    cache_size_mb: f64,
    cache_hits: usize,
    cache_misses: usize,
}

/// Get render cache statistics
#[tauri::command]
pub async fn get_cache_stats(app_handle: AppHandle) -> Result<CacheStats, String> {
    let content_dir = utils::get_content_dir(&app_handle)
        .map_err(|e| format!("Failed to get content directory: {}", e))?;
    let build_dir = content_dir.join(".build");
    
    let mut cached_documents = 0;
    let mut cache_size_mb = 0.0;
    
    if build_dir.exists() {
        if let Ok(entries) = fs::read_dir(&build_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.file_name()
                    .and_then(|name| name.to_str())
                    .map(|name| name.starts_with("cached_"))
                    .unwrap_or(false) {
                    cached_documents += 1;
                    if let Ok(metadata) = fs::metadata(&path) {
                        cache_size_mb += metadata.len() as f64 / (1024.0 * 1024.0);
                    }
                }
            }
        }
    }
    
    Ok(CacheStats {
        cached_documents,
        cache_size_mb,
        cache_hits: 0, // Basic cache - no hit/miss tracking for now
        cache_misses: 0,
    })
}

/// Clear render cache
#[tauri::command]
pub async fn clear_render_cache(app_handle: AppHandle) -> Result<(), String> {
    let content_dir = utils::get_content_dir(&app_handle)
        .map_err(|e| format!("Failed to get content directory: {}", e))?;
    let build_dir = content_dir.join(".build");
    
    if build_dir.exists() {
        if let Ok(entries) = fs::read_dir(&build_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.file_name()
                    .and_then(|name| name.to_str())
                    .map(|name| name.starts_with("cached_"))
                    .unwrap_or(false) {
                    let _ = fs::remove_file(&path);
                }
            }
        }
    }
    
    println!("🧹 Render cache cleared");
    Ok(())
}

#[derive(Debug, Serialize)]
pub struct DebugPathsResponse {
    content_dir: String,
    build_dir: String,
    prefs_path: String,
    build_prefs_path: String,
    prefs_json: serde_json::Value,
    build_prefs_json: Option<serde_json::Value>,
}

/// Debug helper: inspect where preferences are stored and what the renderer likely used last.
#[tauri::command]
pub async fn debug_paths(app_handle: AppHandle) -> Result<DebugPathsResponse, String> {
    let content_dir = utils::get_content_dir(&app_handle)
        .map_err(|e| e.to_string())?;
    let build_dir = content_dir.join(".build");
    let prefs_path = content_dir.join("prefs.json");
    let build_prefs_path = build_dir.join("prefs.json");

    // Load current logical preferences via API (source of truth at time of call)
    let prefs_struct = preferences::get_preferences(app_handle.clone()).await
        .map_err(|e| e)?;
    let prefs_json = serde_json::to_value(&prefs_struct)
        .map_err(|e| e.to_string())?;

    // Attempt to read build prefs (may not exist if no render yet)
    let build_prefs_json = if build_prefs_path.exists() {
        match std::fs::read_to_string(&build_prefs_path) {
            Ok(txt) => serde_json::from_str(&txt).ok(),
            Err(_) => None,
        }
    } else { None };

    Ok(DebugPathsResponse {
        content_dir: content_dir.to_string_lossy().to_string(),
        build_dir: build_dir.to_string_lossy().to_string(),
        prefs_path: prefs_path.to_string_lossy().to_string(),
        build_prefs_path: build_prefs_path.to_string_lossy().to_string(),
        prefs_json,
        build_prefs_json,
    })
}

#[derive(Debug, Serialize)]
pub struct RuntimeFilesResponse {
    prefs_json_raw: Option<String>,
    template_raw: Option<String>,
    prefs_path: String,
    template_path: String,
}

#[tauri::command]
pub async fn get_runtime_files(app_handle: AppHandle) -> Result<RuntimeFilesResponse, String> {
    let content_dir = utils::get_content_dir(&app_handle).map_err(|e| e.to_string())?;
    let prefs_path = content_dir.join("prefs.json");
    let template_path = content_dir.join("tideflow.typ");
    let prefs_json_raw = std::fs::read_to_string(&prefs_path).ok();
    let template_raw = std::fs::read_to_string(&template_path).ok();
    Ok(RuntimeFilesResponse {
        prefs_json_raw,
        template_raw,
        prefs_path: prefs_path.to_string_lossy().to_string(),
        template_path: template_path.to_string_lossy().to_string(),
    })
}
