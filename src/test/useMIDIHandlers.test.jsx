import React, { useEffect, useState } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { useMIDIHandlers } from '../hooks/useMIDIHandlers.js';

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

function Harness({ handlers, onBackgroundColor, onLayers }) {
  const [backgroundColor, setBackgroundColor] = useState('#102030');
  const [layers, setLayers] = useState([
    { id: 'l1', variationShape: 0, variationAnim: 0, variationColor: 0, variationPosition: 0, variationScale: 0, opacity: 1 },
    { id: 'l2', variationShape: 0, variationAnim: 0, variationColor: 0, variationPosition: 0, variationScale: 0, opacity: 1, xOffset: 0 },
  ]);

  useMIDIHandlers({
    registerParamHandler: makeRegister(handlers),
    setGlobalSpeedMultiplier: () => {},
    setGlobalBlendMode: () => {},
    setGlobalPaletteIndex: () => {},
    setGlobalPaletteRef: () => {},
    blendModes: ['normal'],
    parameters: [
      { id: 'globalOpacity', type: 'slider', min: 0, max: 1, step: 0.01, randomMin: 0.2, randomMax: 0.2 },
      { id: 'globalPaletteIndex', type: 'slider', min: 0, max: 1, step: 0.01 },
    ],
    layers,
    setLayers,
    DEFAULT_LAYER: {},
    buildVariedLayerFrom: (layer, index, baseVar, options = {}) => ({
      ...layer,
      xOffset: options.affectCategories?.includes('position') ? baseVar.position + index : layer.xOffset,
    }),
    applyVariationInstantly: true,
    setSelectedLayerIndex: () => {},
    palettes: [{ colors: ['#ff0000', '#00ff00'] }],
    sampleColorsEven: (colors, count) => colors.slice(0, count),
    assignOneColorPerLayer: (colors) => {
      setLayers(prev => prev.map((layer, index) => ({
        ...layer,
        colors: [colors[index % colors.length] || '#ffffff'],
        numColors: 1,
        selectedColor: 0,
      })));
    },
    backgroundColor,
    setBackgroundColor,
    rndAllPrevRef: { current: 0 },
    handleRandomizeAll: () => {},
    clampedSelectedIndex: 0,
  });

  useEffect(() => {
    onBackgroundColor?.(backgroundColor);
  }, [backgroundColor, onBackgroundColor]);

  useEffect(() => {
    onLayers?.(layers);
  }, [layers, onLayers]);

  return null;
}

describe('useMIDIHandlers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('background colour handlers stay registered centrally', () => {
    const handlers = new Map();
    let latestBackgroundColor = '';

    render(<Harness handlers={handlers} onBackgroundColor={(color) => { latestBackgroundColor = color; }} />);

    act(() => {
      fire(handlers, 'backgroundColor', 0.5);
    });
    expect(latestBackgroundColor).toBe('#808080');

    act(() => {
      fire(handlers, 'backgroundColorR', 1);
      fire(handlers, 'backgroundColorG', 0);
      fire(handlers, 'backgroundColorB', 0.25);
    });
    expect(latestBackgroundColor).toBe('#ff0040');
  });

  test('background randomise trigger stays registered centrally', () => {
    const handlers = new Map();
    let latestBackgroundColor = '#102030';
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.999)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.25);

    render(<Harness handlers={handlers} onBackgroundColor={(color) => { latestBackgroundColor = color; }} />);

    act(() => {
      fire(handlers, 'randomize:backgroundColor', 1);
    });

    expect(latestBackgroundColor).toBe('#ff0040');
  });

  test('global palette and opacity randomise triggers stay registered centrally', () => {
    const handlers = new Map();
    let latestLayers = [];

    render(<Harness handlers={handlers} onLayers={(layers) => { latestLayers = layers; }} />);

    act(() => {
      fire(handlers, 'randomize:globalOpacity', 1);
    });

    expect(latestLayers[0].opacity).toBe(0.2);
    expect(latestLayers[1].opacity).toBe(0.2);

    act(() => {
      fire(handlers, 'randomize:globalOpacity', 0);
      fire(handlers, 'randomize:globalPaletteIndex', 1);
    });

    expect(latestLayers[0].colors).toEqual(['#ff0000']);
    expect(latestLayers[1].colors).toEqual(['#00ff00']);
  });

  test('global variation midi updates all layers', () => {
    const handlers = new Map();
    let latestLayers = [];

    render(<Harness handlers={handlers} onLayers={(layers) => { latestLayers = layers; }} />);

    act(() => {
      fire(handlers, 'variationShape', 0.5);
      fire(handlers, 'variationScale', 0.75);
    });

    expect(latestLayers[0].variationShape).toBe(1.5);
    expect(latestLayers[1].variationShape).toBe(1.5);
    expect(latestLayers[0].variationScale).toBe(1.5);
    expect(latestLayers[1].variationScale).toBe(1.5);
  });

  test('variation position midi applies the same instant visual update as the UI slider', () => {
    const handlers = new Map();
    let latestLayers = [];

    render(<Harness handlers={handlers} onLayers={(layers) => { latestLayers = layers; }} />);

    act(() => {
      fire(handlers, 'variationPosition', 0.5);
    });

    expect(latestLayers[0].variationPosition).toBe(1.5);
    expect(latestLayers[1].variationPosition).toBe(1.5);
    expect(latestLayers[1].xOffset).toBe(3.5);
  });
});
