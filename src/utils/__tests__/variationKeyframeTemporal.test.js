import { describe, expect, test } from 'vitest';
import { computeTemporalVariationScales } from '../variationKeyframe.js';

describe('computeTemporalVariationScales', () => {
  test('returns full scale when no neighboring keyframes exist', () => {
    const scales = computeTemporalVariationScales([2.5], [], {
      windowSeconds: 1,
      minScale: 0.2,
    });
    expect(scales).toEqual([1]);
  });

  test('reduces scale for close keyframes and keeps far keyframes near full scale', () => {
    const scales = computeTemporalVariationScales([1.05, 3.0], [1.0, 5.0], {
      windowSeconds: 1,
      minScale: 0.25,
    });

    expect(scales[0]).toBeCloseTo(0.2875, 4); // 50ms from neighbor -> heavily damped
    expect(scales[1]).toBeCloseTo(1, 6); // 2s from nearest neighbor -> full variation
  });

  test('applies minimum scale when candidate keyframes are at the same time', () => {
    const scales = computeTemporalVariationScales([2.0, 2.0], [], {
      windowSeconds: 0.8,
      minScale: 0.3,
    });

    expect(scales[0]).toBeCloseTo(0.3, 6);
    expect(scales[1]).toBeCloseTo(0.3, 6);
  });

  test('can be disabled explicitly', () => {
    const scales = computeTemporalVariationScales([1.05], [1.0], {
      enabled: false,
      windowSeconds: 1,
      minScale: 0.1,
    });
    expect(scales).toEqual([1]);
  });
});
