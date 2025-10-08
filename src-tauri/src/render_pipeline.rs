/// Shared rendering pipeline utilities to eliminate duplication across render
/// functions.
///
/// This module extracts common setup logic for preferences, templates, assets,
/// and Typst compilation that was previously duplicated 3x across
/// render_markdown, export_markdown, and render_typst functions.
use crate::utils;
use anyhow::{Result, anyhow};
use serde_json::Value as JsonValue;
use std::fs;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};

/// Configuration for a render operation
pub struct RenderConfig<'a> {
    pub app_handle: &'a AppHandle,
    pub build_dir: PathBuf,
    pub content_dir: PathBuf, // App's content directory (for templates/prefs)
    pub typst_root: PathBuf,  // Root directory for Typst compilation
}

/// Result of preferences setup including updated JSON value
#[allow(dead_code)]
pub struct PrefsSetupResult {
    pub prefs_json: JsonValue,
}

/// Ensures the cmarker asset exists (Windows-only workaround for incomplete
/// package cache)
pub fn ensure_cmarker_asset() {
    #[cfg(target_os = "windows")]
    {
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            let assets_dir = Path::new(&local)
                .join("typst")
                .join("packages")
                .join("preview")
                .join("cmarker")
                .join("0.1.6")
                .join("assets");
            let target = assets_dir.join("camkale.png");
            if !target.exists() {
                let _ = fs::create_dir_all(&assets_dir);
                // Minimal valid 1x1 PNG (transparent)
                let png_bytes: [u8; 67] = [
                    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
                    0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01,
                    0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
                ];
                if let Ok(mut f) = fs::File::create(&target) {
                    use std::io::Write;
                    let _ = f.write_all(&png_bytes);
                }
            }
        }
    }
}

/// Helper to create a Command for Typst with Windows-specific flags to suppress
/// console window
pub fn typst_command<S: AsRef<std::ffi::OsStr>>(exe: S) -> Command {
    let cmd = Command::new(exe);
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Recursively copy a directory
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

/// Sync theme assets from template source to build directory
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

/// Detect actual image format by reading file header (magic bytes).
/// Returns the correct extension for the detected format.
fn detect_image_format(path: &Path) -> Result<Option<&'static str>> {
    use std::io::Read;

    let mut file = fs::File::open(path)?;
    let mut header = [0u8; 12];
    let bytes_read = file.read(&mut header)?;

    if bytes_read < 4 {
        return Ok(None);
    }

    // PNG: 89 50 4E 47
    if header[0 .. 4] == [0x89, 0x50, 0x4E, 0x47] {
        return Ok(Some("png"));
    }

    // JPEG: FF D8 FF
    if header[0 .. 3] == [0xFF, 0xD8, 0xFF] {
        return Ok(Some("jpg"));
    }

    // GIF: 47 49 46
    if header[0 .. 3] == [0x47, 0x49, 0x46] {
        return Ok(Some("gif"));
    }

    // WebP: RIFF....WEBP
    if bytes_read >= 12 && header[0 .. 4] == [0x52, 0x49, 0x46, 0x46] && header[8 .. 12] == [0x57, 0x45, 0x42, 0x50] {
        return Ok(Some("webp"));
    }

    // BMP: 42 4D
    if header[0 .. 2] == [0x42, 0x4D] {
        return Ok(Some("bmp"));
    }

    Ok(None)
}

/// Handle cover image path rewriting and copying to assets directory.
/// Returns the updated prefs JSON value with cover_image path rewritten if
/// necessary.
fn handle_cover_image(prefs_val: &mut JsonValue, app_handle: &AppHandle) -> Result<()> {
    if let Some(ci) = prefs_val.get("cover_image").and_then(|v| v.as_str()) {
        if !ci.is_empty() && !ci.starts_with("/assets/") {
            let mut img_path = PathBuf::from(ci);
            if !img_path.is_absolute() {
                let maybe = utils::get_content_dir(app_handle)?.join(&img_path);
                if maybe.exists() {
                    img_path = maybe;
                }
            }
            if img_path.exists() {
                let assets_dir = utils::get_assets_dir(app_handle)?;

                // Detect actual image format and correct extension if needed
                let detected_ext = detect_image_format(&img_path)?;

                let _original_fname = img_path.file_name().unwrap().to_string_lossy();
                let stem = img_path
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| "image".to_string());

                // Use detected extension if available, otherwise keep original
                let correct_ext = if let Some(ext) = detected_ext {
                    ext
                } else {
                    img_path.extension().and_then(|e| e.to_str()).unwrap_or("jpg")
                };

                let mut fname = utils::sanitize_filename(&format!("{}.{}", stem, correct_ext));
                let mut dest = assets_dir.join(&fname);

                // Deduplicate if necessary
                let mut counter: u32 = 1;
                while dest.exists() {
                    fname = utils::sanitize_filename(&format!("{}-{}.{}", stem, counter, correct_ext));
                    dest = assets_dir.join(&fname);
                    counter += 1;
                    if counter > 1000 {
                        break;
                    }
                }

                fs::copy(&img_path, &dest)?;
                prefs_val["cover_image"] = JsonValue::String(format!("/assets/{}", fname));
            }
        }
    }
    Ok(())
}

/// Setup preferences for rendering: read canonical prefs.json, handle cover
/// image, write to build directory, and emit debug events.
pub fn setup_prefs(config: &RenderConfig, path_type: &str) -> Result<PrefsSetupResult> {
    let canonical_prefs = config.content_dir.join("prefs.json");

    let mut prefs_val = if canonical_prefs.exists() {
        let txt = fs::read_to_string(&canonical_prefs)?;
        config.app_handle.emit("prefs-dump", &txt).ok();
        serde_json::from_str::<JsonValue>(&txt)?
    } else {
        JsonValue::Object(serde_json::Map::new())
    };

    // Handle cover image rewriting
    handle_cover_image(&mut prefs_val, config.app_handle)?;

    // Emit render-debug event
    let toc_flag = prefs_val.get("toc").and_then(|v| v.as_bool()).unwrap_or(true);
    let num_flag = prefs_val.get("numberSections").and_then(|v| v.as_bool()).unwrap_or(true);
    let dbg = serde_json::json!({
        "path_type": path_type,
        "toc": toc_flag,
        "numberSections": num_flag,
        "papersize": prefs_val.get("papersize"),
        "timestamp": chrono::Utc::now().to_rfc3339(),
    });
    config.app_handle.emit("render-debug", dbg).ok();

    // Write to build directory
    let prefs_json = serde_json::to_string_pretty(&prefs_val)?;
    fs::write(config.build_dir.join("prefs.json"), &prefs_json)?;

    Ok(PrefsSetupResult {
        prefs_json: prefs_val,
    })
}

/// Setup template for rendering: copy tideflow.typ and sync theme assets,
/// emit template inspection events.
pub fn setup_template(config: &RenderConfig, path_type: &str) -> Result<()> {
    // Determine template source (prefer dev workspace during development)
    let mut template_src = if let Ok(cwd) = std::env::current_dir() {
        let dev_tpl = cwd.join("src-tauri").join("content").join("tideflow.typ");
        if dev_tpl.exists() { dev_tpl } else { config.content_dir.join("tideflow.typ") }
    } else {
        config.content_dir.join("tideflow.typ")
    };

    if !template_src.exists() {
        // Attempt to restore the template from resources into the user content
        // directory
        if let Ok(restored) = utils::ensure_tideflow_template_exists(config.app_handle) {
            if restored.exists() {
                template_src = restored;
            }
        }
    }

    if !template_src.exists() {
        return Err(anyhow!("tideflow.typ template not found at {}", template_src.display()));
    }

    // Copy template to build directory
    let template_dst = config.build_dir.join("tideflow.typ");
    fs::copy(&template_src, &template_dst)?;

    // Sync theme assets
    sync_theme_assets(&template_src, &config.build_dir)?;

    // Emit template inspection event
    if let Ok(tpl_txt) = fs::read_to_string(&template_src) {
        let snippet: String = tpl_txt.chars().take(400).collect();
        let has_conditional = tpl_txt.contains("#if prefs.toc");
        let evt = serde_json::json!({
            "path_type": path_type,
            "template_path": template_src.to_string_lossy(),
            "has_conditional": has_conditional,
            "snippet": snippet,
            "timestamp": chrono::Utc::now().to_rfc3339()
        });
        config.app_handle.emit("template-inspect", evt).ok();

        if !has_conditional {
            let warn = serde_json::json!({
                "warning": "Template missing '#if prefs.toc' conditional; TOC will always show.",
                "template_path": template_src.to_string_lossy(),
                "timestamp": chrono::Utc::now().to_rfc3339()
            });
            config.app_handle.emit("template-warning", warn).ok();
        }
    }

    Ok(())
}

/// Compile Typst to PDF with proper error handling and timeout
pub fn compile_typst(config: &RenderConfig, typst_path: &Path, output_file: &str) -> Result<()> {
    ensure_cmarker_asset();

    // Spawn process with timeout (30 seconds)
    use std::time::Duration;

    let mut child = typst_command(typst_path)
        .current_dir(&config.build_dir)
        .args(["compile", "--root", config.typst_root.to_string_lossy().as_ref(), "tideflow.typ", output_file])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    // Wait with timeout
    let timeout = Duration::from_secs(30);
    let start = std::time::Instant::now();

    let status = loop {
        match child.try_wait()? {
            | Some(status) => break status,
            | None => {
                if start.elapsed() > timeout {
                    child.kill()?;
                    return Err(anyhow!("Typst compilation timeout after 30 seconds"));
                }
                std::thread::sleep(Duration::from_millis(100));
            },
        }
    };

    if !status.success() {
        // On error, capture output for detailed error reporting
        let mut stdout = Vec::new();
        let mut stderr = Vec::new();

        if let Some(mut out) = child.stdout.take() {
            let _ = std::io::Read::read_to_end(&mut out, &mut stdout);
        }
        if let Some(mut err) = child.stderr.take() {
            let _ = std::io::Read::read_to_end(&mut err, &mut stderr);
        }

        let stdout_str = String::from_utf8_lossy(&stdout);
        let stderr_str = String::from_utf8_lossy(&stderr);

        return Err(anyhow!(
            "Typst compile failed (status {}).\nSTDOUT:\n{}\nSTDERR:\n{}",
            status,
            stdout_str.trim(),
            stderr_str.trim()
        ));
    }

    let output_path = config.build_dir.join(output_file);
    if !output_path.exists() {
        return Err(anyhow!("Typst compile completed but PDF missing at {}", output_path.display()));
    }

    Ok(())
}
