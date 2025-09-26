use crate::preprocessor::{
    attach_pdf_positions, pdf_positions_from_query, preprocess_markdown, AnchorMeta, PdfPosition,
    SourceMapPayload,
};
use crate::utils;
use anyhow::{anyhow, Context, Result};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::time::SystemTime;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

#[derive(Debug, Serialize)]
pub struct RenderedDocument {
    pub pdf_path: String,
    pub source_map: SourceMapPayload,
}

// A global mutex to ensure only one render happens at a time
lazy_static::lazy_static! {
    static ref RENDER_MUTEX: Arc<Mutex<()>> = Arc::new(Mutex::new(()));
}

// Map of file paths to last modification time to avoid duplicate renders
lazy_static::lazy_static! {
    static ref LAST_RENDER_TIMES: Arc<Mutex<std::collections::HashMap<String, SystemTime>>> =
        Arc::new(Mutex::new(std::collections::HashMap::new()));
}

/// Ensure a required cmarker asset exists in the user's Typst package cache on Windows.
/// Some environments end up with an incomplete package cache missing `assets/camkale.png`,
/// which causes markdown rendering to fail. We synthesize a tiny 1x1 PNG placeholder.
fn ensure_cmarker_asset_camkale_png() {
    #[cfg(target_os = "windows")]
    {
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            let assets_dir = std::path::Path::new(&local)
                .join("typst")
                .join("packages")
                .join("preview")
                .join("cmarker")
                .join("0.1.6")
                .join("assets");
            let target = assets_dir.join("camkale.png");
            if !target.exists() {
                let _ = std::fs::create_dir_all(&assets_dir);
                // Minimal valid 1x1 PNG (transparent)
                let png_bytes: [u8; 67] = [
                    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49,
                    0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
                    0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44,
                    0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D,
                    0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42,
                    0x60, 0x82,
                ];
                if let Ok(mut f) = std::fs::File::create(&target) {
                    let _ = f.write_all(&png_bytes);
                }
            }
        }
    }
}

fn copy_directory(src: &Path, dst: &Path) -> Result<()> {
    if dst.exists() {
        fs::remove_dir_all(dst)?;
    }
    fs::create_dir_all(dst)?;

    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let dest_path = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_directory(&path, &dest_path)?;
        } else {
            fs::copy(&path, &dest_path)?;
        }
    }

    Ok(())
}

fn sync_theme_assets(template_src: &Path, build_dir: &Path) -> Result<()> {
    if let Some(parent) = template_src.parent() {
        let themes_src = parent.join("themes");
        if themes_src.exists() {
            let themes_dst = build_dir.join("themes");
            copy_directory(&themes_src, &themes_dst)?;
        }
    }
    Ok(())
}

fn build_source_map(
    typst_path: &Path,
    build_dir: &Path,
    content_dir: &Path,
    anchors: &[AnchorMeta],
) -> SourceMapPayload {
    if anchors.is_empty() {
        return SourceMapPayload::default();
    }

    let mut pdf_lookup: HashMap<String, PdfPosition> = HashMap::new();
    let root_arg = content_dir.to_string_lossy().to_string();
    let query_result = Command::new(typst_path)
        .current_dir(build_dir)
        .args([
            "query",
            "--format",
            "json",
            "--root",
            root_arg.as_str(),
            "tideflow.typ",
            "label()",
        ])
        .output();

    if let Ok(output) = query_result {
        if output.status.success() {
            if let Ok(map) = pdf_positions_from_query(&output.stdout) {
                pdf_lookup = map;
            }
        }
    }

    attach_pdf_positions(anchors, &pdf_lookup)
}

/// Renders a Markdown file to PDF using Typst
pub async fn render_markdown(app_handle: &AppHandle, file_path: &str) -> Result<RenderedDocument> {
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

    // NOTE: Removed optimization that skipped rendering when file timestamp unchanged.
    // Preferences can change without touching the markdown file; we still need a fresh render.
    let mut last_render_times = LAST_RENDER_TIMES.lock().await;

    // Use Typst to render for preview
    let content_dir = utils::get_content_dir(app_handle)?;
    let build_dir = content_dir.join(".build");
    fs::create_dir_all(&build_dir)?;

    // 1) Get preferences and write prefs.json for the template
    // Copy canonical prefs.json into build directory (single source of truth)
    let canonical_prefs = utils::get_content_dir(app_handle)?.join("prefs.json");
    if canonical_prefs.exists() {
        std::fs::copy(&canonical_prefs, build_dir.join("prefs.json"))?;
        if let Ok(txt) = std::fs::read_to_string(&canonical_prefs) {
            app_handle.emit("prefs-dump", &txt).ok();
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&txt) {
                let toc_flag = val.get("toc").and_then(|v| v.as_bool()).unwrap_or(true);
                let num_flag = val
                    .get("numberSections")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true);
                let dbg = serde_json::json!({
                    "path_type": "markdown",
                    "toc": toc_flag,
                    "numberSections": num_flag,
                    "papersize": val.get("papersize"),
                    "timestamp": chrono::Utc::now().to_rfc3339(),
                });
                app_handle.emit("render-debug", dbg).ok();
            }
        }
    }

    // 2) Copy the markdown content to build/content.md (with preprocessing + image path rewrites)
    let md_content_raw = fs::read_to_string(path)?;
    let preprocess = preprocess_markdown(&md_content_raw)?;
    let base_dir = path.parent().unwrap_or(Path::new("."));
    // Resolve assets/ paths to the global content/assets directory so images work from any doc folder
    let assets_root = utils::get_assets_dir(app_handle).ok();
    let assets_root_ref = assets_root.as_deref();
    let md_content =
        utils::rewrite_image_paths_in_markdown(&preprocess.markdown, base_dir, assets_root_ref);
    fs::write(build_dir.join("content.md"), &md_content)?;

    // 3) Ensure tideflow.typ is available in build directory
    // Prefer workspace template during dev, fall back to user content template
    let template_src = if let Ok(cwd) = std::env::current_dir() {
        let dev_tpl = cwd.join("src-tauri").join("content").join("tideflow.typ");
        if dev_tpl.exists() {
            dev_tpl
        } else {
            content_dir.join("tideflow.typ")
        }
    } else {
        content_dir.join("tideflow.typ")
    };
    let template_dst = build_dir.join("tideflow.typ");
    if template_src.exists() {
        fs::copy(&template_src, &template_dst)?;
        sync_theme_assets(&template_src, &build_dir)?;
        if let Ok(tpl_txt) = fs::read_to_string(&template_src) {
            let snippet: String = tpl_txt.chars().take(400).collect();
            let has_conditional = tpl_txt.contains("#if prefs.toc");
            let evt = serde_json::json!({
                "path_type": "markdown",
                "template_path": template_src.to_string_lossy(),
                "has_conditional": has_conditional,
                "snippet": snippet,
                "timestamp": chrono::Utc::now().to_rfc3339()
            });
            app_handle.emit("template-inspect", evt).ok();
            if !has_conditional {
                let warn = serde_json::json!({
                    "warning": "Template missing '#if prefs.toc' conditional; TOC will always show.",
                    "template_path": template_src.to_string_lossy(),
                    "timestamp": chrono::Utc::now().to_rfc3339()
                });
                app_handle.emit("template-warning", warn).ok();
            }
        }
    } else {
        return Err(anyhow!(
            "tideflow.typ template not found at {}",
            template_src.display()
        ));
    }

    // 4) Get bundled Typst binary path
    let typst_path = utils::get_typst_path(app_handle)
        .context("Typst binary not found. Download and place Typst binary in bin/typst/<platform>/ directory.")?;

    // 5) Compile preview PDF
    // Work around missing cmarker asset on some systems
    ensure_cmarker_asset_camkale_png();
    let preview_pdf = build_dir.join("preview.pdf");
    let status = Command::new(&typst_path)
        .current_dir(&build_dir)
        .args([
            "compile",
            "--root",
            content_dir.to_string_lossy().as_ref(),
            "tideflow.typ",
            "preview.pdf",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .status()?;

    if !status.success() {
        let output = Command::new(&typst_path)
            .current_dir(&build_dir)
            .args([
                "compile",
                "--root",
                content_dir.to_string_lossy().as_ref(),
                "tideflow.typ",
                "preview.pdf",
            ])
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
        return Err(anyhow!(
            "Typst compile completed but PDF missing at {}",
            preview_pdf.display()
        ));
    }

    // Update last render time
    last_render_times.insert(file_path.to_string(), mod_time);

    let source_map = build_source_map(&typst_path, &build_dir, &content_dir, &preprocess.anchors);
    let document = RenderedDocument {
        pdf_path: preview_pdf.to_string_lossy().to_string(),
        source_map,
    };

    Ok(document)
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
    let canonical_prefs = utils::get_content_dir(app_handle)?.join("prefs.json");
    if canonical_prefs.exists() {
        std::fs::copy(&canonical_prefs, build_dir.join("prefs.json"))?;
        if let Ok(txt) = std::fs::read_to_string(&canonical_prefs) {
            app_handle.emit("prefs-dump", txt).ok();
        }
    }

    // 2) Copy the markdown content to build/content.md (with image path rewrites)
    let md_content_raw = fs::read_to_string(path)?;
    let base_dir = path.parent().unwrap_or(Path::new("."));
    let assets_root = utils::get_assets_dir(app_handle).ok();
    let assets_root_ref = assets_root.as_deref();
    let preprocess = preprocess_markdown(&md_content_raw)?;
    let md_content =
        utils::rewrite_image_paths_in_markdown(&preprocess.markdown, base_dir, assets_root_ref);
    fs::write(build_dir.join("content.md"), md_content)?;

    // 3) Ensure tideflow.typ is available in build directory
    let template_src = if let Ok(cwd) = std::env::current_dir() {
        let dev_tpl = cwd.join("src-tauri").join("content").join("tideflow.typ");
        if dev_tpl.exists() {
            dev_tpl
        } else {
            content_dir.join("tideflow.typ")
        }
    } else {
        content_dir.join("tideflow.typ")
    };
    let template_dst = build_dir.join("tideflow.typ");
    if template_src.exists() {
        fs::copy(&template_src, &template_dst)?;
        sync_theme_assets(&template_src, &build_dir)?;
    } else {
        return Err(anyhow!(
            "tideflow.typ template not found at {}",
            template_src.display()
        ));
    }

    // 4) Get bundled Typst binary path
    let typst_path = utils::get_typst_path(app_handle)
        .context("Typst binary not found. Download and place Typst binary in bin/typst/<platform>/ directory.")?;

    // 5) Compile to final PDF next to source file
    // Work around missing cmarker asset on some systems
    ensure_cmarker_asset_camkale_png();
    let final_pdf = Path::new(file_path).with_extension("pdf");
    let status = Command::new(&typst_path)
        .current_dir(&build_dir)
        .args([
            "compile",
            "--root",
            content_dir.to_string_lossy().as_ref(),
            "tideflow.typ",
            final_pdf.to_string_lossy().as_ref(),
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .status()?;

    if !status.success() {
        let output = Command::new(&typst_path)
            .current_dir(&build_dir)
            .args([
                "compile",
                "--root",
                content_dir.to_string_lossy().as_ref(),
                "tideflow.typ",
                final_pdf.to_string_lossy().as_ref(),
            ])
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
        return Err(anyhow!(
            "Typst export completed but PDF missing at {}",
            final_pdf.display()
        ));
    }

    // Emit absolute path of final PDF to UI
    app_handle
        .emit("exported", final_pdf.to_string_lossy().to_string())
        .ok();

    Ok(final_pdf.to_string_lossy().to_string())
}

/// Renders Typst content directly to PDF (always full render)
pub async fn render_typst(
    app_handle: &AppHandle,
    content: &str,
    _format: &str,
) -> Result<RenderedDocument> {
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

    // Preprocess content to rewrite image paths so Typst/cmarker can resolve them properly
    let preprocess = preprocess_markdown(content)?;
    let base_dir = &content_dir; // live preview has no specific file path; use content root
    let assets_root = utils::get_assets_dir(app_handle).ok();
    let assets_root_ref = assets_root.as_deref();
    let processed = utils::rewrite_image_paths_in_markdown(
        &preprocess.markdown,
        base_dir.as_path(),
        assets_root_ref,
    );
    fs::write(&temp_content_path, &processed)?;

    // Copy canonical prefs.json (single source of truth) & emit dump
    let canonical_prefs = content_dir.join("prefs.json");
    if canonical_prefs.exists() {
        fs::copy(&canonical_prefs, build_dir.join("prefs.json"))?;
        if let Ok(txt) = fs::read_to_string(&canonical_prefs) {
            // Emit prefs-dump without moving the String so we can still parse it
            app_handle.emit("prefs-dump", &txt).ok();
            // Emit render-debug event for tracing toc issues
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&txt) {
                let toc_flag = val.get("toc").and_then(|v| v.as_bool()).unwrap_or(true);
                let num_flag = val
                    .get("numberSections")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true);
                let dbg = serde_json::json!({
                    "path_type": "typst-temp",
                    "toc": toc_flag,
                    "numberSections": num_flag,
                    "papersize": val.get("papersize"),
                    "timestamp": chrono::Utc::now().to_rfc3339(),
                });
                app_handle.emit("render-debug", dbg).ok();
            }
        }
    }

    // Ensure the content is available as content.md (required by template)
    fs::copy(&temp_content_path, build_dir.join("content.md"))?;

    // Ensure tideflow.typ is available in build directory
    let template_src = if let Ok(cwd) = std::env::current_dir() {
        let dev_tpl = cwd.join("src-tauri").join("content").join("tideflow.typ");
        if dev_tpl.exists() {
            dev_tpl
        } else {
            content_dir.join("tideflow.typ")
        }
    } else {
        content_dir.join("tideflow.typ")
    };
    let template_dst = build_dir.join("tideflow.typ");
    if template_src.exists() {
        fs::copy(&template_src, &template_dst)?;
        sync_theme_assets(&template_src, &build_dir)?;
        if let Ok(tpl_txt) = fs::read_to_string(&template_src) {
            let snippet: String = tpl_txt.chars().take(400).collect();
            let has_conditional = tpl_txt.contains("#if prefs.toc");
            let evt = serde_json::json!({
                "path_type": "typst-temp",
                "template_path": template_src.to_string_lossy(),
                "has_conditional": has_conditional,
                "snippet": snippet,
                "timestamp": chrono::Utc::now().to_rfc3339()
            });
            app_handle.emit("template-inspect", evt).ok();
            if !has_conditional {
                let warn = serde_json::json!({
                    "warning": "Template missing '#if prefs.toc' conditional; TOC will always show.",
                    "template_path": template_src.to_string_lossy(),
                    "timestamp": chrono::Utc::now().to_rfc3339()
                });
                app_handle.emit("template-warning", warn).ok();
            }
        }
    } else {
        return Err(anyhow!(
            "tideflow.typ template not found at {}",
            template_src.display()
        ));
    }

    // Determine output file extension based on format (Typst only supports PDF for now)
    let output_ext = "pdf"; // Typst primarily outputs PDF
    let output_file_name = format!("temp_{}.{}", uuid, output_ext);
    let output_path = build_dir.join(&output_file_name);

    // Run Typst to compile the file
    // Work around missing cmarker asset on some systems
    ensure_cmarker_asset_camkale_png();
    let output = Command::new(&typst_path)
        .current_dir(&build_dir)
        .args([
            "compile",
            "--root",
            content_dir.to_string_lossy().as_ref(),
            "tideflow.typ",
            &output_file_name,
        ])
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
        return Err(anyhow!(
            "Output file was not created: {}",
            output_path.display()
        ));
    }

    let source_map = build_source_map(&typst_path, &build_dir, &content_dir, &preprocess.anchors);
    Ok(RenderedDocument {
        pdf_path: output_path.to_string_lossy().to_string(),
        source_map,
    })
}
