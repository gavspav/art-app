import { AudioModeProcessor } from '../audioMappingModes.js';

describe('AudioModeProcessor numeric safety', () => {
  test('direct mode clamps invalid raw values to a finite 0..1 output', () => {
    const processor = new AudioModeProcessor();
    expect(processor.process('p-direct-a', NaN, {}, 'direct', {}, 0.05)).toBe(0);
    expect(processor.process('p-direct-b', Infinity, {}, 'direct', {}, 0.05)).toBe(0);
    expect(processor.process('p-direct-c', -1, {}, 'direct', {}, 0.05)).toBe(0);
    expect(processor.process('p-direct-d', 2, {}, 'direct', {}, 0.05)).toBe(1);
  });

  test('all temporal modes return finite values with malformed settings', () => {
    const processor = new AudioModeProcessor();
    const features = { rms: 0.72, bass: 0.41, mids: 0.33, highs: 0.18 };

    const modeCases = [
      { mode: 'accumulate', settings: { rate: NaN, wrap: true } },
      { mode: 'leaky', settings: { rate: NaN, decay: NaN, restValue: NaN } },
      { mode: 'bandRatio', settings: { numerator: 'bass', denominator: 'highs', scale: NaN } },
      { mode: 'runningAvg', settings: { windowSeconds: NaN } },
      { mode: 'onsetDrift', settings: { threshold: NaN, minLevel: NaN, driftSpeed: NaN } },
      {
        mode: 'hysteresis',
        settings: {
          quietToMed: NaN,
          medToLoud: NaN,
          loudToMed: NaN,
          medToQuiet: NaN,
          lerpSpeed: NaN,
          quietValue: NaN,
          medValue: NaN,
          loudValue: NaN,
        },
      },
    ];

    modeCases.forEach(({ mode, settings }) => {
      for (let i = 0; i < 12; i += 1) {
        const out = processor.process(`p-${mode}`, 0.6, features, mode, settings, NaN);
        expect(Number.isFinite(out)).toBe(true);
        expect(out).toBeGreaterThanOrEqual(0);
        expect(out).toBeLessThanOrEqual(1);
      }
    });
  });

  test('running average remains finite even with invalid dt and varying samples', () => {
    const processor = new AudioModeProcessor();
    const settings = { windowSeconds: NaN };

    const outputs = [
      processor.process('p-avg', 0.2, {}, 'runningAvg', settings, NaN),
      processor.process('p-avg', 0.8, {}, 'runningAvg', settings, Infinity),
      processor.process('p-avg', NaN, {}, 'runningAvg', settings, -10),
    ];

    outputs.forEach((out) => {
      expect(Number.isFinite(out)).toBe(true);
      expect(out).toBeGreaterThanOrEqual(0);
      expect(out).toBeLessThanOrEqual(1);
    });
  });
});
