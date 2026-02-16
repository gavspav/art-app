import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useAudio } from '../hooks/useAudio.js';
import { AudioModeProcessor, DEFAULT_MODE_SETTINGS } from '../utils/audioMappingModes.js';

/**
 * AudioContext - Global audio reactive state provider
 * 
 * Provides audio features and settings to the entire app.
 * Supports per-parameter audio mappings (like MIDI).
 * Each parameter can be mapped to an audio band with custom range.
 */

const AudioReactiveContext = createContext();

export const useAudioReactive = () => useContext(AudioReactiveContext);

// Available audio bands (extensible - add 'pitch' etc. in future)
export const AUDIO_BANDS = ['none', 'rms', 'bass', 'mids', 'highs'];

// LocalStorage keys
const LS_AUDIO_MAPPINGS = 'artapp-audio-mappings';
const LS_AUDIO_SETTINGS = 'artapp-audio-settings';
const LS_AUDIO_FILE = 'artapp-audio-file'; // Stores file mode preference

// Default range mapping for a parameter
// Simplified: just outputMin/outputMax (the parameter value range)
// inputMin/inputMax removed - sensitivity handles audio level scaling
const DEFAULT_RANGE = {
  outputMin: 0,
  outputMax: 1,
};

export const AUDIO_TRIGGER_SOURCES = ['processed', 'raw'];
export const AUDIO_TRIGGER_MODES = ['crossUp', 'crossDown', 'both', 'whileAbove'];
export const AUDIO_TRIGGER_ACTIONS = ['modulate', 'addLayer', 'randomize', 'increase', 'decrease'];
export const DEFAULT_TRIGGER = {
  enabled: false,
  source: 'processed',
  mode: 'crossUp',
  riseThreshold: 0.65,
  fallThreshold: 0.55,
  cooldownMs: 250,
  reverseOnFall: false,
  action: 'modulate',
};

const normalizeTriggerConfig = (trigger) => {
  if (!trigger || typeof trigger !== 'object') {
    return { ...DEFAULT_TRIGGER };
  }
  const rise = Math.max(0, Math.min(1, Number.isFinite(Number(trigger.riseThreshold)) ? Number(trigger.riseThreshold) : DEFAULT_TRIGGER.riseThreshold));
  const fallCandidate = Number.isFinite(Number(trigger.fallThreshold)) ? Number(trigger.fallThreshold) : DEFAULT_TRIGGER.fallThreshold;
  const fall = Math.max(0, Math.min(rise, fallCandidate));
  return {
    enabled: !!trigger.enabled,
    source: AUDIO_TRIGGER_SOURCES.includes(trigger.source) ? trigger.source : DEFAULT_TRIGGER.source,
    mode: AUDIO_TRIGGER_MODES.includes(trigger.mode) ? trigger.mode : DEFAULT_TRIGGER.mode,
    riseThreshold: rise,
    fallThreshold: fall,
    cooldownMs: Math.max(0, Number.isFinite(Number(trigger.cooldownMs)) ? Number(trigger.cooldownMs) : DEFAULT_TRIGGER.cooldownMs),
    reverseOnFall: !!trigger.reverseOnFall,
    action: AUDIO_TRIGGER_ACTIONS.includes(trigger.action) ? trigger.action : DEFAULT_TRIGGER.action,
  };
};

const resolveTriggerSourceValue = (source, raw, processed) => {
  if (source === 'raw') {
    return Math.max(0, Math.min(1, Number.isFinite(raw) ? raw : 0));
  }
  return Math.max(0, Math.min(1, Number.isFinite(processed) ? processed : 0));
};

// Singleton mode processor instance (persists across re-renders)
const modeProcessor = new AudioModeProcessor();

// Default audio settings (global settings only)
const DEFAULT_AUDIO_SETTINGS = {
  enabled: false,
  sensitivity: 1.0,
  bassSensitivity: 1.0,
  midsSensitivity: 1.0,
  highsSensitivity: 1.0,
  smoothing: 0.7, // Increased for slower, more flowing response
  release: 0.85, // Falloff factor: values decay slower (0=instant, 1=never)
  deviceId: null, // null = default device
};

// Default audio mappings for common parameters
// { [paramId]: { band: 'rms'|'bass'|'mids'|'highs'|'none', range: {...} } }
const DEFAULT_AUDIO_MAPPINGS = {
  globalSpeedMultiplier: { band: 'none', range: { outputMin: 1.0, outputMax: 3.0 } },
  globalOpacity: { band: 'none', range: { outputMin: 0.3, outputMax: 1.0 } },
  layersCount: { band: 'none', range: { outputMin: 1, outputMax: 20 } },
};

// Map an input value (0-1) through a range mapping to output range
export const mapRange = (value, range) => {
  const { outputMin, outputMax } = range || DEFAULT_RANGE;
  // Clamp input to 0-1
  const normalized = Math.max(0, Math.min(1, value));
  // Map to output range
  return outputMin + normalized * (outputMax - outputMin);
};

// Helper to build a label for an audio mapping
export const audioMappingLabel = (mapping) => {
  if (!mapping || mapping.band === 'none') return 'None';
  const bandLabels = { rms: 'Level', bass: 'Bass', mids: 'Mids', highs: 'Highs', pitch: 'Pitch' };
  return bandLabels[mapping.band] || mapping.band;
};

export const AudioProvider = ({ children }) => {
  // Audio settings state (persisted)
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(LS_AUDIO_SETTINGS);
      return saved ? { ...DEFAULT_AUDIO_SETTINGS, ...JSON.parse(saved) } : DEFAULT_AUDIO_SETTINGS;
    } catch {
      return DEFAULT_AUDIO_SETTINGS;
    }
  });

  // Per-parameter audio mappings (persisted)
  // { [paramId]: { band: 'rms'|'bass'|'mids'|'highs'|'none', range: {...} } | null }
  const [storedMappings, setStoredMappings] = useState(() => {
    try {
      const saved = localStorage.getItem(LS_AUDIO_MAPPINGS);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Learn mode state
  const [learnParamId, setLearnParamId] = useState(null);

  // Param handlers: paramId -> Set<fn({ value01, band, raw })>
  const handlersRef = useRef(new Map());
  
  // Cache of last dispatched values per param (used for change detection)
  const lastValuesRef = useRef({});
  // Latest per-parameter debug snapshot for "Audio Explain" UI
  const mappingDebugRef = useRef({});
  // Threshold trigger runtime state per parameter
  const triggerStateRef = useRef({});
  
  // Track last dispatch timestamp for dt calculation
  const lastDispatchTimeRef = useRef(performance.now());

  // Use the audio hook with current settings
  const {
    isActive,
    error,
    getFeatures: getFeaturesFromHook,
    availableDevices,
    currentDeviceId,
    initMic,
    stopAudio,
    switchDevice,
    refreshDevices,
    // File playback
    isFileMode,
    isFilePlaying,
    fileInfo,
    fileProgress,
    hasStoredFile,
    loadAudioFile,
    toggleFilePlayback,
    seekFile,
    stopFilePlayback,
  } = useAudio({
    enabled: settings.enabled,
    sensitivity: settings.sensitivity,
    bassSensitivity: settings.bassSensitivity,
    midsSensitivity: settings.midsSensitivity,
    highsSensitivity: settings.highsSensitivity,
    smoothing: settings.smoothing,
    release: settings.release,
    deviceId: settings.deviceId,
  });

  // Stable getter for features (doesn't cause re-renders)
  const getFeatures = useCallback(() => {
    if (typeof getFeaturesFromHook === 'function') {
      return getFeaturesFromHook();
    }
    return { rms: 0, bass: 0, mids: 0, highs: 0 };
  }, [getFeaturesFromHook]);

  // Persist settings
  useEffect(() => {
    try {
      localStorage.setItem(LS_AUDIO_SETTINGS, JSON.stringify(settings));
    } catch { /* noop */ }
  }, [settings]);

  // Persist mappings
  const persistMappings = useCallback((updater) => {
    setStoredMappings((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try {
        localStorage.setItem(LS_AUDIO_MAPPINGS, JSON.stringify(next));
      } catch { /* noop */ }
      return next;
    });
  }, []);

  // Compute effective mappings (defaults + stored overrides)
  const effectiveMappings = useMemo(() => {
    const merged = { ...DEFAULT_AUDIO_MAPPINGS };
    Object.entries(storedMappings || {}).forEach(([paramId, mapping]) => {
      if (mapping === null) {
        // Explicitly disabled
        merged[paramId] = { band: 'none', range: DEFAULT_RANGE };
      } else if (mapping && typeof mapping === 'object') {
        merged[paramId] = mapping;
      }
    });
    return merged;
  }, [storedMappings]);

  // Register a handler for a parameter (like MIDI's registerParamHandler)
  const registerAudioHandler = useCallback((paramId, handler) => {
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
    // Clear the cached last value so the next dispatch will always fire
    // This fixes the issue where toggling None → Level wouldn't trigger updates
    delete lastValuesRef.current[paramId];
    delete triggerStateRef.current[paramId];
    
    persistMappings((prev) => {
      const next = { ...prev };
      if (mapping === null || (mapping && mapping.band === 'none')) {
        // Disable mapping - preserve the range for when re-enabled
        const existingRange = prev[paramId]?.range || mapping?.range || DEFAULT_RANGE;
        const existingTrigger = prev[paramId]?.trigger;
        next[paramId] = {
          band: 'none',
          range: existingRange,
          ...(existingTrigger && typeof existingTrigger === 'object'
            ? { trigger: normalizeTriggerConfig(existingTrigger) }
            : {}),
        };
        delete mappingDebugRef.current[paramId];
      } else if (mapping && typeof mapping === 'object') {
        // Validate and store - simplified range (just output min/max)
        const range = mapping.range || DEFAULT_RANGE;
        const entry = {
          band: AUDIO_BANDS.includes(mapping.band) ? mapping.band : 'none',
          range: {
            outputMin: Number.isFinite(Number(range.outputMin)) ? Number(range.outputMin) : 0,
            outputMax: Number.isFinite(Number(range.outputMax)) ? Number(range.outputMax) : 1,
          },
        };
        // Preserve gain if provided
        if (Number.isFinite(Number(mapping.gain))) {
          entry.gain = Math.max(0, Number(mapping.gain));
        } else if (Number.isFinite(Number(prev[paramId]?.gain))) {
          entry.gain = prev[paramId].gain;
        }
        // Preserve mode and modeSettings if provided
        if (mapping.mode && typeof mapping.mode === 'string') {
          entry.mode = mapping.mode;
          // Clear processor state when mode changes
          modeProcessor.clearParam(paramId);
        }
        if (mapping.modeSettings && typeof mapping.modeSettings === 'object') {
          entry.modeSettings = { ...mapping.modeSettings };
          // Clear processor state when settings change
          modeProcessor.clearParam(paramId);
        }
        if (mapping.trigger !== undefined) {
          if (mapping.trigger && typeof mapping.trigger === 'object') {
            entry.trigger = normalizeTriggerConfig(mapping.trigger);
          }
        } else if (prev[paramId]?.trigger && typeof prev[paramId].trigger === 'object') {
          entry.trigger = normalizeTriggerConfig(prev[paramId].trigger);
        }
        next[paramId] = entry;
        // Reset debug snapshot whenever the mapping definition changes.
        delete mappingDebugRef.current[paramId];
      }
      return next;
    });
  }, [persistMappings]);

  // Clear mapping for a parameter (reset to default or none)
  const clearMapping = useCallback((paramId) => {
    if (!paramId) return;
    persistMappings((prev) => {
      const next = { ...prev };
      delete next[paramId];
      return next;
    });
    delete mappingDebugRef.current[paramId];
    delete triggerStateRef.current[paramId];
  }, [persistMappings]);

  // Set mappings from external source (e.g., JSON import)
  const setMappingsFromExternal = useCallback((obj) => {
    if (obj && typeof obj === 'object') {
      // Ensure fresh dispatch after a wholesale mapping swap.
      lastValuesRef.current = {};
      modeProcessor.clearAll();
      persistMappings({ ...obj });
      mappingDebugRef.current = {};
      triggerStateRef.current = {};
    }
  }, [persistMappings]);

  // Begin learn mode for a parameter
  const beginLearn = useCallback((paramId) => {
    setLearnParamId(paramId || null);
  }, []);

  // Cancel learn mode
  const cancelLearn = useCallback(() => {
    setLearnParamId(null);
  }, []);

  // Get mapping for a parameter
  const getMapping = useCallback((paramId) => {
    return effectiveMappings[paramId] || null;
  }, [effectiveMappings]);

  // Dispatch audio values to registered handlers using RAF with throttling
  // This replaces the previous useEffect-on-features approach to:
  // 1. Reduce dispatch frequency from ~60fps to ~20fps (matching BPM)
  // 2. Pause dispatch when user is actively adjusting controls (hold-off)
  // 3. Skip dispatch when values haven't changed significantly
  const effectiveMappingsRef = useRef(effectiveMappings);
  effectiveMappingsRef.current = effectiveMappings;

  useEffect(() => {
    if (!isActive || !settings.enabled) return;

    let frameId = null;
    let lastDispatchTime = 0;
    const THROTTLE_MS = 50; // Dispatch at most 20 times per second (matching BPM)

    const dispatch = () => {
      const now = performance.now();

      // Throttle: skip if called too soon
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
      const currentFeatures = getFeatures();
      
      // Calculate dt for framerate-independent mode processing
      const prevTime = lastDispatchTimeRef.current;
      const dt = Math.min(0.2, (now - prevTime) / 1000); // Cap at 200ms
      lastDispatchTimeRef.current = now;

      handlers.forEach((handlerSet, paramId) => {
        const mapping = mappings[paramId];
        if (!mapping || mapping.band === 'none') return;

        const rawBandValue = currentFeatures[mapping.band] || 0;
        // Apply per-mapping gain (default 1.0)
        const gain = Number.isFinite(Number(mapping.gain)) ? Math.max(0, Number(mapping.gain)) : 1;
        const bandValue = Math.min(1, rawBandValue * gain);
        
        // Apply mode processing if a non-direct mode is set
        const mode = mapping.mode || 'direct';
        const modeSettings = mapping.modeSettings || DEFAULT_MODE_SETTINGS[mode];
        const processedValue = modeProcessor.process(
          paramId, bandValue, currentFeatures, mode, modeSettings, dt
        );
        if (!Number.isFinite(processedValue)) return;
        
        // Map the processed 0-1 value through the output range
        const mappedValue = mapRange(processedValue, mapping.range);
        if (!Number.isFinite(mappedValue)) return;

        const triggerCfg = normalizeTriggerConfig(mapping.trigger);
        const triggerEnabled = !!triggerCfg.enabled;
        let triggered = false;
        let triggerDirection = null;
        let triggerActive = false;
        let triggerSourceValue = resolveTriggerSourceValue(triggerCfg.source, bandValue, processedValue);

        if (triggerEnabled) {
          const prior = triggerStateRef.current[paramId] || {
            above: false,
            lastTriggerMs: -Infinity,
            lastSource: 0,
          };

          let above = !!prior.above;
          let crossedUp = false;
          let crossedDown = false;

          if (above) {
            if (triggerSourceValue <= triggerCfg.fallThreshold) {
              above = false;
              crossedDown = true;
            }
          } else if (triggerSourceValue >= triggerCfg.riseThreshold) {
            above = true;
            crossedUp = true;
          }

          const canTrigger = (now - (prior.lastTriggerMs || -Infinity)) >= triggerCfg.cooldownMs;
          if (crossedUp && canTrigger) {
            triggered = true;
            triggerDirection = 'up';
            prior.lastTriggerMs = now;
          } else if (crossedDown && canTrigger) {
            triggered = true;
            triggerDirection = 'down';
            prior.lastTriggerMs = now;
          }

          prior.above = above;
          prior.lastSource = triggerSourceValue;
          triggerStateRef.current[paramId] = prior;
          triggerActive = above;
        } else {
          delete triggerStateRef.current[paramId];
        }

        mappingDebugRef.current[paramId] = {
          paramId,
          band: mapping.band,
          mode,
          range: mapping.range || DEFAULT_RANGE,
          raw: bandValue,
          processed: processedValue,
          mapped: mappedValue,
          trigger: triggerEnabled
            ? {
                source: triggerCfg.source,
                mode: triggerCfg.mode,
                riseThreshold: triggerCfg.riseThreshold,
                fallThreshold: triggerCfg.fallThreshold,
                reverseOnFall: !!triggerCfg.reverseOnFall,
                sourceValue: triggerSourceValue,
                active: triggerActive,
                triggered,
                direction: triggerDirection,
              }
            : null,
          updatedAt: Date.now(),
        };

        let shouldDispatch = true;
        if (triggerEnabled) {
          switch (triggerCfg.mode) {
            case 'crossUp':
              shouldDispatch = triggered && triggerDirection === 'up';
              break;
            case 'crossDown':
              shouldDispatch = triggered && triggerDirection === 'down';
              break;
            case 'both':
              shouldDispatch = triggered;
              break;
            case 'whileAbove':
              shouldDispatch = triggerActive || (triggered && triggerDirection === 'down' && triggerCfg.reverseOnFall);
              break;
            default:
              shouldDispatch = true;
              break;
          }
        }
        if (!shouldDispatch) return;

        // Skip dispatch if value hasn't changed significantly
        const lastValue = lastValuesRef.current[paramId];
        const threshold = 0.005; // 0.5% change threshold
        const bypassChangeThreshold = triggerEnabled && triggered;
        if (!bypassChangeThreshold && lastValue !== undefined && Math.abs(mappedValue - lastValue) < threshold) return;
        lastValuesRef.current[paramId] = mappedValue;

        // Send the mapped value, raw audio level, and processed value
        handlerSet.forEach(fn => {
          try {
            fn({
              value01: mappedValue,
              band: mapping.band,
              raw: rawBandValue,
              processed: processedValue,
              gain,
              triggered,
              triggerDirection,
              triggerActive,
              triggerSourceValue,
              triggerMode: triggerEnabled ? triggerCfg.mode : null,
              triggerReverseOnFall: triggerEnabled ? !!triggerCfg.reverseOnFall : false,
              triggerAction: triggerEnabled ? (triggerCfg.action || 'modulate') : null,
            });
          } catch { /* noop */ }
        });
      });

      frameId = requestAnimationFrame(dispatch);
    };

    frameId = requestAnimationFrame(dispatch);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [isActive, settings.enabled, getFeatures]); // Read fresh features from ref getter

  // Toggle audio on/off
  const toggleAudio = useCallback(() => {
    setSettings(prev => ({ ...prev, enabled: !prev.enabled }));
  }, []);

  // Set audio enabled state
  const setAudioEnabled = useCallback((enabled) => {
    setSettings(prev => ({ ...prev, enabled: !!enabled }));
  }, []);

  // Set sensitivity (0..3 for more range)
  const setSensitivity = useCallback((value) => {
    const v = Math.max(0, Math.min(3, Number(value) || 1));
    setSettings(prev => ({ ...prev, sensitivity: v }));
  }, []);

  // Set per-band sensitivities (0..3)
  const setBassSensitivity = useCallback((value) => {
    const v = Math.max(0, Math.min(3, Number(value) || 1));
    setSettings(prev => ({ ...prev, bassSensitivity: v }));
  }, []);

  const setMidsSensitivity = useCallback((value) => {
    const v = Math.max(0, Math.min(3, Number(value) || 1));
    setSettings(prev => ({ ...prev, midsSensitivity: v }));
  }, []);

  const setHighsSensitivity = useCallback((value) => {
    const v = Math.max(0, Math.min(3, Number(value) || 1));
    setSettings(prev => ({ ...prev, highsSensitivity: v }));
  }, []);

  // Set smoothing (0..1)
  const setSmoothing = useCallback((value) => {
    const v = Math.max(0, Math.min(1, Number(value) || 0.7));
    setSettings(prev => ({ ...prev, smoothing: v }));
  }, []);

  // Set release (0..1)
  const setRelease = useCallback((value) => {
    const v = Math.max(0, Math.min(1, Number(value) || 0.85));
    setSettings(prev => ({ ...prev, release: v }));
  }, []);

  // Set device ID
  const setDeviceId = useCallback((deviceId) => {
    setSettings(prev => ({ ...prev, deviceId: deviceId || null }));
    if (deviceId) {
      switchDevice(deviceId);
    }
  }, [switchDevice]);

  // Get the audio level for a specific band
  const getBandValue = useCallback((band) => {
    const features = getFeatures();
    return features?.[band] || 0;
  }, [getFeatures]);

  const getMappingDebugValue = useCallback((paramId) => (
    mappingDebugRef.current[paramId] || null
  ), []);

  const getAllMappingDebug = useCallback(() => {
    return { ...mappingDebugRef.current };
  }, []);

  // Get a snapshot of audio settings and mappings for export/preset save
  const getAudioSnapshot = useCallback(() => ({
    settings: {
      // Don't include 'enabled' - that's runtime state, not config
      sensitivity: settings.sensitivity,
      bassSensitivity: settings.bassSensitivity,
      midsSensitivity: settings.midsSensitivity,
      highsSensitivity: settings.highsSensitivity,
      smoothing: settings.smoothing,
      release: settings.release,
      // Don't include deviceId - that's machine-specific
    },
    mappings: { ...storedMappings },
  }), [settings, storedMappings]);

  // Apply a snapshot of audio settings and mappings from import/preset recall
  const applyAudioSnapshot = useCallback((snapshot) => {
    if (!snapshot || typeof snapshot !== 'object') return;
    
    // Apply settings (merge with current, don't overwrite enabled/deviceId)
    if (snapshot.settings && typeof snapshot.settings === 'object') {
      setSettings(prev => ({
        ...prev,
        sensitivity: snapshot.settings.sensitivity ?? prev.sensitivity,
        bassSensitivity: snapshot.settings.bassSensitivity ?? prev.bassSensitivity,
        midsSensitivity: snapshot.settings.midsSensitivity ?? prev.midsSensitivity,
        highsSensitivity: snapshot.settings.highsSensitivity ?? prev.highsSensitivity,
        smoothing: snapshot.settings.smoothing ?? prev.smoothing,
        release: snapshot.settings.release ?? prev.release,
      }));
    }
    
    // Apply mappings
    if (snapshot.mappings && typeof snapshot.mappings === 'object') {
      setMappingsFromExternal(snapshot.mappings);
    }
  }, [setMappingsFromExternal]);

  // Clear all audio mappings
  const clearAllMappings = useCallback(() => {
    setMappingsFromExternal({});
  }, [setMappingsFromExternal]);

  const value = useMemo(() => ({
    // State
    isActive,
    error,
    getFeatures, // Use getter instead of features directly to avoid re-renders
    settings,
    mappings: effectiveMappings,
    availableDevices,
    currentDeviceId,
    learnParamId,

    // Actions
    toggleAudio,
    setAudioEnabled,
    setSensitivity,
    setBassSensitivity,
    setMidsSensitivity,
    setHighsSensitivity,
    setSmoothing,
    setRelease,
    setDeviceId,
    setMapping,
    clearMapping,
    setMappingsFromExternal,
    getMapping,
    getBandValue,
    getMappingDebugValue,
    getAllMappingDebug,
    refreshDevices,
    registerAudioHandler,
    beginLearn,
    cancelLearn,

    // Direct audio control
    initMic,
    stopAudio,
    switchDevice,

    // File playback
    isFileMode,
    isFilePlaying,
    fileInfo,
    fileProgress,
    hasStoredFile,
    loadAudioFile,
    toggleFilePlayback,
    seekFile,
    stopFilePlayback,

    // Snapshot for export/import
    getAudioSnapshot,
    applyAudioSnapshot,
    clearAllMappings,

    // Helpers
    audioMappingLabel,
    AUDIO_BANDS,
    DEFAULT_RANGE,
    DEFAULT_MODE_SETTINGS,
    AUDIO_TRIGGER_SOURCES,
    AUDIO_TRIGGER_MODES,
    AUDIO_TRIGGER_ACTIONS,
    DEFAULT_TRIGGER,
  }), [
    isActive,
    error,
    getFeatures,
    settings,
    effectiveMappings,
    availableDevices,
    currentDeviceId,
    learnParamId,
    toggleAudio,
    setAudioEnabled,
    setSensitivity,
    setBassSensitivity,
    setMidsSensitivity,
    setHighsSensitivity,
    setSmoothing,
    setRelease,
    setDeviceId,
    setMapping,
    clearMapping,
    setMappingsFromExternal,
    getMapping,
    getBandValue,
    getMappingDebugValue,
    getAllMappingDebug,
    refreshDevices,
    registerAudioHandler,
    beginLearn,
    cancelLearn,
    initMic,
    stopAudio,
    switchDevice,
    isFileMode,
    isFilePlaying,
    fileInfo,
    fileProgress,
    hasStoredFile,
    loadAudioFile,
    toggleFilePlayback,
    seekFile,
    stopFilePlayback,
    getAudioSnapshot,
    applyAudioSnapshot,
    clearAllMappings,
  ]);

  return (
    <AudioReactiveContext.Provider value={value}>
      {children}
    </AudioReactiveContext.Provider>
  );
};

export default AudioProvider;
