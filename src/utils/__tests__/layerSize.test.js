import { describe, expect, test } from 'vitest';
import { buildRadiusFactorPatch, getEffectiveRadiusFactor } from '../layerSize.js';

describe('layer size helpers', () => {
  test('converts viewBox-mapped layers when size is explicitly changed', () => {
    const layer = {
      viewBoxMapped: true,
      radiusFactor: 0.1,
      radiusFactorX: 0.1,
      radiusFactorY: 0.1,
    };

    expect(getEffectiveRadiusFactor(layer)).toBe(0.5);
    expect(buildRadiusFactorPatch(layer, 1, 2)).toEqual({
      radiusFactor: 1,
      radiusFactorX: 1,
      radiusFactorY: 1,
      viewBoxMapped: false,
    });
  });

  test('uses visible axes when the stored radius is zero', () => {
    const patch = buildRadiusFactorPatch({
      radiusFactor: 0,
      radiusFactorX: 0.2,
      radiusFactorY: 0.4,
    }, 0.6);

    expect(patch.radiusFactor).toBeCloseTo(0.6);
    expect(patch.radiusFactorX).toBeCloseTo(0.4);
    expect(patch.radiusFactorY).toBeCloseTo(0.8);
  });
});
