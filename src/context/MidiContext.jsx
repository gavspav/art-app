import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { PARAMETERS } from '../config/parameters.js';

const MidiContext = createContext(null);

export const useMidi = () => useContext(MidiContext);

const LS_MIDI_MAPPINGS = 'artapp-midi-mappings';
const LS_MIDI_SELECTED = 'artapp-midi-selected-input';
const LS_ARCADE_JOYSTICK_MIDI_ENABLED = 'artapp-arcade-joystick-midi-enabled';
const LS_ARCADE_KEYBOARD_MIDI_ENABLED = 'artapp-arcade-keyboard-midi-enabled';
const LS_ARCADE_BUTTON_PAIRS_MIDI_ENABLED = 'artapp-arcade-button-pairs-midi-enabled';

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
const ARCADE_JOYSTICK_ACTION_NOTE_MAP = {
  45: { action: 'wobbleNoise', direction: 1 },
  56: { action: 'wobbleNoise', direction: -1 },
};
const ARCADE_BUTTON_PAIR_KEYBOARD_NOTE_MAP = {
  30: { paramId: 'arcade:backgroundColorCycle', direction: 1 },
  5: { paramId: 'arcade:backgroundColorCycle', direction: -1 },
  32: { paramId: 'arcade:paletteCycle', direction: 1 },
  51: { paramId: 'arcade:paletteCycle', direction: -1 },
  40: { paramId: 'numSides', direction: 1, counter: 'numSides' },
  6: { paramId: 'numSides', direction: -1, counter: 'numSides' },
  14: { paramId: 'globalOpacity', direction: 1, counter: 'globalOpacity' },
  12: { paramId: 'globalOpacity', direction: -1, counter: 'globalOpacity' },
  4: { paramId: 'arcade:blendToggle', toggle: true },
  13: { paramId: 'curviness', toggle: 'curviness' },
};
const ARCADE_BUTTON_PAIR_PHYSICAL_NOTE_MAP = {
  30: { paramId: 'arcade:backgroundColorCycle', direction: 1 },
  4: { paramId: 'arcade:backgroundColorCycle', direction: -1 },
  32: { paramId: 'arcade:paletteCycle', direction: 1 },
  5: { paramId: 'arcade:paletteCycle', direction: -1 },
  51: { paramId: 'numSides', direction: 1, counter: 'numSides' },
  14: { paramId: 'numSides', direction: -1, counter: 'numSides' },
  40: { paramId: 'globalOpacity', direction: 1, counter: 'globalOpacity' },
  13: { paramId: 'globalOpacity', direction: -1, counter: 'globalOpacity' },
  6: { paramId: 'arcade:blendToggle', toggle: true },
  12: { paramId: 'curviness', toggle: 'curviness' },
};
const ARCADE_BUTTON_PAIR_MAPPING_ACTIONS = {
  'randomize:backgroundColor': { paramId: 'arcade:backgroundColorCycle', direction: 1 },
  'randomize:globalBlendMode': { paramId: 'arcade:backgroundColorCycle', direction: -1 },
  'randomize:globalPaletteIndex': { paramId: 'arcade:paletteCycle', direction: 1 },
  'randomize:globalOpacity': { paramId: 'arcade:paletteCycle', direction: -1 },
  'randomize:numSides': { paramId: 'numSides', direction: 1, counter: 'numSides' },
  'randomize:movementStyle': { paramId: 'numSides', direction: -1, counter: 'numSides' },
  'randomize:wobble': { paramId: 'globalOpacity', direction: 1, counter: 'globalOpacity' },
  'randomize:variationPosition': { paramId: 'globalOpacity', direction: -1, counter: 'globalOpacity' },
  'randomize:variationColor': { paramId: 'arcade:blendToggle', toggle: true },
  'randomize:variationAnim': { paramId: 'curviness', toggle: 'curviness' },
};
const ARCADE_BUTTON_COUNTER_STEP = 8;
const ARCADE_KEYBOARD_NOTE_MAP = {
  KeyW: { channel: 1, number: 38 },
  KeyA: { channel: 1, number: 37 },
  KeyS: { channel: 1, number: 36 },
  KeyZ: { channel: 1, number: 39 },
  KeyU: { channel: 1, number: 45 },
  KeyH: { channel: 1, number: 46 },
  KeyJ: { channel: 1, number: 44 },
  KeyN: { channel: 1, number: 56 },
  KeyE: { channel: 1, number: 30 },
  KeyR: { channel: 1, number: 32 },
  KeyT: { channel: 1, number: 4 },
  KeyC: { channel: 1, number: 5 },
  KeyV: { channel: 1, number: 51 },
  KeyI: { channel: 1, number: 40 },
  KeyO: { channel: 1, number: 14 },
  KeyP: { channel: 1, number: 13 },
  KeyM: { channel: 1, number: 6 },
  Comma: { channel: 1, number: 12 },
};

export const ARCADE_KEYBOARD_MIDI_CODES = Object.freeze(Object.keys(ARCADE_KEYBOARD_NOTE_MAP));

const shouldIgnoreKeyboardMidiEvent = (event) => {
  const target = event?.target;
  if (!target || typeof target !== 'object') return false;
  const tag = (target.tagName || '').toLowerCase();
  return !!(
    target.isContentEditable
    || tag === 'input'
    || tag === 'textarea'
    || tag === 'select'
  );
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

const messageMatchesMapping = (msg, mapping) => (
  !!msg
  && !!mapping
  && msg.type === mapping.type
  && (!mapping.channel || mapping.channel === msg.channel)
  && mapping.number === msg.number
);

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
  const [arcadeKeyboardMidiEnabled, setArcadeKeyboardMidiEnabledState] = useState(() => {
    try { return localStorage.getItem(LS_ARCADE_KEYBOARD_MIDI_ENABLED) === 'true'; } catch { return false; }
  });
  const [arcadeButtonPairsMidiEnabled, setArcadeButtonPairsMidiEnabledState] = useState(() => {
    try { return localStorage.getItem(LS_ARCADE_BUTTON_PAIRS_MIDI_ENABLED) === 'true'; } catch { return false; }
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
  const arcadeJoystickActionValuesRef = useRef({
    wobbleNoise: ARCADE_JOYSTICK_DEFAULT_VALUE,
  });
  const arcadeJoystickActionDirectionsRef = useRef(new Map());
  const arcadeButtonCounterValuesRef = useRef({
    numSides: ARCADE_JOYSTICK_DEFAULT_VALUE,
    globalOpacity: ARCADE_JOYSTICK_DEFAULT_VALUE,
  });
  const arcadeButtonToggleValuesRef = useRef({
    curviness: false,
  });
  const arcadeJoystickTimerRef = useRef(null);
  const arcadeJoystickLastTickRef = useRef(0);
  const arcadeKeyboardPressedRef = useRef(new Set());

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
  const setArcadeKeyboardMidiEnabled = useCallback((enabled) => {
    const next = !!enabled;
    setArcadeKeyboardMidiEnabledState(next);
    try { localStorage.setItem(LS_ARCADE_KEYBOARD_MIDI_ENABLED, next ? 'true' : 'false'); } catch { /* noop */ }
  }, []);
  const setArcadeButtonPairsMidiEnabled = useCallback((enabled) => {
    const next = !!enabled;
    setArcadeButtonPairsMidiEnabledState(next);
    try { localStorage.setItem(LS_ARCADE_BUTTON_PAIRS_MIDI_ENABLED, next ? 'true' : 'false'); } catch { /* noop */ }
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
    const actionDirections = arcadeJoystickActionDirectionsRef.current;
    if ((!directions || directions.size === 0) && (!actionDirections || actionDirections.size === 0)) {
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

    actionDirections.forEach((direction, action) => {
      const current = Number(arcadeJoystickActionValuesRef.current[action] ?? ARCADE_JOYSTICK_DEFAULT_VALUE);
      const next = Math.max(0, Math.min(127, current + (direction * step)));
      if (Math.round(next) === Math.round(current)) {
        arcadeJoystickActionValuesRef.current[action] = next;
        return;
      }
      arcadeJoystickActionValuesRef.current[action] = next;
      const raw = {
        type: 'arcade-action',
        channel: DEFAULT_MIDI_CHANNEL,
        number: action,
        value: Math.round(next),
        source: 'arcadeJoystick',
        arcadeAction: action,
      };
      if (action === 'wobbleNoise') {
        const value01 = Math.max(0, Math.min(1, Math.round(next) / 127));
        triggerHandlers('wobble', value01, raw);
        triggerHandlers('noiseAmount', value01, raw);
      }
    });
  }, [emitArcadeJoystickCc, stopArcadeJoystickTimer, triggerHandlers]);

  const ensureArcadeJoystickTimer = useCallback(() => {
    if (arcadeJoystickTimerRef.current) return;
    arcadeJoystickLastTickRef.current = performance.now();
    arcadeJoystickTimerRef.current = setInterval(tickArcadeJoystick, ARCADE_JOYSTICK_TICK_MS);
  }, [tickArcadeJoystick]);

  const getArcadeJoystickLearnMapping = useCallback((msg) => {
    if (msg?.type !== 'note' || msg.channel !== DEFAULT_MIDI_CHANNEL) return null;
    const control = ARCADE_JOYSTICK_NOTE_MAP[msg.number];
    if (!control) return null;
    return { type: 'cc', channel: DEFAULT_MIDI_CHANNEL, number: control.cc };
  }, []);

  const handleArcadeJoystickNote = useCallback((msg) => {
    if ((!arcadeJoystickMidiEnabled && msg?.source !== 'arcadeKeyboard') || msg?.type !== 'note' || msg.channel !== DEFAULT_MIDI_CHANNEL) return false;
    if (arcadeButtonPairsMidiEnabled) {
      const actionControl = ARCADE_JOYSTICK_ACTION_NOTE_MAP[msg.number];
      if (actionControl) {
        const isPressed = Number(msg.value || 0) > 0;
        if (isPressed) {
          arcadeJoystickActionDirectionsRef.current.set(actionControl.action, actionControl.direction);
          ensureArcadeJoystickTimer();
        } else {
          const currentDirection = arcadeJoystickActionDirectionsRef.current.get(actionControl.action);
          if (currentDirection === actionControl.direction) {
            arcadeJoystickActionDirectionsRef.current.delete(actionControl.action);
          }
          if (arcadeJoystickDirectionsRef.current.size === 0 && arcadeJoystickActionDirectionsRef.current.size === 0) {
            stopArcadeJoystickTimer();
          }
        }
        return true;
      }
    }

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
  }, [arcadeButtonPairsMidiEnabled, arcadeJoystickMidiEnabled, ensureArcadeJoystickTimer, stopArcadeJoystickTimer]);

  const getArcadeButtonPairAction = useCallback((msg) => {
    if (!arcadeButtonPairsMidiEnabled || !msg) return null;
    if (msg.type === 'note' && msg.channel === DEFAULT_MIDI_CHANNEL) {
      const fixedMap = msg.source === 'arcadeKeyboard'
        ? ARCADE_BUTTON_PAIR_KEYBOARD_NOTE_MAP
        : ARCADE_BUTTON_PAIR_PHYSICAL_NOTE_MAP;
      const fixedAction = fixedMap[msg.number];
      if (fixedAction) return fixedAction;
    }
    for (const [mappedParamId, action] of Object.entries(ARCADE_BUTTON_PAIR_MAPPING_ACTIONS)) {
      if (messageMatchesMapping(msg, effectiveMappings[mappedParamId])) return action;
    }
    return null;
  }, [arcadeButtonPairsMidiEnabled, effectiveMappings]);

  const handleArcadeButtonPairMessage = useCallback((msg) => {
    const action = getArcadeButtonPairAction(msg);
    if (!action) return false;

    const isPressed = msg.type === 'cc'
      ? Number(msg.value || 0) >= 64
      : Number(msg.value || 0) > 0;
    if (!isPressed) return true;

    if (action.counter) {
      const current = Number(arcadeButtonCounterValuesRef.current[action.counter] ?? ARCADE_JOYSTICK_DEFAULT_VALUE);
      const next = Math.max(0, Math.min(127, current + (action.direction * ARCADE_BUTTON_COUNTER_STEP)));
      arcadeButtonCounterValuesRef.current[action.counter] = next;
      triggerHandlers(action.paramId, next / 127, {
        ...msg,
        source: msg.source || 'arcadeButtonPairs',
        arcadeDirection: action.direction,
        arcadeCounter: action.counter,
        value: Math.round(next),
      });
      return true;
    }

    if (action.toggle === 'curviness') {
      const next = !arcadeButtonToggleValuesRef.current.curviness;
      arcadeButtonToggleValuesRef.current.curviness = next;
      triggerHandlers(action.paramId, next ? 1 : 0, {
        ...msg,
        source: msg.source || 'arcadeButtonPairs',
        arcadeToggle: 'curviness',
        value: next ? 127 : 0,
      });
      return true;
    }

    if (action.toggle) {
      triggerHandlers(action.paramId, 1, {
        ...msg,
        source: msg.source || 'arcadeButtonPairs',
        arcadeDirection: action.direction || 1,
      });
      return true;
    }

    triggerHandlers(action.paramId, action.direction > 0 ? 1 : 0, {
      ...msg,
      source: msg.source || 'arcadeButtonPairs',
      arcadeDirection: action.direction,
    });
    return true;
  }, [getArcadeButtonPairAction, triggerHandlers]);

  useEffect(() => {
    if (arcadeJoystickMidiEnabled) return undefined;
    arcadeJoystickDirectionsRef.current.clear();
    arcadeJoystickActionDirectionsRef.current.clear();
    stopArcadeJoystickTimer();
    return undefined;
  }, [arcadeJoystickMidiEnabled, stopArcadeJoystickTimer]);

  useEffect(() => () => {
    stopArcadeJoystickTimer();
  }, [stopArcadeJoystickTimer]);

  const processMidiMessage = useCallback((msg) => {
    if (!msg) return;

    // Learn mode: bind first incoming message
    if (learnParamId) {
      const mapping = getArcadeJoystickLearnMapping(msg) || { type: msg.type, channel: msg.channel, number: msg.number };
      setMapping(learnParamId, mapping);
      setLearnParamId(null);
      return;
    }

    if (msg.type === 'cc' && msg.channel === DEFAULT_MIDI_CHANNEL && Object.hasOwn(arcadeJoystickValuesRef.current, msg.number)) {
      arcadeJoystickValuesRef.current[msg.number] = Math.max(0, Math.min(127, Number(msg.value) || 0));
    }

    if (handleArcadeButtonPairMessage(msg)) return;
    if (handleArcadeJoystickNote(msg)) return;

    dispatchMidiMessage(msg);
  }, [dispatchMidiMessage, getArcadeJoystickLearnMapping, handleArcadeButtonPairMessage, handleArcadeJoystickNote, learnParamId, setMapping]);

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
    processMidiMessage(msg);
  }, [processMidiMessage]);

  useEffect(() => {
    if (!arcadeKeyboardMidiEnabled) {
      arcadeKeyboardPressedRef.current.clear();
      return undefined;
    }
    const pressedKeys = arcadeKeyboardPressedRef.current;

    const handleKeyboardMidi = (event, pressed) => {
      if (event.metaKey || event.ctrlKey || event.altKey || shouldIgnoreKeyboardMidiEvent(event)) return;
      const mapping = ARCADE_KEYBOARD_NOTE_MAP[event.code];
      if (!mapping) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      if (pressed) {
        if (pressedKeys.has(event.code)) return;
        pressedKeys.add(event.code);
      } else {
        if (!pressedKeys.has(event.code)) return;
        pressedKeys.delete(event.code);
      }

      processMidiMessage({
        type: 'note',
        channel: mapping.channel,
        number: mapping.number,
        value: pressed ? 127 : 0,
        source: 'arcadeKeyboard',
      });
    };

    const handleKeyDown = (event) => handleKeyboardMidi(event, true);
    const handleKeyUp = (event) => handleKeyboardMidi(event, false);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      pressedKeys.clear();
    };
  }, [arcadeKeyboardMidiEnabled, processMidiMessage]);

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

    if (!nextInputId && !arcadeKeyboardMidiEnabled) return false;
    if (nextInputId !== selectedInputId) {
      setSelectedInputId(nextInputId);
    }

    setLearnParamId(paramId);
    return true;
  }, [arcadeKeyboardMidiEnabled, inputs, selectedInputId]);

  const midiAvailable = supported || arcadeKeyboardMidiEnabled;

  const value = useMemo(() => ({
    supported: midiAvailable,
    webMidiSupported: supported,
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
    arcadeKeyboardMidiEnabled,
    setArcadeKeyboardMidiEnabled,
    arcadeButtonPairsMidiEnabled,
    setArcadeButtonPairsMidiEnabled,
  }), [arcadeButtonPairsMidiEnabled, arcadeJoystickMidiEnabled, arcadeKeyboardMidiEnabled, beginLearn, clearMapping, effectiveMappings, inputs, learnParamId, midiAvailable, registerParamHandler, selectedInputId, setArcadeButtonPairsMidiEnabled, setArcadeJoystickMidiEnabled, setArcadeKeyboardMidiEnabled, setMapping, setMappingsFromExternal, supported]);

  return (
    <MidiContext.Provider value={value}>
      {children}
    </MidiContext.Provider>
  );
};
