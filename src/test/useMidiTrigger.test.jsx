import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { buildMidiRandomizeId, useMidiTrigger } from '../hooks/useMidiTrigger.js';

function TriggerProbe({ registerParamHandler, onTrigger }) {
  useMidiTrigger(registerParamHandler, buildMidiRandomizeId('globalOpacity'), onTrigger);
  return null;
}

describe('useMidiTrigger', () => {
  it('fires on rising edges only', () => {
    let handler = null;
    const onTrigger = vi.fn();
    const registerParamHandler = vi.fn((_paramId, fn) => {
      handler = fn;
      return vi.fn();
    });

    render(<TriggerProbe registerParamHandler={registerParamHandler} onTrigger={onTrigger} />);

    expect(registerParamHandler).toHaveBeenCalledWith('randomize:globalOpacity', expect.any(Function));

    act(() => handler({ value01: 0.25 }));
    act(() => handler({ value01: 0.75 }));
    act(() => handler({ value01: 1 }));
    act(() => handler({ value01: 0 }));
    act(() => handler({ value01: 0.5 }));

    expect(onTrigger).toHaveBeenCalledTimes(2);
  });
});
