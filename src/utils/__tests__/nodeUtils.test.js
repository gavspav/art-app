import { describe, expect, test } from 'vitest';
import { resizeNodes } from '../nodeUtils.js';

describe('resizeNodes', () => {
  test('adds nodes to open paths without connecting the endpoints', () => {
    const nodes = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 1 }];
    const resized = resizeNodes(nodes, 4, { closed: false });

    expect(resized).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 1 },
    ]);
  });

  test('keeps open path endpoints when removing nodes', () => {
    const nodes = [
      { x: 0, y: 0 },
      { x: 1, y: 0.1 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ];
    const resized = resizeNodes(nodes, 2, { closed: false });

    expect(resized).toEqual([{ x: 0, y: 0 }, { x: 3, y: 0 }]);
  });

  test('preserves metadata on original nodes', () => {
    const nodes = [
      { x: 0, y: 0, cp1x: 0.25, cp1y: 0.5, isCurve: true },
      { x: 1, y: 0, label: 'end' },
    ];
    const resized = resizeNodes(nodes, 3, { closed: false });

    expect(resized[0]).toEqual(nodes[0]);
    expect(resized[2]).toEqual(nodes[1]);
  });

  test('splits the closing edge of a closed shape', () => {
    const nodes = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 10, y: 0 },
    ];
    const resized = resizeNodes(nodes, 4);

    expect(resized).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 0 },
    ]);
  });
});
