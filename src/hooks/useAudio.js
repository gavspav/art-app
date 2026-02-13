import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * useAudio - Web Audio API hook for audio-reactive features
 * 
 * Captures audio input from default device and extracts audio features:
 * - RMS (overall level)
 * - Bass, Mids, Highs (frequency bands)
 * 
 * All values are smoothed for organic animation response.
 */

const DEFAULT_SMOOTHING = 0.7; // 0..1, higher = more responsive
const DEFAULT_RELEASE = 0.85; // 0..1, higher = slower falloff

// IndexedDB helpers for persisting audio file
const DB_NAME = 'artapp-audio';
const DB_STORE = 'audioFile';
const DB_VERSION = 1;

const isQuotaExceededError = (err) => {
  if (!err) return false;
  const name = err.name || '';
  const message = err.message || '';
  return name === 'QuotaExceededError'
    || name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || message.toLowerCase().includes('quota');
};

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
  });
};

const saveFileToIDB = async (file, wasPlaying = false, playbackPosition = 0) => {
  try {
    const db = await openDB();
    const arrayBuffer = await file.arrayBuffer();
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    store.put({ name: file.name, type: file.type, data: arrayBuffer, wasPlaying, playbackPosition }, 'current');
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return { ok: true };
  } catch (err) {
    if (isQuotaExceededError(err)) {
      console.warn('[useAudio] Storage quota exceeded while saving file to IndexedDB.');
      return { ok: false, reason: 'quota' };
    }
    console.warn('[useAudio] Failed to save file to IndexedDB:', err);
    return { ok: false, reason: 'error' };
  }
};

// Update just the play state and position without re-saving the whole file
const updatePlayStateInIDB = async (wasPlaying, playbackPosition = null) => {
  try {
    const db = await openDB();
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const request = store.get('current');
    const existing = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (existing) {
      existing.wasPlaying = wasPlaying;
      if (playbackPosition !== null) {
        existing.playbackPosition = playbackPosition;
      }
      store.put(existing, 'current');
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('[useAudio] Failed to update play state in IndexedDB:', err);
  }
};

const loadFileFromIDB = async () => {
  try {
    const db = await openDB();
    const tx = db.transaction(DB_STORE, 'readonly');
    const store = tx.objectStore(DB_STORE);
    const request = store.get('current');
    const result = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (result) {
      const file = new File([result.data], result.name, { type: result.type });
      return { file, wasPlaying: !!result.wasPlaying, playbackPosition: result.playbackPosition || 0 };
    }
    return null;
  } catch (err) {
    console.warn('[useAudio] Failed to load file from IndexedDB:', err);
    return null;
  }
};

const clearFileFromIDB = async () => {
  try {
    const db = await openDB();
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    store.delete('current');
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('[useAudio] Failed to clear file from IndexedDB:', err);
  }
};

export const useAudio = ({
  enabled = false,
  sensitivity = 1.0,
  bassSensitivity = 1.0,
  midsSensitivity = 1.0,
  highsSensitivity = 1.0,
  smoothing = DEFAULT_SMOOTHING,
  release = DEFAULT_RELEASE,
  deviceId = null, // null = default device
} = {}) => {
  // Audio state
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState(null);
  const [availableDevices, setAvailableDevices] = useState([]);
  const [currentDeviceId, setCurrentDeviceId] = useState(deviceId);
  // Keep per-frame audio features in a ref to avoid re-rendering the whole app at audio-frame rate.
  const featuresRef = useRef({ rms: 0, bass: 0, mids: 0, highs: 0 });
  
  // File playback state
  const [isFileMode, setIsFileMode] = useState(false);
  const [isFilePlaying, setIsFilePlaying] = useState(false);
  const [fileInfo, setFileInfo] = useState(null); // { name, duration }
  const [fileProgress, setFileProgress] = useState(0); // 0-1
  const [hasStoredFile, setHasStoredFile] = useState(false); // Track if we have a stored file

  // Refs for Web Audio objects
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const streamRef = useRef(null);
  const freqDataRef = useRef(null);
  const timeDataRef = useRef(null);
  const smoothRef = useRef({ rms: 0, bass: 0, mids: 0, highs: 0 });
  const rafIdRef = useRef(null);
  
  // File playback refs
  const audioElementRef = useRef(null);
  const fileSourceRef = useRef(null);
  
  // Refs for settings to avoid stale closures in RAF loop
  const smoothingRef = useRef(smoothing);
  const releaseRef = useRef(release);
  const sensitivityRef = useRef(sensitivity);
  const bassSensitivityRef = useRef(bassSensitivity);
  const midsSensitivityRef = useRef(midsSensitivity);
  const highsSensitivityRef = useRef(highsSensitivity);
  smoothingRef.current = smoothing;
  releaseRef.current = release;
  sensitivityRef.current = sensitivity;
  bassSensitivityRef.current = bassSensitivity;
  midsSensitivityRef.current = midsSensitivity;
  highsSensitivityRef.current = highsSensitivity;

  // Extract audio features from analyser
  const getAudioFeatures = useCallback(() => {
    const analyser = analyserRef.current;
    const freqData = freqDataRef.current;
    const timeData = timeDataRef.current;

    if (!analyser || !freqData || !timeData) {
      return { rms: 0, bass: 0, mids: 0, highs: 0 };
    }

    analyser.getByteFrequencyData(freqData);
    analyser.getByteTimeDomainData(timeData);

    // Calculate RMS from time domain data
    let sum = 0;
    for (let i = 0; i < timeData.length; i++) {
      const v = (timeData[i] - 128) / 128; // normalize to -1..1
      sum += v * v;
    }
    const rms = Math.sqrt(sum / timeData.length); // 0..~1

    // Calculate frequency band energies
    const n = freqData.length;
    const band = (from, to) => {
      let s = 0;
      let c = 0;
      const start = Math.floor(from);
      const end = Math.floor(to);
      for (let i = start; i < end && i < n; i++) {
        s += freqData[i];
        c++;
      }
      return c > 0 ? s / (c * 255) : 0; // normalized 0..1
    };

    // Split into 3 bands: bass (0-10%), mids (10-40%), highs (40-90%)
    const bass = band(0, n * 0.1);
    const mids = band(n * 0.1, n * 0.4);
    const highs = band(n * 0.4, n * 0.9);

    return { rms, bass, mids, highs };
  }, []);

  // Update loop - runs on animation frame when active
  // Uses refs for settings to avoid stale closures
  const updateAudio = useCallback(() => {
    if (!analyserRef.current) return;

    const raw = getAudioFeatures();
    const smooth = smoothRef.current;
    const currentSmoothing = smoothingRef.current;
    const currentRelease = releaseRef.current;
    const currentSensitivity = sensitivityRef.current;
    const currentBassSensitivity = bassSensitivityRef.current;
    const currentMidsSensitivity = midsSensitivityRef.current;
    const currentHighsSensitivity = highsSensitivityRef.current;

    // Asymmetric smoothing: fast attack, slow release
    // Use smoothing for attack (raw > smooth), release for decay (raw < smooth)
    const applySmoothing = (rawVal, smoothVal) => {
      if (rawVal > smoothVal) {
        // Attack: use smoothing factor
        return currentSmoothing * rawVal + (1 - currentSmoothing) * smoothVal;
      } else {
        // Release: use release factor (slower decay)
        return currentRelease * smoothVal + (1 - currentRelease) * rawVal;
      }
    };

    smooth.rms = applySmoothing(raw.rms, smooth.rms);
    smooth.bass = applySmoothing(raw.bass, smooth.bass);
    smooth.mids = applySmoothing(raw.mids, smooth.mids);
    smooth.highs = applySmoothing(raw.highs, smooth.highs);

    // Apply sensitivity scaling
    const scaled = {
      rms: Math.min(1, smooth.rms * currentSensitivity),
      bass: Math.min(1, smooth.bass * currentSensitivity * currentBassSensitivity),
      mids: Math.min(1, smooth.mids * currentSensitivity * currentMidsSensitivity),
      highs: Math.min(1, smooth.highs * currentSensitivity * currentHighsSensitivity),
    };

    // Mutate in place to avoid allocations; consumers read via getFeatures().
    featuresRef.current.rms = scaled.rms;
    featuresRef.current.bass = scaled.bass;
    featuresRef.current.mids = scaled.mids;
    featuresRef.current.highs = scaled.highs;

    rafIdRef.current = requestAnimationFrame(updateAudio);
  }, [getAudioFeatures]); // Only depends on getAudioFeatures, settings read from refs

  // Enumerate available audio input devices
  const refreshDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      setAvailableDevices(audioInputs);
      return audioInputs;
    } catch (err) {
      console.warn('[useAudio] Failed to enumerate devices:', err);
      return [];
    }
  }, []);

  // Initialize audio input
  const initAudio = useCallback(async (targetDeviceId = null) => {
    try {
      setError(null);

      // Create audio context
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        throw new Error('Web Audio API not supported');
      }

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;

      // Resume context if suspended (required by some browsers)
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      // Create analyser
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.3;
      analyserRef.current = analyser;

      // Create data arrays
      freqDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      timeDataRef.current = new Uint8Array(analyser.fftSize);

      // Build audio constraints - use default device if no specific device requested
      const audioConstraints = targetDeviceId
        ? { deviceId: { exact: targetDeviceId } }
        : true; // true = use default device

      // Get audio stream from default or specified device
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      streamRef.current = stream;

      // Get actual device ID from the stream
      const tracks = stream.getAudioTracks();
      if (tracks.length > 0) {
        const settings = tracks[0].getSettings();
        setCurrentDeviceId(settings.deviceId || null);
      }

      // Connect audio source to analyser
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;

      // Refresh device list after successful connection
      await refreshDevices();

      setIsActive(true);

      // Start update loop
      rafIdRef.current = requestAnimationFrame(updateAudio);

      return true;
    } catch (err) {
      console.error('[useAudio] Failed to initialize audio:', err);
      setError(err.message || 'Failed to access audio input');
      setIsActive(false);
      return false;
    }
  }, [updateAudio, refreshDevices]);

  // Legacy alias for backward compatibility
  const initMic = useCallback(() => initAudio(currentDeviceId), [initAudio, currentDeviceId]);

  // Stop audio capture
  const stopAudio = useCallback(() => {
    // Cancel animation frame
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    // Stop media stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Disconnect source
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch { /* noop */ }
      sourceRef.current = null;
    }

    // Close audio context
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch { /* noop */ }
      audioCtxRef.current = null;
    }

    analyserRef.current = null;
    freqDataRef.current = null;
    timeDataRef.current = null;

    // Reset smoothed values
    smoothRef.current = { rms: 0, bass: 0, mids: 0, highs: 0 };
    featuresRef.current = { rms: 0, bass: 0, mids: 0, highs: 0 };
    setIsActive(false);
    setError(null);
  }, []);

  // Switch to a different audio device
  const switchDevice = useCallback(async (newDeviceId) => {
    // Stop current audio first
    stopAudio();
    setCurrentDeviceId(newDeviceId);
    // Will be restarted by the enabled effect if enabled
  }, [stopAudio]);

  // Load and play audio from file (with optional persistence)
  const loadAudioFile = useCallback(async (file, { persist = true } = {}) => {
    try {
      setError(null);
      
      // Stop any existing audio
      stopAudio();
      
      // Create audio context
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        throw new Error('Web Audio API not supported');
      }

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;

      // Resume context if suspended
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      // Create analyser
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.3;
      analyserRef.current = analyser;

      // Create data arrays
      freqDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      timeDataRef.current = new Uint8Array(analyser.fftSize);

      // Create audio element for file playback
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audioElementRef.current = audio;

      // Create object URL for the file
      const url = URL.createObjectURL(file);
      audio.src = url;

      // Wait for metadata to load
      await new Promise((resolve, reject) => {
        audio.onloadedmetadata = resolve;
        audio.onerror = () => reject(new Error('Failed to load audio file'));
      });

      // Create media element source and connect to analyser
      const source = audioCtx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(audioCtx.destination); // Connect to speakers for playback
      fileSourceRef.current = source;

      // Set file info
      setFileInfo({
        name: file.name,
        duration: audio.duration,
      });

      // Track progress
      audio.ontimeupdate = () => {
        if (audio.duration > 0) {
          setFileProgress(audio.currentTime / audio.duration);
        }
      };

      // Handle end of playback
      audio.onended = () => {
        setIsFilePlaying(false);
        setFileProgress(0);
        audio.currentTime = 0;
      };

      setIsFileMode(true);
      setIsActive(true);

      // Persist file to IndexedDB for restoration
      if (persist) {
        const saveResult = await saveFileToIDB(file);
        if (saveResult.ok) {
          setHasStoredFile(true);
        } else {
          setHasStoredFile(false);
          if (saveResult.reason === 'quota') {
            setError('Storage quota exceeded. Audio file will not persist after reload.');
          }
        }
      }

      // Start update loop
      rafIdRef.current = requestAnimationFrame(updateAudio);

      return true;
    } catch (err) {
      console.error('[useAudio] Failed to load audio file:', err);
      setError(err.message || 'Failed to load audio file');
      setIsActive(false);
      setIsFileMode(false);
      return false;
    }
  }, [stopAudio, updateAudio]);
  
  // Restore file from IndexedDB (called when audio is re-enabled)
  const restoreFileFromStorage = useCallback(async () => {
    const stored = await loadFileFromIDB();
    if (stored) {
      const success = await loadAudioFile(stored.file, { persist: false });
      if (success) {
        const audio = audioElementRef.current;
        if (audio) {
          // Restore playback position
          if (stored.playbackPosition && audio.duration) {
            audio.currentTime = stored.playbackPosition;
          }
          // Auto-play if it was playing when disabled
          if (stored.wasPlaying) {
            audio.play().then(() => {
              setIsFilePlaying(true);
            }).catch(err => {
              console.warn('[useAudio] Auto-play failed (may need user interaction):', err);
            });
          }
        }
      }
      return success;
    }
    return false;
  }, [loadAudioFile]);

  // Play/pause file
  const toggleFilePlayback = useCallback(() => {
    const audio = audioElementRef.current;
    if (!audio) return;

    if (audio.paused) {
      audio.play().then(() => {
        setIsFilePlaying(true);
        // Save play state
        updatePlayStateInIDB(true);
      }).catch(err => {
        console.error('[useAudio] Failed to play:', err);
        setError('Failed to play audio');
      });
    } else {
      audio.pause();
      setIsFilePlaying(false);
      // Save play state and current position
      updatePlayStateInIDB(false, audio.currentTime);
    }
  }, []);

  // Seek in file
  const seekFile = useCallback((progress) => {
    const audio = audioElementRef.current;
    if (!audio || !audio.duration) return;
    audio.currentTime = progress * audio.duration;
    setFileProgress(progress);
  }, []);

  // Stop file playback and switch back to mic mode
  const stopFilePlayback = useCallback((clearStorage = true) => {
    const audio = audioElementRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
      audioElementRef.current = null;
    }
    
    if (fileSourceRef.current) {
      try {
        fileSourceRef.current.disconnect();
      } catch { /* noop */ }
      fileSourceRef.current = null;
    }

    setIsFileMode(false);
    setIsFilePlaying(false);
    setFileInfo(null);
    setFileProgress(0);
    
    // Clear from IndexedDB if requested (user explicitly closed the file)
    if (clearStorage) {
      clearFileFromIDB();
      setHasStoredFile(false);
    }
    
    // Stop the rest of audio
    stopAudio();
  }, [stopAudio]);
  
  // Check for stored file on mount
  useEffect(() => {
    loadFileFromIDB().then(stored => {
      setHasStoredFile(!!stored);
    });
  }, []);

  // Handle enabled state changes
  useEffect(() => {
    if (enabled && !isActive && !isFileMode) {
      // Check if we have a stored file to restore
      if (hasStoredFile) {
        restoreFileFromStorage();
      } else {
        initAudio(currentDeviceId);
      }
    } else if (!enabled && isActive) {
      if (isFileMode) {
        // Save current position before disabling
        const audio = audioElementRef.current;
        if (audio) {
          updatePlayStateInIDB(isFilePlaying, audio.currentTime);
        }
        // Don't clear storage when just disabling - preserve the file
        stopFilePlayback(false);
      } else {
        stopAudio();
      }
    }
  }, [enabled, isActive, isFileMode, isFilePlaying, hasStoredFile, currentDeviceId, initAudio, stopAudio, stopFilePlayback, restoreFileFromStorage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, [stopAudio]);

  // Refresh devices on mount
  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  return {
    isActive,
    error,
    getFeatures: () => featuresRef.current,
    availableDevices,
    currentDeviceId,
    initMic,
    initAudio,
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
  };
};

export default useAudio;
