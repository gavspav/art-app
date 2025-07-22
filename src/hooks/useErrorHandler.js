/**
 * Error Handler Hook
 * Provides error handling capabilities for React components
 */

import { useState, useCallback, useRef } from 'react';
import { 
  errorLogger, 
  createError, 
  ERROR_TYPES, 
  ERROR_SEVERITY,
  getUserFriendlyMessage,
  getRecoveryStrategy,
  RECOVERY_STRATEGIES
} from '../utils/errorHandling.js';

/**
 * Custom hook for error handling in React components
 * @param {Object} options - Configuration options
 * @returns {Object} Error handling utilities
 */
export const useErrorHandler = (options = {}) => {
  const {
    onError = null,
    autoRecover = true,
    showUserMessages = true,
    logErrors = true
  } = options;

  const [errors, setErrors] = useState([]);
  const [isRecovering, setIsRecovering] = useState(false);
  const recoveryAttempts = useRef(new Map());

  /**
   * Handle an error with automatic logging and recovery
   * @param {Error} error - The error that occurred
   * @param {string} errorType - Type of error from ERROR_TYPES
   * @param {Object} context - Additional context information
   * @param {string} severity - Error severity from ERROR_SEVERITY
   * @returns {Object} Error handling result
   */
  const handleError = useCallback((error, errorType = ERROR_TYPES.UNKNOWN, context = {}, severity = ERROR_SEVERITY.MEDIUM) => {
    const errorObj = createError(errorType, error.message, error, severity, {
      component: context.component || 'Unknown',
      action: context.action || 'Unknown',
      ...context
    });

    // Log error if enabled
    if (logErrors) {
      errorLogger.log(errorObj);
    }

    // Add to component error state
    setErrors(prev => [errorObj, ...prev.slice(0, 9)]); // Keep last 10 errors

    // Call custom error handler if provided
    if (onError) {
      onError(errorObj);
    }

    // Determine recovery strategy
    const recoveryStrategy = getRecoveryStrategy(errorType);
    const userMessage = showUserMessages ? getUserFriendlyMessage(errorObj) : null;

    return {
      error: errorObj,
      recoveryStrategy,
      userMessage,
      canRecover: autoRecover && recoveryStrategy !== RECOVERY_STRATEGIES.USER_ACTION
    };
  }, [onError, autoRecover, showUserMessages, logErrors]);

  /**
   * Attempt to recover from an error
   * @param {string} errorId - ID of the error to recover from
   * @param {Function} recoveryAction - Function to execute for recovery
   * @returns {Promise<boolean>} Success status of recovery
   */
  const recoverFromError = useCallback(async (errorId, recoveryAction) => {
    const error = errors.find(e => e.id === errorId);
    if (!error) {
      return false;
    }

    // Check recovery attempt count
    const attempts = recoveryAttempts.current.get(errorId) || 0;
    if (attempts >= 3) {
      console.warn(`Max recovery attempts reached for error ${errorId}`);
      return false;
    }

    setIsRecovering(true);
    recoveryAttempts.current.set(errorId, attempts + 1);

    try {
      if (recoveryAction) {
        await recoveryAction();
      }

      // Remove error from state on successful recovery
      setErrors(prev => prev.filter(e => e.id !== errorId));
      recoveryAttempts.current.delete(errorId);
      
      return true;
    } catch (recoveryError) {
      console.error('Recovery failed:', recoveryError);
      
      // Log recovery failure
      const recoveryErrorObj = createError(
        ERROR_TYPES.UNKNOWN,
        `Recovery failed for error ${errorId}: ${recoveryError.message}`,
        recoveryError,
        ERROR_SEVERITY.HIGH,
        { originalErrorId: errorId, recoveryAttempt: attempts + 1 }
      );
      
      if (logErrors) {
        errorLogger.log(recoveryErrorObj);
      }
      
      return false;
    } finally {
      setIsRecovering(false);
    }
  }, [errors, logErrors]);

  /**
   * Clear a specific error from the state
   * @param {string} errorId - ID of the error to clear
   */
  const clearError = useCallback((errorId) => {
    setErrors(prev => prev.filter(e => e.id !== errorId));
    recoveryAttempts.current.delete(errorId);
  }, []);

  /**
   * Clear all errors from the state
   */
  const clearAllErrors = useCallback(() => {
    setErrors([]);
    recoveryAttempts.current.clear();
  }, []);

  /**
   * Wrap an async function with error handling
   * @param {Function} fn - Async function to wrap
   * @param {string} errorType - Type of error to handle
   * @param {Object} context - Error context
   * @returns {Function} Wrapped function
   */
  const withErrorHandling = useCallback((fn, errorType = ERROR_TYPES.UNKNOWN, context = {}) => {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        const result = handleError(error, errorType, context);
        
        // Attempt automatic recovery if possible
        if (result.canRecover && result.recoveryStrategy === RECOVERY_STRATEGIES.RETRY) {
          console.log('Attempting automatic recovery...');
          const recovered = await recoverFromError(result.error.id, () => fn(...args));
          if (recovered) {
            return fn(...args); // Retry the original function
          }
        }
        
        throw error; // Re-throw if recovery failed or not applicable
      }
    };
  }, [handleError, recoverFromError]);

  /**
   * Create an error boundary fallback component
   * @param {Object} errorBoundaryProps - Props for the error boundary
   * @returns {Function} Fallback component
   */
  const createErrorFallback = useCallback((errorBoundaryProps = {}) => {
    return (error, retry, reset) => {
      const errorObj = createError(
        ERROR_TYPES.UNKNOWN,
        error?.message || 'Component error',
        error,
        ERROR_SEVERITY.HIGH,
        { boundary: true, ...errorBoundaryProps }
      );

      if (logErrors) {
        errorLogger.log(errorObj);
      }

      return (
        <div style={{
          padding: '20px',
          margin: '10px',
          border: '1px solid #ff6b6b',
          borderRadius: '8px',
          backgroundColor: '#ffe0e0',
          textAlign: 'center'
        }}>
          <h3 style={{ color: '#d63031', margin: '0 0 10px 0' }}>
            {errorBoundaryProps.title || 'Component Error'}
          </h3>
          <p style={{ color: '#2d3436', margin: '0 0 15px 0' }}>
            {errorBoundaryProps.message || 'This component encountered an error and couldn\'t render properly.'}
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              onClick={retry}
              style={{
                padding: '8px 16px',
                backgroundColor: '#0984e3',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Try Again
            </button>
            <button
              onClick={reset}
              style={{
                padding: '8px 16px',
                backgroundColor: '#00b894',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Reset
            </button>
          </div>
        </div>
      );
    };
  }, [logErrors]);

  /**
   * Get error statistics
   * @returns {Object} Error statistics
   */
  const getErrorStats = useCallback(() => {
    const errorsByType = {};
    const errorsBySeverity = {};
    
    errors.forEach(error => {
      errorsByType[error.type] = (errorsByType[error.type] || 0) + 1;
      errorsBySeverity[error.severity] = (errorsBySeverity[error.severity] || 0) + 1;
    });

    return {
      total: errors.length,
      byType: errorsByType,
      bySeverity: errorsBySeverity,
      hasErrors: errors.length > 0,
      hasCriticalErrors: errors.some(e => e.severity === ERROR_SEVERITY.CRITICAL)
    };
  }, [errors]);

  return {
    // Error state
    errors,
    isRecovering,
    hasErrors: errors.length > 0,
    
    // Error handling functions
    handleError,
    recoverFromError,
    clearError,
    clearAllErrors,
    
    // Utility functions
    withErrorHandling,
    createErrorFallback,
    getErrorStats,
    
    // Recent errors for debugging
    recentErrors: errors.slice(0, 5)
  };
};

export default useErrorHandler;