import { describe, it, expect } from 'vitest';
import { hslToHex, hexToRgb, rgbToHex } from '../utils/colorUtils.js';

describe('colorUtils', () => {
  it('hslToHex produces black and white correctly', () => {
    expect(hslToHex(0, 0, 0)).toBe('#000000');
    expect(hslToHex(0, 0, 100)).toBe('#ffffff');
  });

  it('hslToHex produces primary colors', () => {
    expect(hslToHex(0, 100, 50)).toBe('#ff0000');
    expect(hslToHex(120, 100, 50)).toBe('#00ff00');
    expect(hslToHex(240, 100, 50)).toBe('#0000ff');
  });

  it('hexToRgb parses hex correctly', () => {
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#FF0000')).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('rgbToHex clamps and formats properly', () => {
    expect(rgbToHex({ r: 255, g: 255, b: 255 })).toBe('#ffffff');
    expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe('#000000');
  });

  it('roundtrip rgb<->hex', () => {
    const colors = [
      { r: 12, g: 34, b: 56 },
      { r: 200, g: 150, b: 100 },
      { r: 1, g: 2, b: 3 },
    ];
    for (const c of colors) {
      const hex = rgbToHex(c);
      const back = hexToRgb(hex);
      expect(back).toEqual({ r: c.r, g: c.g, b: c.b });
    }
  });
});
