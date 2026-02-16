import { describe, expect, test } from 'vitest';
import {
  evaluateTrackAtTime,
  evaluateShapeTrackAtTime,
  evaluateGlobalShapeTrackAtTime,
} from '../envelopes.js';
import { lerpNodes, lerpSubpaths } from '../nodeUtils.js';

describe('envelopes stability around keyframes', () => {
  test('evaluateTrackAtTime handles unsorted numeric keyframes deterministically', () => {
    const track = {
      type: 'numeric',
      range: { outputMin: 0, outputMax: 1 },
      keyframes: [
        { id: 'b', timeSeconds: 10, value01: 1, curve: 'linear', tension: 0.5 },
        { id: 'a', timeSeconds: 0, value01: 0, curve: 'linear', tension: 0.5 },
      ],
    };

    const value = evaluateTrackAtTime(track, 5);
    expect(value).toBeCloseTo(0.5, 6);
  });

  test('shape interpolation holds available geometry when one side is missing', () => {
    const rightNodes = [
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 0 },
    ];
    const track = {
      type: 'shape',
      categories: { shape: true, animation: true, color: true },
      keyframes: [
        { id: 'left', timeSeconds: 0, enabled: true }, // malformed/partial
        {
          id: 'right',
          timeSeconds: 1,
          enabled: true,
          nodes: rightNodes,
          position: { x: 0.82, y: 0.28, scale: 1.2 },
          shapeParams: { numSides: 9, curviness: 0.44, radiusFactor: 0.2, radiusFactorX: 0.2, radiusFactorY: 0.2, rotation: 12 },
        },
      ],
    };

    const result = evaluateShapeTrackAtTime(track, 0.5, lerpNodes, lerpSubpaths);
    expect(result?.nodes).toEqual(rightNodes);
    expect(result?.position?.x).toBeCloseTo(0.82, 6);
    expect(result?.shapeParams?.numSides).toBe(9);
  });

  test('global shape interpolation does not drop layer data when layer counts differ', () => {
    const nodes = [
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 0 },
    ];
    const track = {
      type: 'globalShape',
      categories: { shape: true, animation: false, color: true },
      keyframes: [
        { id: 'a', timeSeconds: 0, enabled: true, layers: [] },
        {
          id: 'b',
          timeSeconds: 1,
          enabled: true,
          layers: [
            {
              nodes,
              position: { x: 0.7, y: 0.3, scale: 1.1 },
              shapeParams: { numSides: 7, curviness: 0.35, radiusFactor: 0.2, radiusFactorX: 0.2, radiusFactorY: 0.2, rotation: 0 },
              colors: ['#ff9900'],
            },
          ],
        },
      ],
    };

    const result = evaluateGlobalShapeTrackAtTime(track, 0.5, lerpNodes, lerpSubpaths);
    expect(Array.isArray(result?.layers)).toBe(true);
    expect(result.layers.length).toBe(1);
    expect(result.layers[0]?.nodes).toEqual(nodes);
    expect(result.layers[0]?.position?.x).toBeCloseTo(0.7, 6);
    expect(result.layers[0]?.shapeParams?.numSides).toBe(7);
  });
});
