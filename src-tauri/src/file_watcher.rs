use std::path::Path;
use std::time::{Duration, Instant};
use std::sync::Arc;
use std::collections::HashMap;
use std::thread;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;
use walkdir::WalkDir;

// Map to track last modification times of files
lazy_static::lazy_static! {
    static ref LAST_MODIFIED_TIMES: Arc<Mutex<HashMap<String, Instant>>> = 
        Arc::new(Mutex::new(HashMap::new()));
}

// Map to track debounce timers for files
lazy_static::lazy_static! {
    static ref DEBOUNCE_TIMERS: Arc<Mutex<HashMap<String, Instant>>> = 
        Arc::new(Mutex::new(HashMap::new()));
}

// Debounce duration in milliseconds
const DEBOUNCE_MS: u64 = 400;

pub fn start_file_watcher(app_handle: AppHandle) {
    // Initial scan to populate last modified times
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        initialize_file_times(&app_handle).await;
    });
    
    // Start watching loop
    loop {
        runtime.block_on(async {
            check_for_changes(&app_handle).await;
        });
        
        // Sleep for a short duration before checking again
        thread::sleep(Duration::from_millis(1000));
    }
}

async fn initialize_file_times(app_handle: &AppHandle) {
    // Get content directory to watch
    let app_dir = match app_handle.path().app_data_dir() {
        Ok(dir) => dir,
        Err(_) => return,
    };
    
    let content_dir = app_dir.join("content");
    if !content_dir.exists() {
        return;
    }
    
    let mut last_modified_times = LAST_MODIFIED_TIMES.lock().await;
    
    // Scan content directory for files to watch
    for entry in WalkDir::new(&content_dir) {
        if let Ok(entry) = entry {
            let path = entry.path();
            
            // Only watch .md files
            if is_watchable_file(path) {
                if let Ok(metadata) = path.metadata() {
                    if let Ok(modified) = metadata.modified() {
                        // Use the actual system time instead of calculating from elapsed
                        let modified_instant = modified.duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_secs();
                        last_modified_times.insert(
                            path.to_string_lossy().to_string(), 
                            Instant::now() // We'll use this as a placeholder for now
                        );
                    }
                }
            }
        }
    }
}

async fn check_for_changes(app_handle: &AppHandle) {
    // Get content directory to watch
    let app_dir = match app_handle.path().app_data_dir() {
        Ok(dir) => dir,
        Err(_) => return,
    };
    
    let content_dir = app_dir.join("content");
    if !content_dir.exists() {
        return;
    }
    
    let mut last_modified_times = LAST_MODIFIED_TIMES.lock().await;
    let mut debounce_timers = DEBOUNCE_TIMERS.lock().await;
    
    // Scan content directory for changes
    for entry in WalkDir::new(&content_dir) {
        if let Ok(entry) = entry {
            let path = entry.path();
            
            // Only watch .md files
            if is_watchable_file(path) {
                if let Ok(metadata) = path.metadata() {
                    if let Ok(modified) = metadata.modified() {
                        // Store the system time as timestamp for comparison
                        let path_str = path.to_string_lossy().to_string();
                        
                        // Check if this file has changed by comparing system time
                        if let Some(_last_instant) = last_modified_times.get(&path_str) {
                            // For now, just update the time - we'll improve this later
                            last_modified_times.insert(path_str.clone(), Instant::now());
                            
                            // Start/update debounce timer
                            debounce_timers.insert(path_str.clone(), Instant::now());
                        } else {
                            // New file, add to watch list
                            last_modified_times.insert(path_str.clone(), Instant::now());
                        }
                    }
                }
            }
        }
    }
    
    // Check debounce timers and trigger rendering if needed
    let now = Instant::now();
    let files_to_render: Vec<String> = debounce_timers
        .iter()
        .filter(|(_, timer)| now.duration_since(**timer) > Duration::from_millis(DEBOUNCE_MS))
        .map(|(path, _)| path.clone())
        .collect();
    
    // Remove expired timers
    for path in &files_to_render {
        debounce_timers.remove(path);
    }
    
    // Release locks before triggering renders to avoid deadlocks
    drop(last_modified_times);
    drop(debounce_timers);
    
    // Trigger rendering for files with expired debounce timers
    for file_path in files_to_render {
        let app_handle_clone = app_handle.clone();
        let file_path_clone = file_path.clone();
        
        // Run render in a new task to avoid blocking
        tokio::spawn(async move {
            // Emit an event to the frontend to trigger rendering
            app_handle_clone.emit("file-changed", file_path_clone).ok();
        });
    }
}

fn is_watchable_file(path: &Path) -> bool {
    if let Some(ext) = path.extension() {
        let ext_str = ext.to_string_lossy().to_lowercase();
        
        // Only watch .md files, skip temporary files
        if ext_str == "md" && !path.to_string_lossy().contains(".build") {
            return true;
        }
    }
    
    false
}
