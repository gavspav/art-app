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
  const [pairHits, setPairHits] = useState(0);
  const [syncWhileHeld, setSyncWhileHeld] = useState(false);
  const registerParamHandler = midi?.registerParamHandler;
  const setMapping = midi?.setMapping;

  useEffect(() => {
    if (!setMapping) return;
    setMapping('globalSpeedMultiplier', { type: 'cc', channel: 1, number: 36 });
  }, [setMapping]);

  useEffect(() => {
    if (!registerParamHandler) return undefined;
    const unsubs = [
      registerParamHandler('globalSpeedMultiplier', ({ raw }) => {
        setHits(count => count + 1);
        setLastValue(raw?.value ?? 0);
        if (syncWhileHeld) midi?.setArcadeVirtualCcValue?.(36, 0.5);
      }),
      registerParamHandler('arcade:backgroundColorCycle', () => {
        setPairHits(count => count + 1);
      }),
    ];
    return () => unsubs.forEach(unsub => unsub?.());
  }, [midi, registerParamHandler, syncWhileHeld]);

  return (
    <div>
      <div data-testid="arcade-enabled">{midi?.arcadeJoystickMidiEnabled ? 'yes' : 'no'}</div>
      <div data-testid="arcade-hits">{hits}</div>
      <div data-testid="arcade-last-value">{lastValue}</div>
      <div data-testid="arcade-pair-hits">{pairHits}</div>
      <button type="button" onClick={() => midi?.setSelectedInputId?.('input-1')}>Select input</button>
      <button type="button" onClick={() => midi?.setArcadeJoystickMidiEnabled?.(true)}>Enable arcade joystick</button>
      <button type="button" onClick={() => setSyncWhileHeld(true)}>Sync while held</button>
      <button
        type="button"
        onClick={() => {
          midi?.setArcadeButtonPairsMidiEnabled?.(true);
          midi?.setMapping?.('randomize:backgroundColor', { type: 'note', channel: 1, number: 36 });
        }}
      >
        Enable conflicting button pair
      </button>
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

function ArcadeButtonPairsProbe() {
  const midi = useMidi();
  const [backgroundDirections, setBackgroundDirections] = useState([]);
  const [paletteDirections, setPaletteDirections] = useState([]);
  const [opacityValues, setOpacityValues] = useState([]);
  const [numSidesValues, setNumSidesValues] = useState([]);
  const [curvinessValues, setCurvinessValues] = useState([]);
  const [blendHits, setBlendHits] = useState(0);
  const [wobbleHits, setWobbleHits] = useState(0);
  const [noiseHits, setNoiseHits] = useState(0);
  const [randomizeHits, setRandomizeHits] = useState(0);
  const registerParamHandler = midi?.registerParamHandler;
  const setMapping = midi?.setMapping;

  useEffect(() => {
    if (!setMapping) return;
    setMapping('randomize:backgroundColor', { type: 'note', channel: 1, number: 30 });
  }, [setMapping]);

  useEffect(() => {
    if (!registerParamHandler) return undefined;
    const unsubs = [
      registerParamHandler('arcade:backgroundColorCycle', ({ raw }) => {
        setBackgroundDirections(prev => [...prev, raw?.arcadeDirection || 0]);
      }),
      registerParamHandler('arcade:paletteCycle', ({ raw }) => {
        setPaletteDirections(prev => [...prev, raw?.arcadeDirection || 0]);
      }),
      registerParamHandler('globalOpacity', ({ value01 }) => {
        setOpacityValues(prev => [...prev, value01]);
      }),
      registerParamHandler('numSides', ({ value01 }) => {
        setNumSidesValues(prev => [...prev, value01]);
      }),
      registerParamHandler('curviness', ({ value01 }) => {
        setCurvinessValues(prev => [...prev, value01]);
      }),
      registerParamHandler('arcade:blendToggle', () => {
        setBlendHits(count => count + 1);
      }),
      registerParamHandler('wobble', () => {
        setWobbleHits(count => count + 1);
      }),
      registerParamHandler('noiseAmount', () => {
        setNoiseHits(count => count + 1);
      }),
      registerParamHandler('randomize:backgroundColor', ({ value01 }) => {
        if (value01 > 0.5) setRandomizeHits(count => count + 1);
      }),
    ];
    return () => unsubs.forEach(unsub => unsub?.());
  }, [registerParamHandler]);

  return (
    <div>
      <div data-testid="pairs-enabled">{midi?.arcadeButtonPairsMidiEnabled ? 'yes' : 'no'}</div>
      <div data-testid="background-directions">{backgroundDirections.join(',')}</div>
      <div data-testid="palette-directions">{paletteDirections.join(',')}</div>
      <div data-testid="opacity-values">{opacityValues.map(value => value.toFixed(3)).join(',')}</div>
      <div data-testid="num-sides-values">{numSidesValues.map(value => value.toFixed(3)).join(',')}</div>
      <div data-testid="curviness-values">{curvinessValues.join(',')}</div>
      <div data-testid="blend-hits">{blendHits}</div>
      <div data-testid="wobble-hits">{wobbleHits}</div>
      <div data-testid="noise-hits">{noiseHits}</div>
      <div data-testid="randomize-hits">{randomizeHits}</div>
      <button type="button" onClick={() => midi?.setSelectedInputId?.('input-1')}>Select input</button>
      <button type="button" onClick={() => midi?.setArcadeKeyboardMidiEnabled?.(true)}>Enable keyboard cabinet</button>
      <button type="button" onClick={() => midi?.setArcadeButtonPairsMidiEnabled?.(true)}>Enable button pairs</button>
      <button
        type="button"
        onClick={() => midi?.setMapping?.('randomize:backgroundColor', { type: 'cc', channel: 2, number: 99 })}
      >
        Map background CC
      </button>
      <button
        type="button"
        onClick={() => midi?.setMapping?.('randomize:globalOpacity', { type: 'cc', channel: 2, number: 100 })}
      >
        Map physical C CC
      </button>
      <button
        type="button"
        onClick={() => midi?.setMapping?.('randomize:numSides', { type: 'cc', channel: 2, number: 101 })}
      >
        Map physical V CC
      </button>
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

  it('prioritizes joystick notes over conflicting button-pair mappings', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Enable conflicting button pair' }));

    await waitFor(() => expect(typeof input.onmidimessage).toBe('function'));

    sendNote(input, 36, 127);
    await waitFor(() => expect(Number(screen.getByTestId('arcade-hits').textContent)).toBeGreaterThan(0));
    sendNote(input, 36, 0);

    expect(screen.getByTestId('arcade-pair-hits')).toHaveTextContent('0');
  });

  it('does not reset a virtual joystick counter while its direction is held', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Sync while held' }));

    await waitFor(() => expect(typeof input.onmidimessage).toBe('function'));

    sendNote(input, 36, 127);
    await waitFor(
      () => expect(Number(screen.getByTestId('arcade-last-value').textContent)).toBeGreaterThan(68),
      { timeout: 1500 },
    );
    sendNote(input, 36, 0);
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

  it('routes arcade keyboard button pairs to paired actions when pair mode is enabled', async () => {
    render(
      <MidiProvider>
        <ArcadeButtonPairsProbe />
      </MidiProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Enable keyboard cabinet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enable button pairs' }));

    await waitFor(() => expect(screen.getByTestId('pairs-enabled')).toHaveTextContent('yes'));

    fireEvent.keyDown(window, { code: 'KeyE', key: 'e' });
    fireEvent.keyUp(window, { code: 'KeyE', key: 'e' });
    fireEvent.keyDown(window, { code: 'KeyC', key: 'c' });
    fireEvent.keyUp(window, { code: 'KeyC', key: 'c' });

    await waitFor(() => expect(screen.getByTestId('background-directions')).toHaveTextContent('1,-1'));
    expect(screen.getByTestId('randomize-hits')).toHaveTextContent('0');

    fireEvent.keyDown(window, { code: 'KeyO', key: 'o' });
    fireEvent.keyUp(window, { code: 'KeyO', key: 'o' });
    fireEvent.keyDown(window, { code: 'Comma', key: ',' });
    fireEvent.keyUp(window, { code: 'Comma', key: ',' });

    await waitFor(() => expect(screen.getByTestId('opacity-values')).toHaveTextContent('0.567,0.504'));

    fireEvent.keyDown(window, { code: 'KeyP', key: 'p' });
    fireEvent.keyUp(window, { code: 'KeyP', key: 'p' });
    fireEvent.keyDown(window, { code: 'KeyP', key: 'p' });
    fireEvent.keyUp(window, { code: 'KeyP', key: 'p' });

    await waitFor(() => expect(screen.getByTestId('curviness-values')).toHaveTextContent('1,0'));

    fireEvent.keyDown(window, { code: 'KeyU', key: 'u' });
    await waitFor(() => expect(Number(screen.getByTestId('wobble-hits').textContent)).toBeGreaterThan(0));
    await waitFor(() => expect(Number(screen.getByTestId('noise-hits').textContent)).toBeGreaterThan(0));
    fireEvent.keyUp(window, { code: 'KeyU', key: 'u' });
  });

  it('routes mapped physical MIDI controls to paired actions when pair mode is enabled', async () => {
    const { input, access } = createMidiAccess();
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      configurable: true,
      value: vi.fn(() => Promise.resolve(access)),
    });

    render(
      <MidiProvider>
        <ArcadeButtonPairsProbe />
      </MidiProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select input' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enable button pairs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Map background CC' }));
    fireEvent.click(screen.getByRole('button', { name: 'Map physical C CC' }));
    fireEvent.click(screen.getByRole('button', { name: 'Map physical V CC' }));

    await waitFor(() => expect(screen.getByTestId('pairs-enabled')).toHaveTextContent('yes'));
    await waitFor(() => expect(typeof input.onmidimessage).toBe('function'));

    sendCc(input, 99, 127, 2);
    sendCc(input, 99, 0, 2);
    sendCc(input, 100, 127, 2);
    sendCc(input, 100, 0, 2);
    sendCc(input, 101, 127, 2);
    sendCc(input, 101, 0, 2);

    await waitFor(() => expect(screen.getByTestId('background-directions')).toHaveTextContent('1'));
    await waitFor(() => expect(screen.getByTestId('palette-directions')).toHaveTextContent('-1'));
    await waitFor(() => expect(screen.getByTestId('num-sides-values')).toHaveTextContent('0.567'));
    expect(screen.getByTestId('randomize-hits')).toHaveTextContent('0');
  });

  it('routes physical arcade note layout separately from the keyboard layout', async () => {
    const { input, access } = createMidiAccess();
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      configurable: true,
      value: vi.fn(() => Promise.resolve(access)),
    });

    render(
      <MidiProvider>
        <ArcadeButtonPairsProbe />
      </MidiProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select input' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enable button pairs' }));

    await waitFor(() => expect(screen.getByTestId('pairs-enabled')).toHaveTextContent('yes'));
    await waitFor(() => expect(typeof input.onmidimessage).toBe('function'));

    sendNote(input, 30, 127);
    sendNote(input, 30, 0);
    sendNote(input, 4, 127);
    sendNote(input, 4, 0);
    sendNote(input, 32, 127);
    sendNote(input, 32, 0);
    sendNote(input, 5, 127);
    sendNote(input, 5, 0);
    sendNote(input, 6, 127);
    sendNote(input, 6, 0);
    sendNote(input, 51, 127);
    sendNote(input, 51, 0);
    sendNote(input, 14, 127);
    sendNote(input, 14, 0);
    sendNote(input, 40, 127);
    sendNote(input, 40, 0);
    sendNote(input, 13, 127);
    sendNote(input, 13, 0);
    sendNote(input, 12, 127);
    sendNote(input, 12, 0);

    await waitFor(() => expect(screen.getByTestId('background-directions')).toHaveTextContent('1,-1'));
    await waitFor(() => expect(screen.getByTestId('palette-directions')).toHaveTextContent('1,-1'));
    await waitFor(() => expect(screen.getByTestId('blend-hits')).toHaveTextContent('1'));
    await waitFor(() => expect(screen.getByTestId('num-sides-values')).toHaveTextContent('0.567,0.504'));
    await waitFor(() => expect(screen.getByTestId('opacity-values')).toHaveTextContent('0.567,0.504'));
    await waitFor(() => expect(screen.getByTestId('curviness-values')).toHaveTextContent('1'));
  });
});
