/**
 * Tests for useErrorHandler hook
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useErrorHandler } from '../useErrorHandler.js';
import * as errorHandling from '../../utils/errorHandling.js';

// Mock the error handling utilities
vi.mock('../../utils/errorHandling.js', () => ({
  errorLogger: {
    log: vi.fn(),
    getRecentErrors: vi.fn(() => []),
    clearErrors: vi.fn()
  },
  createError: vi.fn((type, message, error, severity, context) => ({
    id: 'test-error-id',
    type,
    message,
    error,
    severity,
    context,
    timestamp: new Date().toISOString()
  })),
  ERROR_TYPES: {
    STORAGE: 'STORAGE',
    CANVAS: 'CANVAS',
    PARAMETER: 'PARAMETER',
    CONFIGURATION: 'CONFIGURATION',
    ANIMATION: 'ANIMATION',
    UNKNOWN: 'UNKNOWN'
  },
  ERROR_SEVERITY: {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    CRITICAL: 'CRITICAL'
  },
  getUserFriendlyMessage: vi.fn(() => 'Something went wrong'),
  getRecoveryStrategy: vi.fn(() => 'RETRY'),
  RECOVERY_STRATEGIES: {
    RETRY: 'RETRY',
    RELOAD: 'RELOAD',
    RESET: 'RESET',
    USER_ACTION: 'USER_ACTION'
  }
}));

describe('useErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with empty error state', () => {
      const { result } = renderHook(() => useErrorHandler());
      
      expect(result.current.errors).toEqual([]);
      expect(result.current.isRecovering).toBe(false);
    });

    it('should accept configuration options', () => {
      const onError = vi.fn();
      const { result } = renderHook(() => useErrorHandler({
        onError,
        autoRecover: false,
        showUserMessages: false,
        logErrors: false
      }));
      
      expect(result.current.errors).toEqual([]);
    });
  });

  describe('handleError', () => {
    it('should handle errors and add them to state', () => {
      const { result } = renderHook(() => useErrorHandler());
      
      const testError = new Error('Test error');
      
      act(() => {
        result.current.handleError(testError, 'STORAGE', { component: 'TestComponent' });
      });
      
      expect(result.current.errors).toHaveLength(1);
      expect(errorHandling.createError).toHaveBeenCalledWith(
        'STORAGE',
        'Test error',
        testError,
        'MEDIUM',
        expect.objectContaining({ component: 'TestComponent' })
      );
    });

    it('should call custom error handler when provided', () => {
      const onError = vi.fn();
      const { result } = renderHook(() => useErrorHandler({ onError }));
      
      const testError = new Error('Test error');
      
      act(() => {
        result.current.handleError(testError);
      });
      
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({
        id: 'test-error-id',
        message: 'Test error'
      }));
    });

    it('should log errors when logging is enabled', () => {
      const { result } = renderHook(() => useErrorHandler({ logErrors: true }));
      
      const testError = new Error('Test error');
      
      act(() => {
        result.current.handleError(testError);
      });
      
      expect(errorHandling.errorLogger.log).toHaveBeenCalled();
    });

    it('should not log errors when logging is disabled', () => {
      const { result } = renderHook(() => useErrorHandler({ logErrors: false }));
      
      const testError = new Error('Test error');
      
      act(() => {
        result.current.handleError(testError);
      });
      
      expect(errorHandling.errorLogger.log).not.toHaveBeenCalled();
    });

    it('should limit error history to 10 items', () => {
      const { result } = renderHook(() => useErrorHandler());
      
      // Add 12 errors
      act(() => {
        for (let i = 0; i < 12; i++) {
          result.current.handleError(new Error(`Error ${i}`));
        }
      });
      
      expect(result.current.errors).toHaveLength(10);
    });
  });

  describe('clearError', () => {
    it('should remove specific error from state', () => {
      const { result } = renderHook(() => useErrorHandler());
      
      const testError = new Error('Test error');
      
      act(() => {
        result.current.handleError(testError);
      });
      
      expect(result.current.errors).toHaveLength(1);
      
      act(() => {
        result.current.clearError('test-error-id');
      });
      
      expect(result.current.errors).toHaveLength(0);
    });

    it('should handle clearing non-existent error', () => {
      const { result } = renderHook(() => useErrorHandler());
      
      act(() => {
        result.current.clearError('non-existent-id');
      });
      
      expect(result.current.errors).toHaveLength(0);
    });
  });

  describe('clearAllErrors', () => {
    it('should remove all errors from state', () => {
      const { result } = renderHook(() => useErrorHandler());
      
      act(() => {
        result.current.handleError(new Error('Error 1'));
        result.current.handleError(new Error('Error 2'));
      });
      
      expect(result.current.errors).toHaveLength(2);
      
      act(() => {
        result.current.clearAllErrors();
      });
      
      expect(result.current.errors).toHaveLength(0);
    });
  });

  describe('recoverFromError', () => {
    it('should attempt recovery and remove error on success', async () => {
      const { result } = renderHook(() => useErrorHandler());
      
      const testError = new Error('Test error');
      
      act(() => {
        result.current.handleError(testError);
      });
      
      expect(result.current.errors).toHaveLength(1);
      
      const recoveryAction = vi.fn().mockResolvedValue();
      
      await act(async () => {
        const success = await result.current.recoverFromError('test-error-id', recoveryAction);
        expect(success).toBe(true);
      });
      
      expect(recoveryAction).toHaveBeenCalled();
      expect(result.current.errors).toHaveLength(0);
    });

    it('should handle recovery failure', async () => {
      const { result } = renderHook(() => useErrorHandler());
      
      const testError = new Error('Test error');
      
      act(() => {
        result.current.handleError(testError);
      });
      
      const recoveryAction = vi.fn().mockRejectedValue(new Error('Recovery failed'));
      
      await act(async () => {
        const success = await result.current.recoverFromError('test-error-id', recoveryAction);
        expect(success).toBe(false);
      });
      
      expect(result.current.errors).toHaveLength(1); // Error should still be there
    });

    it('should limit recovery attempts to 3', async () => {
      const { result } = renderHook(() => useErrorHandler());
      
      const testError = new Error('Test error');
      
      act(() => {
        result.current.handleError(testError);
      });
      
      const recoveryAction = vi.fn().mockRejectedValue(new Error('Recovery failed'));
      
      // Attempt recovery 4 times
      for (let i = 0; i < 4; i++) {
        await act(async () => {
          await result.current.recoverFromError('test-error-id', recoveryAction);
        });
      }
      
      // Should only be called 3 times due to limit
      expect(recoveryAction).toHaveBeenCalledTimes(3);
    });

    it('should return false for non-existent error', async () => {
      const { result } = renderHook(() => useErrorHandler());
      
      await act(async () => {
        const success = await result.current.recoverFromError('non-existent-id', vi.fn());
        expect(success).toBe(false);
      });
    });
  });
});