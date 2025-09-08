/**
 * Centralized error handling utilities for consistent user feedback
 */

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
  const logPrefix = `[${context.component || 'App'}]`;
  
  // Always log to console for debugging
  console.error(`${logPrefix} ${context.operation} failed:`, errorMsg);
  if (context.details) {
    console.error('Additional details:', context.details);
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
      console.warn(`${logPrefix} Warning in ${context.operation}:`, errorMsg);
      break;
    case 'info':
      console.info(`${logPrefix} ${context.operation}:`, errorMsg);
      break;
  }
}

/**
 * Show success message for user operations
 */
export function showSuccess(message: string): void {
  console.log('✅', message);
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