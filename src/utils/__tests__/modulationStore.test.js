import { describe, expect, test } from 'vitest';
import { applyModulationsToLayer } from '../../hooks/useModulationStore.js';

const layer = {
  id: 'layer-1',
  radiusFactor: 0.4,
  radiusFactorX: 0.6,
  radiusFactorY: 0.2,
};

describe('applyModulationsToLayer size modulation', () => {
  test('couples BPM size modulation to the rendered X/Y radii', () => {
    const result = applyModulationsToLayer(
      layer,
      { 'layer-1': { radiusFactor: 0.8 } },
      {},
      {},
      layer,
    );

    expect(result.radiusFactor).toBeCloseTo(0.8);
    expect(result.radiusFactorX).toBeCloseTo(1.2);
    expect(result.radiusFactorY).toBeCloseTo(0.4);
  });

  test('preserves explicit axis modulation alongside size modulation', () => {
    const result = applyModulationsToLayer(
      layer,
      { 'layer-1': { radiusFactor: 0.8, radiusFactorX: 0.9 } },
      {},
      {},
      layer,
    );

    expect(result.radiusFactor).toBeCloseTo(0.8);
    expect(result.radiusFactorX).toBeCloseTo(0.9);
    expect(result.radiusFactorY).toBeCloseTo(0.4);
  });
});
