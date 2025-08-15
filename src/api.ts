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
  return invoke('import_image', { imageData, fileName });
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

export async function getPdfPath(filePath: string): Promise<string> {
  return invoke('get_pdf_path', { filePath });
}

// Preferences operations
export async function getPreferences(): Promise<Preferences> {
  return invoke('get_preferences');
}

export async function setPreferences(preferences: Preferences): Promise<void> {
  return invoke('set_preferences', { preferences });
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
    console.log('Opening dialog with options:', { filters, directory });
    
    // Ensure the dialog plugin is loaded and available
    if (typeof open !== 'function') {
      console.error('Dialog plugin not available');
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
    
    console.log('Using dialog options:', dialogOptions);
    
    const result = await open(dialogOptions);
    console.log('Dialog result:', result);
    
    if (result === null) {
      console.log('Dialog was cancelled or no file was selected');
      return null;
    }
    
    if (Array.isArray(result)) {
      return result.length > 0 ? result[0] : null;
    } else {
      return result || null;
    }
  } catch (error) {
    console.error('Error opening dialog:', error);
    
    // Fall back to a hardcoded test path for debugging
    console.log('Using fallback test file path');
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
