import { describe, it, expect } from 'vitest';
import {
  createSeededRandom,
  randomInRange,
  randomChoice,
  randomColor,
  randomInt,
  randomBoolean
} from '../math/seededRandom.js';

describe('seededRandom utilities', () => {
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
  });

  describe('randomInRange', () => {
    it('should return values within the specified range', () => {
      const random = createSeededRandom(12345);
      
      for (let i = 0; i < 100; i++) {
        const value = randomInRange(10, 20, random);
        expect(value).toBeGreaterThanOrEqual(10);
        expect(value).toBeLessThan(20);
      }
    });

    it('should be deterministic with same seed', () => {
      const random1 = createSeededRandom(12345);
      const random2 = createSeededRandom(12345);
      
      expect(randomInRange(0, 100, random1)).toBe(randomInRange(0, 100, random2));
    });
  });

  describe('randomChoice', () => {
    it('should return an element from the array', () => {
      const random = createSeededRandom(12345);
      const array = ['a', 'b', 'c', 'd'];
      
      for (let i = 0; i < 50; i++) {
        const choice = randomChoice(array, random);
        expect(array).toContain(choice);
      }
    });

    it('should return undefined for empty array', () => {
      const random = createSeededRandom(12345);
      expect(randomChoice([], random)).toBeUndefined();
    });

    it('should return undefined for non-array input', () => {
      const random = createSeededRandom(12345);
      expect(randomChoice(null, random)).toBeUndefined();
      expect(randomChoice(undefined, random)).toBeUndefined();
    });

    it('should be deterministic with same seed', () => {
      const random1 = createSeededRandom(12345);
      const random2 = createSeededRandom(12345);
      const array = ['a', 'b', 'c', 'd'];
      
      expect(randomChoice(array, random1)).toBe(randomChoice(array, random2));
    });
  });

  describe('randomColor', () => {
    it('should return a valid hex color', () => {
      const random = createSeededRandom(12345);
      
      for (let i = 0; i < 20; i++) {
        const color = randomColor(random);
        expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    });

    it('should be deterministic with same seed', () => {
      const random1 = createSeededRandom(12345);
      const random2 = createSeededRandom(12345);
      
      expect(randomColor(random1)).toBe(randomColor(random2));
    });
  });

  describe('randomInt', () => {
    it('should return integers within the specified range', () => {
      const random = createSeededRandom(12345);
      
      for (let i = 0; i < 100; i++) {
        const value = randomInt(5, 15, random);
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(5);
        expect(value).toBeLessThanOrEqual(15);
      }
    });

    it('should be deterministic with same seed', () => {
      const random1 = createSeededRandom(12345);
      const random2 = createSeededRandom(12345);
      
      expect(randomInt(1, 100, random1)).toBe(randomInt(1, 100, random2));
    });
  });

  describe('randomBoolean', () => {
    it('should return boolean values', () => {
      const random = createSeededRandom(12345);
      
      for (let i = 0; i < 50; i++) {
        const value = randomBoolean(random);
        expect(typeof value).toBe('boolean');
      }
    });

    it('should respect probability parameter', () => {
      const random = createSeededRandom(12345);
      
      // Test with probability 0 (should always be false)
      expect(randomBoolean(random, 0)).toBe(false);
      
      // Test with probability 1 (should always be true)
      const random2 = createSeededRandom(12345);
      expect(randomBoolean(random2, 1)).toBe(true);
    });

    it('should be deterministic with same seed', () => {
      const random1 = createSeededRandom(12345);
      const random2 = createSeededRandom(12345);
      
      expect(randomBoolean(random1)).toBe(randomBoolean(random2));
    });
  });
});