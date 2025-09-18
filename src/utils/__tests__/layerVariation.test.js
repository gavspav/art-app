import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildVariedLayerFrom } from '../layerVariation.js';
import { DEFAULT_LAYER } from '../../constants/defaults.js';

describe('buildVariedLayerFrom', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps geometry but varies colour and animation when shape variation is zero', () => {
    const baseLayer = {
      ...DEFAULT_LAYER,
      name: 'Layer 1',
      movementSpeed: 1,
      movementAngle: 45,
      position: { ...DEFAULT_LAYER.position },
      colors: ['#112233'],
      numColors: 1,
      vary: {
        ...DEFAULT_LAYER.vary,
        movementSpeed: true,
        movementAngle: true,
        colors: true,
      },
      variationShape: 0,
      variationAnim: 1.5,
      variationColor: 3,
      variationPosition: 0.5,
    };

    const palettes = [{ name: 'Test', colors: ['#abcdef', '#fedcba'] }];

    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.42);

    const result = buildVariedLayerFrom(
      baseLayer,
      2,
      { shape: 0, anim: 1.5, color: 3, position: 0.5 },
      { palettes, DEFAULT_LAYER },
    );

    // Geometry and seeds stay intact.
    expect(result.numSides).toBe(baseLayer.numSides);
    expect(result.width).toBe(baseLayer.width);
    expect(result.height).toBe(baseLayer.height);
    expect(result.seed).toBe(baseLayer.seed);
    expect(result.nodes).toBeNull();

    // Animation-related values should change.
    expect(result.movementSpeed).not.toBe(baseLayer.movementSpeed);
    expect(result.movementAngle).not.toBe(baseLayer.movementAngle);
    expect(result.position.x).not.toBe(baseLayer.position.x);
    expect(result.position.y).not.toBe(baseLayer.position.y);

    // Colour palette should update from provided list, but remain a new array.
    expect(result.colors).toEqual(palettes[0].colors);
    expect(result.colors).not.toBe(baseLayer.colors);
    expect(result.numColors).toBe(palettes[0].colors.length);

    // Variations are copied through.
    expect(result.variationShape).toBe(0);
    expect(result.variationAnim).toBe(1.5);
    expect(result.variationColor).toBe(3);

    randomSpy.mockRestore();
  });
});
