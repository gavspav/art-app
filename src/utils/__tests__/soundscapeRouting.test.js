import { describe, expect, test } from 'vitest';
import { migrateLegacySoundscapeRoutes, resolveSoundscapeRoutes } from '../soundscapeRouting.js';

describe('soundscape routing', () => {
  test('maps normalized sources into bounded destinations', () => {
    const result = resolveSoundscapeRoutes(
      { speed: 0.5, noise: 1 },
      [
        { source: 'speed', dest: 'bpm', outMin: 60, outMax: 120 },
        { source: 'noise', dest: 'distortion', outMin: 0, outMax: 1 },
      ],
    );
    expect(result.destinations.bpm).toBe(90);
    expect(result.destinations.distortion).toBe(0.75);
  });

  test('combines multiplicative destinations and supports curves', () => {
    const result = resolveSoundscapeRoutes(
      { opacity: 0.5, layers: 0.5 },
      [
        { source: 'opacity', dest: 'masterGain', outMin: 0.5, outMax: 1 },
        { source: 'layers', dest: 'masterGain', outMin: 0.5, outMax: 1, curve: 'exp' },
      ],
    );
    expect(result.destinations.masterGain).toBeCloseTo(0.46875);
  });

  test('migrates legacy mapping strengths and ranges', () => {
    const routes = migrateLegacySoundscapeRoutes({
      mappings: { speed: 0.5 },
      mappingRanges: { speed: { min: 0.2, max: 0.8, invert: true } },
    });
    const speedRoute = routes.find(route => route.id === 'speed-bpm');
    expect(speedRoute).toMatchObject({ inMin: 0.2, inMax: 0.8, invert: true, depth: 0.5 });
  });
});
