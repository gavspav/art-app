/**
 * Tests for random utility functions
 */

import { describe, it, expect } from 'vitest';
import { createSeededRandom, randomColor } from '../random.js';

describe('random utilities', () => {
  describe('createSeededRandom', () => {
    it('should create a deterministic random function', () => {
      const random1 = createSeededRandom(12345);
      const random2 = createSeededRandom(12345);
      
      // Same seed should produce same sequence
      expect(random1()).toBe(random2());
      expect(random1()).toBe(random2());
      expect(random1()).toBe(random2());
    });

    it('should produce different sequences for different seeds', () => {
      const random1 = createSeededRandom(12345);
      const random2 = createSeededRandom(54321);
      
      expect(random1()).not.toBe(random2());
    });

    it('should return values between 0 and 1', () => {
      const random = createSeededRandom(12345);
      
      for (let i = 0; i < 100; i++) {
        const value = random();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });

    it('should handle edge case seeds', () => {
      const random1 = createSeededRandom(0);
      const random2 = createSeededRandom(1);
      const random3 = createSeededRandom(-1);
      
      // Should not throw and should produce valid values
      expect(() => random1()).not.toThrow();
      expect(() => random2()).not.toThrow();
      expect(() => random3()).not.toThrow();
      
      expect(random1()).toBeGreaterThanOrEqual(0);
      expect(random2()).toBeGreaterThanOrEqual(0);
      expect(random3()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('randomColor', () => {
    it('should return a valid hex color', () => {
      const random = createSeededRandom(12345);
      const color = randomColor(random);
      
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it('should be deterministic with same seeded random', () => {
      const random1 = createSeededRandom(12345);
      const random2 = createSeededRandom(12345);
      
      expect(randomColor(random1)).toBe(randomColor(random2));
    });

    it('should produce different colors with different random values', () => {
      const random = createSeededRandom(12345);
      const colors = [];
      
      for (let i = 0; i < 10; i++) {
        colors.push(randomColor(random));
      }
      
      // Should have some variety (not all the same)
      const uniqueColors = new Set(colors);
      expect(uniqueColors.size).toBeGreaterThan(1);
    });

    it('should handle edge cases', () => {
      // Mock random function that returns 0
      const zeroRandom = () => 0;
      expect(randomColor(zeroRandom)).toBe('#000000');
      
      // Mock random function that returns close to 1
      const maxRandom = () => 0.9999999;
      const maxColor = randomColor(maxRandom);
      expect(maxColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(maxColor).not.toBe('#000000');
    });
  });
});