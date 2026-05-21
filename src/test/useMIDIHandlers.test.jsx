import React, { useEffect, useState } from 'react';
import { act, render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
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
    { id: 'l2', variationShape: 0, variationAnim: 0, variationColor: 0, variationPosition: 0, variationScale: 0, opacity: 1 },
  ]);

  useMIDIHandlers({
    registerParamHandler: makeRegister(handlers),
    setGlobalSpeedMultiplier: () => {},
    setGlobalBlendMode: () => {},
    blendModes: ['normal'],
    layers,
    setLayers,
    DEFAULT_LAYER: {},
    buildVariedLayerFrom: layer => ({ ...layer }),
    setSelectedLayerIndex: () => {},
    palettes: [],
    sampleColorsEven: colors => colors,
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
});
