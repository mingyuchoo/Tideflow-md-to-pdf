//! PDF serving operations to bypass asset protocol restrictions

use base64::Engine;
use std::fs;
use tauri::{AppHandle, command};

#[command]
pub async fn read_pdf_as_base64(_app_handle: AppHandle, pdf_path: String) -> Result<String, String> {
    // Read the PDF file
    let bytes = fs::read(&pdf_path)
        .map_err(|e| format!("Failed to read PDF file: {}", e))?;
    
    // Convert to base64
    let base64_data = base64::engine::general_purpose::STANDARD.encode(&bytes);
    
    Ok(base64_data)
}
