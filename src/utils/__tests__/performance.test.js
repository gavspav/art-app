/**
 * Performance utilities tests
 * Tests for performance monitoring and optimization utilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PerformanceMonitor,
  FrameRateMonitor,
  MemoryMonitor,
  performanceUtils,
  globalPerformanceMonitor,
  globalFrameRateMonitor,
  globalMemoryMonitor
} from '../performance.js';

describe('Performance Utilities', () => {
  describe('PerformanceMonitor', () => {
    let monitor;

    beforeEach(() => {
      monitor = new PerformanceMonitor();
      monitor.isEnabled = true; // Force enable for testing
    });

    it('should start and end timing correctly', () => {
      monitor.startTiming('test');
      
      // Simulate some work
      const start = Date.now();
      while (Date.now() - start < 10) {
        // Wait 10ms
      }
      
      const duration = monitor.endTiming('test');
      expect(duration).toBeGreaterThan(0);
      expect(duration).toBeLessThan(100); // Should be reasonable
    });

    it('should handle multiple metrics', () => {
      monitor.startTiming('metric1');
      monitor.startTiming('metric2');
      
      monitor.endTiming('metric1');
      monitor.endTiming('metric2');
      
      const metrics = monitor.getAllMetrics();
      expect(Object.keys(metrics)).toHaveLength(2);
      expect(metrics.metric1.duration).toBeGreaterThanOrEqual(0);
      expect(metrics.metric2.duration).toBeGreaterThanOrEqual(0);
    });

    it('should clear metrics', () => {
      monitor.startTiming('test');
      monitor.endTiming('test');
      
      expect(monitor.getAllMetrics()).toHaveProperty('test');
      
      monitor.clearMetrics();
      expect(Object.keys(monitor.getAllMetrics())).toHaveLength(0);
    });

    it('should handle ending non-existent timing', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const duration = monitor.endTiming('nonexistent');
      expect(duration).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith("Performance metric 'nonexistent' was not started");
      
      consoleSpy.mockRestore();
    });
  });

  describe('FrameRateMonitor', () => {
    let monitor;

    beforeEach(() => {
      monitor = new FrameRateMonitor();
    });

    it('should record frames and calculate FPS', () => {
      // Simulate 60 FPS (16.67ms per frame)
      const frameTime = 1000 / 60;
      
      for (let i = 0; i < 10; i++) {
        monitor.lastFrameTime = performance.now() - frameTime;
        monitor.recordFrame();
      }
      
      const fps = monitor.getCurrentFPS();
      expect(fps).toBeGreaterThan(50);
      expect(fps).toBeLessThan(70);
    });

    it('should provide frame statistics', () => {
      // Record some frames with varying times
      monitor.frames = [16, 17, 15, 18, 16];
      
      const stats = monitor.getFrameStats();
      expect(stats.min).toBe(15);
      expect(stats.max).toBe(18);
      expect(stats.avg).toBeCloseTo(16.4);
      expect(stats.fps).toBeGreaterThan(50);
    });

    it('should handle empty frame data', () => {
      const fps = monitor.getCurrentFPS();
      expect(fps).toBe(0);
      
      const stats = monitor.getFrameStats();
      expect(stats).toEqual({ min: 0, max: 0, avg: 0, fps: 0 });
    });

    it('should limit frame samples', () => {
      // Record more frames than maxSamples
      for (let i = 0; i < 100; i++) {
        monitor.frames.push(16);
      }
      
      expect(monitor.frames.length).toBe(monitor.maxSamples);
    });

    it('should reset correctly', () => {
      monitor.frames = [16, 17, 18];
      monitor.lastFrameTime = 1000;
      
      monitor.reset();
      
      expect(monitor.frames).toHaveLength(0);
      expect(monitor.lastFrameTime).toBe(0);
    });
  });

  describe('MemoryMonitor', () => {
    let monitor;
    let originalMemory;

    beforeEach(() => {
      monitor = new MemoryMonitor();
      
      // Mock performance.memory
      originalMemory = performance.memory;
      performance.memory = {
        usedJSHeapSize: 10000000,
        totalJSHeapSize: 20000000,
        jsHeapSizeLimit: 100000000
      };
    });

    afterEach(() => {
      performance.memory = originalMemory;
    });

    it('should record memory usage', () => {
      monitor.recordUsage();
      
      expect(monitor.samples).toHaveLength(1);
      expect(monitor.samples[0]).toHaveProperty('used', 10000000);
      expect(monitor.samples[0]).toHaveProperty('total', 20000000);
    });

    it('should get current memory usage', () => {
      const usage = monitor.getCurrentUsage();
      
      expect(usage.used).toBe(10000000);
      expect(usage.total).toBe(20000000);
      expect(usage.usedMB).toBeCloseTo(9.54, 1);
      expect(usage.totalMB).toBeCloseTo(19.07, 1);
    });

    it('should calculate memory trend', () => {
      // Record initial usage
      monitor.recordUsage();
      
      // Simulate memory increase
      performance.memory.usedJSHeapSize = 15000000;
      monitor.recordUsage();
      
      const trend = monitor.getTrend();
      expect(trend.change).toBe(5000000);
      expect(trend.changePercent).toBe(50);
      expect(trend.isIncreasing).toBe(true);
    });

    it('should handle missing performance.memory', () => {
      performance.memory = undefined;
      
      monitor.recordUsage();
      expect(monitor.samples).toHaveLength(0);
      
      const usage = monitor.getCurrentUsage();
      expect(usage).toBeNull();
    });
  });

  describe('performanceUtils', () => {
    it('should debounce function calls', (done) => {
      let callCount = 0;
      const debouncedFn = performanceUtils.debounce(() => {
        callCount++;
      }, 50);
      
      // Call multiple times quickly
      debouncedFn();
      debouncedFn();
      debouncedFn();
      
      // Should not have been called yet
      expect(callCount).toBe(0);
      
      // Wait for debounce delay
      setTimeout(() => {
        expect(callCount).toBe(1);
        done();
      }, 60);
    });

    it('should throttle function calls', (done) => {
      let callCount = 0;
      const throttledFn = performanceUtils.throttle(() => {
        callCount++;
      }, 50);
      
      // Call multiple times quickly
      throttledFn();
      throttledFn();
      throttledFn();
      
      // Should have been called once immediately
      expect(callCount).toBe(1);
      
      // Wait and call again
      setTimeout(() => {
        throttledFn();
        expect(callCount).toBe(2);
        done();
      }, 60);
    });

    it('should measure execution time', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const result = performanceUtils.measureExecution(() => {
        return 'test result';
      }, 'test function');
      
      expect(result).toBe('test result');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('test function:'));
      
      consoleSpy.mockRestore();
    });

    it('should get device performance info', () => {
      const info = performanceUtils.getDevicePerformance();
      
      expect(info).toHaveProperty('hardwareConcurrency');
      expect(info).toHaveProperty('deviceMemory');
      expect(info).toHaveProperty('webglSupported');
      expect(info).toHaveProperty('pixelRatio');
      expect(info).toHaveProperty('isHighPerformance');
      expect(typeof info.isHighPerformance).toBe('boolean');
    });

    it('should handle requestIdleCallback fallback', (done) => {
      const originalRequestIdleCallback = window.requestIdleCallback;
      window.requestIdleCallback = undefined;
      
      performanceUtils.requestIdleCallback((deadline) => {
        expect(deadline).toHaveProperty('didTimeout');
        expect(deadline).toHaveProperty('timeRemaining');
        expect(typeof deadline.timeRemaining).toBe('function');
        
        window.requestIdleCallback = originalRequestIdleCallback;
        done();
      });
    });
  });

  describe('Global Monitors', () => {
    it('should have global performance monitor instance', () => {
      expect(globalPerformanceMonitor).toBeInstanceOf(PerformanceMonitor);
    });

    it('should have global frame rate monitor instance', () => {
      expect(globalFrameRateMonitor).toBeInstanceOf(FrameRateMonitor);
    });

    it('should have global memory monitor instance', () => {
      expect(globalMemoryMonitor).toBeInstanceOf(MemoryMonitor);
    });
  });
});