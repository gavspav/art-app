import React, { useState } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Canvas, { computeDeformedNodePoints } from '../Canvas.jsx';
import { DEFAULT_LAYER } from '../../constants/defaults.js';

vi.mock('../../context/AppStateContext.jsx', () => ({ useAppState: () => ({}) }));

class TestPointerEvent extends MouseEvent {
  constructor(type, init = {}) {
    super(type, init);
    Object.defineProperties(this, {
      pointerId: { value: init.pointerId ?? 1 },
      pointerType: { value: init.pointerType ?? 'touch' },
    });
  }
}

const originalNodes = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
function Harness({ overrides = {} }) {
  const [layers, setLayers] = useState([{
    ...DEFAULT_LAYER, id: 'test-shape', layerType: 'shape', visible: true,
    nodes: originalNodes, numSides: 4, syncNodesToNumSides: false,
    position: { x: 0.5, y: 0.5, scale: 1 }, movementStyle: 'still',
    radiusFactor: 0.25, radiusFactorX: 0.25, radiusFactorY: 0.25, radiusBump: 0,
    rotation: 0, wobble: 0, noiseAmount: 0, curviness: 0, xOffset: 0, yOffset: 0,
    ...overrides,
  }]);
  const [selectedLayerIndex, setSelectedLayerIndex] = useState(0);
  return <div>
    <Canvas layers={layers} setLayers={setLayers} isNodeEditMode isFrozen colorFadeWhileFrozen={false}
      selectedLayerIndex={selectedLayerIndex} setSelectedLayerIndex={setSelectedLayerIndex}
      backgroundColor="#000000" globalSeed={1} globalBlendMode="source-over" />
    <output data-testid="layers">{JSON.stringify(layers)}</output>
  </div>;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('Path2D', class { moveTo() {} lineTo() {} closePath() {} bezierCurveTo() {} quadraticCurveTo() {} });
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 });
  const context = new Proxy({}, { get: (target, key) => target[key] ?? (() => {}), set: (target, key, value) => { target[key] = value; return true; } });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function setup(overrides) {
  const view = render(<Harness overrides={overrides} />);
  const canvas = view.getByLabelText('Shape editing canvas');
  canvas.setPointerCapture = vi.fn();
  const send = (type, id, x, y, pointerType = 'touch') => fireEvent(canvas,
    new TestPointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType, clientX: x, clientY: y }));
  const layers = () => JSON.parse(view.getByTestId('layers').textContent);
  return { ...view, send, layers, nodes: () => layers()[0].nodes };
}

describe('touch editing on the canvas', () => {
  it('keeps the Pencil on the visible point of a rotated, non-uniformly scaled shape', () => {
    const { send, layers } = setup({ rotation: 90, radiusFactorY: 0.1 });
    send('pointerdown', 1, 400, 450, 'pen');
    send('pointermove', 1, 420, 480, 'pen');
    send('pointerup', 1, 420, 480, 'pen');
    const points = computeDeformedNodePoints(layers()[0], { width: 800, height: 600 }, 1, 0);
    expect(points[0].x).toBeCloseTo(420);
    expect(points[0].y).toBeCloseTo(480);
  });
  it('drags precisely from an offset finger target, flushes release, and undoes the complete drag', () => {
    const { send, nodes, getByRole } = setup();
    send('pointerdown', 1, 565, 300);
    send('pointermove', 1, 590, 315);
    send('pointermove', 1, 600, 320);
    send('pointerup', 1, 610, 330);
    expect(nodes()[0].x).toBeCloseTo(1.3);
    expect(nodes()[0].y).toBeCloseTo(0.2);
    fireEvent.click(getByRole('button', { name: 'Undo node edit' }));
    expect(nodes()).toEqual(originalNodes);
    fireEvent.click(getByRole('button', { name: 'Redo node edit' }));
    expect(nodes()[0].x).toBeCloseTo(1.3);
  });

  it('pinches the shape and consumes the remaining finger without deforming a node', () => {
    const { send, nodes, getByRole } = setup();
    send('pointerdown', 1, 350, 300);
    send('pointerdown', 2, 450, 300);
    send('pointermove', 1, 300, 300);
    send('pointermove', 2, 500, 300);
    send('pointerup', 2, 500, 300);
    expect(nodes()[0].x).toBeCloseTo(2);
    const afterPinch = nodes();
    send('pointermove', 1, 550, 350);
    send('pointerup', 1, 550, 350);
    expect(nodes()).toEqual(afterPinch);
    fireEvent.click(getByRole('button', { name: 'Undo node edit' }));
    expect(nodes()).toEqual(originalNodes);
  });

  it('adds and removes nodes by holding, with minimum topology and undo preserved', () => {
    const { send, nodes, getByRole } = setup();
    send('pointerdown', 1, 550, 300);
    act(() => vi.advanceTimersByTime(650));
    send('pointerup', 1, 550, 300);
    expect(nodes()).toHaveLength(3);
    fireEvent.click(getByRole('button', { name: 'Undo node edit' }));
    expect(nodes()).toHaveLength(4);
    send('pointerdown', 2, 475, 375);
    act(() => vi.advanceTimersByTime(650));
    send('pointerup', 2, 475, 375);
    expect(nodes()).toHaveLength(5);
    fireEvent.click(getByRole('button', { name: 'Undo node edit' }));
    expect(nodes()).toEqual(originalNodes);
  });

  it('uses Pencil for precise dragging while ignoring simultaneous palm contacts', () => {
    const { send, nodes } = setup();
    send('pointerdown', 1, 550, 300, 'pen');
    send('pointerdown', 2, 300, 300);
    send('pointerdown', 3, 500, 300);
    send('pointermove', 1, 580, 300, 'pen');
    send('pointerup', 1, 580, 300, 'pen');
    expect(nodes()[0].x).toBeCloseTo(1.2);
    expect(nodes()[2]).toEqual(originalNodes[2]);
  });

  it('pulls horizontally with touch and can undo the deformation', () => {
    const { send, nodes, getByRole } = setup();
    fireEvent.click(getByRole('button', { name: 'Pull', exact: true }));
    send('pointerdown', 1, 550, 300);
    send('pointermove', 1, 580, 300);
    send('pointerup', 1, 580, 300);
    expect(nodes()[0].x).toBeCloseTo(1.2);
    expect(nodes()[2]).toEqual(originalNodes[2]);
    fireEvent.click(getByRole('button', { name: 'Undo node edit' }));
    expect(nodes()).toEqual(originalNodes);
  });

  it('navigates the view without changing geometry in Pencil-only mode', () => {
    const { send, nodes, getByRole } = setup();
    fireEvent.click(getByRole('button', { name: 'Pencil only' }));
    send('pointerdown', 1, 350, 300);
    send('pointerdown', 2, 450, 300);
    send('pointermove', 1, 300, 300);
    send('pointermove', 2, 500, 300);
    send('pointerup', 2, 500, 300);
    send('pointerup', 1, 300, 300);
    expect(nodes()).toEqual(originalNodes);
    expect(getByRole('button', { name: 'Reset node edit zoom' })).toHaveTextContent('200%');
  });

  it('creates a polygon with a Pencil drag and commits on lift without a keyboard', () => {
    const { send, layers, getByRole, queryByRole } = setup();
    fireEvent.click(getByRole('button', { name: 'Polygon', exact: true }));
    send('pointerdown', 1, 300, 200, 'pen');
    send('pointermove', 1, 390, 200, 'pen');
    send('pointerup', 1, 420, 200, 'pen');
    expect(layers()).toHaveLength(2);
    expect(layers()[1].radiusFactor).toBeCloseTo(0.2);
    expect(queryByRole('button', { name: 'Finish', exact: true })).not.toBeInTheDocument();
  });
});
