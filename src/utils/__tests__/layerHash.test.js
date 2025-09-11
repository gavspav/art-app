/**
 * Test suite for layer hash utilities
 * Validates visual change detection and hash calculation
 */

import { 
  calculateVisualHash, 
  calculateCompactVisualHash, 
  hasVisuallyChanged, 
  getChangedVisualProperties,
  calculateLayersHash 
} from '../layerHash';

describe('Layer Hash Utilities', () => {
  const mockLayer = {
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
      x: 0.5,
      y: 0.5,
      scale: 1.0
    },
    // Non-visual properties that should be ignored
    seed: 123,
    movementSpeed: 0.001,
    movementAngle: 45,
    vx: 0.001,
    vy: 0.001
  };

  describe('calculateVisualHash', () => {
    test('should generate consistent hash for same visual properties', () => {
      const hash1 = calculateVisualHash(mockLayer);
      const hash2 = calculateVisualHash(mockLayer);
      expect(hash1).toBe(hash2);
    });

    test('should ignore non-visual properties', () => {
      const layer1 = { ...mockLayer, seed: 123, movementSpeed: 0.001 };
      const layer2 = { ...mockLayer, seed: 456, movementSpeed: 0.002 };
      
      const hash1 = calculateVisualHash(layer1);
      const hash2 = calculateVisualHash(layer2);
      expect(hash1).toBe(hash2);
    });

    test('should detect visual property changes', () => {
      const layer1 = { ...mockLayer };
      const layer2 = { ...mockLayer, opacity: 0.5 };
      
      const hash1 = calculateVisualHash(layer1);
      const hash2 = calculateVisualHash(layer2);
      expect(hash1).not.toBe(hash2);
    });

    test('should handle null/undefined layers', () => {
      expect(calculateVisualHash(null)).toBe('');
      expect(calculateVisualHash(undefined)).toBe('');
    });
  });

  describe('calculateCompactVisualHash', () => {
    test('should generate shorter hash than full hash', () => {
      const fullHash = calculateVisualHash(mockLayer);
      const compactHash = calculateCompactVisualHash(mockLayer);
      
      expect(compactHash.length).toBeLessThan(fullHash.length);
      expect(compactHash).toBeTruthy();
    });

    test('should be deterministic', () => {
      const hash1 = calculateCompactVisualHash(mockLayer);
      const hash2 = calculateCompactVisualHash(mockLayer);
      expect(hash1).toBe(hash2);
    });
  });

  describe('hasVisuallyChanged', () => {
    test('should return false for unchanged layer', () => {
      const hash = calculateCompactVisualHash(mockLayer);
      expect(hasVisuallyChanged(mockLayer, hash)).toBe(false);
    });

    test('should return true for changed layer', () => {
      const originalHash = calculateCompactVisualHash(mockLayer);
      const changedLayer = { ...mockLayer, opacity: 0.5 };
      expect(hasVisuallyChanged(changedLayer, originalHash)).toBe(true);
    });
  });

  describe('getChangedVisualProperties', () => {
    test('should detect changed properties', () => {
      const layer1 = { ...mockLayer };
      const layer2 = { 
        ...mockLayer, 
        opacity: 0.5, 
        position: { ...mockLayer.position, scale: 1.5 }
      };
      
      const changes = getChangedVisualProperties(layer2, layer1);
      expect(changes).toContain('opacity');
      expect(changes).toContain('position.scale');
    });

    test('should return empty array for identical layers', () => {
      const changes = getChangedVisualProperties(mockLayer, mockLayer);
      expect(changes).toEqual([]);
    });

    test('should handle null/undefined layers', () => {
      const changes = getChangedVisualProperties(null, mockLayer);
      expect(changes).toEqual([]);
    });
  });

  describe('calculateLayersHash', () => {
    test('should generate hash for multiple layers', () => {
      const layers = [mockLayer, { ...mockLayer, opacity: 0.5 }];
      const hash = calculateLayersHash(layers);
      expect(hash).toBeTruthy();
      expect(typeof hash).toBe('string');
    });

    test('should handle empty array', () => {
      const hash = calculateLayersHash([]);
      expect(hash).toBe('');
    });

    test('should handle non-array input', () => {
      const hash = calculateLayersHash(null);
      expect(hash).toBe('');
    });
  });
});
/* eslint-env jest, node */
/* eslint-disable no-undef */
