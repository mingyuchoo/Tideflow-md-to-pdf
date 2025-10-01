import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import type {
  BackendRenderedDocument,
  FileEntry,
  Preferences,
  RenderedDocument,
  SourceMap,
} from './types';

// File operations
export async function readMarkdownFile(path: string): Promise<string> {
  return invoke('read_markdown_file', { path });
}

import { scrubRawTypstAnchors } from './utils/scrubAnchors';

export async function writeMarkdownFile(path: string, content: string): Promise<void> {
  // Ensure any injected preview-only raw-typst anchors are removed before
  // persisting to disk. This centralizes scrubbing so every caller is safe.
  const cleaned = scrubRawTypstAnchors(content);
  return invoke('write_markdown_file', { path, content: cleaned });
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

// Import an image from a filesystem path by copying it into the app's assets directory.
export async function importImageFromPath(sourcePath: string): Promise<string> {
  // Send both camelCase and snake_case to be safe across bindings
  return invoke('import_image_from_path', { sourcePath, source_path: sourcePath });
}

// Rendering operations
export async function renderMarkdown(filePath: string): Promise<RenderedDocument> {
  const raw = await invoke<BackendRenderedDocument>('render_markdown', { filePath });
  return normalizeRenderedDocument(raw);
}

// Latest-wins coalesced render queue for Typst
// If multiple renderTypst calls happen rapidly, coalesce them so only the latest
// content is rendered. All callers receive the final output path.
type RenderArgs = { content: string; format: string };
let typstRenderInFlight = false;
let typstPending: RenderArgs | null = null;
let typstSharedPromise: Promise<RenderedDocument> | null = null;
let typstSharedResolve: ((doc: RenderedDocument) => void) | null = null;
let typstSharedReject: ((err: unknown) => void) | null = null;

function normalizeSourceMap(map: SourceMap | undefined): SourceMap {
  if (!map) {
    return { anchors: [] };
  }
  if (!Array.isArray(map.anchors)) {
    return { anchors: [] };
  }
  return {
    anchors: map.anchors.map((anchor) => ({
      id: anchor.id,
      editor: anchor.editor,
      pdf: anchor.pdf,
    })),
  };
}

function normalizeRenderedDocument(doc: BackendRenderedDocument): RenderedDocument {
  return {
    pdfPath: doc.pdf_path,
    sourceMap: normalizeSourceMap(doc.source_map),
  };
}

async function invokeRenderTypst(args: RenderArgs): Promise<RenderedDocument> {
  const raw = await invoke<BackendRenderedDocument>('render_typst', args);
  return normalizeRenderedDocument(raw);
}

export function renderTypst(content: string, format: string): Promise<RenderedDocument> {
  const nextArgs: RenderArgs = { content, format };
  if (typstRenderInFlight) {
    // Replace any previously pending args with the latest
    typstPending = nextArgs;
    // Return a shared promise that resolves when the final render completes
    if (!typstSharedPromise) {
      typstSharedPromise = new Promise<RenderedDocument>((resolve, reject) => {
        typstSharedResolve = resolve;
        typstSharedReject = reject;
      });
    }
    return typstSharedPromise;
  }

  // Start a rendering loop processing the initial args and any pending ones
  typstRenderInFlight = true;
  return new Promise<RenderedDocument>((resolve, reject) => {
    let current: RenderArgs = nextArgs;
    // Ensure a shared promise exists so concurrent callers during the loop get the final path
    if (!typstSharedPromise) {
      typstSharedPromise = new Promise<RenderedDocument>((res, rej) => {
        typstSharedResolve = res;
        typstSharedReject = rej;
      });
    }
    (async () => {
      try {
  // Loop processes current request and any queued latest args; last one wins
  // We break explicitly when no pending is left
  for (;;) {
          const document = await invokeRenderTypst(current);
          // If a newer request was queued during this render, render that next
          if (typstPending) {
            current = typstPending;
            typstPending = null;
            continue;
          }
          // No more pending: finalize and resolve
          typstRenderInFlight = false;
          const finalDocument = document;
          // Resolve both the shared and this specific promise
          if (typstSharedResolve) typstSharedResolve(finalDocument);
          // Reset shared handles after settling
          typstSharedPromise = null;
          typstSharedResolve = null;
          typstSharedReject = null;
          resolve(finalDocument);
          break;
        }
      } catch (err) {
        // If there was a failure but another request arrived, try that next
        if (typstPending) {
          const retryArgs = typstPending;
          typstPending = null;
          try {
            const document = await invokeRenderTypst(retryArgs);
            // Drain any additional pending
            while (typstPending) {
              const next = typstPending;
              typstPending = null;
              await invokeRenderTypst(next);
            }
            typstRenderInFlight = false;
            if (typstSharedResolve) typstSharedResolve(document);
            typstSharedPromise = null;
            typstSharedResolve = null;
            typstSharedReject = null;
            resolve(document);
            return;
          } catch (err2) {
            typstRenderInFlight = false;
            if (typstSharedReject) typstSharedReject(err2);
            typstSharedPromise = null;
            typstSharedResolve = null;
            typstSharedReject = null;
            reject(err2);
            return;
          }
        }
        // No pending retry available; fail the queue
        typstRenderInFlight = false;
        if (typstSharedReject) typstSharedReject(err);
        typstSharedPromise = null;
        typstSharedResolve = null;
        typstSharedReject = null;
        reject(err);
      }
    })();
  });
}

export async function exportMarkdown(filePath: string): Promise<string> {
  return invoke('export_markdown', { filePath });
}

// Preferences operations
interface BackendPreferences {
  theme_id?: string;
  papersize: string;
  margin: { x: string; y: string };
  toc: boolean;
  toc_title?: string;
  cover_page?: boolean;
  cover_title?: string;
  cover_writer?: string;
  cover_image?: string;
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
    theme_id: raw.theme_id ?? 'default',
    papersize: raw.papersize,
    margin: raw.margin,
    toc: raw.toc,
    toc_title: raw.toc_title ?? '',
    cover_page: raw.cover_page ?? false,
    cover_title: raw.cover_title ?? '',
    cover_writer: raw.cover_writer ?? '',
    cover_image: raw.cover_image ?? '',
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
    theme_id: preferences.theme_id,
    papersize: preferences.papersize,
    margin: preferences.margin,
    toc: preferences.toc,
    toc_title: preferences.toc_title,
    cover_page: preferences.cover_page,
    cover_title: preferences.cover_title,
    cover_writer: preferences.cover_writer,
    cover_image: preferences.cover_image,
    numberSections: preferences.number_sections,
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
  // Use HTML <img> so our Typst template's cmarker html override can apply width and alignment.
  // Alignment is provided via data-align to avoid conflicting with HTML align defaults.
  const trimmedWidth = width.trim();
  const trimmedAlignment = alignment.trim() || 'center';
  const widthAttr = trimmedWidth.length > 0 ? ` width="${trimmedWidth}"` : '';
  const safeAlt = altText
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  return `<img src="${path}" alt="${safeAlt}"${widthAttr} data-align="${trimmedAlignment}" />`;
}

// Cleanup operations
export async function cleanupTempPdfs(keepLastN?: number): Promise<{
  files_removed: number;
  total_space_freed: number;
}> {
  return invoke('cleanup_temp_pdfs', { keepLastN });
}
