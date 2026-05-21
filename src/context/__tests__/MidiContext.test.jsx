import React, { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MidiProvider, useMidi } from '../MidiContext.jsx';

const createMidiAccess = () => {
  const input = {
    id: 'input-1',
    name: 'Test MIDI',
    manufacturer: 'Test',
    onmidimessage: null,
  };
  return {
    input,
    access: {
      inputs: new Map([[input.id, input]]),
      onstatechange: null,
    },
  };
};

const sendCc = (input, number, value, channel = 1) => {
  act(() => {
    input.onmidimessage?.({
      data: new Uint8Array([0xB0 + (channel - 1), number, value]),
    });
  });
};

function MidiProbe() {
  const midi = useMidi();
  const [hits, setHits] = useState(0);
  const registerParamHandler = midi?.registerParamHandler;

  useEffect(() => {
    if (!registerParamHandler) return undefined;
    return registerParamHandler('globalOpacity', () => {
      setHits(count => count + 1);
    });
  }, [registerParamHandler]);

  const mapping = midi?.mappings?.globalOpacity;

  return (
    <div>
      <div data-testid="supported">{midi?.supported ? 'yes' : 'no'}</div>
      <div data-testid="selected">{midi?.selectedInputId || 'none'}</div>
      <div data-testid="mapping">{mapping ? `${mapping.type}:${mapping.channel}:${mapping.number}` : 'none'}</div>
      <div data-testid="hits">{hits}</div>
      <button type="button" onClick={() => midi?.beginLearn?.('globalOpacity')}>Learn opacity</button>
    </div>
  );
}

describe('MidiContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('learns a CC mapping, auto-selects the first input, and dispatches learned fader values', async () => {
    const { input, access } = createMidiAccess();
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      configurable: true,
      value: vi.fn(() => Promise.resolve(access)),
    });

    render(
      <MidiProvider>
        <MidiProbe />
      </MidiProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('supported')).toHaveTextContent('yes'));

    fireEvent.click(screen.getByRole('button', { name: 'Learn opacity' }));

    await waitFor(() => expect(screen.getByTestId('selected')).toHaveTextContent('input-1'));
    await waitFor(() => expect(typeof input.onmidimessage).toBe('function'));

    sendCc(input, 74, 96);

    await waitFor(() => expect(screen.getByTestId('mapping')).toHaveTextContent('cc:1:74'));

    sendCc(input, 74, 64);

    await waitFor(() => expect(screen.getByTestId('hits')).toHaveTextContent('1'));
  });
});
