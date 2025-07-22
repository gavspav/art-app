/**
 * Error Handling Utilities Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createError,
  ErrorLogger,
  errorLogger,
  handleStorageError,
  handleCanvasError,
  handleParameterError,
  handleConfigurationError,
  handleAnimationError,
  handleUnknownError,
  withGracefulDegradation,
  withRetry,
  getRecoveryStrategy,
  getUserFriendlyMessage,
  ERROR_TYPES,
  ERROR_SEVERITY,
  RECOVERY_STRATEGIES
} from '../errorHandling.js';

describe('Error Handling Utilities', () => {
  beforeEach(() => {
    // Clear error logger before each test
    errorLogger.clear();
    vi.clearAllMocks();
  });

  describe('createError', () => {
    it('should create a standardized error object', () => {
      const originalError = new Error('Test error');
      const context = { userId: '123' };
      
      const error = createError(
        ERROR_TYPES.STORAGE,
        'Storage failed',
        originalError,
        ERROR_SEVERITY.HIGH,
        context
      );

      expect(error).toMatchObject({
        type: ERROR_TYPES.STORAGE,
        message: 'Storage failed',
        originalError,
        severity: ERROR_SEVERITY.HIGH,
        context
      });
      expect(error.id).toBeDefined();
      expect(error.timestamp).toBeDefined();
      expect(error.userAgent).toBeDefined();
      expect(error.url).toBeDefined();
    });

    it('should use default values when optional parameters are omitted', () => {
      const error = createError(ERROR_TYPES.CANVAS, 'Canvas error');

      expect(error.originalError).toBeNull();
      expect(error.severity).toBe(ERROR_SEVERITY.MEDIUM);
      expect(error.context).toEqual({});
    });
  });

  describe('ErrorLogger', () => {
    let logger;

    beforeEach(() => {
      logger = new ErrorLogger();
    });

    it('should log errors and maintain them in memory', () => {
      const error = createError(ERROR_TYPES.STORAGE, 'Test error');
      
      logger.log(error);
      
      expect(logger.errors).toHaveLength(1);
      expect(logger.errors[0]).toBe(error);
    });

    it('should limit the number of stored errors', () => {
      logger.maxErrors = 3;
      
      for (let i = 0; i < 5; i++) {
        const error = createError(ERROR_TYPES.STORAGE, `Error ${i}`);
        logger.log(error);
      }
      
      expect(logger.errors).toHaveLength(3);
      expect(logger.errors[0].message).toBe('Error 4'); // Most recent first
    });

    it('should get recent errors', () => {
      for (let i = 0; i < 5; i++) {
        const error = createError(ERROR_TYPES.STORAGE, `Error ${i}`);
        logger.log(error);
      }
      
      const recent = logger.getRecentErrors(3);
      expect(recent).toHaveLength(3);
      expect(recent[0].message).toBe('Error 4');
    });

    it('should filter errors by type', () => {
      logger.log(createError(ERROR_TYPES.STORAGE, 'Storage error'));
      logger.log(createError(ERROR_TYPES.CANVAS, 'Canvas error'));
      logger.log(createError(ERROR_TYPES.STORAGE, 'Another storage error'));
      
      const storageErrors = logger.getErrorsByType(ERROR_TYPES.STORAGE);
      expect(storageErrors).toHaveLength(2);
      expect(storageErrors.every(e => e.type === ERROR_TYPES.STORAGE)).toBe(true);
    });

    it('should clear all errors', () => {
      logger.log(createError(ERROR_TYPES.STORAGE, 'Test error'));
      expect(logger.errors).toHaveLength(1);
      
      logger.clear();
      expect(logger.errors).toHaveLength(0);
    });

    it('should export errors as JSON', () => {
      const error = createError(ERROR_TYPES.STORAGE, 'Test error');
      logger.log(error);
      
      const exported = logger.export();
      const parsed = JSON.parse(exported);
      
      expect(parsed).toHaveLength(1);
      expect(parsed[0].message).toBe('Test error');
    });
  });

  describe('Error Handlers', () => {
    it('should handle storage errors', () => {
      const error = new Error('Storage quota exceeded');
      const message = handleStorageError('save', 'test-key', error);
      
      expect(message).toBe('Failed to save data. Your browser storage might be full.');
      expect(errorLogger.errors).toHaveLength(1);
      expect(errorLogger.errors[0].type).toBe(ERROR_TYPES.STORAGE);
    });

    it('should handle canvas errors', () => {
      const error = new Error('WebGL context lost');
      const result = handleCanvasError('render', error);
      
      expect(result.message).toContain('Canvas rendering failed');
      expect(result.suggestions).toBeInstanceOf(Array);
      expect(errorLogger.errors).toHaveLength(1);
      expect(errorLogger.errors[0].type).toBe(ERROR_TYPES.CANVAS);
    });

    it('should handle parameter errors', () => {
      const validationError = { message: 'Value out of range' };
      const message = handleParameterError('speed', 2.5, validationError);
      
      expect(message).toContain('Invalid value for speed');
      expect(errorLogger.errors).toHaveLength(1);
      expect(errorLogger.errors[0].type).toBe(ERROR_TYPES.PARAMETER);
    });

    it('should handle configuration errors', () => {
      const error = new Error('File not found');
      const message = handleConfigurationError('load', 'test-config', error);
      
      expect(message).toContain("Failed to load configuration 'test-config'");
      expect(errorLogger.errors).toHaveLength(1);
      expect(errorLogger.errors[0].type).toBe(ERROR_TYPES.CONFIGURATION);
    });

    it('should handle animation errors', () => {
      const error = new Error('Animation frame error');
      const message = handleAnimationError(error);
      
      expect(message).toContain('Animation encountered an error');
      expect(errorLogger.errors).toHaveLength(1);
      expect(errorLogger.errors[0].type).toBe(ERROR_TYPES.ANIMATION);
    });

    it('should handle unknown errors', () => {
      const error = new Error('Unknown error');
      const message = handleUnknownError(error);
      
      expect(message).toContain('An unexpected error occurred');
      expect(errorLogger.errors).toHaveLength(1);
      expect(errorLogger.errors[0].type).toBe(ERROR_TYPES.UNKNOWN);
    });
  });

  describe('withGracefulDegradation', () => {
    it('should return function result when successful', async () => {
      const successFn = vi.fn().mockResolvedValue('success');
      const fallback = 'fallback';
      
      const wrappedFn = withGracefulDegradation(successFn, fallback);
      const result = await wrappedFn('arg1', 'arg2');
      
      expect(result).toBe('success');
      expect(successFn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should return fallback when function throws', async () => {
      const failFn = vi.fn().mockRejectedValue(new Error('Function failed'));
      const fallback = 'fallback';
      
      const wrappedFn = withGracefulDegradation(failFn, fallback);
      const result = await wrappedFn();
      
      expect(result).toBe('fallback');
      expect(errorLogger.errors).toHaveLength(1);
    });

    it('should use custom error handler', async () => {
      const failFn = vi.fn().mockRejectedValue(new Error('Function failed'));
      const fallback = 'fallback';
      const customHandler = vi.fn().mockReturnValue('Custom error message');
      
      const wrappedFn = withGracefulDegradation(failFn, fallback, customHandler);
      await wrappedFn();
      
      expect(customHandler).toHaveBeenCalled();
    });
  });

  describe('withRetry', () => {
    it('should return result on first success', async () => {
      const successFn = vi.fn().mockResolvedValue('success');
      
      const result = await withRetry(successFn, 3, 100);
      
      expect(result).toBe('success');
      expect(successFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const retryFn = vi.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');
      
      const result = await withRetry(retryFn, 3, 10);
      
      expect(result).toBe('success');
      expect(retryFn).toHaveBeenCalledTimes(3);
    });

    it('should throw last error after max retries', async () => {
      const failFn = vi.fn().mockRejectedValue(new Error('Always fails'));
      
      await expect(withRetry(failFn, 2, 10)).rejects.toThrow('Always fails');
      expect(failFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('getRecoveryStrategy', () => {
    it('should return appropriate recovery strategies', () => {
      expect(getRecoveryStrategy(ERROR_TYPES.STORAGE)).toBe(RECOVERY_STRATEGIES.USE_FALLBACK);
      expect(getRecoveryStrategy(ERROR_TYPES.CANVAS)).toBe(RECOVERY_STRATEGIES.RETRY);
      expect(getRecoveryStrategy(ERROR_TYPES.PARAMETER)).toBe(RECOVERY_STRATEGIES.RESET_TO_DEFAULT);
      expect(getRecoveryStrategy(ERROR_TYPES.CONFIGURATION)).toBe(RECOVERY_STRATEGIES.USE_FALLBACK);
      expect(getRecoveryStrategy(ERROR_TYPES.ANIMATION)).toBe(RECOVERY_STRATEGIES.RETRY);
      expect(getRecoveryStrategy('UNKNOWN_TYPE')).toBe(RECOVERY_STRATEGIES.USER_ACTION);
    });
  });

  describe('getUserFriendlyMessage', () => {
    it('should return user-friendly messages for different error types', () => {
      const storageError = createError(ERROR_TYPES.STORAGE, 'Storage failed');
      const canvasError = createError(ERROR_TYPES.CANVAS, 'Canvas failed');
      const unknownError = createError('UNKNOWN_TYPE', 'Unknown failed');
      
      expect(getUserFriendlyMessage(storageError)).toContain('problem saving your settings');
      expect(getUserFriendlyMessage(canvasError)).toContain('animation display encountered an issue');
      expect(getUserFriendlyMessage(unknownError)).toContain('unexpected error occurred');
    });
  });
});