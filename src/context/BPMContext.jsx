import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useBPMClock } from '../hooks/useBPMClock.js';
import { evaluateEnvelope, DEFAULT_ENVELOPE } from '../components/common/BPMEnvelopeEditor.jsx';

/**
 * BPMContext - Global BPM/beat sync state provider
 * 
 * Provides beat-synced parameter automation similar to MIDI/Audio.
 * Each parameter can be mapped to a beat-synced automation with:
 * - Speed (duration in beats: 1/4, 1/2, 1, 2, 4, 8, 16, 32, 64)
 * - Loop mode (forward, reverse, pingpong, oneshot)
 * - Output range (min/max)
 * - Envelope curve (custom node-based curves)
 */

const BPMContext = createContext();

export const useBPM = () => useContext(BPMContext);

// LocalStorage keys
const LS_BPM_SETTINGS = 'artapp-bpm-settings';
const LS_BPM_MAPPINGS = 'artapp-bpm-mappings';

// Available beat speeds (in beats)
export const BEAT_SPEEDS = [
  { value: 0.25, label: '1/4' },
  { value: 0.5, label: '1/2' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 4, label: '4' },
  { value: 8, label: '8' },
  { value: 16, label: '16' },
  { value: 32, label: '32' },
  { value: 64, label: '64' },
];

// Loop modes
export const LOOP_MODES = ['forward', 'reverse', 'pingpong', 'oneshot'];

// Default range
const DEFAULT_RANGE = {
  outputMin: 0,
  outputMax: 1,
};

// Default BPM settings
const DEFAULT_BPM_SETTINGS = {
  bpm: 120,
  beatsPerBar: 4,
  isPlaying: false,
};

// Default BPM mappings
// { [paramId]: { enabled: bool, speed: number, loopMode: string, range: {...} } }
const DEFAULT_BPM_MAPPINGS = {};

// Interpolation with loop modes and optional envelope
const interpolate = (phase, loopMode, envelope = null) => {
  // phase is 0-1 within the cycle
  let adjustedPhase = phase;
  
  switch (loopMode) {
    case 'forward':
      adjustedPhase = phase;
      break;
    case 'reverse':
      adjustedPhase = 1 - phase;
      break;
    case 'pingpong': {
      // 0->1->0 over full cycle
      adjustedPhase = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
      break;
    }
    case 'oneshot':
      // 0->1 then stay at 1
      adjustedPhase = Math.min(1, phase);
      break;
    default:
      adjustedPhase = phase;
  }
  
  // Apply envelope curve if provided
  if (envelope && envelope.nodes && envelope.nodes.length >= 2) {
    return evaluateEnvelope(envelope, adjustedPhase);
  }
  
  return adjustedPhase;
};

export const BPMProvider = ({ children }) => {
  // BPM settings state (persisted)
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(LS_BPM_SETTINGS);
      return saved ? { ...DEFAULT_BPM_SETTINGS, ...JSON.parse(saved) } : DEFAULT_BPM_SETTINGS;
    } catch {
      return DEFAULT_BPM_SETTINGS;
    }
  });

  // Per-parameter BPM mappings (persisted)
  const [storedMappings, setStoredMappings] = useState(() => {
    try {
      const saved = localStorage.getItem(LS_BPM_MAPPINGS);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Param handlers: paramId -> Set<fn({ value01, phase, beat })>
  const handlersRef = useRef(new Map());

  // Use the BPM clock
  const clock = useBPMClock({
    initialBPM: settings.bpm,
    beatsPerBar: settings.beatsPerBar,
    autoStart: settings.isPlaying,
  });

  // Sync clock state to settings
  useEffect(() => {
    if (clock.isPlaying !== settings.isPlaying) {
      setSettings(prev => ({ ...prev, isPlaying: clock.isPlaying }));
    }
  }, [clock.isPlaying, settings.isPlaying]);

  // Persist settings
  useEffect(() => {
    try {
      localStorage.setItem(LS_BPM_SETTINGS, JSON.stringify(settings));
    } catch { /* noop */ }
  }, [settings]);

  // Persist mappings
  const persistMappings = useCallback((updater) => {
    setStoredMappings((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try {
        localStorage.setItem(LS_BPM_MAPPINGS, JSON.stringify(next));
      } catch { /* noop */ }
      return next;
    });
  }, []);

  // Compute effective mappings (defaults + stored overrides)
  const effectiveMappings = useMemo(() => {
    const merged = { ...DEFAULT_BPM_MAPPINGS };
    Object.entries(storedMappings || {}).forEach(([paramId, mapping]) => {
      if (mapping && typeof mapping === 'object') {
        merged[paramId] = mapping;
      }
    });
    return merged;
  }, [storedMappings]);

  // Register a handler for a parameter
  const registerBPMHandler = useCallback((paramId, handler) => {
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

  // Set mapping for a parameter
  const setMapping = useCallback((paramId, mapping) => {
    if (!paramId) return;
    persistMappings((prev) => {
      const next = { ...prev };
      const existingMapping = prev[paramId] || {};
      if (mapping === null) {
        // Clear mapping entirely
        next[paramId] = { enabled: false, speed: 1, loopMode: 'forward', range: DEFAULT_RANGE };
      } else if (mapping && typeof mapping === 'object') {
        // Validate and store - preserve existing range if not provided
        const range = mapping.range || existingMapping.range || DEFAULT_RANGE;
        next[paramId] = {
          enabled: mapping.enabled !== false,
          speed: BEAT_SPEEDS.find(s => s.value === mapping.speed)?.value || 1,
          loopMode: LOOP_MODES.includes(mapping.loopMode) ? mapping.loopMode : 'forward',
          range: {
            outputMin: Number.isFinite(Number(range.outputMin)) ? Number(range.outputMin) : 0,
            outputMax: Number.isFinite(Number(range.outputMax)) ? Number(range.outputMax) : 1,
          },
        };
      }
      return next;
    });
  }, [persistMappings]);

  // Clear mapping for a parameter
  const clearMapping = useCallback((paramId) => {
    if (!paramId) return;
    persistMappings((prev) => {
      const next = { ...prev };
      delete next[paramId];
      return next;
    });
  }, [persistMappings]);

  // Set mappings from external source (e.g., JSON import)
  const setMappingsFromExternal = useCallback((obj) => {
    if (obj && typeof obj === 'object') {
      persistMappings({ ...obj });
    }
  }, [persistMappings]);

  // Get mapping for a parameter
  const getMapping = useCallback((paramId) => {
    return effectiveMappings[paramId] || null;
  }, [effectiveMappings]);

  // Dispatch BPM values to registered handlers using requestAnimationFrame (throttled)
  // This avoids the infinite re-render loop caused by having clock.currentBeat in deps
  const lastValuesRef = useRef({});
  const effectiveMappingsRef = useRef(effectiveMappings);
  effectiveMappingsRef.current = effectiveMappings;
  
  // Store clock in a ref so dispatch can read fresh values without re-running useEffect
  const clockRef = useRef(clock);
  clockRef.current = clock;
  
  useEffect(() => {
    if (!clock.isPlaying) return;
    
    let frameId = null;
    let lastDispatchTime = 0;
    const THROTTLE_MS = 50; // Dispatch at most 20 times per second
    
    const dispatch = () => {
      const now = performance.now();
      if (now - lastDispatchTime < THROTTLE_MS) {
        frameId = requestAnimationFrame(dispatch);
        return;
      }
      lastDispatchTime = now;
      
      const handlers = handlersRef.current;
      if (handlers.size === 0) {
        frameId = requestAnimationFrame(dispatch);
        return;
      }
      
      const mappings = effectiveMappingsRef.current;
      // Read fresh clock values from ref
      const currentClock = clockRef.current;
      const currentBeat = currentClock?.currentBeat ?? 0;
      const beatPhase = currentClock?.beatPhase ?? 0;
      
      handlers.forEach((handlerSet, paramId) => {
        const mapping = mappings[paramId];
        if (!mapping || !mapping.enabled) return;
        
        const { speed, loopMode, range, envelope } = mapping;
        
        // Calculate phase within the cycle (0-1)
        const cycleBeats = speed;
        const totalBeats = currentBeat + beatPhase;
        const cyclePhase = (totalBeats % cycleBeats) / cycleBeats;
        
        // Apply loop mode interpolation and envelope curve
        const normalizedPhase = interpolate(cyclePhase, loopMode, envelope);
        
        // Map to output range
        const rangeSpan = range.outputMax - range.outputMin;
        const mappedValue = range.outputMin + normalizedPhase * rangeSpan;
        
        // Only dispatch if value changed significantly (avoid redundant React updates)
        // Use relative threshold based on range span (0.1% of range or 0.001, whichever is larger)
        const lastValue = lastValuesRef.current[paramId];
        const threshold = Math.max(0.001, Math.abs(rangeSpan) * 0.001);
        if (lastValue !== undefined && Math.abs(mappedValue - lastValue) < threshold) return;
        lastValuesRef.current[paramId] = mappedValue;
        
        handlerSet.forEach(fn => {
          try {
            fn({ value01: mappedValue, phase: cyclePhase, beat: currentBeat });
          } catch { /* noop */ }
        });
      });
      
      frameId = requestAnimationFrame(dispatch);
    };
    
    frameId = requestAnimationFrame(dispatch);
    
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [clock.isPlaying]); // Only depend on isPlaying, not currentBeat/beatPhase!

  // Set BPM
  const setBPMValue = useCallback((newBPM) => {
    clock.setBPM(newBPM);
    setSettings(prev => ({ ...prev, bpm: newBPM }));
  }, [clock]);

  // Stable getters that read from ref (don't cause re-renders)
  // clockRef is already declared above for the dispatch loop
  const getClockState = useCallback(() => clockRef.current, []);

  // Get a snapshot of BPM settings and mappings for export/preset save
  const getBPMSnapshot = useCallback(() => ({
    settings: {
      bpm: settings.bpm,
      beatsPerBar: settings.beatsPerBar,
      // Don't include 'isPlaying' - that's runtime state
    },
    mappings: { ...storedMappings },
  }), [settings, storedMappings]);

  // Apply a snapshot of BPM settings and mappings from import/preset recall
  const applyBPMSnapshot = useCallback((snapshot) => {
    if (!snapshot || typeof snapshot !== 'object') return;
    
    // Apply settings
    if (snapshot.settings && typeof snapshot.settings === 'object') {
      if (typeof snapshot.settings.bpm === 'number') {
        setBPMValue(snapshot.settings.bpm);
      }
      if (typeof snapshot.settings.beatsPerBar === 'number') {
        setSettings(prev => ({ ...prev, beatsPerBar: snapshot.settings.beatsPerBar }));
      }
    }
    
    // Apply mappings
    if (snapshot.mappings && typeof snapshot.mappings === 'object') {
      setMappingsFromExternal(snapshot.mappings);
    }
  }, [setBPMValue, setMappingsFromExternal]);

  // Clear all BPM mappings
  const clearAllMappings = useCallback(() => {
    setMappingsFromExternal({});
  }, [setMappingsFromExternal]);
  
  // Stable value that only changes when mappings/settings change (not on every beat)
  // IMPORTANT: Do NOT include currentBeat or beatPhase here - they change every frame!
  // Use getClockState() to get current values in the animation loop.
  const value = useMemo(() => ({
    // Clock state (only stable values that don't change every frame)
    bpm: clock.bpm,
    isPlaying: clock.isPlaying,
    beatsPerBar: clock.beatsPerBar,
    beatDurationMs: clock.beatDurationMs,
    getClockState, // For animation loop to get currentBeat/beatPhase without subscribing
    
    // Settings
    settings,
    mappings: effectiveMappings,
    
    // Clock actions (stable)
    setBPM: setBPMValue,
    play: clock.play,
    pause: clock.pause,
    togglePlay: clock.togglePlay,
    reset: clock.reset,
    tap: clock.tap,
    
    // Mapping actions
    setMapping,
    clearMapping,
    setMappingsFromExternal,
    getMapping,
    registerBPMHandler,
    
    // Snapshot for export/import
    getBPMSnapshot,
    applyBPMSnapshot,
    clearAllMappings,

    // Helpers
    BEAT_SPEEDS,
    LOOP_MODES,
    DEFAULT_RANGE,
    DEFAULT_ENVELOPE,
  }), [
    // Only include stable dependencies - NOT currentBeat/beatPhase (which change every frame)
    clock.bpm,
    clock.isPlaying,
    clock.beatsPerBar,
    clock.beatDurationMs,
    clock.play,
    clock.pause,
    clock.togglePlay,
    clock.reset,
    clock.tap,
    settings,
    effectiveMappings,
    setBPMValue,
    setMapping,
    clearMapping,
    setMappingsFromExternal,
    getMapping,
    registerBPMHandler,
    getClockState,
    getBPMSnapshot,
    applyBPMSnapshot,
    clearAllMappings,
  ]);

  return (
    <BPMContext.Provider value={value}>
      {children}
    </BPMContext.Provider>
  );
};
