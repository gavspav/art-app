import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { PARAMETERS } from '../config/parameters.js';

const MidiContext = createContext(null);

export const useMidi = () => useContext(MidiContext);

const LS_MIDI_MAPPINGS = 'artapp-midi-mappings';
const LS_MIDI_SELECTED = 'artapp-midi-selected-input';
const LS_ARCADE_JOYSTICK_MIDI_ENABLED = 'artapp-arcade-joystick-midi-enabled';

const DEFAULT_MIDI_CHANNEL = 1;
const HIDDEN_IMAGE_EFFECT_MIDI_PARAMS = new Set([
  'imageBlur',
  'imageBrightness',
  'imageContrast',
  'imageHue',
  'imageSaturation',
  'imageDistortion',
]);
const ARCADE_JOYSTICK_CC_RATE_PER_SECOND = 30;
const ARCADE_JOYSTICK_TICK_MS = 33;
const ARCADE_JOYSTICK_DEFAULT_VALUE = 64;
const ARCADE_JOYSTICK_NOTE_MAP = {
  37: { cc: 36, direction: -1 },
  36: { cc: 36, direction: 1 },
  38: { cc: 37, direction: 1 },
  39: { cc: 37, direction: -1 },
  46: { cc: 34, direction: -1 },
  44: { cc: 34, direction: 1 },
  45: { cc: 35, direction: 1 },
  56: { cc: 35, direction: -1 },
};

const buildDefaultMidiMappings = () => {
  const mapping = {};
  let cc = 1;

  const assign = (paramId) => {
    if (!paramId || mapping[paramId]) return;
    mapping[paramId] = { type: 'cc', channel: DEFAULT_MIDI_CHANNEL, number: cc };
    cc += 1;
  };

  const specialOrder = [
    'backgroundColor',
    'backgroundColorR',
    'backgroundColorG',
    'backgroundColorB',
    'globalSpeedMultiplier',
    'globalOpacity',
    'layersCount',
    'variationPosition',
    'variationShape',
    'variationAnim',
    'variationColor',
    'variationScale',
  ];

  specialOrder.forEach(assign);

  PARAMETERS
    .filter((param) => param?.type === 'slider')
    .forEach((param) => {
      if (!param?.id) return;
      if (HIDDEN_IMAGE_EFFECT_MIDI_PARAMS.has(param.id)) {
        cc += 1;
        return;
      }
      assign(param.id);
    });

  const extraParams = ['globalPaletteIndex', 'globalBlendMode', 'randomizeAll', 'variation'];
  extraParams.forEach(assign);

  return mapping;
};

const DEFAULT_MIDI_MAPPINGS = buildDefaultMidiMappings();

const stripHiddenImageEffectMappings = (mappings) => {
  if (!mappings || typeof mappings !== 'object') return {};
  const next = { ...mappings };
  HIDDEN_IMAGE_EFFECT_MIDI_PARAMS.forEach((paramId) => {
    delete next[paramId];
  });
  return next;
};

// Helper to build a stable descriptor string for a mapping
const mappingLabel = (m) => {
  if (!m) return 'Not mapped';
  const ch = m.channel ? `Ch ${m.channel}` : 'Ch ?';
  if (m.type === 'cc') return `CC ${m.number} (${ch})`;
  if (m.type === 'note') return `Note ${m.number} (${ch})`;
  return 'Unknown mapping';
};

export const MidiProvider = ({ children }) => {
  const [supported, setSupported] = useState(false);
  const [access, setAccess] = useState(null);
  const [inputs, setInputs] = useState([]); // { id, name, manufacturer }
  const [selectedInputId, setSelectedInputId] = useState(() => {
    try { return localStorage.getItem(LS_MIDI_SELECTED) || ''; } catch { return ''; }
  });
  const [arcadeJoystickMidiEnabled, setArcadeJoystickMidiEnabledState] = useState(() => {
    try { return localStorage.getItem(LS_ARCADE_JOYSTICK_MIDI_ENABLED) === 'true'; } catch { return false; }
  });

  const [storedMappings, setStoredMappings] = useState(() => {
    try {
      const saved = localStorage.getItem(LS_MIDI_MAPPINGS);
      return saved ? stripHiddenImageEffectMappings(JSON.parse(saved)) : {};
    } catch {
      return {};
    }
  }); // { [paramId]: { type: 'cc'|'note', channel, number, invert? } }

  const [learnParamId, setLearnParamId] = useState(null);

  // Param handlers: paramId -> Set<fn({ value01, raw })>
  const handlersRef = useRef(new Map());
  const arcadeJoystickValuesRef = useRef({
    34: ARCADE_JOYSTICK_DEFAULT_VALUE,
    35: ARCADE_JOYSTICK_DEFAULT_VALUE,
    36: ARCADE_JOYSTICK_DEFAULT_VALUE,
    37: ARCADE_JOYSTICK_DEFAULT_VALUE,
  });
  const arcadeJoystickDirectionsRef = useRef(new Map());
  const arcadeJoystickTimerRef = useRef(null);
  const arcadeJoystickLastTickRef = useRef(0);

  const registerParamHandler = useCallback((paramId, handler) => {
    if (!paramId || typeof handler !== 'function') return () => {};
    const map = handlersRef.current;
    if (!map.has(paramId)) map.set(paramId, new Set());
    const set = map.get(paramId);
    set.add(handler);
    return () => {
      const s = handlersRef.current.get(paramId);
      if (s) {
        s.delete(handler);
        if (s.size === 0) handlersRef.current.delete(paramId);
      }
    };
  }, []);

  const persist = useCallback((updater) => {
    setStoredMappings((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try {
        localStorage.setItem(LS_MIDI_MAPPINGS, JSON.stringify(next));
      } catch { /* noop */ }
      return next;
    });
  }, []);

  const effectiveMappings = useMemo(() => {
    const merged = { ...DEFAULT_MIDI_MAPPINGS };
    Object.entries(stripHiddenImageEffectMappings(storedMappings) || {}).forEach(([paramId, mapping]) => {
      if (mapping === null) {
        delete merged[paramId];
      } else if (mapping && typeof mapping === 'object') {
        merged[paramId] = mapping;
      } else {
        delete merged[paramId];
      }
    });
    return merged;
  }, [storedMappings]);

  const setMapping = useCallback((paramId, mapping) => {
    if (!paramId) return;
    if (HIDDEN_IMAGE_EFFECT_MIDI_PARAMS.has(paramId)) return;
    persist((prev) => {
      const next = { ...prev };
      const defaultMapping = DEFAULT_MIDI_MAPPINGS[paramId];
      if (mapping === null) {
        next[paramId] = null;
        return next;
      }
      if (!mapping) {
        delete next[paramId];
        return next;
      }

      const normalizedChannel = Number.isFinite(mapping.channel) ? mapping.channel : DEFAULT_MIDI_CHANNEL;
      const isDefault = !!defaultMapping
        && mapping.type === defaultMapping.type
        && normalizedChannel === defaultMapping.channel
        && mapping.number === defaultMapping.number;

      if (isDefault) {
        delete next[paramId];
      } else {
        next[paramId] = { ...mapping, channel: normalizedChannel };
      }
      return next;
    });
  }, [persist]);

  const clearMapping = useCallback((paramId) => {
    if (!paramId) return;
    persist((prev) => {
      const next = { ...prev };
      if (DEFAULT_MIDI_MAPPINGS[paramId]) {
        next[paramId] = null;
      } else {
        delete next[paramId];
      }
      return next;
    });
  }, [persist]);

  const setMappingsFromExternal = useCallback((obj) => {
    if (obj && typeof obj === 'object') {
      persist(stripHiddenImageEffectMappings(obj));
    }
  }, [persist]);

  // MIDI access
  useEffect(() => {
    let canceled = false;
    if (!('requestMIDIAccess' in navigator)) {
      setSupported(false);
      return;
    }
    setSupported(true);
    navigator.requestMIDIAccess({ sysex: false }).then(midi => {
      if (canceled) return;
      setAccess(midi);
      const refresh = () => {
        const list = [];
        midi.inputs.forEach((input) => {
          list.push({ id: input.id, name: input.name || 'MIDI Input', manufacturer: input.manufacturer || '' });
        });
        setInputs(list);
      };
      refresh();
      midi.onstatechange = refresh;
    }).catch(() => {
      if (!canceled) setSupported(false);
    });
    return () => { canceled = true; };
  }, []);

  // Selected input persistence
  useEffect(() => {
    try { localStorage.setItem(LS_MIDI_SELECTED, selectedInputId || ''); } catch { /* noop */ }
  }, [selectedInputId]);
  const setArcadeJoystickMidiEnabled = useCallback((enabled) => {
    const next = !!enabled;
    setArcadeJoystickMidiEnabledState(next);
    try { localStorage.setItem(LS_ARCADE_JOYSTICK_MIDI_ENABLED, next ? 'true' : 'false'); } catch { /* noop */ }
  }, []);

  useEffect(() => {
    if (!selectedInputId && learnParamId) {
      setLearnParamId(null);
    }
  }, [selectedInputId, learnParamId]);

  // MIDI message handler
  const SECRET_CC_PARAMS = useMemo(() => ({
    50: '__secretLayer1ColorR',
    51: '__secretLayer1ColorG',
    52: '__secretLayer1ColorB',
  }), []);

  const triggerHandlers = useCallback((paramId, value01, msg) => {
    if (!paramId) return;
    const handlers = handlersRef.current.get(paramId);
    if (!handlers || handlers.size === 0) return;
    handlers.forEach(fn => {
      try { fn({ value01, raw: msg }); } catch { /* noop */ }
    });
  }, []);

  const dispatchMidiMessage = useCallback((msg) => {
    if (!msg) return;
    const value01 = Math.max(0, Math.min(1, (msg.value ?? 0) / 127));

    // Build reverse index lazily per message (paramId -> mapping) filtered by match
    for (const [paramId, m] of Object.entries(effectiveMappings)) {
      if (!m) continue;
      const same = (m.type === msg.type) &&
                   (!m.channel || m.channel === msg.channel) &&
                   (m.number === msg.number);
      if (!same) continue;
      triggerHandlers(paramId, value01, msg);
    }

    if (msg.type === 'cc') {
      const secretParam = SECRET_CC_PARAMS[msg.number];
      if (secretParam) {
        triggerHandlers(secretParam, value01, msg);
      }
    }
  }, [SECRET_CC_PARAMS, effectiveMappings, triggerHandlers]);

  const emitArcadeJoystickCc = useCallback((cc, value) => {
    dispatchMidiMessage({
      type: 'cc',
      channel: DEFAULT_MIDI_CHANNEL,
      number: cc,
      value,
      source: 'arcadeJoystick',
    });
  }, [dispatchMidiMessage]);

  const stopArcadeJoystickTimer = useCallback(() => {
    if (arcadeJoystickTimerRef.current) {
      clearInterval(arcadeJoystickTimerRef.current);
      arcadeJoystickTimerRef.current = null;
    }
    arcadeJoystickLastTickRef.current = 0;
  }, []);

  const tickArcadeJoystick = useCallback(() => {
    const directions = arcadeJoystickDirectionsRef.current;
    if (!directions || directions.size === 0) {
      stopArcadeJoystickTimer();
      return;
    }

    const now = performance.now();
    const previous = arcadeJoystickLastTickRef.current || now;
    arcadeJoystickLastTickRef.current = now;
    const deltaSeconds = Math.max(0, Math.min(0.25, (now - previous) / 1000));
    const step = ARCADE_JOYSTICK_CC_RATE_PER_SECOND * deltaSeconds;

    directions.forEach((direction, cc) => {
      const current = Number(arcadeJoystickValuesRef.current[cc] ?? ARCADE_JOYSTICK_DEFAULT_VALUE);
      const next = Math.max(0, Math.min(127, current + (direction * step)));
      if (Math.round(next) === Math.round(current)) {
        arcadeJoystickValuesRef.current[cc] = next;
        return;
      }
      arcadeJoystickValuesRef.current[cc] = next;
      emitArcadeJoystickCc(cc, Math.round(next));
    });
  }, [emitArcadeJoystickCc, stopArcadeJoystickTimer]);

  const ensureArcadeJoystickTimer = useCallback(() => {
    if (arcadeJoystickTimerRef.current) return;
    arcadeJoystickLastTickRef.current = performance.now();
    arcadeJoystickTimerRef.current = setInterval(tickArcadeJoystick, ARCADE_JOYSTICK_TICK_MS);
  }, [tickArcadeJoystick]);

  const handleArcadeJoystickNote = useCallback((msg) => {
    if (!arcadeJoystickMidiEnabled || msg?.type !== 'note' || msg.channel !== DEFAULT_MIDI_CHANNEL) return false;
    const control = ARCADE_JOYSTICK_NOTE_MAP[msg.number];
    if (!control) return false;

    const isPressed = Number(msg.value || 0) > 0;
    if (isPressed) {
      arcadeJoystickDirectionsRef.current.set(control.cc, control.direction);
      ensureArcadeJoystickTimer();
    } else {
      const currentDirection = arcadeJoystickDirectionsRef.current.get(control.cc);
      if (currentDirection === control.direction) {
        arcadeJoystickDirectionsRef.current.delete(control.cc);
      }
      if (arcadeJoystickDirectionsRef.current.size === 0) {
        stopArcadeJoystickTimer();
      }
    }
    return true;
  }, [arcadeJoystickMidiEnabled, ensureArcadeJoystickTimer, stopArcadeJoystickTimer]);

  useEffect(() => {
    if (arcadeJoystickMidiEnabled) return undefined;
    arcadeJoystickDirectionsRef.current.clear();
    stopArcadeJoystickTimer();
    return undefined;
  }, [arcadeJoystickMidiEnabled, stopArcadeJoystickTimer]);

  useEffect(() => () => {
    stopArcadeJoystickTimer();
  }, [stopArcadeJoystickTimer]);

  const onMidiMessage = useCallback((e) => {
    const data = e.data; // Uint8Array [status, data1, data2]
    if (!data || data.length < 2) return;
    const status = data[0] & 0xF0;
    const channel = (data[0] & 0x0F) + 1;
    const d1 = data[1] ?? 0;
    const d2 = data[2] ?? 0;

    let msg = null;
    if (status === 0xB0) { // CC
      msg = { type: 'cc', channel, number: d1, value: d2 };
    } else if (status === 0x90) { // Note On
      msg = { type: 'note', channel, number: d1, value: d2 };
    } else if (status === 0x80) { // Note Off (treat as value 0)
      msg = { type: 'note', channel, number: d1, value: 0 };
    }
    if (!msg) return;

    // Learn mode: bind first incoming message
    if (learnParamId) {
      const mapping = { type: msg.type, channel: msg.channel, number: msg.number };
      setMapping(learnParamId, mapping);
      setLearnParamId(null);
      return;
    }

    if (msg.type === 'cc' && msg.channel === DEFAULT_MIDI_CHANNEL && Object.hasOwn(arcadeJoystickValuesRef.current, msg.number)) {
      arcadeJoystickValuesRef.current[msg.number] = Math.max(0, Math.min(127, Number(msg.value) || 0));
    }

    if (handleArcadeJoystickNote(msg)) return;

    dispatchMidiMessage(msg);
  }, [dispatchMidiMessage, handleArcadeJoystickNote, learnParamId, setMapping]);

  // Attach listener to selected input
  useEffect(() => {
    if (!access) return;
    let input = null;
    access.inputs.forEach(i => { if (i.id === selectedInputId) input = i; });
    if (!input) return;
    const handler = (e) => onMidiMessage(e);
    input.onmidimessage = handler;
    return () => { if (input && input.onmidimessage === handler) input.onmidimessage = null; };
  }, [access, selectedInputId, onMidiMessage]);

  const beginLearn = useCallback((paramId) => {
    if (!paramId) {
      setLearnParamId(null);
      return false;
    }

    const inputList = Array.isArray(inputs) ? inputs : [];
    const selectedExists = !!selectedInputId && inputList.some(input => input?.id === selectedInputId);
    const nextInputId = selectedExists
      ? selectedInputId
      : (inputList.find(input => input?.id)?.id || '');

    if (!nextInputId) return false;
    if (nextInputId !== selectedInputId) {
      setSelectedInputId(nextInputId);
    }

    setLearnParamId(paramId);
    return true;
  }, [inputs, selectedInputId]);

  const value = useMemo(() => ({
    supported,
    inputs,
    selectedInputId,
    setSelectedInputId,
    mappings: effectiveMappings,
    setMapping,
    clearMapping,
    setMappingsFromExternal,
    beginLearn,
    learnParamId,
    registerParamHandler,
    mappingLabel,
    arcadeJoystickMidiEnabled,
    setArcadeJoystickMidiEnabled,
  }), [arcadeJoystickMidiEnabled, beginLearn, clearMapping, effectiveMappings, inputs, learnParamId, registerParamHandler, selectedInputId, setArcadeJoystickMidiEnabled, setMapping, setMappingsFromExternal, supported]);

  return (
    <MidiContext.Provider value={value}>
      {children}
    </MidiContext.Provider>
  );
};
