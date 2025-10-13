//! Font operations for listing system fonts

use once_cell::sync::Lazy;
use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use tauri::command;

// Global font cache to avoid repeated filesystem scans
static FONT_CACHE: Lazy<Arc<Mutex<Option<Vec<String>>>>> = Lazy::new(|| Arc::new(Mutex::new(None)));

/// Get list of all system fonts (cached)
#[command]
pub fn get_system_fonts() -> Result<Vec<String>, String> {
    // Check cache first
    let mut cache = FONT_CACHE.lock().unwrap();
    if let Some(fonts) = cache.as_ref() {
        return Ok(fonts.clone());
    }

    // Cache miss - load from system
    let fonts = load_fonts_from_system()?;
    *cache = Some(fonts.clone());
    Ok(fonts)
}

/// Load fonts from system (platform-specific)
fn load_fonts_from_system() -> Result<Vec<String>, String> {
    #[cfg(target_os = "windows")]
    {
        get_windows_fonts()
    }

    #[cfg(target_os = "linux")]
    {
        get_linux_fonts()
    }

    #[cfg(target_os = "macos")]
    {
        get_macos_fonts()
    }
}

#[cfg(target_os = "windows")]
fn get_windows_fonts() -> Result<Vec<String>, String> {
    use std::fs;
    use std::path::Path;

    let mut fonts = HashSet::new();

    // Windows fonts directory
    let windows_dir = std::env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".to_string());
    let fonts_dir = Path::new(&windows_dir).join("Fonts");

    if let Ok(entries) = fs::read_dir(&fonts_dir) {
        for entry in entries.flatten() {
            if let Some(file_name) = entry.file_name().to_str() {
                if let Some(font_name) = extract_font_name(file_name) {
                    fonts.insert(font_name);
                }
            }
        }
    }

    // Add common fonts that might be in user directory
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let user_fonts = Path::new(&local_app_data).join("Microsoft\\Windows\\Fonts");
        if let Ok(entries) = fs::read_dir(&user_fonts) {
            for entry in entries.flatten() {
                if let Some(file_name) = entry.file_name().to_str() {
                    if let Some(font_name) = extract_font_name(file_name) {
                        fonts.insert(font_name);
                    }
                }
            }
        }
    }

    let mut result: Vec<String> = fonts.into_iter().collect();
    result.sort();
    Ok(result)
}

#[cfg(target_os = "linux")]
fn get_linux_fonts() -> Result<Vec<String>, String> {
    use std::process::Command;

    let mut fonts = HashSet::new();

    // Use fc-list to get system fonts
    if let Ok(output) = Command::new("fc-list").arg(":").arg("family").output() {
        if output.status.success() {
            let output_str = String::from_utf8_lossy(&output.stdout);
            for line in output_str.lines() {
                // fc-list returns comma-separated font families
                for font in line.split(',') {
                    let font_name = font.trim().to_string();
                    if !font_name.is_empty() {
                        fonts.insert(font_name);
                    }
                }
            }
        }
    }

    // Fallback to common fonts if fc-list fails
    if fonts.is_empty() {
        fonts.extend(get_fallback_fonts().into_iter().map(String::from));
    }

    let mut result: Vec<String> = fonts.into_iter().collect();
    result.sort();
    Ok(result)
}

#[cfg(target_os = "macos")]
fn get_macos_fonts() -> Result<Vec<String>, String> {
    use std::fs;
    use std::path::Path;

    let mut fonts = HashSet::new();

    // macOS font directories
    let mut font_dirs = vec!["/System/Library/Fonts", "/Library/Fonts"];

    // Add user fonts directory
    let user_fonts_path;
    if let Ok(home) = std::env::var("HOME") {
        user_fonts_path = format!("{}/Library/Fonts", home);
        font_dirs.push(&user_fonts_path);
    }

    for dir in font_dirs {
        if let Ok(entries) = fs::read_dir(Path::new(dir)) {
            for entry in entries.flatten() {
                if let Some(file_name) = entry.file_name().to_str() {
                    if let Some(font_name) = extract_font_name(file_name) {
                        fonts.insert(font_name);
                    }
                }
            }
        }
    }

    let mut result: Vec<String> = fonts.into_iter().collect();
    result.sort();
    Ok(result)
}

/// Extract font name from filename
#[allow(dead_code)]
fn extract_font_name(filename: &str) -> Option<String> {
    let lower = filename.to_lowercase();

    // Check if it's a font file
    if !lower.ends_with(".ttf") && !lower.ends_with(".otf") && !lower.ends_with(".ttc") && !lower.ends_with(".dfont") {
        return None;
    }

    // Remove extension
    let name = filename
        .trim_end_matches(".ttf")
        .trim_end_matches(".TTF")
        .trim_end_matches(".otf")
        .trim_end_matches(".OTF")
        .trim_end_matches(".ttc")
        .trim_end_matches(".TTC")
        .trim_end_matches(".dfont")
        .trim_end_matches(".DFONT");

    // Clean up the name
    let cleaned = name.replace('-', " ").replace('_', " ");

    // Remove common suffixes
    let cleaned = cleaned
        .trim_end_matches(" Regular")
        .trim_end_matches(" Bold")
        .trim_end_matches(" Italic")
        .trim_end_matches(" BoldItalic")
        .trim_end_matches("Regular")
        .trim_end_matches("Bold")
        .trim_end_matches("Italic")
        .trim_end_matches("BoldItalic")
        .trim();

    if cleaned.is_empty() { None } else { Some(cleaned.to_string()) }
}

/// Fallback fonts for when system font detection fails
fn get_fallback_fonts() -> Vec<&'static str> {
    vec![
        "Arial",
        "Calibri",
        "Cambria",
        "Candara",
        "Comic Sans MS",
        "Consolas",
        "Constantia",
        "Corbel",
        "Courier New",
        "Georgia",
        "Lucida Console",
        "Palatino Linotype",
        "Segoe UI",
        "Tahoma",
        "Times New Roman",
        "Trebuchet MS",
        "Verdana",
    ]
}
