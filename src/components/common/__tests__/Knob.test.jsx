import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Knob from '../Knob.jsx';

// jsdom lacks PointerEvent — dispatch a plain Event with coordinates attached.
const firePointer = (target, type, init = {}) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  event.clientX = init.clientX ?? 0;
  event.clientY = init.clientY ?? 0;
  if (init.shiftKey) event.shiftKey = true;
  fireEvent(target, event);
};

describe('Knob', () => {
  it('renders a slider role with the expected aria bounds', () => {
    render(<Knob value={0.5} min={0} max={1} step={0.01} onChange={vi.fn()} label="Size" />);
    const knob = screen.getByRole('slider', { name: 'Size' });
    expect(knob.getAttribute('aria-valuemin')).toBe('0');
    expect(knob.getAttribute('aria-valuemax')).toBe('1');
    expect(knob.getAttribute('aria-valuenow')).toBe('0.5');
    expect(knob.getAttribute('aria-orientation')).toBe('vertical');
  });

  it('steps on arrow keys and jumps to min on Home', () => {
    const onChange = vi.fn();
    render(<Knob value={0.5} min={0} max={1} step={0.1} onChange={onChange} label="Size" />);
    const knob = screen.getByRole('slider');
    fireEvent.keyDown(knob, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith(0.6);
    fireEvent.keyDown(knob, { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith(0.4);
    fireEvent.keyDown(knob, { key: 'PageUp' });
    expect(onChange).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(knob, { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it('drags upward to increase the value', () => {
    const onChange = vi.fn();
    render(<Knob value={0.5} min={0} max={1} step={0.01} onChange={onChange} label="Size" />);
    const knob = screen.getByRole('slider');
    firePointer(knob, 'pointerdown', { clientX: 100, clientY: 100 });
    firePointer(window, 'pointermove', { clientX: 100, clientY: 50 });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)[0];
    expect(next).toBeGreaterThan(0.5);
    firePointer(window, 'pointerup');
  });

  it('shows the amber band when the range is narrower than the limits', () => {
    const { container, rerender } = render(
      <Knob value={0.5} min={0} max={1} rangeMin={0.2} rangeMax={0.8} showRangeBand label="Size" />
    );
    expect(container.querySelector('path.knob-range')).toBeTruthy();
    rerender(<Knob value={0.5} min={0} max={1} rangeMin={0} rangeMax={1} showRangeBand label="Size" />);
    expect(container.querySelector('path.knob-range')).toBeNull();
  });

  describe('draggable range handles', () => {
    // Same formula as Knob's polar(): 0deg up, clockwise positive.
    const polar = (r, deg) => {
      const rad = (deg * Math.PI) / 180;
      return [20 + r * Math.sin(rad), 20 - r * Math.cos(rad)];
    };
    // 1px = 1 viewBox unit.
    const mockRect = (el) => {
      el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 40, height: 40, right: 40, bottom: 40, x: 0, y: 0 });
    };
    const renderEditable = (props = {}) => {
      const handlers = { onChange: vi.fn(), onRangeMinChange: vi.fn(), onRangeMaxChange: vi.fn() };
      const utils = render(
        <Knob value={0.5} min={0} max={1} step={0.01} rangeMin={0.2} rangeMax={0.8} showRangeBand label="Size"
          {...handlers} {...props} />
      );
      const knob = screen.getByRole('slider');
      mockRect(knob);
      return { ...utils, ...handlers, knob };
    };

    it('renders both handles when editable, even at full range, and none without callbacks', () => {
      const { container, rerender } = render(
        <Knob value={0.5} min={0} max={1} rangeMin={0} rangeMax={1} showRangeBand
          onRangeMinChange={vi.fn()} onRangeMaxChange={vi.fn()} label="Size" />
      );
      const minHandle = container.querySelector('circle.knob-handle--min');
      const maxHandle = container.querySelector('circle.knob-handle--max');
      expect(minHandle).toBeTruthy();
      expect(maxHandle).toBeTruthy();
      expect(minHandle.classList.contains('at-edge')).toBe(true);
      expect(maxHandle.classList.contains('at-edge')).toBe(true);
      expect(container.querySelector('path.knob-range')).toBeNull();

      rerender(<Knob value={0.5} min={0} max={1} rangeMin={0.2} rangeMax={0.8} showRangeBand label="Size" />);
      expect(container.querySelector('circle.knob-handle')).toBeNull();
      expect(container.querySelector('path.knob-range')).toBeTruthy();
    });

    it('drags the max handle around the ring without changing the value', () => {
      const { knob, onChange, onRangeMaxChange, onRangeMinChange, container } = renderEditable();
      const [hx, hy] = polar(17.5, -135 + 0.8 * 270);
      firePointer(knob, 'pointerdown', { clientX: hx, clientY: hy });
      firePointer(window, 'pointermove', { clientX: 20, clientY: 2 });
      expect(onRangeMaxChange).toHaveBeenLastCalledWith(0.5);
      expect(container.querySelector('.knob-pop')?.textContent).toMatch(/^Max /);
      firePointer(window, 'pointerup');
      expect(onChange).not.toHaveBeenCalled();
      expect(onRangeMinChange).not.toHaveBeenCalled();
      expect(container.querySelector('.knob-pop')).toBeNull();
    });

    it('clamps the min handle to the current max', () => {
      const { knob, onChange, onRangeMinChange, onRangeMaxChange } = renderEditable();
      const [hx, hy] = polar(17.5, -135 + 0.2 * 270);
      firePointer(knob, 'pointerdown', { clientX: hx, clientY: hy });
      const [mx, my] = polar(15, 100);
      firePointer(window, 'pointermove', { clientX: mx, clientY: my });
      expect(onRangeMinChange).toHaveBeenLastCalledWith(0.8);
      firePointer(window, 'pointerup');
      expect(onChange).not.toHaveBeenCalled();
      expect(onRangeMaxChange).not.toHaveBeenCalled();
    });

    it('still drags the value when pressing the centre', () => {
      const { knob, onChange, onRangeMinChange, onRangeMaxChange } = renderEditable();
      firePointer(knob, 'pointerdown', { clientX: 20, clientY: 20 });
      firePointer(window, 'pointermove', { clientX: 20, clientY: -30 });
      expect(onChange).toHaveBeenCalled();
      expect(onChange.mock.calls.at(-1)[0]).toBeGreaterThan(0.5);
      firePointer(window, 'pointerup');
      expect(onRangeMinChange).not.toHaveBeenCalled();
      expect(onRangeMaxChange).not.toHaveBeenCalled();
    });
  });

  describe('precision and reset', () => {
    it('moving sideways while dragging makes the value change finer', () => {
      const near = vi.fn();
      const far = vi.fn();
      render(<>
        <Knob value={0.5} min={0} max={1} step={0.001} onChange={near} label="Near" />
        <Knob value={0.5} min={0} max={1} step={0.001} onChange={far} label="Far" />
      </>);
      const [nearKnob, farKnob] = screen.getAllByRole('slider');

      firePointer(nearKnob, 'pointerdown', { clientX: 100, clientY: 100 });
      firePointer(window, 'pointermove', { clientX: 100, clientY: 50 });
      firePointer(window, 'pointerup', { clientX: 100, clientY: 50 });

      firePointer(farKnob, 'pointerdown', { clientX: 100, clientY: 100 });
      firePointer(window, 'pointermove', { clientX: 300, clientY: 50 });
      firePointer(window, 'pointerup', { clientX: 300, clientY: 50 });

      expect(near).toHaveBeenCalled();
      expect(far).toHaveBeenCalled();
      expect(far.mock.calls.at(-1)[0]).toBeLessThan(near.mock.calls.at(-1)[0]);
      expect(far.mock.calls.at(-1)[0]).toBeGreaterThan(0.5);
    });

    it('double-tapping the dial resets to the default value', () => {
      const onChange = vi.fn();
      render(<Knob value={0.9} min={0} max={1} step={0.01} defaultValue={0.5} onChange={onChange} label="Size" />);
      const knob = screen.getByRole('slider');
      firePointer(knob, 'pointerdown', { clientX: 50, clientY: 50 });
      firePointer(window, 'pointerup', { clientX: 50, clientY: 50 });
      firePointer(knob, 'pointerdown', { clientX: 51, clientY: 50 });
      firePointer(window, 'pointerup', { clientX: 51, clientY: 50 });
      expect(onChange).toHaveBeenCalledWith(0.5);
    });

    it('a single tap does not reset the value', () => {
      const onChange = vi.fn();
      render(<Knob value={0.9} min={0} max={1} step={0.01} defaultValue={0.5} onChange={onChange} label="Size" />);
      const knob = screen.getByRole('slider');
      firePointer(knob, 'pointerdown', { clientX: 50, clientY: 50 });
      firePointer(window, 'pointerup', { clientX: 50, clientY: 50 });
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
