use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::hash::{Hash, Hasher};
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::path::Path;
use tokio::sync::Mutex;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageSection {
    pub id: String,
    pub content_hash: u64,
    pub start_line: usize,
    pub end_line: usize,
    pub dependencies: HashSet<String>, // Referenced images, includes, etc.
    pub affects_later_pages: bool, // Headers, TOC changes, etc.
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentCache {
    pub content_hash: u64,
    pub sections: Vec<PageSection>,
    pub global_dependencies: HashSet<String>, // Global settings and template dependencies
    pub last_render_time: std::time::SystemTime,
}

lazy_static::lazy_static! {
    static ref DOCUMENT_CACHE: Arc<Mutex<HashMap<String, DocumentCache>>> = 
        Arc::new(Mutex::new(HashMap::new()));
}

pub struct IncrementalRenderer {
    cache_file: std::path::PathBuf,
}

impl IncrementalRenderer {
    pub fn new(app_handle: &tauri::AppHandle) -> Result<Self> {
        let app_dir = crate::utils::get_app_dir(app_handle)?;
        let cache_file = app_dir.join("render_cache.json");
        
        // Load existing cache if it exists
        if cache_file.exists() {
            if let Ok(cache_content) = fs::read_to_string(&cache_file) {
                if let Ok(cache_map) = serde_json::from_str::<HashMap<String, DocumentCache>>(&cache_content) {
                    let mut cache = DOCUMENT_CACHE.blocking_lock();
                    *cache = cache_map;
                }
            }
        }
        
        Ok(Self { cache_file })
    }
    
    pub async fn should_render(&self, file_path: &str, content: &str) -> Result<RenderDecision> {
        let mut cache = DOCUMENT_CACHE.lock().await;
        
        // Calculate content hash
        let content_hash = calculate_hash(content);
        
        // Check if we have cached data for this file
        if let Some(cached) = cache.get(file_path) {
            if cached.content_hash == content_hash {
                // Content unchanged, check dependencies
                if self.check_dependencies(&cached.global_dependencies).await? {
                    return Ok(RenderDecision::Skip);
                }
            }
        }
        
        // Parse content into sections
        let sections = self.parse_sections(content)?;
        
        // If we have cached data, do incremental analysis
        if let Some(cached) = cache.get(file_path) {
            let changed_sections = self.find_changed_sections(&cached.sections, &sections);
            
            if changed_sections.is_empty() {
                return Ok(RenderDecision::Skip);
            }
            
            // Check if changes affect later pages
            let affects_global = changed_sections.iter()
                .any(|section_id| {
                    sections.iter()
                        .find(|s| &s.id == section_id)
                        .map(|s| s.affects_later_pages)
                        .unwrap_or(false)
                });
            
            if affects_global {
                return Ok(RenderDecision::RenderAll("Global changes detected".to_string()));
            }
            
            return Ok(RenderDecision::RenderPartial(changed_sections));
        }
        
        // No cache, render everything
        let doc_cache = DocumentCache {
            content_hash,
            sections,
            global_dependencies: self.extract_global_dependencies(content)?,
            last_render_time: std::time::SystemTime::now(),
        };
        
        cache.insert(file_path.to_string(), doc_cache);
        self.save_cache().await?;
        
        Ok(RenderDecision::RenderAll("No cache data".to_string()))
    }
    
    pub async fn update_cache(&self, file_path: &str, content: &str) -> Result<()> {
        let mut cache = DOCUMENT_CACHE.lock().await;
        
        let content_hash = calculate_hash(content);
        let sections = self.parse_sections(content)?;
        let global_dependencies = self.extract_global_dependencies(content)?;
        
        let doc_cache = DocumentCache {
            content_hash,
            sections,
            global_dependencies,
            last_render_time: std::time::SystemTime::now(),
        };
        
        cache.insert(file_path.to_string(), doc_cache);
        self.save_cache().await?;
        
        Ok(())
    }
    
    fn parse_sections(&self, content: &str) -> Result<Vec<PageSection>> {
        let lines: Vec<&str> = content.lines().collect();
        let mut sections = Vec::new();
        let mut current_section_start = 0;
        let mut section_counter = 0;
        
        // Start from beginning since we don't use YAML frontmatter anymore
        let content_start = 0;
        
        for (line_idx, line) in lines.iter().enumerate().skip(content_start) {
            let line_trimmed = line.trim();
            
            // Detect page breaks and major section boundaries
            let is_page_break = line_trimmed.starts_with("# ") || // H1 headers
                               line_trimmed.contains("{pagebreak}") || // Explicit page breaks
                               line_trimmed.starts_with("\\newpage") || // LaTeX page breaks
                               (line_trimmed.starts_with("## ") && section_counter > 0); // H2 after content
            
            if is_page_break && line_idx > current_section_start {
                // Create section for previous content
                let section_content = lines[current_section_start..line_idx].join("\n");
                let content_hash = calculate_hash(&section_content);
                let dependencies = self.extract_dependencies(&section_content);
                let affects_later = self.affects_later_pages(&section_content);
                
                sections.push(PageSection {
                    id: format!("section_{}", section_counter),
                    content_hash,
                    start_line: current_section_start,
                    end_line: line_idx - 1,
                    dependencies,
                    affects_later_pages: affects_later,
                });
                
                current_section_start = line_idx;
                section_counter += 1;
            }
        }
        
        // Add final section
        if current_section_start < lines.len() {
            let section_content = lines[current_section_start..].join("\n");
            let content_hash = calculate_hash(&section_content);
            let dependencies = self.extract_dependencies(&section_content);
            let affects_later = self.affects_later_pages(&section_content);
            
            sections.push(PageSection {
                id: format!("section_{}", section_counter),
                content_hash,
                start_line: current_section_start,
                end_line: lines.len() - 1,
                dependencies,
                affects_later_pages: affects_later,
            });
        }
        
        Ok(sections)
    }
    
    fn find_changed_sections(&self, old_sections: &[PageSection], new_sections: &[PageSection]) -> Vec<String> {
        let mut changed = Vec::new();
        
        // Create maps for efficient lookup
        let old_map: HashMap<String, &PageSection> = old_sections.iter()
            .map(|s| (s.id.clone(), s))
            .collect();
        
        for new_section in new_sections {
            if let Some(old_section) = old_map.get(&new_section.id) {
                if old_section.content_hash != new_section.content_hash {
                    changed.push(new_section.id.clone());
                }
            } else {
                // New section
                changed.push(new_section.id.clone());
            }
        }
        
        // Check for deleted sections
        for old_section in old_sections {
            if !new_sections.iter().any(|s| s.id == old_section.id) {
                // Section was deleted, this affects layout
                changed.push(old_section.id.clone());
            }
        }
        
        changed
    }
    
    fn extract_dependencies(&self, content: &str) -> HashSet<String> {
        let mut deps = HashSet::new();
        
        // Find image references
        for line in content.lines() {
            // Markdown images: ![alt](path)
            if let Some(start) = line.find("](") {
                if let Some(end) = line[start + 2..].find(')') {
                    let path = &line[start + 2..start + 2 + end];
                    if !path.starts_with("http") {
                        deps.insert(path.to_string());
                    }
                }
            }
            
            // Include statements
            if line.contains("{{< include") {
                // Extract include path
                if let Some(start) = line.find("{{< include ") {
                    if let Some(end) = line[start..].find(" >}}") {
                        let path = line[start + 12..start + end].trim();
                        deps.insert(path.to_string());
                    }
                }
            }
        }
        
        deps
    }
    
    fn extract_global_dependencies(&self, content: &str) -> Result<HashSet<String>> {
        let mut deps = HashSet::new();
        
        // For Typst, we mainly depend on template files and images
        // Look for image references in the markdown content
        for line in content.lines() {
            // Extract image references ![alt](path)
            if let Some(start) = line.find("![") {
                if let Some(end) = line[start..].find("](") {
                    let remaining = &line[start + end + 2..];
                    if let Some(close) = remaining.find(')') {
                        let path = &remaining[..close];
                        if !path.starts_with("http") && !path.is_empty() {
                            deps.insert(path.to_string());
                        }
                    }
                }
            }
        }
        
        Ok(deps)
    }
    
    fn affects_later_pages(&self, content: &str) -> bool {
        // Check if content affects global document structure
        content.contains("# ") || // H1 headers affect TOC
        content.contains("\\label{") || // LaTeX labels
        content.contains("\\ref{") || // References
        content.contains("{#") || // Pandoc cross-references
        content.contains("bibliography:") ||
        content.contains("toc:")
    }
    
    async fn check_dependencies(&self, deps: &HashSet<String>) -> Result<bool> {
        for dep in deps {
            if let Ok(metadata) = fs::metadata(dep) {
                if let Ok(modified) = metadata.modified() {
                    // Check if dependency was modified recently
                    if let Ok(elapsed) = modified.elapsed() {
                        if elapsed.as_secs() < 60 { // Modified in last minute
                            return Ok(false); // Need to re-render
                        }
                    }
                }
            }
        }
        Ok(true) // Dependencies unchanged
    }
    
    async fn save_cache(&self) -> Result<()> {
        let cache = DOCUMENT_CACHE.lock().await;
        let json = serde_json::to_string_pretty(&*cache)?;
        fs::write(&self.cache_file, json)?;
        Ok(())
    }
}

#[derive(Debug)]
pub enum RenderDecision {
    Skip,
    RenderPartial(Vec<String>),
    RenderAll(String),
}

fn calculate_hash(content: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    content.hash(&mut hasher);
    hasher.finish()
}
