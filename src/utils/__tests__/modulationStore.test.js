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

describe('applyModulationsToLayer side-count modulation', () => {
  test('resamples an open path without closing or replacing it', () => {
    const openLayer = {
      id: 'line-1',
      pathMode: 'open',
      pathClosed: false,
      numSides: 3,
      nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 1 }],
    };
    const result = applyModulationsToLayer(
      openLayer,
      { 'line-1': { numSides: 4 } },
      {},
      {},
      openLayer,
    );

    expect(result.nodes).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 1 },
    ]);
  });
});
