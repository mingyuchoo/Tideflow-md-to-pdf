use anyhow::Result;
use std::fs;
use std::process::{Command, Stdio};
use tauri::AppHandle;
use crate::utils;

/// Pre-warm Typst environment by rendering a minimal test document
/// This helps ensure fonts and templates are cached for faster subsequent renders
pub async fn preload_typst_environment(app_handle: &AppHandle) -> Result<()> {
    println!("🚀 Pre-warming Typst environment...");
    
    // Get path to Typst binary
    let typst_path = match utils::get_typst_path(app_handle) {
        Ok(path) => path,
        Err(e) => {
            println!("⚠️ Could not preload Typst environment: {}", e);
            return Ok(()); // Don't fail startup if preload fails
        }
    };
    
    // Create minimal test document for warming up
    let content_dir = utils::get_content_dir(app_handle)?;
    let build_dir = content_dir.join(".build");
    fs::create_dir_all(&build_dir)?;
    
    let test_content = r#"# Preload Test

This is a minimal test document to pre-warm the Typst environment.

**Bold text** and *italic text* for font loading.

```python
print("Code block for syntax highlighting")
```

- List item 1
- List item 2

#table(
  columns: 2,
  [Table], [Header],
  [Cell], [Cell]
)
"#;
    
    // Write content.md for our template
    fs::write(build_dir.join("content.md"), test_content)?;
    
    // Write minimal prefs.json
    let prefs_json = r#"{"papersize": "a4", "margin": {"x": "2cm", "y": "2.5cm"}, "toc": false, "numberSections": false}"#;
    fs::write(build_dir.join("prefs.json"), prefs_json)?;
    
    // Write minimal template for testing
    let template_content = r#"#let prefs = json("prefs.json")
#set page(paper: prefs.papersize, margin: (x: prefs.margin.x, y: prefs.margin.y))
#read("content.md")"#;
    fs::write(build_dir.join("preload.typ"), template_content)?;
    
    // Run Typst compile in background
    let start_time = std::time::Instant::now();
    let output = Command::new(&typst_path)
        .arg("compile")
        .arg("preload.typ")
        .arg("preload_test.pdf")
        .current_dir(&build_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();
    
    match output {
        Ok(result) => {
            let duration = start_time.elapsed();
            if result.status.success() {
                println!("✅ Typst environment pre-warmed successfully in {:.1}s", duration.as_secs_f32());
            } else {
                let stderr = String::from_utf8_lossy(&result.stderr);
                println!("⚠️ Typst preload failed: {}", stderr);
            }
        }
        Err(e) => {
            println!("⚠️ Could not run Typst preload: {}", e);
        }
    }
    
    // Clean up test files
    let _ = fs::remove_file(build_dir.join("content.md"));
    let _ = fs::remove_file(build_dir.join("prefs.json"));
    let _ = fs::remove_file(build_dir.join("preload.typ"));
    let _ = fs::remove_file(build_dir.join("preload_test.pdf"));
    
    Ok(())
}

/// Typst doesn't need LaTeX package preloading, so this is a no-op
pub async fn preload_latex_packages(_app_handle: &AppHandle) -> Result<()> {
    // Typst doesn't use LaTeX packages, so this is unnecessary
    Ok(())
}
