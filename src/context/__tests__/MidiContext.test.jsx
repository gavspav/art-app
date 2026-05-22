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

const sendNote = (input, number, value, channel = 1) => {
  act(() => {
    input.onmidimessage?.({
      data: new Uint8Array([0x90 + (channel - 1), number, value]),
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

function MappingProbe() {
  const midi = useMidi();
  const opacity = midi?.mappings?.globalOpacity;
  const speed = midi?.mappings?.globalSpeedMultiplier;

  return (
    <div>
      <div data-testid="opacity-mapping">{opacity ? `${opacity.type}:${opacity.channel}:${opacity.number}` : 'none'}</div>
      <div data-testid="speed-mapping">{speed ? `${speed.type}:${speed.channel}:${speed.number}` : 'none'}</div>
      <button
        type="button"
        onClick={() => {
          midi?.setMapping?.('globalOpacity', { type: 'cc', channel: 1, number: 74 });
          midi?.setMapping?.('globalSpeedMultiplier', { type: 'cc', channel: 1, number: 75 });
        }}
      >
        Set mappings
      </button>
      <button type="button" onClick={() => midi?.clearMapping?.('globalOpacity')}>Clear opacity</button>
    </div>
  );
}

function HiddenImageEffectMappingProbe() {
  const midi = useMidi();
  const blur = midi?.mappings?.imageBlur;
  const brightness = midi?.mappings?.imageBrightness;
  const palette = midi?.mappings?.globalPaletteIndex;

  return (
    <div>
      <div data-testid="blur-mapping">{blur ? `${blur.type}:${blur.channel}:${blur.number}` : 'none'}</div>
      <div data-testid="brightness-mapping">{brightness ? `${brightness.type}:${brightness.channel}:${brightness.number}` : 'none'}</div>
      <div data-testid="palette-mapping">{palette ? `${palette.type}:${palette.channel}:${palette.number}` : 'none'}</div>
      <button
        type="button"
        onClick={() => {
          midi?.setMappingsFromExternal?.({
            imageBlur: { type: 'cc', channel: 1, number: 36 },
            imageBrightness: { type: 'cc', channel: 1, number: 37 },
            globalSpeedMultiplier: { type: 'cc', channel: 1, number: 36 },
          });
        }}
      >
        Import old mappings
      </button>
    </div>
  );
}

function ArcadeJoystickProbe() {
  const midi = useMidi();
  const [hits, setHits] = useState(0);
  const [lastValue, setLastValue] = useState(0);
  const registerParamHandler = midi?.registerParamHandler;
  const setMapping = midi?.setMapping;

  useEffect(() => {
    if (!setMapping) return;
    setMapping('globalSpeedMultiplier', { type: 'cc', channel: 1, number: 36 });
  }, [setMapping]);

  useEffect(() => {
    if (!registerParamHandler) return undefined;
    return registerParamHandler('globalSpeedMultiplier', ({ raw }) => {
      setHits(count => count + 1);
      setLastValue(raw?.value ?? 0);
    });
  }, [registerParamHandler]);

  return (
    <div>
      <div data-testid="arcade-enabled">{midi?.arcadeJoystickMidiEnabled ? 'yes' : 'no'}</div>
      <div data-testid="arcade-hits">{hits}</div>
      <div data-testid="arcade-last-value">{lastValue}</div>
      <button type="button" onClick={() => midi?.setSelectedInputId?.('input-1')}>Select input</button>
      <button type="button" onClick={() => midi?.setArcadeJoystickMidiEnabled?.(true)}>Enable arcade joystick</button>
    </div>
  );
}

function ArcadeKeyboardProbe() {
  const midi = useMidi();
  const [hits, setHits] = useState(0);
  const registerParamHandler = midi?.registerParamHandler;
  const setMapping = midi?.setMapping;
  const opacity = midi?.mappings?.globalOpacity;

  useEffect(() => {
    if (!setMapping) return;
    setMapping('globalOpacity', { type: 'note', channel: 1, number: 30 });
  }, [setMapping]);

  useEffect(() => {
    if (!registerParamHandler) return undefined;
    return registerParamHandler('globalOpacity', ({ value01 }) => {
      if (value01 > 0.5) setHits(count => count + 1);
    });
  }, [registerParamHandler]);

  return (
    <div>
      <div data-testid="keyboard-enabled">{midi?.arcadeKeyboardMidiEnabled ? 'yes' : 'no'}</div>
      <div data-testid="keyboard-supported">{midi?.supported ? 'yes' : 'no'}</div>
      <div data-testid="keyboard-hits">{hits}</div>
      <div data-testid="keyboard-mapping">{opacity ? `${opacity.type}:${opacity.channel}:${opacity.number}` : 'none'}</div>
      <button type="button" onClick={() => midi?.setArcadeKeyboardMidiEnabled?.(true)}>Enable keyboard cabinet</button>
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

  it('clears only the requested learned mapping', async () => {
    const { access } = createMidiAccess();
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      configurable: true,
      value: vi.fn(() => Promise.resolve(access)),
    });

    render(
      <MidiProvider>
        <MappingProbe />
      </MidiProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Set mappings' }));

    await waitFor(() => expect(screen.getByTestId('opacity-mapping')).toHaveTextContent('cc:1:74'));
    await waitFor(() => expect(screen.getByTestId('speed-mapping')).toHaveTextContent('cc:1:75'));

    fireEvent.click(screen.getByRole('button', { name: 'Clear opacity' }));

    await waitFor(() => expect(screen.getByTestId('opacity-mapping')).toHaveTextContent('none'));
    expect(screen.getByTestId('speed-mapping')).toHaveTextContent('cc:1:75');
  });

  it('does not expose hidden image effect parameters as default or imported MIDI mappings', async () => {
    const { access } = createMidiAccess();
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      configurable: true,
      value: vi.fn(() => Promise.resolve(access)),
    });

    render(
      <MidiProvider>
        <HiddenImageEffectMappingProbe />
      </MidiProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('blur-mapping')).toHaveTextContent('none'));
    expect(screen.getByTestId('brightness-mapping')).toHaveTextContent('none');
    expect(screen.getByTestId('palette-mapping')).toHaveTextContent('cc:1:42');

    fireEvent.click(screen.getByRole('button', { name: 'Import old mappings' }));

    await waitFor(() => expect(screen.getByTestId('blur-mapping')).toHaveTextContent('none'));
    expect(screen.getByTestId('brightness-mapping')).toHaveTextContent('none');
  });

  it('translates arcade joystick notes into held virtual CC movement when enabled', async () => {
    const { input, access } = createMidiAccess();
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      configurable: true,
      value: vi.fn(() => Promise.resolve(access)),
    });

    render(
      <MidiProvider>
        <ArcadeJoystickProbe />
      </MidiProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select input' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enable arcade joystick' }));

    await waitFor(() => expect(screen.getByTestId('arcade-enabled')).toHaveTextContent('yes'));
    await waitFor(() => expect(typeof input.onmidimessage).toBe('function'));

    sendNote(input, 36, 127);

    await waitFor(() => expect(Number(screen.getByTestId('arcade-hits').textContent)).toBeGreaterThan(0));

    sendNote(input, 36, 0);

    expect(Number(screen.getByTestId('arcade-last-value').textContent)).toBeGreaterThan(64);
  });

  it('emits arcade button notes from keyboard mode without a physical MIDI input', async () => {
    render(
      <MidiProvider>
        <ArcadeKeyboardProbe />
      </MidiProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Enable keyboard cabinet' }));

    await waitFor(() => expect(screen.getByTestId('keyboard-enabled')).toHaveTextContent('yes'));
    await waitFor(() => expect(screen.getByTestId('keyboard-supported')).toHaveTextContent('yes'));

    fireEvent.keyDown(window, { code: 'KeyE', key: 'e' });
    fireEvent.keyUp(window, { code: 'KeyE', key: 'e' });

    await waitFor(() => expect(screen.getByTestId('keyboard-hits')).toHaveTextContent('1'));
  });

  it('learns joystick keyboard controls as their virtual CC axis', async () => {
    render(
      <MidiProvider>
        <ArcadeKeyboardProbe />
      </MidiProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Enable keyboard cabinet' }));
    await waitFor(() => expect(screen.getByTestId('keyboard-enabled')).toHaveTextContent('yes'));

    fireEvent.click(screen.getByRole('button', { name: 'Learn opacity' }));
    fireEvent.keyDown(window, { code: 'KeyW', key: 'w' });

    await waitFor(() => expect(screen.getByTestId('keyboard-mapping')).toHaveTextContent('cc:1:37'));
  });
});
