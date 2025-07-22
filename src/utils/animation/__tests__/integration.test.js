/**
 * Integration tests for animation utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateLayerParams, generateOilShapePoints } from '../shapeGenerator.js';
import { renderFrame, setupCanvas } from '../canvasRenderer.js';
import { createAnimationLoop } from '../animationLoop.js';

describe('Animation Integration', () => {
  let mockCanvas;
  let mockContext;

  beforeEach(() => {
    mockContext = {
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      createRadialGradient: vi.fn(() => ({
        addColorStop: vi.fn()
      })),
      scale: vi.fn(),
      globalCompositeOperation: '',
      fillStyle: ''
    };

    mockCanvas = {
      getContext: vi.fn(() => mockContext),
      getBoundingClientRect: vi.fn(() => ({
        width: 800,
        height: 600
      })),
      width: 800,
      height: 600
    };
  });

  describe('Shape Generation to Rendering Pipeline', () => {
    it('should generate layer parameters and render them', () => {
      const animationParams = {
        speed: 0.01,
        variation: 0.5,
        numLayers: 3,
        numSides: 6,
        backgroundColor: '#000000'
      };

      // Generate layer parameters
      const layers = generateLayerParams(animationParams, 12345);
      expect(layers).toHaveLength(3);

      // Setup canvas
      setupCanvas(mockCanvas, mockContext);

      // Generate points for each layer
      const time = 1000;
      layers.forEach(layer => {
        const points = generateOilShapePoints(layer, time);
        expect(points.length).toBeGreaterThan(0);
        
        points.forEach(point => {
          expect(point).toHaveProperty('x', expect.any(Number));
          expect(point).toHaveProperty('y', expect.any(Number));
        });
      });

      // Render frame
      expect(() => {
        renderFrame(mockContext, layers, time, animationParams);
      }).not.toThrow();

      // Verify rendering calls were made
      expect(mockContext.fillRect).toHaveBeenCalled();
      expect(mockContext.save).toHaveBeenCalled();
      expect(mockContext.restore).toHaveBeenCalled();
    });

    it('should handle animation loop with rendering', () => {
      const animationParams = {
        speed: 0.01,
        variation: 0.5,
        numLayers: 2,
        numSides: 6,
        backgroundColor: '#000000'
      };

      const layers = generateLayerParams(animationParams, 12345);
      let renderCallCount = 0;

      const renderCallback = (time, deltaTime) => {
        renderCallCount++;
        expect(typeof time).toBe('number');
        expect(typeof deltaTime).toBe('number');
        
        // Simulate rendering
        renderFrame(mockContext, layers, time, animationParams);
      };

      const animationLoop = createAnimationLoop(renderCallback, { autoStart: false });
      
      // Start animation
      animationLoop.start();
      expect(animationLoop.isRunning()).toBe(true);

      // Stop animation
      animationLoop.stop();
      expect(animationLoop.isRunning()).toBe(false);
    });
  });

  describe('Performance Integration', () => {
    it('should handle many layers efficiently', () => {
      const animationParams = {
        speed: 0.01,
        variation: 0.5,
        numLayers: 20, // Many layers
        numSides: 8,
        backgroundColor: '#000000'
      };

      const layers = generateLayerParams(animationParams, 12345);
      expect(layers).toHaveLength(20);

      const start = performance.now();
      
      // Generate points for all layers
      const time = 1000;
      layers.forEach(layer => {
        generateOilShapePoints(layer, time);
      });

      // Render all layers
      renderFrame(mockContext, layers, time, animationParams);

      const end = performance.now();
      const duration = end - start;

      // Should complete within reasonable time (100ms)
      expect(duration).toBeLessThan(100);
    });

    it('should handle complex shapes efficiently', () => {
      const animationParams = {
        speed: 0.01,
        variation: 0.5,
        numLayers: 5,
        numSides: 32, // Complex shapes
        backgroundColor: '#000000'
      };

      const layers = generateLayerParams(animationParams, 12345);
      const time = 1000;

      const start = performance.now();

      layers.forEach(layer => {
        const points = generateOilShapePoints(layer, time);
        expect(points.length).toBe(32);
      });

      renderFrame(mockContext, layers, time, animationParams);

      const end = performance.now();
      const duration = end - start;

      // Should complete within reasonable time
      expect(duration).toBeLessThan(50);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle rendering errors gracefully', () => {
      const animationParams = {
        speed: 0.01,
        variation: 0.5,
        numLayers: 2,
        numSides: 6,
        backgroundColor: '#000000'
      };

      const layers = generateLayerParams(animationParams, 12345);
      
      // Mock context that throws errors
      const errorContext = {
        ...mockContext,
        fillRect: vi.fn(() => { throw new Error('Render error'); })
      };

      // Should not throw, should handle error gracefully
      expect(() => {
        renderFrame(errorContext, layers, 1000, animationParams);
      }).not.toThrow();
    });

    it('should handle malformed layer data', () => {
      const malformedLayers = [
        null,
        undefined,
        {},
        { position: null },
        { colors: null }
      ];

      expect(() => {
        renderFrame(mockContext, malformedLayers, 1000, {
          backgroundColor: '#000000'
        });
      }).not.toThrow();
    });
  });
});