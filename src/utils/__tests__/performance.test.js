/**
 * Performance tests for canvas rendering optimizations
 * Validates that optimizations improve performance without breaking functionality
 */

import { calculateCompactVisualHash } from '../layerHash';

describe('Performance Tests', () => {
  // Mock layer factory
  const createMockLayer = (overrides = {}) => ({
    numSides: 6,
    curviness: -0.64,
    width: 0.5,
    height: 0.5,
    noiseAmount: 0.8,
    opacity: 1.0,
    blendMode: 'normal',
    colors: ['#FF0000', '#00FF00', '#0000FF'],
    layerType: 'shape',
    visible: true,
    position: {
      x: Math.random(),
      y: Math.random(),
      scale: 1.0
    },
    ...overrides
  });

  describe('Hash Calculation Performance', () => {
    test('should calculate hash quickly for single layer', () => {
      const layer = createMockLayer();
      const iterations = 1000;
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        calculateCompactVisualHash(layer);
      }
      const end = performance.now();
      
      const avgTime = (end - start) / iterations;
      expect(avgTime).toBeLessThan(1); // Should be less than 1ms per hash
    });

    test('should handle many layers efficiently', () => {
      const layers = Array.from({ length: 100 }, () => createMockLayer());
      
      const start = performance.now();
      layers.forEach(layer => calculateCompactVisualHash(layer));
      const end = performance.now();
      
      const totalTime = end - start;
      expect(totalTime).toBeLessThan(100); // Should process 100 layers in under 100ms
    });
  });

  describe('Change Detection Performance', () => {
    test('should quickly detect unchanged layers', () => {
      const layer = createMockLayer();
      const hash = calculateCompactVisualHash(layer);
      const iterations = 1000;
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        const currentHash = calculateCompactVisualHash(layer);
        const hasChanged = currentHash !== hash;
        expect(hasChanged).toBe(false);
      }
      const end = performance.now();
      
      const avgTime = (end - start) / iterations;
      expect(avgTime).toBeLessThan(0.5); // Should be very fast for unchanged layers
    });

    test('should efficiently detect changes in large layer sets', () => {
      const layers = Array.from({ length: 50 }, () => createMockLayer());
      const hashes = layers.map(layer => calculateCompactVisualHash(layer));
      
      // Change one layer
      layers[25] = { ...layers[25], opacity: 0.5 };
      
      const start = performance.now();
      const changes = layers.map((layer, index) => {
        const currentHash = calculateCompactVisualHash(layer);
        return currentHash !== hashes[index];
      });
      const end = performance.now();
      
      const totalTime = end - start;
      expect(totalTime).toBeLessThan(50); // Should detect changes in 50 layers quickly
      expect(changes.filter(Boolean)).toHaveLength(1); // Only one layer changed
      expect(changes[25]).toBe(true); // The changed layer was detected
    });
  });

  describe('Memory Usage', () => {
    test('should not leak memory with repeated hash calculations', () => {
      const layer = createMockLayer();
      const iterations = 10000;
      
      // Force garbage collection if available (Node.js)
      if (global.gc) {
        global.gc();
      }
      
      const initialMemory = process.memoryUsage ? process.memoryUsage().heapUsed : 0;
      
      for (let i = 0; i < iterations; i++) {
        calculateCompactVisualHash(layer);
      }
      
      // Force garbage collection again
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage ? process.memoryUsage().heapUsed : 0;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be minimal (less than 1MB for 10k calculations)
      if (process.memoryUsage) {
        expect(memoryIncrease).toBeLessThan(1024 * 1024);
      }
    });
  });

  describe('Edge Cases Performance', () => {
    test('should handle malformed layers gracefully', () => {
      const malformedLayers = [
        null,
        undefined,
        {},
        { position: null },
        { position: {} },
        { colors: null },
        { numSides: null }
      ];
      
      const start = performance.now();
      malformedLayers.forEach(layer => {
        expect(() => calculateCompactVisualHash(layer)).not.toThrow();
      });
      const end = performance.now();
      
      const totalTime = end - start;
      expect(totalTime).toBeLessThan(10); // Should handle edge cases quickly
    });

    test('should handle very large layer objects', () => {
      const largeLayer = createMockLayer({
        colors: Array.from({ length: 1000 }, (_, i) => `#${i.toString(16).padStart(6, '0')}`),
        customData: Array.from({ length: 1000 }, (_, i) => ({ id: i, value: Math.random() }))
      });
      
      const start = performance.now();
      const hash = calculateCompactVisualHash(largeLayer);
      const end = performance.now();
      
      const time = end - start;
      expect(time).toBeLessThan(10); // Should handle large objects reasonably fast
      expect(hash).toBeTruthy();
    });
  });
});