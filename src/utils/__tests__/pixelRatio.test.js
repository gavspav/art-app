import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getPixelRatio, setupHighDPICanvas } from '../canvas/pixelRatio.js';

// Mock canvas context
const createMockContext = (backingStoreRatio = 1) => ({
  webkitBackingStorePixelRatio: backingStoreRatio,
  mozBackingStorePixelRatio: backingStoreRatio,
  msBackingStorePixelRatio: backingStoreRatio,
  oBackingStorePixelRatio: backingStoreRatio,
  backingStorePixelRatio: backingStoreRatio,
  scale: vi.fn()
});

// Mock canvas element
const createMockCanvas = () => ({
  width: 0,
  height: 0,
  style: {
    width: '',
    height: ''
  }
});

describe('pixelRatio utilities', () => {
  beforeEach(() => {
    // Reset window.devicePixelRatio
    Object.defineProperty(window, 'devicePixelRatio', {
      writable: true,
      value: 1
    });
  });

  describe('getPixelRatio', () => {
    it('should return 1 when device and backing store ratios are equal', () => {
      const context = createMockContext(1);
      window.devicePixelRatio = 1;
      
      expect(getPixelRatio(context)).toBe(1);
    });

    it('should return 2 when device pixel ratio is 2 and backing store is 1', () => {
      const context = createMockContext(1);
      window.devicePixelRatio = 2;
      
      expect(getPixelRatio(context)).toBe(2);
    });

    it('should handle missing devicePixelRatio', () => {
      const context = createMockContext(1);
      const originalRatio = window.devicePixelRatio;
      window.devicePixelRatio = undefined;
      
      expect(getPixelRatio(context)).toBe(1);
      
      // Restore original value
      window.devicePixelRatio = originalRatio;
    });

    it('should handle missing backing store properties', () => {
      const context = {};
      window.devicePixelRatio = 2;
      
      expect(getPixelRatio(context)).toBe(2);
    });

    it('should use webkitBackingStorePixelRatio when available', () => {
      const context = {
        webkitBackingStorePixelRatio: 0.5
      };
      window.devicePixelRatio = 2;
      
      expect(getPixelRatio(context)).toBe(4); // 2 / 0.5
    });

    it('should fallback through different backing store properties', () => {
      const context = {
        mozBackingStorePixelRatio: 0.5
      };
      window.devicePixelRatio = 2;
      
      expect(getPixelRatio(context)).toBe(4);
    });
  });

  describe('setupHighDPICanvas', () => {
    it('should set canvas dimensions correctly', () => {
      const canvas = createMockCanvas();
      const context = createMockContext(1);
      window.devicePixelRatio = 2;
      
      const ratio = setupHighDPICanvas(canvas, context, 400, 300);
      
      expect(ratio).toBe(2);
      expect(canvas.width).toBe(800); // 400 * 2
      expect(canvas.height).toBe(600); // 300 * 2
      expect(canvas.style.width).toBe('400px');
      expect(canvas.style.height).toBe('300px');
      expect(context.scale).toHaveBeenCalledWith(2, 2);
    });

    it('should handle fractional pixel ratios', () => {
      const canvas = createMockCanvas();
      const context = createMockContext(1);
      window.devicePixelRatio = 1.5;
      
      const ratio = setupHighDPICanvas(canvas, context, 100, 100);
      
      expect(ratio).toBe(1.5);
      expect(canvas.width).toBe(150); // Math.floor(100 * 1.5)
      expect(canvas.height).toBe(150);
      expect(canvas.style.width).toBe('100px');
      expect(canvas.style.height).toBe('100px');
      expect(context.scale).toHaveBeenCalledWith(1.5, 1.5);
    });

    it('should work with ratio of 1', () => {
      const canvas = createMockCanvas();
      const context = createMockContext(1);
      window.devicePixelRatio = 1;
      
      const ratio = setupHighDPICanvas(canvas, context, 200, 200);
      
      expect(ratio).toBe(1);
      expect(canvas.width).toBe(200);
      expect(canvas.height).toBe(200);
      expect(canvas.style.width).toBe('200px');
      expect(canvas.style.height).toBe('200px');
      expect(context.scale).toHaveBeenCalledWith(1, 1);
    });
  });
});