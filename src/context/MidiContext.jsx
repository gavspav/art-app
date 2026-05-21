import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { PARAMETERS } from '../config/parameters.js';

const MidiContext = createContext(null);

export const useMidi = () => useContext(MidiContext);

const LS_MIDI_MAPPINGS = 'artapp-midi-mappings';
const LS_MIDI_SELECTED = 'artapp-midi-selected-input';

const DEFAULT_MIDI_CHANNEL = 1;

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

  const sliderParamIds = PARAMETERS
    .filter((param) => param?.type === 'slider')
    .map((param) => param?.id)
    .filter(Boolean);

  sliderParamIds.forEach(assign);

  const extraParams = ['globalPaletteIndex', 'globalBlendMode', 'randomizeAll', 'variation'];
  extraParams.forEach(assign);

  return mapping;
};

const DEFAULT_MIDI_MAPPINGS = buildDefaultMidiMappings();

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

  const [storedMappings, setStoredMappings] = useState(() => {
    try {
      const saved = localStorage.getItem(LS_MIDI_MAPPINGS);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  }); // { [paramId]: { type: 'cc'|'note', channel, number, invert? } }

  const [learnParamId, setLearnParamId] = useState(null);

  // Param handlers: paramId -> Set<fn({ value01, raw })>
  const handlersRef = useRef(new Map());

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
    Object.entries(storedMappings || {}).forEach(([paramId, mapping]) => {
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
      persist({ ...obj });
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

    // Dispatch to any params mapped to this message
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
  }, [SECRET_CC_PARAMS, effectiveMappings, learnParamId, setMapping, triggerHandlers]);

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
  }), [beginLearn, clearMapping, effectiveMappings, inputs, learnParamId, registerParamHandler, selectedInputId, setMapping, setMappingsFromExternal, supported]);

  return (
    <MidiContext.Provider value={value}>
      {children}
    </MidiContext.Provider>
  );
};
