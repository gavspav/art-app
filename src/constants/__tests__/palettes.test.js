/**
 * Tests for color palettes constants
 */

import { describe, it, expect } from 'vitest';
import { palettes } from '../palettes.js';

describe('palettes constant', () => {
  it('should be an object with palette definitions', () => {
    expect(typeof palettes).toBe('object');
    expect(palettes).not.toBeNull();
    expect(Object.keys(palettes).length).toBeGreaterThan(0);
  });

  it('should have all palettes as arrays of colors', () => {
    Object.entries(palettes).forEach(([name, colors]) => {
      expect(Array.isArray(colors)).toBe(true);
      expect(colors.length).toBeGreaterThan(0);
      
      colors.forEach((color, index) => {
        expect(typeof color).toBe('string');
        expect(color).toMatch(/^#[0-9A-F]{6}$/i);
      });
    });
  });

  it('should have expected palette names', () => {
    const expectedPalettes = [
      'blues', 'neon', 'sunset', 'ocean', 'aurora', 'cyberpunk',
      'pastel', 'forest', 'volcanic', 'cosmic', 'retro', 'candy',
      'autumn', 'midnight'
    ];
    
    expectedPalettes.forEach(paletteName => {
      expect(palettes).toHaveProperty(paletteName);
    });
  });

  it('should have consistent color count per palette', () => {
    Object.entries(palettes).forEach(([name, colors]) => {
      // Most palettes should have a reasonable number of colors
      expect(colors.length).toBeGreaterThanOrEqual(4);
      expect(colors.length).toBeLessThanOrEqual(16);
    });
  });

  it('should have valid hex color format', () => {
    Object.entries(palettes).forEach(([name, colors]) => {
      colors.forEach(color => {
        // Should be 7 characters: # + 6 hex digits
        expect(color.length).toBe(7);
        expect(color.charAt(0)).toBe('#');
        
        // Should be valid hex
        const hexPart = color.slice(1);
        expect(hexPart).toMatch(/^[0-9A-F]{6}$/i);
      });
    });
  });

  it('should have unique colors within each palette', () => {
    Object.entries(palettes).forEach(([name, colors]) => {
      const uniqueColors = new Set(colors);
      expect(uniqueColors.size).toBe(colors.length);
    });
  });

  it('should have descriptive palette names', () => {
    const paletteNames = Object.keys(palettes);
    
    paletteNames.forEach(name => {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(2);
      expect(name).toMatch(/^[a-z]+$/); // lowercase letters only
    });
  });
});