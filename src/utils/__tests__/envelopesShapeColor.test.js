import { describe, expect, test } from 'vitest';
import { evaluateShapeTrackAtTime } from '../envelopes.js';

describe('evaluateShapeTrackAtTime - color tweening', () => {
  test('tweens colors between two shape keyframes', () => {
    const track = {
      type: 'shape',
      categories: { shape: false, animation: false, color: true },
      keyframes: [
        { id: 'a', timeSeconds: 0, enabled: true, colors: ['#ff0000'] },
        { id: 'b', timeSeconds: 10, enabled: true, colors: ['#00ff00'] },
      ],
    };

    const res = evaluateShapeTrackAtTime(track, 5, null, null);
    expect(res?.colors).toEqual(['#808000']);
  });

  test('ignores intermediate keyframes without colors (no stepping)', () => {
    const track = {
      type: 'shape',
      categories: { shape: false, animation: false, color: true },
      keyframes: [
        { id: 'a', timeSeconds: 0, enabled: true, colors: ['#ff0000'] },
        { id: 'mid', timeSeconds: 5, enabled: true }, // accidentally-added numeric-like keyframe (no colors)
        { id: 'b', timeSeconds: 10, enabled: true, colors: ['#00ff00'] },
      ],
    };

    const res = evaluateShapeTrackAtTime(track, 7.5, null, null);
    expect(res?.colors).toEqual(['#40bf00']);
  });
});

