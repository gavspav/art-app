import { describe, expect, it } from 'vitest';
import { findClosestPointIndex, getGesturePair, mapNodePoints, moveNodeTo, transformGesturePoint } from '../nodeEditorGestures.js';

describe('shape gesture geometry', () => {
  it('picks the closest node when generous finger targets overlap', () => {
    expect(findClosestPointIndex([{ x: 0, y: 0 }, { x: 20, y: 0 }], { x: 18, y: 0 }, 24)).toBe(1);
    expect(findClosestPointIndex([{ x: 0, y: 0 }], { x: 30, y: 0 }, 24)).toBe(-1);
  });
  it('scales, rotates and translates around the two-finger midpoint', () => {
    const start = getGesturePair([{ x: -10, y: 0 }, { x: 10, y: 0 }]);
    const end = getGesturePair([{ x: 5, y: -13 }, { x: 5, y: 27 }]);
    const point = transformGesturePoint({ x: 10, y: 10 }, start, end);
    expect(point.x).toBeCloseTo(-15);
    expect(point.y).toBeCloseTo(27);
  });
  it('keeps coincident fingers finite and limits extreme scale changes', () => {
    const start = getGesturePair([{ x: 0, y: 0 }, { x: 0, y: 0 }]);
    const end = getGesturePair([{ x: -10000, y: 0 }, { x: 10000, y: 0 }]);
    expect(transformGesturePoint({ x: 1, y: 0 }, start, end)).toEqual({ x: 20, y: 0 });
  });
  it('transforms Bézier controls and preserves metadata without mutating the source', () => {
    const node = { x: 1, y: 2, cp1x: 0, cp1y: 1, cp2x: 3, cp2y: 4, isCurve: true };
    expect(mapNodePoints(node, p => ({ x: p.x * 2, y: p.y * 2 }))).toEqual({
      x: 2, y: 4, cp1x: 0, cp1y: 2, cp2x: 6, cp2y: 8, isCurve: true,
    });
    expect(moveNodeTo(node, 4, 6)).toEqual({ x: 4, y: 6, cp1x: 3, cp1y: 5, cp2x: 6, cp2y: 8, isCurve: true });
    expect(node.x).toBe(1);
  });
});
