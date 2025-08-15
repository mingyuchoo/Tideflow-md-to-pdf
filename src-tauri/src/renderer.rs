use crate::utils;
use crate::preferences;
use anyhow::{anyhow, Context, Result};
use std::fs;
use std::path::Path;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use std::sync::Arc;
use std::time::SystemTime;
use std::hash::{Hash, Hasher};
use std::collections::hash_map::DefaultHasher;

// A global mutex to ensure only one render happens at a time
lazy_static::lazy_static! {
    static ref RENDER_MUTEX: Arc<Mutex<()>> = Arc::new(Mutex::new(()));
}

// Map of file paths to last modification time to avoid duplicate renders
lazy_static::lazy_static! {
    static ref LAST_RENDER_TIMES: Arc<Mutex<std::collections::HashMap<String, SystemTime>>> = 
        Arc::new(Mutex::new(std::collections::HashMap::new()));
}

/// Renders a Markdown file to PDF using Typst
pub async fn render_markdown(app_handle: &AppHandle, file_path: &str) -> Result<String> {
    let path = Path::new(file_path);
    
    // Only render markdown files
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    if ext != "md" && ext != "qmd" {
        return Err(anyhow!("Not a markdown file: {}", file_path));
    }

    if !path.exists() {
        return Err(anyhow!("File does not exist: {}", file_path));
    }
    
    // Acquire render lock to prevent multiple simultaneous renders
    let _lock = RENDER_MUTEX.lock().await;
    
    // Check if file has been modified since last render
    let metadata = fs::metadata(file_path)?;
    let mod_time = metadata.modified()?;
    
    let mut last_render_times = LAST_RENDER_TIMES.lock().await;
    
    if let Some(last_time) = last_render_times.get(file_path) {
        if *last_time >= mod_time {
            // File hasn't been modified, return the existing PDF path
            return get_pdf_path(file_path);
        }
    }
    
    // Use Typst to render for preview
    let content_dir = utils::get_content_dir(app_handle)?;
    let build_dir = content_dir.join(".build");
    fs::create_dir_all(&build_dir)?;

    // 1) Get preferences and write prefs.json for the template
    let prefs = preferences::get_preferences(app_handle.clone()).await
        .map_err(|e| anyhow!("Failed to get preferences: {}", e))?;
    let prefs_json = serde_json::to_string_pretty(&prefs)?;
    fs::write(build_dir.join("prefs.json"), prefs_json)?;

    // 2) Copy the markdown content to build/content.md
    let md_content = fs::read_to_string(path)?;
    fs::write(build_dir.join("content.md"), md_content)?;

    // 3) Ensure tideflow.typ is available in build directory
    let template_src = content_dir.join("tideflow.typ");
    let template_dst = build_dir.join("tideflow.typ");
    if template_src.exists() {
        fs::copy(&template_src, &template_dst)?;
    } else {
        return Err(anyhow!("tideflow.typ template not found at {}", template_src.display()));
    }

    // 4) Get bundled Typst binary path
    let typst_path = utils::get_typst_path(app_handle)
        .context("Typst binary not found. Download and place Typst binary in bin/typst/<platform>/ directory.")?;

    // 5) Compile preview PDF
    let preview_pdf = build_dir.join("preview.pdf");
    let status = Command::new(&typst_path)
        .current_dir(&build_dir)
        .args(["compile", "tideflow.typ", "preview.pdf"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .status()?;

    if !status.success() {
        let output = Command::new(&typst_path)
            .current_dir(&build_dir)
            .args(["compile", "tideflow.typ", "preview.pdf"])
            .output()?;
        
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        
        return Err(anyhow!(
            "Typst compile failed (status {}).\nSTDOUT:\n{}\nSTDERR:\n{}",
            status,
            stdout.trim(),
            stderr.trim()
        ));
    }

    if !preview_pdf.exists() {
        return Err(anyhow!("Typst compile completed but PDF missing at {}", preview_pdf.display()));
    }

    // Update last render time
    last_render_times.insert(file_path.to_string(), mod_time);

    // Emit absolute path of preview.pdf to UI
    app_handle.emit("compiled", preview_pdf.to_string_lossy().to_string()).ok();

    Ok(preview_pdf.to_string_lossy().to_string())
}

/// Export markdown to final PDF location using Typst
pub async fn export_markdown(app_handle: &AppHandle, file_path: &str) -> Result<String> {
    let path = Path::new(file_path);
    
    // Only export markdown files
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    if ext != "md" && ext != "qmd" {
        return Err(anyhow!("Not a markdown file: {}", file_path));
    }

    if !path.exists() {
        return Err(anyhow!("File does not exist: {}", file_path));
    }
    
    // Acquire render lock to prevent multiple simultaneous renders
    let _lock = RENDER_MUTEX.lock().await;
    
    // Setup similar to preview, but write to final path next to source
    let content_dir = utils::get_content_dir(app_handle)?;
    let build_dir = content_dir.join(".build");
    fs::create_dir_all(&build_dir)?;

    // 1) Get preferences and write prefs.json for the template
    let prefs = preferences::get_preferences(app_handle.clone()).await
        .map_err(|e| anyhow!("Failed to get preferences: {}", e))?;
    let prefs_json = serde_json::to_string_pretty(&prefs)?;
    fs::write(build_dir.join("prefs.json"), prefs_json)?;

    // 2) Copy the markdown content to build/content.md
    let md_content = fs::read_to_string(path)?;
    fs::write(build_dir.join("content.md"), md_content)?;

    // 3) Ensure tideflow.typ is available in build directory
    let template_src = content_dir.join("tideflow.typ");
    let template_dst = build_dir.join("tideflow.typ");
    if template_src.exists() {
        fs::copy(&template_src, &template_dst)?;
    } else {
        return Err(anyhow!("tideflow.typ template not found at {}", template_src.display()));
    }

    // 4) Get bundled Typst binary path
    let typst_path = utils::get_typst_path(app_handle)
        .context("Typst binary not found. Download and place Typst binary in bin/typst/<platform>/ directory.")?;

    // 5) Compile to final PDF next to source file
    let final_pdf = Path::new(file_path).with_extension("pdf");
    let status = Command::new(&typst_path)
        .current_dir(&build_dir)
        .args(["compile", "tideflow.typ", final_pdf.to_string_lossy().as_ref()])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .status()?;

    if !status.success() {
        let output = Command::new(&typst_path)
            .current_dir(&build_dir)
            .args(["compile", "tideflow.typ", final_pdf.to_string_lossy().as_ref()])
            .output()?;
        
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        
        return Err(anyhow!(
            "Typst export failed (status {}).\nSTDOUT:\n{}\nSTDERR:\n{}",
            status,
            stdout.trim(),
            stderr.trim()
        ));
    }

    if !final_pdf.exists() {
        return Err(anyhow!("Typst export completed but PDF missing at {}", final_pdf.display()));
    }

    // Emit absolute path of final PDF to UI
    app_handle.emit("exported", final_pdf.to_string_lossy().to_string()).ok();

    Ok(final_pdf.to_string_lossy().to_string())
}

/// Renders Typst content directly to PDF (always full render)
pub async fn render_typst(app_handle: &AppHandle, content: &str, format: &str) -> Result<String> {
    // Simple content-based caching for identical documents
    let content_hash = calculate_content_hash(content);
    let content_dir = utils::get_content_dir(app_handle)?;
    let build_dir = content_dir.join(".build");
    
    // Check for existing cached output with same content hash
    let cached_file_name = format!("cached_{}_{}.{}", content_hash, format, 
        match format {
            "pdf" => "pdf",
            "html" => "html",
            "docx" => "docx",
            _ => "pdf",
        });
    let cached_path = build_dir.join(&cached_file_name);
    
    if cached_path.exists() {
        println!("📋 Using cached render for identical content (hash: {})", content_hash);
        return Ok(cached_path.to_string_lossy().to_string());
    }

    // Acquire render lock to prevent multiple simultaneous renders
    let _lock = RENDER_MUTEX.lock().await;
    
    // Get path to Typst binary (fail fast if missing)
    let typst_path = utils::get_typst_path(app_handle)
        .context("Typst binary not found. Download and place Typst binary in bin/typst/<platform>/ directory.")?;
    
    // Create .build directory if it doesn't exist
    let content_dir = utils::get_content_dir(app_handle)?;
    let build_dir = content_dir.join(".build");
    fs::create_dir_all(&build_dir)?;
    
    // Create a temporary content file
    let uuid = uuid::Uuid::new_v4();
    let temp_content_name = format!("temp_{}.md", uuid);
    let temp_content_path = build_dir.join(&temp_content_name);
    
    // Write the content to temporary markdown file
    fs::write(&temp_content_path, content)?;
    
    // Get preferences and write prefs.json
    let prefs = preferences::get_preferences(app_handle.clone()).await
        .map_err(|e| anyhow!("Failed to get preferences: {}", e))?;
    let prefs_json = serde_json::to_string_pretty(&prefs)?;
    fs::write(build_dir.join("prefs.json"), prefs_json)?;

    // Ensure the content is available as content.md (required by template)
    fs::copy(&temp_content_path, build_dir.join("content.md"))?;

    // Ensure tideflow.typ is available in build directory
    let template_src = content_dir.join("tideflow.typ");
    let template_dst = build_dir.join("tideflow.typ");
    if template_src.exists() {
        fs::copy(&template_src, &template_dst)?;
    } else {
        return Err(anyhow!("tideflow.typ template not found at {}", template_src.display()));
    }
    
    // Determine output file extension based on format (Typst only supports PDF for now)
    let output_ext = "pdf"; // Typst primarily outputs PDF
    let output_file_name = format!("temp_{}.{}", uuid, output_ext);
    let output_path = build_dir.join(&output_file_name);
    
    // Run Typst to compile the file
    let output = Command::new(&typst_path)
        .current_dir(&build_dir)
        .args(["compile", "tideflow.typ", &output_file_name])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .context("Failed to execute Typst command")?;

    // Clean up the temporary content file
    let _ = fs::remove_file(&temp_content_path);

    if !output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        
        return Err(anyhow!(
            "Typst compilation failed (status exit code: {}).\nSTDOUT:\n{}\nSTDERR:\n{}",
            output.status.code().unwrap_or(-1),
            stdout,
            stderr
        ));
    }

    // Check if output was created
    if !output_path.exists() {
        return Err(anyhow!("Output file was not created: {}", output_path.display()));
    }
    
    // Create cached copy for future reuse
    let hash = calculate_content_hash(content);
    let cached_file_name = format!("cached_{}_{}.{}", hash, format, output_ext);
    let cached_path = build_dir.join(&cached_file_name);
    
    // Copy output to cached location
    if let Err(e) = fs::copy(&output_path, &cached_path) {
        println!("⚠️ Warning: Failed to create cache copy: {}", e);
    } else {
        println!("💾 Cached render result as: {}", cached_file_name);
    }

    Ok(output_path.to_string_lossy().to_string())
}

/// Get the output PDF path for a file
pub fn get_pdf_path(file_path: &str) -> Result<String> {
    let path = Path::new(file_path);
    let file_stem = path.file_stem()
        .ok_or_else(|| anyhow!("Cannot determine file name"))?
        .to_string_lossy();
    
    let parent = path.parent()
        .ok_or_else(|| anyhow!("Cannot determine parent directory"))?;
    
    let pdf_path = parent.join(format!("{}.pdf", file_stem));
    
    Ok(pdf_path.to_string_lossy().to_string())
}

/// Calculate a hash of content for caching
fn calculate_content_hash(content: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    content.hash(&mut hasher);
    hasher.finish()
}
