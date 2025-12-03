import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useAudio } from '../hooks/useAudio.js';

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
const DEFAULT_RANGE = {
  inputMin: 0,
  inputMax: 1,
  outputMin: 0,
  outputMax: 1,
};

// Default audio settings (global settings only)
const DEFAULT_AUDIO_SETTINGS = {
  enabled: false,
  sensitivity: 1.0,
  smoothing: 0.7, // Increased for slower, more flowing response
  release: 0.85, // Falloff factor: values decay slower (0=instant, 1=never)
  deviceId: null, // null = default device
};

// Default audio mappings for common parameters
// { [paramId]: { band: 'rms'|'bass'|'mids'|'highs'|'none', range: {...} } }
const DEFAULT_AUDIO_MAPPINGS = {
  globalSpeedMultiplier: { band: 'none', range: { inputMin: 0, inputMax: 1, outputMin: 1.0, outputMax: 3.0 } },
  globalOpacity: { band: 'none', range: { inputMin: 0, inputMax: 1, outputMin: 0.3, outputMax: 1.0 } },
  layersCount: { band: 'none', range: { inputMin: 0, inputMax: 1, outputMin: 1, outputMax: 20 } },
};

// Map an input value through a range mapping
export const mapRange = (value, range) => {
  const { inputMin, inputMax, outputMin, outputMax } = range || DEFAULT_RANGE;
  // Clamp input to input range
  const clampedInput = Math.max(inputMin, Math.min(inputMax, value));
  // Normalize to 0-1 within input range
  const inputSpan = inputMax - inputMin;
  const normalized = inputSpan > 0 ? (clampedInput - inputMin) / inputSpan : 0;
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

  // Use the audio hook with current settings
  const {
    isActive,
    error,
    features,
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
    smoothing: settings.smoothing,
    release: settings.release,
    deviceId: settings.deviceId,
  });

  // Use a ref for features to avoid re-renders on every audio frame
  const featuresRef = useRef(features);
  
  // Update the ref whenever features change (useEffect ensures this runs after render)
  useEffect(() => {
    featuresRef.current = features;
  }, [features]);

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
    persistMappings((prev) => {
      const next = { ...prev };
      if (mapping === null || (mapping && mapping.band === 'none')) {
        // Disable mapping
        next[paramId] = { band: 'none', range: DEFAULT_RANGE };
      } else if (mapping && typeof mapping === 'object') {
        // Validate and store
        const range = mapping.range || DEFAULT_RANGE;
        next[paramId] = {
          band: AUDIO_BANDS.includes(mapping.band) ? mapping.band : 'none',
          range: {
            inputMin: Math.max(0, Math.min(1, Number(range.inputMin) || 0)),
            inputMax: Math.max(0, Math.min(1, Number(range.inputMax) || 1)),
            outputMin: Number.isFinite(Number(range.outputMin)) ? Number(range.outputMin) : 0,
            outputMax: Number.isFinite(Number(range.outputMax)) ? Number(range.outputMax) : 1,
          },
        };
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
  }, [persistMappings]);

  // Set mappings from external source (e.g., JSON import)
  const setMappingsFromExternal = useCallback((obj) => {
    if (obj && typeof obj === 'object') {
      persistMappings({ ...obj });
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

  // Dispatch audio values to registered handlers
  useEffect(() => {
    if (!isActive || !settings.enabled) return;

    // Dispatch to all registered handlers based on their mappings
    const handlers = handlersRef.current;
    if (handlers.size === 0) return;

    handlers.forEach((handlerSet, paramId) => {
      const mapping = effectiveMappings[paramId];
      if (!mapping || mapping.band === 'none') return;

      const currentFeatures = featuresRef.current;
      const bandValue = currentFeatures[mapping.band] || 0;
      const value01 = mapRange(bandValue, mapping.range);

      handlerSet.forEach(fn => {
        try {
          fn({ value01, band: mapping.band, raw: bandValue });
        } catch { /* noop */ }
      });
    });
  }, [isActive, settings.enabled, features, effectiveMappings]); // features still needed to trigger dispatch

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

  // Stable getter for features (doesn't cause re-renders)
  const getFeatures = useCallback(() => featuresRef.current, []);

  // Get the audio level for a specific band
  const getBandValue = useCallback((band) => {
    return featuresRef.current[band] || 0;
  }, []);

  // Get a snapshot of audio settings and mappings for export/preset save
  const getAudioSnapshot = useCallback(() => ({
    settings: {
      // Don't include 'enabled' - that's runtime state, not config
      sensitivity: settings.sensitivity,
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
    setSmoothing,
    setRelease,
    setDeviceId,
    setMapping,
    clearMapping,
    setMappingsFromExternal,
    getMapping,
    getBandValue,
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
    setSmoothing,
    setRelease,
    setDeviceId,
    setMapping,
    clearMapping,
    setMappingsFromExternal,
    getMapping,
    getBandValue,
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
