import { evaluateShapeTrackAtTime, evaluateGlobalShapeTrackAtTime } from '../envelopes.js';
import { lerpNodes, lerpSubpaths } from '../nodeUtils.js';

describe('open path timeline compatibility', () => {
  test('holds previous geometry when shape track pathMode changes', () => {
    const leftNodes = [
      { x: -1, y: 0 },
      { x: 1, y: 0 },
    ];
    const rightNodes = [
      { x: -1, y: -1 },
      { x: 1, y: -1 },
      { x: 1, y: 1 },
    ];
    const track = {
      type: 'shape',
      keyframes: [
        {
          id: 'a',
          timeSeconds: 0,
          enabled: true,
          nodes: leftNodes,
          subpaths: null,
          shapeParams: { pathMode: 'open', strokeWidthPx: 3 },
        },
        {
          id: 'b',
          timeSeconds: 1,
          enabled: true,
          nodes: rightNodes,
          subpaths: null,
          shapeParams: { pathMode: 'closed' },
        },
      ],
    };

    const result = evaluateShapeTrackAtTime(track, 0.5, lerpNodes, lerpSubpaths);
    expect(result.nodes).toEqual(leftNodes);
    expect(result.shapeParams.pathMode).toBe('open');
  });

  test('holds previous geometry when global shape track pathMode changes', () => {
    const track = {
      type: 'globalShape',
      keyframes: [
        {
          id: 'a',
          timeSeconds: 0,
          enabled: true,
          layers: [
            {
              nodes: [{ x: -1, y: 0 }, { x: 1, y: 0 }],
              subpaths: null,
              shapeParams: { pathMode: 'open' },
            },
          ],
        },
        {
          id: 'b',
          timeSeconds: 1,
          enabled: true,
          layers: [
            {
              nodes: [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }],
              subpaths: null,
              shapeParams: { pathMode: 'closed' },
            },
          ],
        },
      ],
    };

    const result = evaluateGlobalShapeTrackAtTime(track, 0.5, lerpNodes, lerpSubpaths);
    expect(result.layers[0].nodes).toEqual(track.keyframes[0].layers[0].nodes);
    expect(result.layers[0].shapeParams.pathMode).toBe('open');
  });
});
