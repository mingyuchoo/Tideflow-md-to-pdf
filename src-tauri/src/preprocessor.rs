use anyhow::Result;
use pulldown_cmark::{Event, Options, Parser, Tag};
use serde::Serialize;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize)]
pub struct EditorPosition {
    pub offset: usize,
    pub line: usize,
    pub column: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct PdfPosition {
    pub page: usize,
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct AnchorEntry {
    pub id: String,
    pub editor: EditorPosition,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pdf: Option<PdfPosition>,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct SourceMapPayload {
    pub anchors: Vec<AnchorEntry>,
}

#[derive(Debug, Clone)]
pub struct AnchorMeta {
    pub id: String,
    pub offset: usize,
    pub line: usize,
    pub column: usize,
}

#[derive(Debug, Clone)]
pub struct PreprocessorOutput {
    pub markdown: String,
    pub anchors: Vec<AnchorMeta>,
}

/// Transform user markdown by converting custom syntax (admonitions) and injecting
/// invisible Typst anchors used for scroll synchronisation.
pub fn preprocess_markdown(markdown: &str) -> Result<PreprocessorOutput> {
    let admonition_transformed = transform_admonitions(markdown);
    let legacy_normalised = normalise_legacy_callouts(&admonition_transformed);
    let cmarker_fixed = fix_cmarker_quirks(&legacy_normalised);
    inject_anchors(&cmarker_fixed)
}

fn transform_admonitions(markdown: &str) -> String {
    let mut output = String::with_capacity(markdown.len() + 128);
    let segments: Vec<&str> = markdown.split_inclusive('\n').collect();
    let mut idx = 0;

    while idx < segments.len() {
        let segment = segments[idx];
        let (line_content, had_newline) = if segment.ends_with('\n') {
            (&segment[..segment.len() - 1], true)
        } else {
            (segment, false)
        };

        let trimmed = line_content.trim_start();
        if !trimmed.starts_with('>') {
            output.push_str(segment);
            idx += 1;
            continue;
        }

        let indent_len = line_content.len() - trimmed.len();
        let indent = &line_content[..indent_len];
        let mut after_marker = trimmed[1..].trim_start();
        if !after_marker.starts_with("[!") {
            output.push_str(segment);
            idx += 1;
            continue;
        }
        after_marker = &after_marker[2..];
        let closing_idx = match after_marker.find(']') {
            Some(idx) => idx,
            None => {
                output.push_str(segment);
                idx += 1;
                continue;
            }
        };

        let raw_kind = after_marker[..closing_idx].trim();
        let remainder = after_marker[closing_idx + 1..].trim_start();
        if raw_kind.is_empty() {
            output.push_str(segment);
            idx += 1;
            continue;
        }

        let kind = canonical_admonition_kind(raw_kind);
        let mut body = String::new();
        if !remainder.is_empty() {
            body.push_str(remainder);
            if had_newline {
                body.push('\n');
            }
        } else if had_newline {
            body.push('\n');
        }

        idx += 1;
        while idx < segments.len() {
            let seg = segments[idx];
            let (line_body, seg_had_newline) = if seg.ends_with('\n') {
                (&seg[..seg.len() - 1], true)
            } else {
                (seg, false)
            };
            let trimmed_line = line_body.trim_start();
            if !trimmed_line.starts_with('>') {
                break;
            }
            let content = trimmed_line[1..].trim_start_matches(' ');
            if content.is_empty() {
                // Preserve blank quoted line
                body.push('\n');
            } else {
                body.push_str(content);
                if seg_had_newline {
                    body.push('\n');
                }
            }
            idx += 1;
        }

        let mut rendered = String::new();
        rendered.push_str(indent);
        rendered.push_str("<!--raw-typst #admonition(\"");
        rendered.push_str(&kind);
        rendered.push_str("\")[ -->\n");
        rendered.push_str(body.trim_end_matches('\n'));
        rendered.push('\n');

        // Append the rendered admonition block to the output and continue processing
        output.push_str(&rendered);
        // advance to the next segment in the outer loop
        continue;
    }

    output
}

fn canonical_admonition_kind(raw: &str) -> String {
    match raw.to_lowercase().as_str() {
        "warning" | "warn" | "danger" | "caution" => "warning".to_string(),
        "tip" | "success" => "tip".to_string(),
        "info" | "information" => "info".to_string(),
        "important" => "important".to_string(),
        _ => "note".to_string(),
    }
}
fn normalise_legacy_callouts(markdown: &str) -> String {
    let mut replaced = markdown.replace(
        "<!--raw-typst #block(fill: luma(245), inset: 8pt, radius: 6pt, stroke: 0.5pt + luma(200))",
        "<!--raw-typst #admonition(\"note\")",
    );
    replaced = replaced.replace(
        "<!--raw-typst #block(fill: rgb(224,242,254), inset: 8pt, radius: 6pt, stroke: 0.5pt + rgb(186,230,253))",
        "<!--raw-typst #admonition(\"info\")",
    );
    replaced = replaced.replace(
        "<!--raw-typst #block(fill: rgb(220,252,231), inset: 8pt, radius: 6pt, stroke: 0.5pt + rgb(187,247,208))",
        "<!--raw-typst #admonition(\"tip\")",
    );
    replaced = replaced.replace(
        "<!--raw-typst #block(fill: rgb(254,249,195), inset: 8pt, radius: 6pt, stroke: 0.5pt + rgb(253,224,71))",
        "<!--raw-typst #admonition(\"warning\")",
    );
    replaced
}

/// Fix block element adjacency issues by ensuring proper spacing between elements.
/// Fix quirks in markdown that cause issues with the cmarker parser.
/// Specifically handles blockquotes immediately followed by headings.
/// 
/// The fix: Insert a zero-width space (U+200B) which breaks the blockquote context
/// without being visible in the rendered output.
fn fix_cmarker_quirks(markdown: &str) -> String {
    let lines: Vec<&str> = markdown.split('\n').collect();
    let mut output = String::with_capacity(markdown.len() + 128);
    
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];
        output.push_str(line);
        
        if i < lines.len() - 1 {
            let next_line = lines[i + 1];
            let next_is_blockquote = next_line.trim_start().starts_with('>');
            
            let current_is_blockquote = line.trim_start().starts_with('>');
            let prev_is_blockquote = i > 0 && lines[i - 1].trim_start().starts_with('>');
            
            // Insert zero-width space before every blockquote (unless previous line was also a blockquote)
            if next_is_blockquote && !current_is_blockquote {
                output.push('\n');
                output.push('\u{200B}'); // Zero-width space separator
            }
            
            // Insert zero-width space after every blockquote (unless next line is also a blockquote)
            if current_is_blockquote && !next_is_blockquote {
                output.push('\n');
                output.push('\u{200B}'); // Zero-width space separator
            } else if prev_is_blockquote && !current_is_blockquote && !next_is_blockquote {
                // Handle multi-line blockquote endings
                output.push('\n');
                output.push('\u{200B}'); // Zero-width space separator
            }
        }
        
        if i < lines.len() - 1 {
            output.push('\n');
        }
        
        i += 1;
    }
    
    output
}

fn inject_anchors(markdown: &str) -> Result<PreprocessorOutput> {
    let mut insertions: Vec<(usize, String)> = Vec::new();
    let mut anchors: Vec<AnchorMeta> = Vec::new();
    let mut seen_offsets: HashSet<usize> = HashSet::new();

    // Ensure there's always a document-start anchor so preview can scroll to
    // the top even when a cover page is rendered above content.
    let doc_id = "tf-doc-start".to_string();
    if !seen_offsets.contains(&0) {
            let doc_anchor = build_anchor_markup(markdown, 0, &doc_id);
        insertions.push((0, doc_anchor));
        anchors.push(AnchorMeta {
            id: doc_id.clone(),
            offset: 0,
            line: 0,
            column: 0,
        });
        seen_offsets.insert(0usize);
    }

    let parser = Parser::new_ext(
        markdown,
        Options::ENABLE_FOOTNOTES | Options::ENABLE_TASKLISTS,
    );
    for (event, range) in parser.into_offset_iter() {
        if let Event::Start(tag) = event {
            if !is_block_level(&tag) {
                continue;
            }
            if !seen_offsets.insert(range.start) {
                continue;
            }
            let id = format!("tf-{}-{}", range.start, anchors.len());
            let (line, column) = offset_to_line_column(markdown, range.start);
            let anchor_markup = build_anchor_markup(markdown, range.start, &id);
            insertions.push((range.start, anchor_markup));
            anchors.push(AnchorMeta {
                id,
                offset: range.start,
                line,
                column,
            });
        }
    }

    insertions.sort_by_key(|(offset, _)| *offset);
    let mut output = markdown.to_owned();
    for (offset, snippet) in insertions.into_iter().rev() {
        output.insert_str(offset, &snippet);
    }

    Ok(PreprocessorOutput {
        markdown: output,
        anchors,
    })
}

fn is_block_level(tag: &Tag<'_>) -> bool {
    matches!(
        tag,
        Tag::Paragraph
            | Tag::Heading(..)
            | Tag::BlockQuote
            | Tag::CodeBlock(_)
            | Tag::List(_)
            | Tag::Item
            | Tag::FootnoteDefinition(_)
            | Tag::Table(_)
            | Tag::TableHead
            | Tag::TableRow
            | Tag::TableCell
    )
}

fn offset_to_line_column(source: &str, offset: usize) -> (usize, usize) {
    let mut line = 0;
    let mut column = 0;
    for ch in source[..offset].chars() {
        if ch == '\n' {
            line += 1;
            column = 0;
        } else {
            column += 1;
        }
    }
    (line, column)
}

fn build_anchor_markup(source: &str, offset: usize, id: &str) -> String {
    let mut snippet = String::new();
    if offset > 0 {
        let preceding = &source[..offset];
        if !preceding.ends_with('\n') {
            snippet.push('\n');
        }
    }
    // Inject a literal label call so Typst sees a label node it can query.
    // A bare label is accepted by Typst and will be discoverable by `typst query`.
    snippet.push_str("<!--raw-typst #label(\"");
    snippet.push_str(id);
    snippet.push_str("\") -->\n");
    snippet
}

pub fn attach_pdf_positions(
    anchors: &[AnchorMeta],
    positions: &HashMap<String, PdfPosition>,
) -> SourceMapPayload {
    let entries = anchors
        .iter()
        .map(|anchor| AnchorEntry {
            id: anchor.id.clone(),
            editor: EditorPosition {
                offset: anchor.offset,
                line: anchor.line,
                column: anchor.column,
            },
            pdf: positions.get(&anchor.id).cloned(),
        })
        .collect();

    SourceMapPayload { anchors: entries }
}

#[allow(dead_code)]
pub fn anchors_to_lookup(anchors: &[AnchorMeta]) -> HashMap<String, EditorPosition> {
    anchors
        .iter()
        .map(|anchor| {
            (
                anchor.id.clone(),
                EditorPosition {
                    offset: anchor.offset,
                    line: anchor.line,
                    column: anchor.column,
                },
            )
        })
        .collect()
}

pub fn pdf_positions_from_query(json_bytes: &[u8]) -> Result<HashMap<String, PdfPosition>> {
    let value: serde_json::Value = serde_json::from_slice(json_bytes)?;
    let mut map = HashMap::new();
    if let Some(entries) = value.as_array() {
        for entry in entries {
            if let Some(label) = find_label(entry) {
                if !label.starts_with("tf-") {
                    continue;
                }
                // Try to find a location object anywhere under this entry. Typst
                // output varies by version and query shape; search for common
                // variants such as { location: { page, position: { x,y } } }
                // or nested fields like 'point', 'pos', or 'rect'.
                if let Some((page, x, y)) = find_location(entry) {
                    map.insert(label, PdfPosition { page, x, y });
                }
            }
        }
    }
    Ok(map)
}

fn find_label(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::Object(map) => {
            if let Some(label) = map.get("label").and_then(|v| v.as_str()) {
                return Some(label.to_owned());
            }
            for key in ["value", "target", "node", "fields"] {
                if let Some(child) = map.get(key) {
                    if let Some(found) = find_label(child) {
                        return Some(found);
                    }
                }
            }
            None
        }
        serde_json::Value::Array(arr) => arr.iter().find_map(find_label),
        _ => None,
    }
}

/// Recursively search a serde_json::Value for a location-like object and extract
/// (page, x, y) if possible. Supports keys: location, page, position, point,
/// pos, rect (rect may provide [x0,y0,x1,y1] coords; we use y0 as baseline).
fn find_location(value: &serde_json::Value) -> Option<(usize, f32, f32)> {
    match value {
        serde_json::Value::Object(map) => {
            // Direct location field
            if let Some(loc) = map.get("location") {
                if let Some(res) = extract_page_xy(loc) {
                    return Some(res);
                }
            }
            // Some outputs might put page/position at top-level
            if let Some(res) = extract_page_xy(&serde_json::Value::Object(map.clone())) {
                return Some(res);
            }
            // Recurse into children
            for (_k, v) in map.iter() {
                if let Some(found) = find_location(v) {
                    return Some(found);
                }
            }
            None
        }
        serde_json::Value::Array(arr) => arr.iter().find_map(find_location),
        _ => None,
    }
}

fn extract_page_xy(v: &serde_json::Value) -> Option<(usize, f32, f32)> {
    if let Some(obj) = v.as_object() {
        // Page
        // Page may be numeric or string; accept both
        let page = obj
            .get("page")
            .and_then(|p| p.as_u64().or_else(|| p.as_str().and_then(|s| s.parse::<u64>().ok())))
            .unwrap_or(1) as usize;

        // Position variants
        if let Some(pos) = obj.get("position").or_else(|| obj.get("point")).or_else(|| obj.get("pos")) {
            if let Some(pos_obj) = pos.as_object() {
                let x = pos_obj
                    .get("x")
                    .and_then(|v| v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse::<f64>().ok())))
                    .unwrap_or(0.0) as f32;
                let y = pos_obj
                    .get("y")
                    .and_then(|v| v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse::<f64>().ok())))
                    .unwrap_or(0.0) as f32;
                return Some((page, x, y));
            }
        }

        // rect variant: [x0, y0, x1, y1]
        if let Some(rect) = obj.get("rect") {
            if let Some(arr) = rect.as_array() {
                if arr.len() >= 2 {
                    let x = arr[0]
                        .as_f64()
                        .or_else(|| arr[0].as_str().and_then(|s| s.parse::<f64>().ok()))
                        .unwrap_or(0.0) as f32;
                    let y = arr[1]
                        .as_f64()
                        .or_else(|| arr[1].as_str().and_then(|s| s.parse::<f64>().ok()))
                        .unwrap_or(0.0) as f32;
                    return Some((page, x, y));
                }
            }
        }
    }
    None
}

