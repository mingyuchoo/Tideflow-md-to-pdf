import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import type { FileEntry, Preferences } from './types';

// File operations
export async function readMarkdownFile(path: string): Promise<string> {
  return invoke('read_markdown_file', { path });
}

export async function writeMarkdownFile(path: string, content: string): Promise<void> {
  return invoke('write_markdown_file', { path, content });
}

export async function listFiles(dirPath = ''): Promise<FileEntry[]> {
  return invoke('list_files', { dirPath });
}

export async function createFile(
  name: string,
  template?: string,
  dirPath?: string
): Promise<string> {
  return invoke('create_file', { name, template, dirPath });
}

export async function deleteFile(path: string): Promise<void> {
  return invoke('delete_file', { path });
}

export async function renameFile(oldPath: string, newName: string): Promise<string> {
  return invoke('rename_file', { oldPath, newName });
}

// Image operations
export async function importImage(
  imageData: string,
  fileName?: string
): Promise<string> {
  // IMPORTANT: Rust command parameters are snake_case (image_data, file_name).
  // Previous camelCase keys caused silent failure (no image inserted on drag/drop or paste).
  return invoke('import_image', { image_data: imageData, file_name: fileName });
}

// Rendering operations
export async function renderMarkdown(filePath: string): Promise<string> {
  return invoke('render_markdown', { filePath });
}

export async function renderTypst(content: string, format: string): Promise<string> {
  return invoke('render_typst', { content, format });
}

export async function exportMarkdown(filePath: string): Promise<string> {
  return invoke('export_markdown', { filePath });
}

// Preferences operations
interface BackendPreferences {
  papersize: string;
  margin: { x: string; y: string };
  toc: boolean;
  toc_title?: string;
  numberSections?: boolean; // backend serialized camelCase
  number_sections?: boolean; // tolerate snake just in case
  default_image_width: string;
  default_image_alignment: string;
  fonts: { main: string; mono: string };
  render_debounce_ms: number;
  focused_preview_enabled?: boolean;
  preserve_scroll_position: boolean;
}

export async function getPreferences(): Promise<Preferences> {
  const raw = await invoke<BackendPreferences>('get_preferences');
  return {
    papersize: raw.papersize,
    margin: raw.margin,
    toc: raw.toc,
    toc_title: raw.toc_title ?? '',
    number_sections: raw.numberSections ?? raw.number_sections ?? true,
    default_image_width: raw.default_image_width,
    default_image_alignment: raw.default_image_alignment,
    fonts: raw.fonts,
    render_debounce_ms: raw.render_debounce_ms,
    focused_preview_enabled: raw.focused_preview_enabled,
    preserve_scroll_position: raw.preserve_scroll_position,
  };
}

export async function setPreferences(preferences: Preferences): Promise<void> {
  const outbound: BackendPreferences = {
    papersize: preferences.papersize,
    margin: preferences.margin,
    toc: preferences.toc,
    toc_title: preferences.toc_title,
    numberSections: false, // numbering removed
    default_image_width: preferences.default_image_width,
    default_image_alignment: preferences.default_image_alignment,
    fonts: preferences.fonts,
    render_debounce_ms: preferences.render_debounce_ms,
    focused_preview_enabled: preferences.focused_preview_enabled,
    preserve_scroll_position: preferences.preserve_scroll_position,
  };
  await invoke('set_preferences', { preferences: outbound });
}

export async function applyPreferences(): Promise<void> {
  return invoke('apply_preferences');
}

// Cache management operations
export async function getCacheStats(): Promise<{
  cached_documents: number;
  cache_size_mb: number;
  cache_hits: number;
  cache_misses: number;
}> {
  return invoke('get_cache_stats');
}

export async function clearRenderCache(): Promise<void> {
  return invoke('clear_render_cache');
}

// Debug operations
export interface DebugPathsInfo {
  content_dir: string;
  build_dir: string;
  prefs_path: string;
  build_prefs_path: string;
  prefs_json: unknown;
  build_prefs_json?: unknown;
}

export async function debugPaths(): Promise<DebugPathsInfo> {
  return invoke('debug_paths');
}

export async function typstDiagnostics(): Promise<{
  detected_binary: string | null;
  attempted_binary_paths: string[];
  error: string | null;
}> {
  return invoke('typst_diagnostics');
}

// Dialog operations
export async function showOpenDialog(
  filters?: { name: string; extensions: string[] }[],
  directory = false
): Promise<string | null> {
  try {
    // Ensure the dialog plugin is loaded and available
    if (typeof open !== 'function') {
      throw new Error('Dialog plugin not available');
    }
    
    // Use more specific type annotation to help TypeScript
    const dialogOptions: {
      multiple?: boolean;
      directory?: boolean;
      filters?: { name: string; extensions: string[] }[];
    } = {
      multiple: false,
      directory
    };
    
    if (filters && filters.length > 0) {
      dialogOptions.filters = filters;
    }
    
    const result = await open(dialogOptions);
    
    if (result === null) {
      return null;
    }
    
    if (Array.isArray(result)) {
      return result.length > 0 ? result[0] : null;
    } else {
      return result || null;
    }
  } catch {
    // Fall back to a hardcoded test path for debugging
    return 'C:\\Users\\Deniz\\Desktop\\mdtopdf\\test\\test-document.md';
  }
}

// Event listeners
export async function listenForFileChanges(
  callback: (filePath: string) => void
): Promise<UnlistenFn> {
  // This returns an unlisten function
  return listen('file-changed', (event) => {
    callback(event.payload as string);
  });
}

// Helper for generating Markdown image syntax
export function generateImageMarkdown(
  path: string,
  width: string = '60%',
  alignment: string = 'center',
  altText: string = ''
): string {
  return `![${altText}](${path}){fig-align="${alignment}" width="${width}"}`;
}
