/**
 * Centralized logging utility with environment-aware verbosity levels.
 * In production, only errors and warnings are logged.
 */

const isDev = process.env.NODE_ENV !== 'production';

export const logger = {
  debug: (component: string, message: string, data?: unknown) => {
    if (isDev) {
      console.debug(`[${component}] ${message}`, data ?? '');
    }
  },
  
  info: (component: string, message: string, data?: unknown) => {
    if (isDev) {
      console.log(`[${component}] ${message}`, data ?? '');
    }
  },
  
  warn: (component: string, message: string, data?: unknown) => {
    console.warn(`[${component}] ${message}`, data ?? '');
  },
  
  error: (component: string, message: string, error?: unknown) => {
    console.error(`[${component}] ${message}`, error ?? '');
  },
};
