/**
 * Tests for useAnimation hook
 */

import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useAnimation } from '../useAnimation.js';
import { AnimationLoop } from '../../utils/animation/animationLoop.js';

// Mock the AnimationLoop
vi.mock('../../utils/animation/animationLoop.js');

describe('useAnimation', () => {
  let mockAnimationLoop;
  let mockRenderCallback;

  beforeEach(() => {
    mockAnimationLoop = {
      addCallback: vi.fn(),
      removeCallback: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      isRunning: false
    };
    
    AnimationLoop.mockImplementation(() => mockAnimationLoop);
    mockRenderCallback = vi.fn();
    
    // Mock requestAnimationFrame
    global.requestAnimationFrame = vi.fn(cb => setTimeout(cb, 16));
    global.cancelAnimationFrame = vi.fn(id => clearTimeout(id));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  describe('initialization', () => {
    it('should initialize with default options', () => {
      const { result } = renderHook(() => useAnimation(mockRenderCallback));

      expect(result.current.isRunning).toBe(true); // Auto-starts by default
      expect(result.current.currentFPS).toBe(0);
      expect(result.current.time).toBe(0);
      expect(typeof result.current.start).toBe('function');
      expect(typeof result.current.stop).toBe('function');
      expect(typeof result.current.pause).toBe('function');
      expect(typeof result.current.resume).toBe('function');
      expect(typeof result.current.reset).toBe('function');
    });

    it('should auto-start animation when autoStart is true', () => {
      renderHook(() => useAnimation(mockRenderCallback, { autoStart: true }));

      expect(AnimationLoop).toHaveBeenCalled();
      expect(mockAnimationLoop.addCallback).toHaveBeenCalled();
      expect(mockAnimationLoop.start).toHaveBeenCalled();
    });

    it('should not auto-start animation when autoStart is false', () => {
      renderHook(() => useAnimation(mockRenderCallback, { autoStart: false }));

      expect(AnimationLoop).not.toHaveBeenCalled();
    });
  });

  describe('animation controls', () => {
    it('should start animation when start() is called', () => {
      const { result } = renderHook(() => useAnimation(mockRenderCallback, { autoStart: false }));

      act(() => {
        result.current.start();
      });

      expect(AnimationLoop).toHaveBeenCalled();
      expect(mockAnimationLoop.addCallback).toHaveBeenCalled();
      expect(mockAnimationLoop.start).toHaveBeenCalled();
    });

    it('should stop animation when stop() is called', () => {
      const { result } = renderHook(() => useAnimation(mockRenderCallback, { autoStart: true }));

      act(() => {
        result.current.stop();
      });

      expect(mockAnimationLoop.removeCallback).toHaveBeenCalled();
      expect(mockAnimationLoop.stop).toHaveBeenCalled();
    });

    it('should reset animation time when reset() is called', () => {
      const { result } = renderHook(() => useAnimation(mockRenderCallback));

      // Simulate some time passing
      act(() => {
        result.current.setTime(100);
      });

      expect(result.current.getTime()).toBe(100);

      act(() => {
        result.current.reset();
      });

      expect(result.current.time).toBe(0);
      expect(result.current.currentFPS).toBe(0);
    });

    it('should set time directly when setTime() is called', () => {
      const { result } = renderHook(() => useAnimation(mockRenderCallback));

      act(() => {
        result.current.setTime(50);
      });

      expect(result.current.getTime()).toBe(50);
      expect(result.current.time).toBe(50);
    });
  });

  describe('frozen state handling', () => {
    it('should pause animation when isFrozen is true', () => {
      const { result, rerender } = renderHook(
        ({ isFrozen }) => useAnimation(mockRenderCallback, { isFrozen, autoStart: true }),
        { initialProps: { isFrozen: false } }
      );

      expect(result.current.isRunning).toBe(true);

      rerender({ isFrozen: true });

      expect(result.current.isRunning).toBe(false);
    });

    it('should resume animation when isFrozen changes to false', () => {
      const { result, rerender } = renderHook(
        ({ isFrozen }) => useAnimation(mockRenderCallback, { isFrozen, autoStart: true }),
        { initialProps: { isFrozen: true } }
      );

      expect(result.current.isRunning).toBe(false);

      rerender({ isFrozen: false });

      expect(result.current.isRunning).toBe(true);
    });
  });

  describe('render callback', () => {
    it('should call render callback with time and deltaTime', () => {
      const { result } = renderHook(() => useAnimation(mockRenderCallback, { autoStart: true }));

      // Get the callback that was added to the animation loop
      const addedCallback = mockAnimationLoop.addCallback.mock.calls[0][0];

      // Simulate animation frame
      act(() => {
        addedCallback(1000, 16); // 1000ms timestamp, 16ms delta
      });

      expect(mockRenderCallback).toHaveBeenCalled();
    });

    it('should handle render callback errors gracefully', () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Render error');
      });
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation();

      const { result } = renderHook(() => useAnimation(errorCallback, { autoStart: true }));

      // Get the callback that was added to the animation loop
      const addedCallback = mockAnimationLoop.addCallback.mock.calls[0][0];

      // Simulate animation frame with error
      act(() => {
        addedCallback(1000, 16);
      });

      expect(consoleSpy).toHaveBeenCalledWith('Animation render callback error:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });

    it('should update callback when renderCallback changes', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      const { rerender } = renderHook(
        ({ callback }) => useAnimation(callback, { autoStart: true }),
        { initialProps: { callback: callback1 } }
      );

      // Get the callback that was added to the animation loop
      const addedCallback = mockAnimationLoop.addCallback.mock.calls[0][0];

      // Simulate animation frame
      act(() => {
        addedCallback(1000, 16);
      });

      expect(callback1).toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();

      // Change the callback
      rerender({ callback: callback2 });

      // Simulate another animation frame
      act(() => {
        addedCallback(2000, 16);
      });

      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('FPS calculation', () => {
    it('should calculate and update FPS', () => {
      const { result } = renderHook(() => useAnimation(mockRenderCallback, { autoStart: true }));

      // Get the callback that was added to the animation loop
      const addedCallback = mockAnimationLoop.addCallback.mock.calls[0][0];

      // Simulate multiple animation frames over 1 second
      act(() => {
        addedCallback(0, 16);
        addedCallback(16, 16);
        addedCallback(32, 16);
        // ... simulate 60 frames over 1000ms
        for (let i = 0; i < 60; i++) {
          addedCallback(i * 16, 16);
        }
        addedCallback(1000, 16); // 1 second mark
      });

      // FPS should be calculated (exact value depends on implementation)
      expect(result.current.currentFPS).toBeGreaterThan(0);
    });
  });

  describe('cleanup', () => {
    it('should cleanup animation loop on unmount', () => {
      const { unmount } = renderHook(() => useAnimation(mockRenderCallback, { autoStart: true }));

      unmount();

      expect(mockAnimationLoop.removeCallback).toHaveBeenCalled();
      expect(mockAnimationLoop.stop).toHaveBeenCalled();
    });
  });

  describe('time management', () => {
    it('should advance time based on speed when not frozen', () => {
      const speed = 0.02;
      const { result } = renderHook(() => useAnimation(mockRenderCallback, { speed, autoStart: true }));

      // Get the callback that was added to the animation loop
      const addedCallback = mockAnimationLoop.addCallback.mock.calls[0][0];

      const initialTime = result.current.getTime();

      // Simulate animation frame
      act(() => {
        addedCallback(1000, 16);
      });

      expect(result.current.getTime()).toBe(initialTime + speed);
    });

    it('should not advance time when frozen', () => {
      const speed = 0.02;
      const { result } = renderHook(() => useAnimation(mockRenderCallback, { 
        speed, 
        isFrozen: true, 
        autoStart: true 
      }));

      // Get the callback that was added to the animation loop
      const addedCallback = mockAnimationLoop.addCallback.mock.calls[0][0];

      const initialTime = result.current.getTime();

      // Simulate animation frame
      act(() => {
        addedCallback(1000, 16);
      });

      expect(result.current.getTime()).toBe(initialTime);
    });
  });

  describe('options handling', () => {
    it('should use custom speed option', () => {
      const customSpeed = 0.05;
      const { result } = renderHook(() => useAnimation(mockRenderCallback, { 
        speed: customSpeed,
        autoStart: true 
      }));

      // Get the callback that was added to the animation loop
      const addedCallback = mockAnimationLoop.addCallback.mock.calls[0][0];

      const initialTime = result.current.getTime();

      // Simulate animation frame
      act(() => {
        addedCallback(1000, 16);
      });

      expect(result.current.getTime()).toBe(initialTime + customSpeed);
    });

    it('should handle targetFPS option', () => {
      const targetFPS = 30;
      renderHook(() => useAnimation(mockRenderCallback, { 
        targetFPS,
        autoStart: true 
      }));

      // Animation loop should still be created (targetFPS is for future use)
      expect(AnimationLoop).toHaveBeenCalled();
    });
  });
});