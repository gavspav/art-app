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

export const useAudio = ({
  enabled = false,
  sensitivity = 1.0,
  smoothing = DEFAULT_SMOOTHING,
  release = DEFAULT_RELEASE,
  deviceId = null, // null = default device
} = {}) => {
  // Audio state
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState(null);
  const [availableDevices, setAvailableDevices] = useState([]);
  const [currentDeviceId, setCurrentDeviceId] = useState(deviceId);
  const [features, setFeatures] = useState({
    rms: 0,
    bass: 0,
    mids: 0,
    highs: 0,
  });

  // Refs for Web Audio objects
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const streamRef = useRef(null);
  const freqDataRef = useRef(null);
  const timeDataRef = useRef(null);
  const smoothRef = useRef({ rms: 0, bass: 0, mids: 0, highs: 0 });
  const rafIdRef = useRef(null);

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
  const updateAudio = useCallback(() => {
    if (!analyserRef.current) return;

    const raw = getAudioFeatures();
    const smooth = smoothRef.current;

    // Asymmetric smoothing: fast attack, slow release
    // Use smoothing for attack (raw > smooth), release for decay (raw < smooth)
    const applySmoothing = (rawVal, smoothVal) => {
      if (rawVal > smoothVal) {
        // Attack: use smoothing factor
        return smoothing * rawVal + (1 - smoothing) * smoothVal;
      } else {
        // Release: use release factor (slower decay)
        return release * smoothVal + (1 - release) * rawVal;
      }
    };

    smooth.rms = applySmoothing(raw.rms, smooth.rms);
    smooth.bass = applySmoothing(raw.bass, smooth.bass);
    smooth.mids = applySmoothing(raw.mids, smooth.mids);
    smooth.highs = applySmoothing(raw.highs, smooth.highs);

    // Apply sensitivity scaling
    const scaled = {
      rms: Math.min(1, smooth.rms * sensitivity),
      bass: Math.min(1, smooth.bass * sensitivity),
      mids: Math.min(1, smooth.mids * sensitivity),
      highs: Math.min(1, smooth.highs * sensitivity),
    };

    setFeatures(scaled);

    rafIdRef.current = requestAnimationFrame(updateAudio);
  }, [getAudioFeatures, smoothing, release, sensitivity]);

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
    setFeatures({ rms: 0, bass: 0, mids: 0, highs: 0 });
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

  // Handle enabled state changes
  useEffect(() => {
    if (enabled && !isActive) {
      initAudio(currentDeviceId);
    } else if (!enabled && isActive) {
      stopAudio();
    }
  }, [enabled, isActive, currentDeviceId, initAudio, stopAudio]);

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
    features,
    availableDevices,
    currentDeviceId,
    initMic,
    initAudio,
    stopAudio,
    switchDevice,
    refreshDevices,
  };
};

export default useAudio;
