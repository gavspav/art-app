import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AnimationLoop,
  createAnimationLoop,
  useAnimationFrame
} from '../animationLoop.js';

// Mock requestAnimationFrame and cancelAnimationFrame
global.requestAnimationFrame = vi.fn();
global.cancelAnimationFrame = vi.fn();
global.performance = { now: vi.fn(() => Date.now()) };

describe('animationLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.requestAnimationFrame.mockImplementation((callback) => {
      return setTimeout(callback, 16); // ~60fps
    });
    global.cancelAnimationFrame.mockImplementation((id) => {
      clearTimeout(id);
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('AnimationLoop', () => {
    let animationLoop;

    beforeEach(() => {
      animationLoop = new AnimationLoop();
    });

    afterEach(() => {
      animationLoop.stop();
    });

    it('should initialize with correct default state', () => {
      expect(animationLoop.isRunning).toBe(false);
      expect(animationLoop.time).toBe(0);
      expect(animationLoop.animationId).toBe(null);
      expect(animationLoop.callbacks.size).toBe(0);
    });

    it('should add and remove callbacks', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      animationLoop.addCallback(callback1);
      animationLoop.addCallback(callback2);
      expect(animationLoop.callbacks.size).toBe(2);

      animationLoop.removeCallback(callback1);
      expect(animationLoop.callbacks.size).toBe(1);
      expect(animationLoop.callbacks.has(callback2)).toBe(true);
    });

    it('should start and stop animation loop', () => {
      expect(animationLoop.isRunning).toBe(false);

      animationLoop.start();
      expect(animationLoop.isRunning).toBe(true);
      expect(global.requestAnimationFrame).toHaveBeenCalled();

      animationLoop.stop();
      expect(animationLoop.isRunning).toBe(false);
      expect(global.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should not start if already running', () => {
      animationLoop.start();
      const firstCallCount = global.requestAnimationFrame.mock.calls.length;

      animationLoop.start(); // Should not start again
      expect(global.requestAnimationFrame.mock.calls.length).toBe(firstCallCount);
    });

    it('should execute callbacks during animation', async () => {
      const callback = vi.fn();
      animationLoop.addCallback(callback);

      animationLoop.start();

      // Wait for animation frame
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(callback).toHaveBeenCalled();
    });

    it('should handle callback errors gracefully', async () => {
      const errorCallback = vi.fn(() => { throw new Error('Test error'); });
      const normalCallback = vi.fn();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      animationLoop.addCallback(errorCallback);
      animationLoop.addCallback(normalCallback);

      animationLoop.start();

      // Wait for animation frame
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(consoleSpy).toHaveBeenCalledWith('Animation callback error:', expect.any(Error));
      expect(normalCallback).toHaveBeenCalled(); // Should still execute

      consoleSpy.mockRestore();
    });

    it('should reset time', () => {
      animationLoop.time = 100;
      animationLoop.reset();
      expect(animationLoop.time).toBe(0);
    });

    it('should set and get time', () => {
      animationLoop.setTime(50);
      expect(animationLoop.getTime()).toBe(50);
    });

    it('should update time correctly', () => {
      animationLoop.time = 10;
      animationLoop.updateTime(5, false);
      expect(animationLoop.time).toBe(15);

      animationLoop.updateTime(5, true); // frozen
      expect(animationLoop.time).toBe(15); // should not change
    });
  });

  describe('createAnimationLoop', () => {
    it('should create animation loop with callback', () => {
      const callback = vi.fn();
      const loop = createAnimationLoop(callback, { autoStart: false });

      expect(typeof loop.start).toBe('function');
      expect(typeof loop.stop).toBe('function');
      expect(typeof loop.reset).toBe('function');
      expect(loop.isRunning()).toBe(false);
    });

    it('should auto-start by default', () => {
      const callback = vi.fn();
      const loop = createAnimationLoop(callback);

      expect(global.requestAnimationFrame).toHaveBeenCalled();
      loop.stop();
    });

    it('should not auto-start when disabled', () => {
      const callback = vi.fn();
      const loop = createAnimationLoop(callback, { autoStart: false });

      expect(loop.isRunning()).toBe(false);
    });

    it('should execute callback during animation', async () => {
      const callback = vi.fn();
      const loop = createAnimationLoop(callback, { autoStart: false });

      loop.start();

      // Wait for animation frame
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(callback).toHaveBeenCalled();
      loop.stop();
    });

    it('should handle callback errors', async () => {
      const errorCallback = vi.fn(() => { throw new Error('Test error'); });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const loop = createAnimationLoop(errorCallback, { autoStart: false });
      loop.start();

      // Wait for animation frame
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(consoleSpy).toHaveBeenCalledWith('Animation callback error:', expect.any(Error));
      loop.stop();
      consoleSpy.mockRestore();
    });

    it('should manage time correctly', () => {
      const callback = vi.fn();
      const loop = createAnimationLoop(callback, { autoStart: false });

      expect(loop.getTime()).toBe(0);

      loop.setTime(100);
      expect(loop.getTime()).toBe(100);

      loop.reset();
      expect(loop.getTime()).toBe(0);

      loop.updateTime(10, false);
      expect(loop.getTime()).toBe(10);

      loop.updateTime(5, true); // frozen
      expect(loop.getTime()).toBe(10);
    });

    it('should start and stop correctly', () => {
      const callback = vi.fn();
      const loop = createAnimationLoop(callback, { autoStart: false });

      expect(loop.isRunning()).toBe(false);

      loop.start();
      expect(loop.isRunning()).toBe(true);

      loop.stop();
      expect(loop.isRunning()).toBe(false);
    });
  });

  describe('useAnimationFrame', () => {
    it('should create animation frame manager', () => {
      const callback = vi.fn();
      const manager = useAnimationFrame(callback);

      expect(typeof manager.start).toBe('function');
      expect(typeof manager.stop).toBe('function');
      expect(typeof manager.updateTime).toBe('function');
      expect(typeof manager.getTime).toBe('function');
      expect(typeof manager.setTime).toBe('function');
    });

    it('should execute callback during animation', async () => {
      const callback = vi.fn();
      const manager = useAnimationFrame(callback);

      manager.start();

      // Wait for animation frame
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(callback).toHaveBeenCalled();
      manager.stop();
    });

    it('should handle callback errors', async () => {
      const errorCallback = vi.fn(() => { throw new Error('Test error'); });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const manager = useAnimationFrame(errorCallback);
      manager.start();

      // Wait for animation frame
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(consoleSpy).toHaveBeenCalledWith('Animation frame error:', expect.any(Error));
      manager.stop();
      consoleSpy.mockRestore();
    });

    it('should manage time correctly', () => {
      const callback = vi.fn();
      const manager = useAnimationFrame(callback);

      expect(manager.getTime()).toBe(0);

      manager.setTime(50);
      expect(manager.getTime()).toBe(50);

      manager.updateTime(10, false);
      expect(manager.getTime()).toBe(60);

      manager.updateTime(5, true); // frozen
      expect(manager.getTime()).toBe(60);
    });

    it('should prevent multiple starts', () => {
      const callback = vi.fn();
      const manager = useAnimationFrame(callback);

      manager.start();
      const firstCallCount = global.requestAnimationFrame.mock.calls.length;

      manager.start(); // Should not start again
      expect(global.requestAnimationFrame.mock.calls.length).toBe(firstCallCount);

      manager.stop();
    });
  });
});