import React, { useEffect, useState } from 'react';
import { act, render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { useMIDILayerParamHandlers } from '../hooks/useMIDILayerParamHandlers.js';

const makeRegister = (handlers) => (paramId, handler) => {
  if (!handlers.has(paramId)) handlers.set(paramId, new Set());
  handlers.get(paramId).add(handler);
  return () => {
    handlers.get(paramId)?.delete(handler);
  };
};

const fire = (handlers, paramId, value01) => {
  const set = handlers.get(paramId);
  if (!set || set.size === 0) throw new Error(`No handler for ${paramId}`);
  set.forEach(handler => handler({ value01 }));
};

function Harness({
  handlers,
  mode = 'individual',
  activeIds = null,
  onLayers,
}) {
  const [layers, setLayers] = useState([
    { id: 'l1', name: 'Layer 1', layerType: 'shape', radiusFactor: 1, radiusFactorX: 1, radiusFactorY: 1, rotation: 0, numColors: 2, colors: ['#000000', '#111111'] },
    { id: 'l2', name: 'Layer 2', layerType: 'shape', radiusFactor: 2, radiusFactorX: 2, radiusFactorY: 2, rotation: 0, numColors: 2, colors: ['#222222', '#333333'] },
  ]);

  useMIDILayerParamHandlers({
    registerParamHandler: makeRegister(handlers),
    parameters: [
      { id: 'radiusFactor', label: 'Size', group: 'Shape', type: 'slider', min: 0, max: 4, step: 0.01, showInOverlay: true },
      { id: 'colorFadeSpeed', label: 'Colour fade', group: 'Movement', type: 'slider', min: 0, max: 1, step: 0.01, randomMin: 0.2, randomMax: 0.6, showInOverlay: true },
    ],
    layers,
    setLayers,
    selectedLayerIndex: 0,
    parameterTargetMode: mode,
    getActiveTargetLayerIds: () => activeIds,
    palettes: [{ colors: ['#ff0000', '#00ff00', '#0000ff'] }],
    sampleColors: (src, count) => src.slice(0, count),
  });

  useEffect(() => {
    onLayers?.(layers);
  }, [layers, onLayers]);

  return null;
}

describe('useMIDILayerParamHandlers', () => {
  test('keeps learned layer aliases active outside the mounted control tab', () => {
    const handlers = new Map();
    let latestLayers = [];

    render(<Harness handlers={handlers} onLayers={(layers) => { latestLayers = layers; }} />);

    act(() => {
      fire(handlers, 'layer:l2:rotation', 0.75);
    });

    expect(latestLayers[0].rotation).toBe(0);
    expect(latestLayers[1].rotation).toBe(90);

    act(() => {
      fire(handlers, 'layer:l2:paletteIndex', 0.99);
    });

    expect(latestLayers[0].colors).toEqual(['#000000', '#111111']);
    expect(latestLayers[1].colors).toEqual(['#ff0000', '#00ff00']);
  });

  test('plain layer parameter mappings respect global target mode', () => {
    const handlers = new Map();
    let latestLayers = [];

    render(<Harness handlers={handlers} mode="global" onLayers={(layers) => { latestLayers = layers; }} />);

    act(() => {
      fire(handlers, 'radiusFactor', 0.75);
    });

    expect(latestLayers[0].radiusFactor).toBeCloseTo(3);
    expect(latestLayers[0].radiusFactorX).toBeCloseTo(3);
    expect(latestLayers[0].radiusFactorY).toBeCloseTo(3);
    expect(latestLayers[1].radiusFactor).toBeCloseTo(6);
    expect(latestLayers[1].radiusFactorX).toBeCloseTo(6);
    expect(latestLayers[1].radiusFactorY).toBeCloseTo(6);
  });

  test('individual size mappings do not crash when computing radius ratios', () => {
    const handlers = new Map();
    let latestLayers = [];

    render(<Harness handlers={handlers} onLayers={(layers) => { latestLayers = layers; }} />);

    act(() => {
      fire(handlers, 'layer:l1:radiusFactor', 0.5);
    });

    expect(latestLayers[0].radiusFactor).toBeCloseTo(2);
    expect(latestLayers[0].radiusFactorX).toBeCloseTo(2);
    expect(latestLayers[0].radiusFactorY).toBeCloseTo(2);
    expect(latestLayers[1].radiusFactor).toBeCloseTo(2);
  });

  test('layer parameter mappings respect configured random bounds', () => {
    const handlers = new Map();
    let latestLayers = [];

    render(<Harness handlers={handlers} onLayers={(layers) => { latestLayers = layers; }} />);

    act(() => {
      fire(handlers, 'colorFadeSpeed', 1);
    });

    expect(latestLayers[0].colorFadeSpeed).toBeCloseTo(0.6);
    expect(latestLayers[1].colorFadeSpeed).toBeUndefined();
  });

  test('layer parameter randomise triggers are registered centrally', () => {
    const handlers = new Map();
    let latestLayers = [];

    render(<Harness handlers={handlers} onLayers={(layers) => { latestLayers = layers; }} />);

    act(() => {
      fire(handlers, 'randomize:radiusFactor', 1);
    });

    expect(latestLayers[0].radiusFactor).toBeGreaterThanOrEqual(0);
    expect(latestLayers[0].radiusFactor).toBeLessThanOrEqual(4);
    expect(latestLayers[1].radiusFactor).toBe(2);
  });
});
