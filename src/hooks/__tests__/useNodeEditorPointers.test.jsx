import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNodeEditorPointers } from '../useNodeEditorPointers.js';

class TestPointerEvent extends MouseEvent {
  constructor(type, init = {}) {
    super(type, init);
    Object.defineProperties(this, {
      pointerId: { value: init.pointerId ?? 1 },
      pointerType: { value: init.pointerType ?? 'touch' },
    });
  }
}

function Harness({ options }) {
  const handlers = useNodeEditorPointers({ enabled: true, ...options });
  return <div data-testid="surface" {...handlers} />;
}

function setup(overrides = {}) {
  const options = Object.fromEntries(['onStart', 'onMove', 'onEnd', 'onCancel', 'onPairStart', 'onPairMove', 'onPairEnd', 'onHold', 'onFlush'].map(name => [name, vi.fn()]));
  Object.assign(options, { canHold: () => true }, overrides);
  const view = render(<Harness options={options} />);
  const surface = view.getByTestId('surface');
  surface.setPointerCapture = vi.fn();
  const send = (type, pointerId, x = 0, y = 0, pointerType = 'touch') => fireEvent(surface,
    new TestPointerEvent(type, { bubbles: true, pointerId, pointerType, clientX: x, clientY: y }));
  return { ...view, surface, options, send };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('node editor pointer ownership', () => {
  it('captures a finger and flushes its release position before finishing', () => {
    const { send, surface, options } = setup();
    send('pointerdown', 1, 10, 10);
    send('pointermove', 1, 30, 20);
    send('pointerup', 1, 35, 22);
    expect(surface.setPointerCapture).toHaveBeenCalledWith(1);
    expect(options.onFlush.mock.calls[0][0].clientX).toBe(35);
    expect(options.onFlush.mock.invocationCallOrder[0]).toBeLessThan(options.onEnd.mock.invocationCallOrder[0]);
  });

  it('promotes two fingers to a pinch and consumes the remaining finger after release', () => {
    const { send, options } = setup();
    send('pointerdown', 1, 10);
    send('pointerdown', 2, 50);
    expect(options.onCancel).toHaveBeenCalledOnce();
    expect(options.onPairStart).toHaveBeenCalledOnce();
    send('pointermove', 2, 70);
    send('pointerup', 2, 70);
    send('pointermove', 1, 100);
    send('pointerup', 1, 100);
    expect(options.onPairEnd).toHaveBeenCalledOnce();
    expect(options.onMove).not.toHaveBeenCalled();
    expect(options.onEnd).not.toHaveBeenCalled();
    send('pointerdown', 3, 20);
    expect(options.onStart).toHaveBeenCalledTimes(2);
  });

  it('uses the original two fingers when an extra finger lands and leaves', () => {
    const { send, options } = setup();
    send('pointerdown', 1, 10);
    send('pointerdown', 2, 50);
    send('pointerdown', 3, 500);
    send('pointerup', 3, 500);
    expect(options.onPairEnd).not.toHaveBeenCalled();
    send('pointermove', 2, 80);
    expect(options.onPairMove.mock.lastCall[0].map(p => p.pointerId)).toEqual([1, 2]);
  });

  it('ignores palm contacts while a pen owns the gesture, including just after release', () => {
    const { send, options } = setup();
    send('pointerdown', 1, 20, 20, 'pen');
    send('pointerdown', 2, 100, 100);
    send('pointerdown', 3, 200, 100);
    send('pointermove', 1, 30, 20, 'pen');
    send('pointerup', 1, 30, 20, 'pen');
    send('pointerdown', 4, 100, 100);
    expect(options.onStart).toHaveBeenCalledOnce();
    expect(options.onPairStart).not.toHaveBeenCalled();
    expect(options.onMove).toHaveBeenCalledOnce();
  });

  it('allows two-finger navigation but no single-finger edits in Pencil-only mode', () => {
    const { send, options } = setup({ pencilOnly: true });
    send('pointerdown', 1, 10);
    send('pointermove', 1, 20);
    send('pointerdown', 2, 70);
    expect(options.onStart).not.toHaveBeenCalled();
    expect(options.onPairStart).toHaveBeenCalledOnce();
  });

  it('holds once, suppresses the release action, and cancels holds when dragging', () => {
    const { send, options } = setup({ onHold: vi.fn(() => true) });
    send('pointerdown', 1, 10);
    act(() => vi.advanceTimersByTime(650));
    send('pointerup', 1, 10);
    expect(options.onHold).toHaveBeenCalledOnce();
    expect(options.onEnd).not.toHaveBeenCalled();
    send('pointerdown', 2, 10);
    send('pointermove', 2, 30);
    act(() => vi.advanceTimersByTime(700));
    expect(options.onHold).toHaveBeenCalledOnce();
  });

  it('cleans up cancelled pointers and pending holds on blur', () => {
    const { send, options } = setup();
    send('pointerdown', 1, 10);
    send('pointercancel', 1, 10);
    send('pointerup', 1, 10);
    expect(options.onCancel).toHaveBeenCalledOnce();
    expect(options.onEnd).not.toHaveBeenCalled();
    send('pointerdown', 2, 10);
    fireEvent(window, new Event('blur'));
    act(() => vi.advanceTimersByTime(700));
    expect(options.onCancel).toHaveBeenCalledTimes(2);
    expect(options.onHold).not.toHaveBeenCalled();
  });
});
