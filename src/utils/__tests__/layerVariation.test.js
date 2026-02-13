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



  it('constrains colour variation to provided paletteColors when enabled', () => {
    const baseLayer = {
      ...DEFAULT_LAYER,
      name: 'Layer 1',
      position: { ...DEFAULT_LAYER.position },
      colors: ['#112233', '#445566', '#778899'],
      numColors: 3,
      vary: {
        ...DEFAULT_LAYER.vary,
        colors: true,
        numColors: false,
      },
    };

    const palettePool = ['#ff0000', '#00ff00', '#0000ff'];

    const result = buildVariedLayerFrom(
      baseLayer,
      2,
      { shape: 0, anim: 0, color: 3, position: 0 },
      {
        DEFAULT_LAYER,
        randomSeed: 12345,
        constrainColorsToPalette: true,
        paletteColors: palettePool,
      },
    );

    expect(result.colors).toHaveLength(3);
    const allowed = new Set(palettePool.map(c => c.toLowerCase()));
    result.colors.forEach((c) => {
      expect(allowed.has(String(c).toLowerCase())).toBe(true);
    });
  });

  it('does not inherit the source layer id', () => {
    const baseLayer = {
      ...DEFAULT_LAYER,
      id: 'layer-source-id',
      name: 'Layer 1',
      position: { ...DEFAULT_LAYER.position },
    };

    const result = buildVariedLayerFrom(
      baseLayer,
      2,
      { shape: 1, anim: 1, color: 1, position: 1 },
      { DEFAULT_LAYER },
    );

    expect(result.id).toBeUndefined();
  });
});
