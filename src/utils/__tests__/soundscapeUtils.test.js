import { describe, expect, test } from 'vitest';
import {
  colorToRootMidi,
  calculateSoundscapeTension,
  hexToHsl,
  paletteToSound,
  summarizeSoundscapeLayers,
} from '../soundscapeUtils.js';

describe('soundscape utilities', () => {
  test('maps colors and palettes deterministically', () => {
    expect(colorToRootMidi('#ff0000')).toBe(colorToRootMidi('#ff0000'));
    expect(paletteToSound(['#ff0000', '#00ff00'])).toEqual(
      paletteToSound(['#ff0000', '#00ff00']),
    );
    expect(paletteToSound(['#ff0000']).rootMidi).not.toBe(paletteToSound(['#0000ff']).rootMidi);
    expect(hexToHsl('#ffffff').lightness).toBeCloseTo(1);
  });

  test('summarizes layer values into bounded sound controls', () => {
    const summary = summarizeSoundscapeLayers([
      { radiusFactor: 3, opacity: 2, noiseAmount: 10, curviness: -1, wobble: 2, numSides: 30 },
      { radiusFactor: 1, opacity: 0.5, noiseAmount: 4, curviness: 0.5, wobble: 0, numSides: 4 },
    ]);

    expect(summary.count).toBe(2);
    expect(summary.size).toBe(1);
    expect(summary.opacity).toBe(0.75);
    expect(summary.noise).toBeCloseTo(0.875);
    expect(summary.curviness).toBe(0);
    expect(summary.wobble).toBe(1);
    expect(summary.sides).toBe(17);
    expect(summary.voices).toHaveLength(2);
    expect(summary.voices[0]).toMatchObject({ x: 0.5, y: 0.5, size: 1, opacity: 1 });
  });

  test('keeps relaxed visuals consonant and raises tension for harsh visuals', () => {
    const relaxed = calculateSoundscapeTension({ speed: 1, noise: 0, curviness: 1 });
    const harsh = calculateSoundscapeTension({ speed: 5, noise: 1, curviness: 0, wobble: 1 });
    expect(relaxed).toBe(0);
    expect(harsh).toBe(1);
    expect(calculateSoundscapeTension({ speed: 1, noise: 0, curviness: 1, wobble: 1 }))
      .toBeGreaterThan(relaxed);
  });
});
