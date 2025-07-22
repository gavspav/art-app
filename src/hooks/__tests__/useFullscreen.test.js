/**
 * Tests for useFullscreen hook
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useFullscreen } from '../useFullscreen.js';

describe('useFullscreen', () => {
  let addEventListenerSpy;
  let removeEventListenerSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset fullscreen state
    document.fullscreenElement = null;
    document.webkitFullscreenElement = null;
    document.mozFullScreenElement = null;
    document.msFullscreenElement = null;
    
    // Set up spies for event listeners
    addEventListenerSpy = vi.spyOn(document, 'addEventListener');
    removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
  });

  afterEach(() => {
    addEventListenerSpy?.mockRestore();
    removeEventListenerSpy?.mockRestore();
  });

  describe('initialization', () => {
    it('should initialize with correct default state', () => {
      const { result } = renderHook(() => useFullscreen());
      
      expect(result.current.isFullscreen).toBe(false);
      expect(result.current.isSupported).toBe(true);
      expect(result.current.error).toBe(null);
    });

    it('should detect fullscreen support', () => {
      const { result } = renderHook(() => useFullscreen());
      
      expect(result.current.isSupported).toBe(true);
    });

    it('should detect lack of fullscreen support', () => {
      // Mock a document element without fullscreen methods
      const originalDocumentElement = document.documentElement;
      const mockElement = {};
      
      Object.defineProperty(document, 'documentElement', {
        value: mockElement,
        configurable: true
      });
      
      const { result } = renderHook(() => useFullscreen());
      
      expect(result.current.isSupported).toBe(false);
      
      // Restore original
      Object.defineProperty(document, 'documentElement', {
        value: originalDocumentElement,
        configurable: true
      });
    });

    it('should set up event listeners', () => {
      renderHook(() => useFullscreen());
      
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'fullscreenchange',
        expect.any(Function)
      );
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'webkitfullscreenchange',
        expect.any(Function)
      );
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'mozfullscreenchange',
        expect.any(Function)
      );
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'MSFullscreenChange',
        expect.any(Function)
      );
    });
  });

  describe('enter fullscreen', () => {
    it('should enter fullscreen successfully', async () => {
      document.documentElement.requestFullscreen.mockResolvedValue();
      
      const { result } = renderHook(() => useFullscreen());
      let enterResult;
      
      await act(async () => {
        enterResult = await result.current.enter();
      });
      
      expect(enterResult.success).toBe(true);
      expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
    });

    it('should handle enter fullscreen failure', async () => {
      const error = new Error('Fullscreen failed');
      document.documentElement.requestFullscreen.mockRejectedValue(error);
      
      const { result } = renderHook(() => useFullscreen());
      let enterResult;
      
      await act(async () => {
        enterResult = await result.current.enter();
      });
      
      expect(enterResult.success).toBe(false);
      expect(enterResult.error).toBe('Failed to enter fullscreen mode');
      expect(result.current.error).toBe('Failed to enter fullscreen mode');
    });

    it('should handle unsupported browser', async () => {
      // Temporarily remove fullscreen methods
      const originalRequestFullscreen = document.documentElement.requestFullscreen;
      delete document.documentElement.requestFullscreen;
      
      const { result } = renderHook(() => useFullscreen());
      let enterResult;
      
      await act(async () => {
        enterResult = await result.current.enter();
      });
      
      expect(enterResult.success).toBe(false);
      expect(enterResult.error).toBe('Fullscreen is not supported in this browser');
      
      // Restore method
      document.documentElement.requestFullscreen = originalRequestFullscreen;
    });

    it('should handle already in fullscreen', async () => {
      const { result } = renderHook(() => useFullscreen());
      
      // Simulate already in fullscreen
      act(() => {
        document.fullscreenElement = document.documentElement;
        // Trigger fullscreen change event
        const changeEvent = new Event('fullscreenchange');
        document.dispatchEvent(changeEvent);
      });
      
      let enterResult;
      
      await act(async () => {
        enterResult = await result.current.enter();
      });
      
      expect(enterResult.success).toBe(true);
      expect(enterResult.message).toBe('Already in fullscreen mode');
    });

    it('should use webkit prefix when standard not available', async () => {
      // Remove standard method, keep webkit
      const originalRequestFullscreen = document.documentElement.requestFullscreen;
      delete document.documentElement.requestFullscreen;
      document.documentElement.webkitRequestFullscreen.mockResolvedValue();
      
      const { result } = renderHook(() => useFullscreen());
      
      await act(async () => {
        await result.current.enter();
      });
      
      expect(document.documentElement.webkitRequestFullscreen).toHaveBeenCalled();
      
      // Restore method
      document.documentElement.requestFullscreen = originalRequestFullscreen;
    });
  });

  describe('exit fullscreen', () => {
    it('should exit fullscreen successfully', async () => {
      document.exitFullscreen.mockResolvedValue();
      
      const { result } = renderHook(() => useFullscreen());
      
      // Simulate being in fullscreen
      act(() => {
        document.fullscreenElement = document.documentElement;
      });
      
      let exitResult;
      
      await act(async () => {
        exitResult = await result.current.exit();
      });
      
      expect(exitResult.success).toBe(true);
      expect(document.exitFullscreen).toHaveBeenCalled();
    });

    it('should handle exit fullscreen failure', async () => {
      const error = new Error('Exit failed');
      document.exitFullscreen.mockRejectedValue(error);
      
      const { result } = renderHook(() => useFullscreen());
      
      // Simulate being in fullscreen
      act(() => {
        document.fullscreenElement = document.documentElement;
      });
      
      let exitResult;
      
      await act(async () => {
        exitResult = await result.current.exit();
      });
      
      expect(exitResult.success).toBe(false);
      expect(exitResult.error).toBe('Failed to exit fullscreen mode');
    });

    it('should handle not in fullscreen', async () => {
      const { result } = renderHook(() => useFullscreen());
      let exitResult;
      
      await act(async () => {
        exitResult = await result.current.exit();
      });
      
      expect(exitResult.success).toBe(true);
      expect(exitResult.message).toBe('Not in fullscreen mode');
    });
  });

  describe('toggle fullscreen', () => {
    it('should toggle from normal to fullscreen', async () => {
      document.documentElement.requestFullscreen.mockResolvedValue();
      
      const { result } = renderHook(() => useFullscreen());
      let toggleResult;
      
      await act(async () => {
        toggleResult = await result.current.toggle();
      });
      
      expect(toggleResult.success).toBe(true);
      expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
    });

    it('should toggle from fullscreen to normal', async () => {
      document.exitFullscreen.mockResolvedValue();
      
      const { result } = renderHook(() => useFullscreen());
      
      // Simulate being in fullscreen
      act(() => {
        document.fullscreenElement = document.documentElement;
      });
      
      let toggleResult;
      
      await act(async () => {
        toggleResult = await result.current.toggle();
      });
      
      expect(toggleResult.success).toBe(true);
      expect(document.exitFullscreen).toHaveBeenCalled();
    });
  });

  describe('fullscreen state changes', () => {
    it('should update state when entering fullscreen', () => {
      const { result } = renderHook(() => useFullscreen());
      
      expect(result.current.isFullscreen).toBe(false);
      
      act(() => {
        document.fullscreenElement = document.documentElement;
        // Simulate fullscreen change event
        const listeners = document.addEventListener.mock.calls
          .filter(call => call[0] === 'fullscreenchange')
          .map(call => call[1]);
        
        listeners.forEach(listener => listener());
      });
      
      expect(result.current.isFullscreen).toBe(true);
    });

    it('should update state when exiting fullscreen', () => {
      const { result } = renderHook(() => useFullscreen());
      
      // Start in fullscreen
      act(() => {
        document.fullscreenElement = document.documentElement;
        const listeners = document.addEventListener.mock.calls
          .filter(call => call[0] === 'fullscreenchange')
          .map(call => call[1]);
        
        listeners.forEach(listener => listener());
      });
      
      expect(result.current.isFullscreen).toBe(true);
      
      // Exit fullscreen
      act(() => {
        document.fullscreenElement = null;
        const listeners = document.addEventListener.mock.calls
          .filter(call => call[0] === 'fullscreenchange')
          .map(call => call[1]);
        
        listeners.forEach(listener => listener());
      });
      
      expect(result.current.isFullscreen).toBe(false);
    });

    it('should handle webkit fullscreen changes', () => {
      const { result } = renderHook(() => useFullscreen());
      
      act(() => {
        document.webkitFullscreenElement = document.documentElement;
        const listeners = document.addEventListener.mock.calls
          .filter(call => call[0] === 'webkitfullscreenchange')
          .map(call => call[1]);
        
        listeners.forEach(listener => listener());
      });
      
      expect(result.current.isFullscreen).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle fullscreen errors', () => {
      const { result } = renderHook(() => useFullscreen());
      
      act(() => {
        const listeners = global.document.addEventListener.mock.calls
          .filter(call => call[0] === 'fullscreenerror')
          .map(call => call[1]);
        
        listeners.forEach(listener => listener(new Event('fullscreenerror')));
      });
      
      expect(result.current.error).toBe('Failed to enter fullscreen mode');
    });

    it('should clear error manually', () => {
      const { result } = renderHook(() => useFullscreen());
      
      // Set an error
      act(() => {
        const listeners = global.document.addEventListener.mock.calls
          .filter(call => call[0] === 'fullscreenerror')
          .map(call => call[1]);
        
        listeners.forEach(listener => listener(new Event('fullscreenerror')));
      });
      
      expect(result.current.error).toBe('Failed to enter fullscreen mode');
      
      // Clear error
      act(() => {
        result.current.clearError();
      });
      
      expect(result.current.error).toBe(null);
    });

    it('should clear error on successful state change', () => {
      const { result } = renderHook(() => useFullscreen());
      
      // Set an error
      act(() => {
        const listeners = global.document.addEventListener.mock.calls
          .filter(call => call[0] === 'fullscreenerror')
          .map(call => call[1]);
        
        listeners.forEach(listener => listener(new Event('fullscreenerror')));
      });
      
      expect(result.current.error).toBe('Failed to enter fullscreen mode');
      
      // Trigger successful fullscreen change
      act(() => {
        document.fullscreenElement = document.documentElement;
        const listeners = document.addEventListener.mock.calls
          .filter(call => call[0] === 'fullscreenchange')
          .map(call => call[1]);
        
        listeners.forEach(listener => listener());
      });
      
      expect(result.current.error).toBe(null);
    });
  });

  describe('custom target element', () => {
    it('should use custom target element', async () => {
      const targetElement = {
        requestFullscreen: vi.fn().mockResolvedValue()
      };
      
      const { result } = renderHook(() => useFullscreen(targetElement));
      
      await act(async () => {
        await result.current.enter();
      });
      
      expect(targetElement.requestFullscreen).toHaveBeenCalled();
    });

    it('should update target element', async () => {
      const initialElement = {
        requestFullscreen: vi.fn().mockResolvedValue()
      };
      
      const newElement = {
        requestFullscreen: vi.fn().mockResolvedValue()
      };
      
      const { result, rerender } = renderHook(
        ({ element }) => useFullscreen(element),
        { initialProps: { element: initialElement } }
      );
      
      // Use initial element
      await act(async () => {
        await result.current.enter();
      });
      
      expect(initialElement.requestFullscreen).toHaveBeenCalled();
      
      // Update to new element
      rerender({ element: newElement });
      
      await act(async () => {
        await result.current.enter();
      });
      
      expect(newElement.requestFullscreen).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should remove event listeners on unmount', () => {
      const { unmount } = renderHook(() => useFullscreen());
      
      unmount();
      
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'fullscreenchange',
        expect.any(Function)
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'webkitfullscreenchange',
        expect.any(Function)
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'mozfullscreenchange',
        expect.any(Function)
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'MSFullscreenChange',
        expect.any(Function)
      );
    });
  });
});