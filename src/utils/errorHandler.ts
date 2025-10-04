/**
 * Centralized error handling utilities for consistent user feedback
 */

import { logger } from './logger';

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface ErrorContext {
  operation: string;
  component?: string;
  details?: string;
}

/**
 * Handle errors consistently across the application
 */
export function handleError(
  error: unknown, 
  context: ErrorContext, 
  severity: ErrorSeverity = 'error'
): void {
  const errorMsg = error instanceof Error ? error.message : String(error);
  const component = context.component || 'App';
  
  // Log to console for debugging (using centralized logger)
  logger.error(component, `${context.operation} failed: ${errorMsg}`);
  if (context.details) {
    logger.debug(component, 'Additional details', context.details);
  }
  
  // Show user feedback based on severity
  switch (severity) {
    case 'critical':
      alert(`Critical error: ${context.operation} failed. ${errorMsg}`);
      break;
    case 'error':
      alert(`Error: ${context.operation} failed. ${errorMsg}`);
      break;
    case 'warning':
      // Only log warnings, don't interrupt user
      logger.warn(component, `Warning in ${context.operation}: ${errorMsg}`);
      break;
    case 'info':
      logger.info(component, `${context.operation}: ${errorMsg}`);
      break;
  }
}

/**
 * Show success message for user operations
 */
export function showSuccess(message: string): void {
  logger.info('UI', message);
  // Could be enhanced with toast notifications in the future
}

/**
 * Wrap async operations with consistent error handling
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context: ErrorContext,
  severity: ErrorSeverity = 'error'
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    handleError(error, context, severity);
    return null;
  }
}