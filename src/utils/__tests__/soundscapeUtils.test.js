import { describe, expect, test } from 'vitest';
import { SOUND_PROGRAMS } from '../../constants/soundscapeParams.js';
import defaultArcadePreset from '../../config/defaultArcadePreset.json';
import {
  colorToRootMidi,
  calculateSoundscapeTension,
  getPaletteIdentity,
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
    expect(getPaletteIdentity(['#FF0000', '#00ff00'])).toBe('#ff0000|#00ff00');
  });

  test('spreads palette timbres across gentle sine and triangle families', () => {
    const palettes = [
      ['#ff0000'],
      ['#ffbf00'],
      ['#80ff00'],
      ['#00ff40'],
      ['#00ffff'],
      ['#0040ff'],
      ['#8000ff'],
      ['#ff00bf'],
    ];
    const oscillators = palettes.map(palette => paletteToSound(palette).oscillator);

    expect(new Set(oscillators).size).toBeGreaterThanOrEqual(3);
    expect(oscillators.filter(oscillator => oscillator.startsWith('sine')).length)
      .toBeGreaterThanOrEqual(oscillators.length / 2);
    expect(oscillators).not.toContain('fatsawtooth');
  });

  test('assigns cabinet palettes across every curated sound program', () => {
    const assignments = Object.values(defaultArcadePreset.soundscapeConfig.paletteProgramMap);
    expect(new Set(assignments)).toEqual(new Set(Object.keys(SOUND_PROGRAMS)));
    expect(Math.max(...Object.keys(SOUND_PROGRAMS).map(id => assignments.filter(value => value === id).length))).toBeLessThanOrEqual(3);
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
