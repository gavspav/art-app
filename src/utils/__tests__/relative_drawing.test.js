import { describe, it, expect } from 'vitest';
import { computeDeformedNodePoints, estimateLayerHalfExtents } from '../../components/Canvas.jsx';

const makeLayer = (overrides = {}) => ({
  layerType: 'shape',
  numSides: 6,
  curviness: 0,
  wobble: 0,
  noiseAmount: 0,
  freq1: 2,
  freq2: 3,
  freq3: 4,
  rotation: 0,
  baseRadiusFactor: 0.4,
  radiusFactor: 0.2,
  radiusBump: 0,
  nodes: [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
  ],
  position: { x: 0.5, y: 0.5, scale: 1, vx: 0, vy: 0, scaleDirection: 1 },
  visible: true,
  ...overrides,
});

const makeCanvas = (w, h) => ({ width: w, height: h });

describe('relative drawing geometry', () => {
  it('estimateLayerHalfExtents scales with canvas size via radiusFactor', () => {
    const layer = makeLayer({ radiusFactor: 0.25 });
    const c1 = makeCanvas(800, 600); // minWH=600
    const c2 = makeCanvas(1600, 1200); // minWH=1200 (2x)

    const { rx: rx1, ry: ry1 } = estimateLayerHalfExtents(layer, c1);
    const { rx: rx2, ry: ry2 } = estimateLayerHalfExtents(layer, c2);

    // Expect extents to double when minWH doubles
    expect(rx2).toBeCloseTo(rx1 * 2, 5);
    expect(ry2).toBeCloseTo(ry1 * 2, 5);
  });

  it('computeDeformedNodePoints maintains proportional distances when resized', () => {
    const base = makeLayer({ radiusFactor: 0.3, noiseAmount: 0, wobble: 0 });
    const c1 = makeCanvas(1000, 800); // minWH=800
    const c2 = makeCanvas(2000, 1600); // minWH=1600 (2x)

    const pts1 = computeDeformedNodePoints(base, c1, 1, 0);
    const pts2 = computeDeformedNodePoints(base, c2, 1, 0);

    // Compare first point's distance from center
    const cx1 = c1.width * base.position.x;
    const cy1 = c1.height * base.position.y;
    const cx2 = c2.width * base.position.x;
    const cy2 = c2.height * base.position.y;

    const d1 = Math.hypot(pts1[0].x - cx1, pts1[0].y - cy1);
    const d2 = Math.hypot(pts2[0].x - cx2, pts2[0].y - cy2);

    expect(d2).toBeCloseTo(d1 * 2, 4);
  });
});
