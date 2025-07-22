import { describe, it, expect } from 'vitest';
import {
  linearTransform,
  clamp,
  exponentialTransform,
  inverseExponentialTransform,
  speedTransform,
  logarithmicTransform,
  inverseLogarithmicTransform,
  smoothStep,
  smootherStep,
  normalize,
  denormalize
} from '../math/transformations.js';

describe('transformation utilities', () => {
  describe('linearTransform', () => {
    it('should transform values between ranges correctly', () => {
      expect(linearTransform(5, 0, 10, 0, 100)).toBe(50);
      expect(linearTransform(0, 0, 10, 0, 100)).toBe(0);
      expect(linearTransform(10, 0, 10, 0, 100)).toBe(100);
    });

    it('should handle negative ranges', () => {
      expect(linearTransform(0, -10, 10, 0, 100)).toBe(50);
      expect(linearTransform(-5, -10, 10, 0, 100)).toBe(25);
    });

    it('should handle inverted ranges', () => {
      expect(linearTransform(5, 0, 10, 100, 0)).toBe(50);
    });
  });

  describe('clamp', () => {
    it('should clamp values within bounds', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it('should handle edge cases', () => {
      expect(clamp(0, 0, 10)).toBe(0);
      expect(clamp(10, 0, 10)).toBe(10);
    });
  });

  describe('exponentialTransform', () => {
    it('should apply exponential transformation', () => {
      expect(exponentialTransform(0.5, 2)).toBe(0.25);
      expect(exponentialTransform(0.5, 2, 10)).toBe(2.5);
      expect(exponentialTransform(1, 2)).toBe(1);
      expect(exponentialTransform(0, 2)).toBe(0);
    });
  });

  describe('inverseExponentialTransform', () => {
    it('should reverse exponential transformation', () => {
      const original = 0.5;
      const power = 3;
      const scale = 5;
      
      const transformed = exponentialTransform(original, power, scale);
      const reversed = inverseExponentialTransform(transformed, power, scale);
      
      expect(reversed).toBeCloseTo(original, 10);
    });
  });

  describe('speedTransform', () => {
    it('should convert speed to slider and back', () => {
      const speeds = [0.001, 0.01, 0.05, 0.1];
      
      speeds.forEach(speed => {
        const sliderValue = speedTransform.toSlider(speed);
        const backToSpeed = speedTransform.fromSlider(sliderValue);
        expect(backToSpeed).toBeCloseTo(speed, 10);
      });
    });

    it('should handle edge cases', () => {
      expect(speedTransform.toSlider(0)).toBe(0);
      expect(speedTransform.fromSlider(0)).toBe(0);
      expect(speedTransform.fromSlider(1)).toBe(0.1);
    });
  });

  describe('logarithmicTransform', () => {
    it('should apply logarithmic transformation', () => {
      expect(logarithmicTransform(Math.E)).toBeCloseTo(1, 10);
      expect(logarithmicTransform(1)).toBe(0);
      expect(logarithmicTransform(10, 10)).toBe(1);
    });
  });

  describe('inverseLogarithmicTransform', () => {
    it('should reverse logarithmic transformation', () => {
      const values = [1, 2, 5, 10];
      
      values.forEach(value => {
        const transformed = logarithmicTransform(value);
        const reversed = inverseLogarithmicTransform(transformed);
        expect(reversed).toBeCloseTo(value, 10);
      });
    });
  });

  describe('smoothStep', () => {
    it('should create smooth S-curve interpolation', () => {
      expect(smoothStep(0)).toBe(0);
      expect(smoothStep(1)).toBe(1);
      expect(smoothStep(0.5)).toBe(0.5);
      
      // Should be smooth (derivative continuous)
      const step = 0.01;
      const value = 0.3;
      const left = smoothStep(value - step);
      const right = smoothStep(value + step);
      const center = smoothStep(value);
      
      // Check that it's smoother than linear
      expect(Math.abs(center - (left + right) / 2)).toBeLessThan(step);
    });

    it('should clamp values outside 0-1 range', () => {
      expect(smoothStep(-0.5)).toBe(0);
      expect(smoothStep(1.5)).toBe(1);
    });
  });

  describe('smootherStep', () => {
    it('should create even smoother interpolation than smoothStep', () => {
      expect(smootherStep(0)).toBe(0);
      expect(smootherStep(1)).toBe(1);
      expect(smootherStep(0.5)).toBe(0.5);
    });

    it('should clamp values outside 0-1 range', () => {
      expect(smootherStep(-0.5)).toBe(0);
      expect(smootherStep(1.5)).toBe(1);
    });
  });

  describe('normalize', () => {
    it('should normalize values to 0-1 range', () => {
      expect(normalize(5, 0, 10)).toBe(0.5);
      expect(normalize(0, 0, 10)).toBe(0);
      expect(normalize(10, 0, 10)).toBe(1);
    });

    it('should handle negative ranges', () => {
      expect(normalize(0, -10, 10)).toBe(0.5);
      expect(normalize(-5, -10, 10)).toBe(0.25);
    });
  });

  describe('denormalize', () => {
    it('should convert 0-1 values to specified range', () => {
      expect(denormalize(0.5, 0, 10)).toBe(5);
      expect(denormalize(0, 0, 10)).toBe(0);
      expect(denormalize(1, 0, 10)).toBe(10);
    });

    it('should be inverse of normalize', () => {
      const values = [3, 7, 15, -5];
      const min = -10;
      const max = 20;
      
      values.forEach(value => {
        const normalized = normalize(value, min, max);
        const denormalized = denormalize(normalized, min, max);
        expect(denormalized).toBeCloseTo(value, 10);
      });
    });
  });
});