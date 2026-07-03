import { describe, expect, test } from 'vitest';
import { resolveModulationSources } from '../useModulationStore.js';

describe('resolveModulationSources', () => {
  const sources = {
    bpmMods: { layer1: { wobble: 0.4 } },
    audioMods: { layer1: { noiseAmount: 2 } },
    timelineMods: { layer1: { radiusFactor: 0.2 } },
  };

  test('keeps all sources during normal idle playback', () => {
    expect(resolveModulationSources(sources)).toEqual(sources);
  });

  test('keeps timeline playback while direct interaction pauses Audio and BPM', () => {
    expect(resolveModulationSources({ ...sources, isUserInteracting: true })).toEqual({
      bpmMods: {},
      audioMods: {},
      timelineMods: sources.timelineMods,
    });
  });

  test('disables all external visual modulation in arcade mode', () => {
    expect(resolveModulationSources({ ...sources, isArcade: true })).toEqual({
      bpmMods: {},
      audioMods: {},
      timelineMods: {},
    });
  });
});
