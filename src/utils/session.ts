// Session persistence utilities
// Stores open files, current file, preview visibility, and sample doc content.

export interface TideflowSessionData {
  openFiles: string[];
  currentFile: string | null;
  previewVisible: boolean;
  fullscreen?: boolean;
  maximized?: boolean;
  sampleDocContent: string | null;
  timestamp: number;
  version: number;
}

const KEY = 'tideflowSession';
const VERSION = 1;

export function loadSession(): TideflowSessionData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as TideflowSessionData;
    if (data.version !== VERSION) return null; // ignore incompatible versions
    return data;
  } catch {
    return null;
  }
}

export function saveSession(partial: Partial<TideflowSessionData>) {
  try {
    const existing = loadSession();
    const merged: TideflowSessionData = {
      openFiles: [],
      currentFile: null,
      previewVisible: true,
      fullscreen: false,
      maximized: true,
      sampleDocContent: null,
      version: VERSION,
      ...existing,
      ...partial,
  timestamp: Date.now()
    };
    localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    // ignore persistence failures
  }
}

export function clearSession() {
  try { 
    localStorage.removeItem(KEY); 
  } catch {
    // ignore
  }
}
