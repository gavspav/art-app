/**
 * Error Handling Utilities
 * Provides centralized error handling, logging, and recovery mechanisms
 */

/**
 * Error types for categorization
 */
export const ERROR_TYPES = {
  STORAGE: 'STORAGE',
  CANVAS: 'CANVAS',
  PARAMETER: 'PARAMETER',
  CONFIGURATION: 'CONFIGURATION',
  ANIMATION: 'ANIMATION',
  NETWORK: 'NETWORK',
  VALIDATION: 'VALIDATION',
  UNKNOWN: 'UNKNOWN'
};

/**
 * Error severity levels
 */
export const ERROR_SEVERITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

/**
 * Create a standardized error object
 * @param {string} type - Error type from ERROR_TYPES
 * @param {string} message - Human-readable error message
 * @param {Error} originalError - Original error object
 * @param {string} severity - Error severity from ERROR_SEVERITY
 * @param {Object} context - Additional context information
 * @returns {Object} Standardized error object
 */
export const createError = (type, message, originalError = null, severity = ERROR_SEVERITY.MEDIUM, context = {}) => ({
  id: Date.now().toString(36) + Math.random().toString(36).substr(2),
  type,
  message,
  originalError,
  severity,
  context,
  timestamp: new Date().toISOString(),
  userAgent: navigator.userAgent,
  url: window.location.href
});

/**
 * Error logger with different output methods
 */
export class ErrorLogger {
  constructor() {
    this.errors = [];
    this.maxErrors = 100; // Keep last 100 errors
  }

  /**
   * Log an error
   * @param {Object} error - Error object from createError
   */
  log(error) {
    // Add to internal log
    this.errors.unshift(error);
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(0, this.maxErrors);
    }

    // Console logging based on severity
    const logMethod = this.getLogMethod(error.severity);
    logMethod(`[${error.type}] ${error.message}`, {
      error: error.originalError,
      context: error.context,
      id: error.id
    });

    // Send to external monitoring if available
    this.sendToMonitoring(error);
  }

  /**
   * Get appropriate console method based on severity
   * @param {string} severity - Error severity
   * @returns {Function} Console method
   */
  getLogMethod(severity) {
    switch (severity) {
      case ERROR_SEVERITY.LOW:
        return console.info;
      case ERROR_SEVERITY.MEDIUM:
        return console.warn;
      case ERROR_SEVERITY.HIGH:
      case ERROR_SEVERITY.CRITICAL:
        return console.error;
      default:
        return console.log;
    }
  }

  /**
   * Send error to external monitoring service
   * @param {Object} error - Error object
   */
  sendToMonitoring(error) {
    // Placeholder for external monitoring integration
    // In a real app, this would send to services like Sentry, LogRocket, etc.
    if (window.errorMonitoring && typeof window.errorMonitoring.captureError === 'function') {
      window.errorMonitoring.captureError(error);
    }
  }

  /**
   * Get recent errors
   * @param {number} count - Number of recent errors to return
   * @returns {Array} Recent errors
   */
  getRecentErrors(count = 10) {
    return this.errors.slice(0, count);
  }

  /**
   * Get errors by type
   * @param {string} type - Error type to filter by
   * @returns {Array} Filtered errors
   */
  getErrorsByType(type) {
    return this.errors.filter(error => error.type === type);
  }

  /**
   * Clear error log
   */
  clear() {
    this.errors = [];
  }

  /**
   * Export errors for debugging
   * @returns {string} JSON string of all errors
   */
  export() {
    return JSON.stringify(this.errors, null, 2);
  }
}

// Global error logger instance
export const errorLogger = new ErrorLogger();

/**
 * Storage error handlers
 */
export const handleStorageError = (operation, key, error) => {
  const errorObj = createError(
    ERROR_TYPES.STORAGE,
    `Storage ${operation} failed for key '${key}': ${error.message}`,
    error,
    ERROR_SEVERITY.MEDIUM,
    { operation, key }
  );
  
  errorLogger.log(errorObj);
  
  // Return user-friendly message
  switch (operation) {
    case 'save':
      return 'Failed to save data. Your browser storage might be full.';
    case 'load':
      return 'Failed to load saved data. Using default settings.';
    case 'delete':
      return 'Failed to delete saved data.';
    default:
      return 'Storage operation failed.';
  }
};

/**
 * Canvas error handlers
 */
export const handleCanvasError = (operation, error, context = {}) => {
  const errorObj = createError(
    ERROR_TYPES.CANVAS,
    `Canvas ${operation} failed: ${error.message}`,
    error,
    ERROR_SEVERITY.HIGH,
    { operation, ...context }
  );
  
  errorLogger.log(errorObj);
  
  // Return recovery suggestions
  return {
    message: 'Canvas rendering failed. This might be due to browser compatibility issues.',
    suggestions: [
      'Try refreshing the page',
      'Enable hardware acceleration in your browser',
      'Update your browser to the latest version',
      'Try a different browser if the issue persists'
    ]
  };
};

/**
 * Parameter validation error handler
 */
export const handleParameterError = (parameterId, value, validationError) => {
  const errorObj = createError(
    ERROR_TYPES.PARAMETER,
    `Parameter validation failed for '${parameterId}': ${validationError.message}`,
    null,
    ERROR_SEVERITY.LOW,
    { parameterId, value, validationError }
  );
  
  errorLogger.log(errorObj);
  
  return `Invalid value for ${parameterId}. Using default value instead.`;
};

/**
 * Configuration error handler
 */
export const handleConfigurationError = (operation, filename, error) => {
  const errorObj = createError(
    ERROR_TYPES.CONFIGURATION,
    `Configuration ${operation} failed for '${filename}': ${error.message}`,
    error,
    ERROR_SEVERITY.MEDIUM,
    { operation, filename }
  );
  
  errorLogger.log(errorObj);
  
  switch (operation) {
    case 'save':
      return `Failed to save configuration '${filename}'. Please try again.`;
    case 'load':
      return `Failed to load configuration '${filename}'. Using current settings.`;
    case 'delete':
      return `Failed to delete configuration '${filename}'.`;
    default:
      return 'Configuration operation failed.';
  }
};

/**
 * Animation error handler
 */
export const handleAnimationError = (error, context = {}) => {
  const errorObj = createError(
    ERROR_TYPES.ANIMATION,
    `Animation error: ${error.message}`,
    error,
    ERROR_SEVERITY.MEDIUM,
    context
  );
  
  errorLogger.log(errorObj);
  
  return 'Animation encountered an error. Attempting to recover...';
};

/**
 * Generic error handler for unknown errors
 */
export const handleUnknownError = (error, context = {}) => {
  const errorObj = createError(
    ERROR_TYPES.UNKNOWN,
    `Unknown error: ${error.message}`,
    error,
    ERROR_SEVERITY.HIGH,
    context
  );
  
  errorLogger.log(errorObj);
  
  return 'An unexpected error occurred. Please try again.';
};

/**
 * Graceful degradation helper
 */
export const withGracefulDegradation = (fn, fallback, errorHandler = handleUnknownError) => {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      const message = errorHandler(error, { function: fn.name, args });
      console.warn(message);
      return fallback;
    }
  };
};

/**
 * Retry mechanism with exponential backoff
 */
export const withRetry = async (fn, maxRetries = 3, baseDelay = 1000) => {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
};

/**
 * Error recovery strategies
 */
export const RECOVERY_STRATEGIES = {
  /**
   * Reset to default state
   */
  RESET_TO_DEFAULT: 'RESET_TO_DEFAULT',
  
  /**
   * Retry operation
   */
  RETRY: 'RETRY',
  
  /**
   * Use cached/fallback data
   */
  USE_FALLBACK: 'USE_FALLBACK',
  
  /**
   * Graceful degradation
   */
  DEGRADE: 'DEGRADE',
  
  /**
   * User intervention required
   */
  USER_ACTION: 'USER_ACTION'
};

/**
 * Get recovery strategy for error type
 * @param {string} errorType - Error type
 * @returns {string} Recommended recovery strategy
 */
export const getRecoveryStrategy = (errorType) => {
  switch (errorType) {
    case ERROR_TYPES.STORAGE:
      return RECOVERY_STRATEGIES.USE_FALLBACK;
    case ERROR_TYPES.CANVAS:
      return RECOVERY_STRATEGIES.RETRY;
    case ERROR_TYPES.PARAMETER:
      return RECOVERY_STRATEGIES.RESET_TO_DEFAULT;
    case ERROR_TYPES.CONFIGURATION:
      return RECOVERY_STRATEGIES.USE_FALLBACK;
    case ERROR_TYPES.ANIMATION:
      return RECOVERY_STRATEGIES.RETRY;
    default:
      return RECOVERY_STRATEGIES.USER_ACTION;
  }
};

/**
 * User-friendly error messages
 */
export const getUserFriendlyMessage = (error) => {
  const baseMessages = {
    [ERROR_TYPES.STORAGE]: 'There was a problem saving your settings. Your changes might not be preserved.',
    [ERROR_TYPES.CANVAS]: 'The animation display encountered an issue. Try refreshing the page.',
    [ERROR_TYPES.PARAMETER]: 'Some settings had invalid values and were reset to defaults.',
    [ERROR_TYPES.CONFIGURATION]: 'There was a problem with your saved configuration.',
    [ERROR_TYPES.ANIMATION]: 'The animation encountered an error but will attempt to continue.',
    [ERROR_TYPES.NETWORK]: 'Network connection issue. Please check your internet connection.',
    [ERROR_TYPES.VALIDATION]: 'Some input values were invalid and have been corrected.',
    [ERROR_TYPES.UNKNOWN]: 'An unexpected error occurred. Please try again.'
  };

  return baseMessages[error.type] || baseMessages[ERROR_TYPES.UNKNOWN];
};