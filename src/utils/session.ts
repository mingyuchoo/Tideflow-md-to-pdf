// Session persistence utilities
// Stores open files, current file, preview visibility, and sample doc content.

import { logger } from './logger';

const sessionLogger = logger.createScoped('Session');

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
    if (!raw) {
      sessionLogger.debug('No session data found');
      return null;
    }
    const data = JSON.parse(raw) as TideflowSessionData;
    if (data.version !== VERSION) {
      sessionLogger.warn(`Incompatible session version: ${data.version}, expected: ${VERSION}`);
      return null; // ignore incompatible versions
    }
    sessionLogger.debug('Session loaded successfully', { openFiles: data.openFiles.length });
    return data;
  } catch (error) {
    sessionLogger.error('Failed to load session', error);
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
    sessionLogger.debug('Session saved', { currentFile: merged.currentFile });
  } catch (error) {
    sessionLogger.warn('Failed to save session', error);
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
    sessionLogger.info('Session cleared');
  } catch (error) {
    sessionLogger.warn('Failed to clear session', error);
  }
}
