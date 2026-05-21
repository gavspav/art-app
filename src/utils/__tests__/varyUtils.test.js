import { describe, expect, it } from 'vitest';
import { applyWithVary, buildLayerIndexTarget } from '../varyUtils.js';

describe('applyWithVary', () => {
  it('can target id-less layers by index for global edits', () => {
    const layers = [
      { id: 'layer-a', radiusFactor: 0.1 },
      { radiusFactor: 0.2 },
      { id: 'layer-c', radiusFactor: 0.3 },
    ];

    const result = applyWithVary({
      layers,
      targets: new Set(['layer-a', buildLayerIndexTarget(1), 'layer-c']),
      updater: (layer) => ({ radiusFactor: layer.radiusFactor * 2 }),
    });

    expect(result.map(layer => layer.radiusFactor)).toEqual([0.2, 0.4, 0.6]);
  });
});
