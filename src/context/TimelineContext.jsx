import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { evaluateTrackAtTime, evaluateShapeTrackAtTime } from '../utils/envelopes.js';
import {
  computeEnergyFlux,
  detectTransientsFromFlux,
  sensitivityToThreshold,
  buildMultiBandEnergyMap,
} from '../utils/audioTransients.js';
import {
  generateVariedLayer,
  extractKeyframeData,
  generateEvenlySpacedTimes,
  generateRandomTimes,
  selectTopTransientTimes,
  generateRerollSeed,
  computeTemporalVariationScales,
} from '../utils/variationKeyframe.js';
import { lerpNodes, lerpSubpaths } from '../utils/nodeUtils.js';
import { saveTimelineAudio, loadTimelineAudio, clearTimelineAudio } from '../utils/timelineAudioStorage.js';
import {
  applyNodeModulation,
  applyNodeModulationToSubpaths,
  generateKeyframePhase,
  DEFAULT_NODE_MOD_CONFIG,
} from '../utils/nodeModulation.js';
import { hslToHex } from '../utils/colorUtils.js';

/**
 * TimelineContext - Global timeline automation state provider
 * 
 * Provides seconds-based timeline automation for parameter control.
 * Features:
 * - Seconds-based playback (one-shot with optional global loop)
 * - Multiple tracks with keyframe-based curves
 * - Per-layer and global parameter targeting
 * - Audio file waveform display (optional)
 * - Integration with modulation store for parameter application
 */

const TimelineContext = createContext();

export const useTimeline = () => useContext(TimelineContext);

// LocalStorage keys
const LS_TIMELINE_SESSION = 'artapp-timeline-session';
const LS_TIMELINE_SETTINGS = 'artapp-timeline-settings';

// Default timeline length (seconds)
const DEFAULT_LENGTH_SECONDS = 60;

// Default track colors (cycle through these)
const TRACK_COLORS = [
  '#4fc3f7', // cyan
  '#81c784', // green
  '#ffb74d', // orange
  '#f06292', // pink
  '#ba68c8', // purple
  '#4db6ac', // teal
  '#fff176', // yellow
  '#ff8a65', // coral
];

/**
 * Generate a unique ID
 */
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

/**
 * Create a default numeric keyframe
 */
const createKeyframe = (timeSeconds, value01, curve = 'linear', tension = 0.5) => ({
  id: generateId(),
  timeSeconds,
  value01,
  curve,
  tension,
});

/**
 * Create a color keyframe (stores a hex string)
 */
const createColorKeyframe = (timeSeconds, color = '#ffffff') => ({
  id: generateId(),
  timeSeconds,
  color,
});

const scaleVariationWeights = (weights, scale = 1) => ({
  shape: (weights?.shape ?? 0) * scale,
  anim: (weights?.anim ?? 0) * scale,
  color: (weights?.color ?? 0) * scale,
  position: (weights?.position ?? 0) * scale,
  scale: (weights?.scale ?? 0) * scale,
});

const normalizeKeyframeTimes = (times, epsilon = 0.01) => {
  if (!Array.isArray(times) || times.length === 0) return [];
  const sorted = times.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return [];
  const normalized = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const t = sorted[i];
    if (Math.abs(t - normalized[normalized.length - 1]) >= epsilon) {
      normalized.push(t);
    }
  }
  return normalized;
};

/**
 * Create a shape keyframe (stores node geometry snapshot)
 * Extended to optionally include animation and color parameters.
 *
 * For visualization in the curve editor, we also derive a display-only value01
 * from the X position (0-1). This does NOT affect playback; shape tracks use
 * the full position object, not value01, when evaluating.
 */
const createShapeKeyframe = (timeSeconds, nodes, subpaths, label = '', extras = {}) => {
  const pos = extras.position || null;
  const displayValue01 =
    pos && typeof pos.x === 'number'
      ? Math.max(0, Math.min(1, pos.x))
      : 0.5;

  return {
    id: generateId(),
    timeSeconds,
    nodes: nodes || null,
    subpaths: subpaths || null,
    label,
    // Proxy value for curve editor visualization only
    value01: displayValue01,
    // Extended layer preset data (optional)
    position: pos,                    // { x, y, scale, xOffset, yOffset } - layer position
    shapeParams: extras.shapeParams || null, // { numSides, curviness, radiusFactor, radiusFactorX, radiusFactorY, rotation }
    animation: extras.animation || null,    // { movementStyle, movementSpeed, movementAngle, scaleSpeed, scaleMin, scaleMax }
    colors: Array.isArray(extras.colors) ? extras.colors : null, // array of hex colors
    enabled: extras.enabled !== undefined ? extras.enabled : true,
  };
};

/**
 * Create a global shape keyframe (stores ALL layers' geometry snapshots)
 * Used by global shape tracks to tween all layers at once.
 *
 * @param {number} timeSeconds - Time position
 * @param {Array} layers - Array of layer data objects, each containing:
 *   { nodes, subpaths, position, shapeParams, animation, colors }
 * @param {string} label - Optional label
 * @param {Object} extras - Additional metadata (variation, curve, tension, etc.)
 */
const createGlobalShapeKeyframe = (timeSeconds, layers, label = '', extras = {}) => {
  return {
    id: generateId(),
    timeSeconds,
    layers: layers || [],
    label,
    // Proxy value for curve editor visualization (use average x position or 0.5)
    value01: 0.5,
    // Curve settings for interpolation
    curve: extras.curve || 'linear',
    tension: extras.tension !== undefined ? extras.tension : 0.5,
    // Variation metadata for regeneration
    variation: extras.variation || null,
    enabled: extras.enabled !== undefined ? extras.enabled : true,
  };
};

/**
 * Create a default track
 * @param {string} name - Track display name
 * @param {string} targetId - e.g., 'layer:abc123:radiusFactor' or 'global:globalSpeedMultiplier' or 'layer:abc123:shape' or 'global:globalShape'
 * @param {string} color - Track color
 * @param {number} lengthSeconds - Timeline length
 * @param {'numeric'|'shape'|'globalShape'|'color'} type - Track type (default: 'numeric')
 */
const createTrack = (name, targetId, color, lengthSeconds, type = 'numeric') => {
  const isShape = type === 'shape' || (targetId && targetId.endsWith(':shape') && !targetId.startsWith('global:globalShape'));
  const isGlobalShape = type === 'globalShape' || targetId === 'global:globalShape';
  const isColor = type === 'color';

  if (isGlobalShape) {
    return {
      id: generateId(),
      name: name || 'Global Shape',
      color,
      enabled: true,
      targetId: 'global:globalShape',
      type: 'globalShape',
      range: null,
      keyframes: [],
      // Category toggles for what to interpolate
      categories: {
        shape: true,      // Interpolate nodes/subpaths
        animation: false, // Interpolate animation params
        color: true,      // Interpolate colors array
      },
    };
  }

  return {
    id: generateId(),
    name,
    color,
    enabled: true,
    targetId,
    type: isShape ? 'shape' : isColor ? 'color' : 'numeric',
    // Numeric tracks have range and numeric keyframes
    // Shape tracks have shape keyframes (no range needed)
    // Color tracks have color keyframes (no range needed)
    range: isShape || isColor ? null : { outputMin: 0, outputMax: 1 },
    keyframes: isShape ? [] : isColor ? [] : [
      createKeyframe(0, 0),
      createKeyframe(lengthSeconds, 1),
    ],
    // Stored keyframes for other parameters on this track.
    // When the user switches parameter, the current keyframes are saved here
    // keyed by targetId, and restored when that parameter is reselected.
    // Format: { [targetId]: { keyframes, range, type } }
    paramKeyframes: {},
    // Which frequency band drives energy scaling for this track
    // Options: 'total', 'low', 'mid', 'high'
    energyBand: 'total',
    // Shape track category toggles (which parameters to interpolate)
    // Only used when type === 'shape'
    categories: isShape ? {
      shape: true,      // Interpolate nodes/subpaths
      animation: false, // Interpolate animation params (movementStyle, speeds, etc.)
      color: true,      // Interpolate colors array
    } : null,
  };
};

/**
 * Default timeline session
 */
const createDefaultSession = () => ({
  id: generateId(),
  lengthSeconds: DEFAULT_LENGTH_SECONDS,
  tracks: [],
  audio: null, // { src, durationSeconds, peaks, offsetSeconds }
  // Optional: snapshot of app state to apply when timeline starts from 0
  startPreset: null,
  loop: {
    enabled: false,
    startSeconds: 0,
    endSeconds: DEFAULT_LENGTH_SECONDS,
  },
});

/**
 * Default timeline settings
 */
const DEFAULT_SETTINGS = {
  visible: false,
  zoom: 1, // pixels per second (will be calculated based on view width)
  scrollLeft: 0,
  timelineSmoothing: 0, // 0..1 low-pass smoothing for timeline modulation
  timelineDamping: 0, // 0..1 compression for timeline modulation extremes
};

// Default transient detection settings
const DEFAULT_TRANSIENT_SETTINGS = {
  enabled: true,
  sensitivity: 50, // 0-100, higher = more transients
  maxMarkers: 1000,
};

export const TimelineProvider = ({ children }) => {
  // Timeline session state (persisted)
  const [session, setSession] = useState(() => {
    try {
      const saved = localStorage.getItem(LS_TIMELINE_SESSION);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Ensure all required fields exist
        return {
          ...createDefaultSession(),
          ...parsed,
          loop: { ...createDefaultSession().loop, ...(parsed.loop || {}) },
        };
      }
    } catch { /* noop */ }
    return createDefaultSession();
  });

  // Timeline settings (UI state, persisted)
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(LS_TIMELINE_SETTINGS);
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  // Playback state (not persisted - runtime only)
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionSeconds, setPositionSeconds] = useState(0);

  // Keyframe clipboard (for copy/paste)
  const [keyframeClipboard, setKeyframeClipboard] = useState(null);

  // Transient detection state
  const [transientSettings, setTransientSettings] = useState(DEFAULT_TRANSIENT_SETTINGS);
  const [transients, setTransients] = useState([]); // Array of { time, strength }
  const audioFluxRef = useRef(null); // Cached flux data for re-detection on threshold change
  const [energyMap, setEnergyMap] = useState({ total: [], low: [], mid: [], high: [] }); // Multi-band: { total, low, mid, high } each Array<{ time, energy, normalized }>

  // Refs for RAF loop
  const lastUpdateTimeRef = useRef(null);
  const animationFrameRef = useRef(null);
  const positionRef = useRef(positionSeconds);
  const sessionRef = useRef(session);
  const isPlayingRef = useRef(isPlaying);

  // Audio playback refs
  const audioContextRef = useRef(null);
  const audioSourceRef = useRef(null);
  const audioStartTimeRef = useRef(0);
  const audioStartPositionRef = useRef(0);

  // Audio capture for recording
  const audioDestinationRef = useRef(null); // MediaStreamDestination for recording
  const audioGainRef = useRef(null); // Gain node to route audio to both destination and capture

  // Timing refs for RAF loop (used by seekTo and tick)
  const playStartTimeRef = useRef(0); // performance.now() when playback started
  const playStartPositionRef = useRef(0); // timeline position when playback started
  const frameCountRef = useRef(0);

  // Keep refs in sync
  useEffect(() => { positionRef.current = positionSeconds; }, [positionSeconds]);
  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // Persist session
  useEffect(() => {
    try {
      // Don't persist audio buffer data, just metadata
      const toSave = {
        ...session,
        audio: session.audio ? {
          durationSeconds: session.audio.durationSeconds,
          offsetSeconds: session.audio.offsetSeconds,
          // Don't save peaks or src (too large)
        } : null,
      };
      localStorage.setItem(LS_TIMELINE_SESSION, JSON.stringify(toSave));
    } catch { /* noop */ }
  }, [session]);

  // Persist settings
  useEffect(() => {
    try {
      localStorage.setItem(LS_TIMELINE_SETTINGS, JSON.stringify(settings));
    } catch { /* noop */ }
  }, [settings]);

  // --- Audio Playback Helpers ---

  const startAudioPlayback = useCallback((startPosition) => {
    const audio = sessionRef.current.audio;
    if (!audio?.buffer) return;

    try {
      // Create audio context if needed
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }

      // Stop any existing playback
      if (audioSourceRef.current) {
        try { audioSourceRef.current.stop(); } catch { /* noop */ }
        audioSourceRef.current = null;
      }

      const ctx = audioContextRef.current;
      const source = ctx.createBufferSource();
      source.buffer = audio.buffer;

      // Create gain node and media stream destination if not already created
      // This allows us to capture audio for recording while still playing to speakers
      if (!audioGainRef.current) {
        audioGainRef.current = ctx.createGain();
        audioGainRef.current.connect(ctx.destination);
      }
      if (!audioDestinationRef.current) {
        audioDestinationRef.current = ctx.createMediaStreamDestination();
        audioGainRef.current.connect(audioDestinationRef.current);
      }

      // Connect source through gain node (which routes to both speakers and capture)
      source.connect(audioGainRef.current);

      // Calculate audio offset: timeline position + audio offset within the audio file
      // audioOffset allows the audio to be shifted relative to the timeline
      const audioOffset = audio.offsetSeconds || 0;
      const audioPosition = startPosition + audioOffset;

      // Clamp to valid range within the audio buffer
      const clampedOffset = Math.max(0, Math.min(audioPosition, audio.durationSeconds));

      // Only start if we're within the audio duration
      if (clampedOffset < audio.durationSeconds) {
        source.start(0, clampedOffset);
        audioSourceRef.current = source;
        audioStartTimeRef.current = ctx.currentTime;
        audioStartPositionRef.current = clampedOffset;
      }
    } catch (error) {
      console.warn('Failed to start audio playback:', error);
    }
  }, []);

  // Timeline start preset (app state snapshot applied when playing from t=0)
  const setStartPreset = useCallback((preset) => {
    setSession(prev => ({
      ...prev,
      startPreset: preset || null,
    }));
  }, []);

  const clearStartPreset = useCallback(() => {
    setSession(prev => ({
      ...prev,
      startPreset: null,
    }));
  }, []);

  const stopAudioPlayback = useCallback(() => {
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch { /* noop */ }
      audioSourceRef.current = null;
    }
  }, []);

  // --- Playback Controls ---

  const play = useCallback(() => {
    if (isPlaying) return;
    lastUpdateTimeRef.current = performance.now();
    setIsPlaying(true);

    // Start audio playback
    startAudioPlayback(positionRef.current);
  }, [isPlaying, startAudioPlayback]);

  const pause = useCallback(() => {
    // Snap React state to the exact live position so pause holds the current frame.
    setPositionSeconds(positionRef.current);
    setIsPlaying(false);
    isPlayingRef.current = false;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    stopAudioPlayback();
  }, [stopAudioPlayback]);

  const stop = useCallback(() => {
    pause();
    positionRef.current = 0;
    setPositionSeconds(0);
  }, [pause]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause]);

  const seekTo = useCallback((seconds) => {
    const clamped = Math.max(0, Math.min(sessionRef.current.lengthSeconds, seconds));
    positionRef.current = clamped;
    setPositionSeconds(clamped);

    // If playing, restart audio from new position and reset timing refs
    if (isPlaying) {
      stopAudioPlayback();
      startAudioPlayback(clamped);
      // Reset timing refs so elapsed time calculation starts from new position
      playStartTimeRef.current = performance.now();
      playStartPositionRef.current = clamped;
    }
  }, [isPlaying, startAudioPlayback, stopAudioPlayback]);

  // --- RAF Playback Loop ---
  // Uses audio context time as source of truth when audio is playing
  // Falls back to performance.now() delta accumulation when no audio
  const SYNC_EVERY_N_FRAMES = 3; // Sync to React every 3 frames (~20fps UI updates)

  useEffect(() => {
    if (!isPlaying) return;

    // Record when we started playing for non-audio fallback
    playStartTimeRef.current = performance.now();
    playStartPositionRef.current = positionRef.current;

    const tick = () => {
      const audio = sessionRef.current.audio;
      const audioCtx = audioContextRef.current;
      let newPosition;

      // Use audio context time as source of truth when audio is playing
      if (audio?.buffer && audioCtx && audioSourceRef.current) {
        // Calculate position from audio context's high-precision clock
        const audioElapsed = audioCtx.currentTime - audioStartTimeRef.current;
        const audioOffset = audio.offsetSeconds || 0;
        newPosition = audioStartPositionRef.current - audioOffset + audioElapsed;
      } else {
        // Fallback: calculate from performance.now() elapsed time
        const elapsedMs = performance.now() - playStartTimeRef.current;
        newPosition = playStartPositionRef.current + (elapsedMs / 1000);
      }

      const { lengthSeconds, loop } = sessionRef.current;
      let didLoop = false;

      // Handle looping or end
      if (loop.enabled) {
        // Loop within region
        if (newPosition >= loop.endSeconds) {
          newPosition = loop.startSeconds + ((newPosition - loop.startSeconds) % (loop.endSeconds - loop.startSeconds));
          didLoop = true;
        }
      } else {
        // One-shot: stop at end
        if (newPosition >= lengthSeconds) {
          newPosition = lengthSeconds;
          setIsPlaying(false);
          isPlayingRef.current = false;
          stopAudioPlayback();
        }
      }

      // Clamp to valid range
      newPosition = Math.max(0, Math.min(lengthSeconds, newPosition));

      // Always update the ref (for smooth playhead via getPositionSeconds)
      positionRef.current = newPosition;

      // Only sync to React state periodically to prevent update depth errors
      frameCountRef.current += 1;
      if (frameCountRef.current >= SYNC_EVERY_N_FRAMES) {
        frameCountRef.current = 0;
        setPositionSeconds(newPosition);
      }

      // Restart audio from loop start when looping occurs
      if (didLoop) {
        stopAudioPlayback();
        startAudioPlayback(newPosition);
        // Reset timing refs for the new loop iteration
        playStartTimeRef.current = performance.now();
        playStartPositionRef.current = newPosition;
      }

      if (isPlayingRef.current && newPosition < lengthSeconds) {
        animationFrameRef.current = requestAnimationFrame(tick);
      }
    };

    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isPlaying, startAudioPlayback, stopAudioPlayback]);

  // --- Session Mutations ---

  const setLengthSeconds = useCallback((length) => {
    const newLength = Math.max(1, Number(length) || DEFAULT_LENGTH_SECONDS);
    setSession(prev => ({
      ...prev,
      lengthSeconds: newLength,
      loop: {
        ...prev.loop,
        endSeconds: Math.min(prev.loop.endSeconds, newLength),
      },
    }));
  }, []);

  const setLoop = useCallback((loopConfig) => {
    setSession(prev => {
      const length = Math.max(1, Number(prev.lengthSeconds) || DEFAULT_LENGTH_SECONDS);
      const merged = { ...prev.loop, ...(loopConfig || {}) };
      const enabled = !!merged.enabled;

      const startRaw = Number(merged.startSeconds);
      const endRaw = Number(merged.endSeconds);
      const safeStart = Number.isFinite(startRaw) ? startRaw : prev.loop.startSeconds;
      const safeEnd = Number.isFinite(endRaw) ? endRaw : prev.loop.endSeconds;

      const clampedStart = Math.max(0, Math.min(length - 0.01, safeStart ?? 0));
      const minEnd = clampedStart + 0.01;
      const clampedEnd = Math.max(minEnd, Math.min(length, safeEnd ?? length));

      return {
        ...prev,
        loop: {
          enabled,
          startSeconds: enabled ? clampedStart : Math.max(0, Math.min(length, clampedStart)),
          endSeconds: enabled ? clampedEnd : Math.max(0, Math.min(length, clampedEnd)),
        },
      };
    });
  }, []);

  // --- Track CRUD ---

  const addTrack = useCallback((name, targetId, color, lengthSeconds, type = 'numeric') => {
    // Pre-generate ID so we can return it synchronously
    const preId = generateId();
    setSession(prev => {
      const colorIndex = prev.tracks.length % TRACK_COLORS.length;
      const newTrack = {
        ...createTrack(
          name || `Track ${prev.tracks.length + 1}`,
          targetId || '',
          color || TRACK_COLORS[colorIndex],
          Number.isFinite(lengthSeconds) ? lengthSeconds : prev.lengthSeconds,
          type
        ),
        id: preId, // override with pre-generated ID
      };
      return { ...prev, tracks: [...prev.tracks, newTrack] };
    });
    return preId;
  }, []);

  const updateTrack = useCallback((trackId, updates) => {
    setSession(prev => ({
      ...prev,
      tracks: prev.tracks.map(track =>
        track.id === trackId ? { ...track, ...updates } : track
      ),
    }));
  }, []);

  const removeTrack = useCallback((trackId) => {
    setSession(prev => ({
      ...prev,
      tracks: prev.tracks.filter(track => track.id !== trackId),
    }));
  }, []);

  const reorderTracks = useCallback((fromIndex, toIndex) => {
    setSession(prev => {
      const tracks = [...prev.tracks];
      const [removed] = tracks.splice(fromIndex, 1);
      tracks.splice(toIndex, 0, removed);
      return { ...prev, tracks };
    });
  }, []);

  // --- Keyframe CRUD ---

  const addKeyframe = useCallback((trackId, timeSeconds, value01, curve = 'linear', tension = 0.5) => {
    setSession(prev => ({
      ...prev,
      tracks: prev.tracks.map(track => {
        if (track.id !== trackId) return track;

        const newKeyframe = createKeyframe(timeSeconds, value01, curve, tension);
        const keyframes = [...track.keyframes, newKeyframe].sort((a, b) => a.timeSeconds - b.timeSeconds);
        return { ...track, keyframes };
      }),
    }));
  }, []);

  const addColorKeyframe = useCallback((trackId, timeSeconds, color = '#ffffff') => {
    setSession(prev => ({
      ...prev,
      tracks: prev.tracks.map(track => {
        if (track.id !== trackId) return track;

        const newKeyframe = createColorKeyframe(timeSeconds, color);
        const keyframes = [...(track.keyframes || []), newKeyframe].sort((a, b) => a.timeSeconds - b.timeSeconds);
        return { ...track, keyframes };
      }),
    }));
  }, []);

  const updateKeyframe = useCallback((trackId, keyframeId, updates) => {
    setSession(prev => ({
      ...prev,
      tracks: prev.tracks.map(track => {
        if (track.id !== trackId) return track;

        let keyframes = track.keyframes.map(kf =>
          kf.id === keyframeId ? { ...kf, ...updates } : kf
        );

        // Re-sort if time changed
        if (updates.timeSeconds !== undefined) {
          keyframes = keyframes.sort((a, b) => a.timeSeconds - b.timeSeconds);
        }

        return { ...track, keyframes };
      }),
    }));
  }, []);

  const removeKeyframe = useCallback((trackId, keyframeId) => {
    setSession(prev => ({
      ...prev,
      tracks: prev.tracks.map(track => {
        if (track.id !== trackId) return track;

        // Don't allow removing if only 2 keyframes left (for numeric tracks).
        // Shape/globalShape/color tracks can have any number of keyframes (including 0).
        if (track.type !== 'shape' && track.type !== 'globalShape' && track.type !== 'color' && track.keyframes.length <= 2) return track;

        return {
          ...track,
          keyframes: track.keyframes.filter(kf => kf.id !== keyframeId),
        };
      }),
    }));
  }, []);

  /**
   * Add or update a shape keyframe on a shape track
   * If a keyframe exists at the same time (within epsilon), it will be updated
   * @param {string} trackId - Track ID
   * @param {number} timeSeconds - Time position
   * @param {Array|null} nodes - Node array (for shape)
   * @param {Array|null} subpaths - Subpaths array (for shape)
   * @param {string} label - Optional label
   * @param {Object} extras - Extended data { position, animation, colors }
   */
  const addShapeKeyframe = useCallback((trackId, timeSeconds, nodes, subpaths, label = '', extras = {}) => {
    const TIME_EPSILON = 0.01; // 10ms tolerance for "same time"
    const existingTrack = session.tracks.find(track => track.id === trackId);
    const isShapeTrack = existingTrack?.type === 'shape' || existingTrack?.targetId?.endsWith(':shape');
    if (!existingTrack || !isShapeTrack) return null;

    const existingAtTime = existingTrack.keyframes.find(
      kf => Math.abs(kf.timeSeconds - timeSeconds) < TIME_EPSILON
    );
    const resolvedId = existingAtTime?.id || generateId();

    setSession(prev => ({
      ...prev,
      tracks: prev.tracks.map(track => {
        const isShapeTrack = track.type === 'shape' || track.targetId?.endsWith(':shape');
        if (track.id !== trackId || !isShapeTrack) return track;

        // Check if a keyframe already exists at this time
        const existingIndex = track.keyframes.findIndex(
          kf => Math.abs(kf.timeSeconds - timeSeconds) < TIME_EPSILON
        );

        let keyframes;
        if (existingIndex >= 0) {
          // Update existing keyframe - merge all data
          keyframes = track.keyframes.map((kf, i) =>
            i === existingIndex
              ? {
                ...kf,
                nodes: nodes || null,
                subpaths: subpaths || null,
                label,
                position: ('position' in extras) ? (extras.position || null) : (kf.position || null),
                shapeParams: ('shapeParams' in extras) ? (extras.shapeParams || null) : (kf.shapeParams || null),
                animation: ('animation' in extras) ? (extras.animation || null) : (kf.animation || null),
                colors: ('colors' in extras) ? (Array.isArray(extras.colors) ? extras.colors : null) : (kf.colors || null),
              }
              : kf
          );
        } else {
          const newKeyframe = {
            ...createShapeKeyframe(timeSeconds, nodes, subpaths, label, extras),
            id: resolvedId,
          };
          keyframes = [...track.keyframes, newKeyframe].sort((a, b) => a.timeSeconds - b.timeSeconds);
        }

        return { ...track, type: 'shape', keyframes };
      }),
    }));
    return resolvedId;
  }, [session.tracks]);

  /**
   * Add or update a global shape keyframe on a globalShape track
   * Stores snapshots of ALL layers at the given time
   * @param {string} trackId - Track ID
   * @param {number} timeSeconds - Time position
   * @param {Array} layers - Array of layer data objects
   * @param {string} label - Optional label
   * @param {Object} extras - Extended data { variation, curve, tension }
   */
  const addGlobalShapeKeyframe = useCallback((trackId, timeSeconds, layers, label = '', extras = {}) => {
    const TIME_EPSILON = 0.01;
    setSession(prev => ({
      ...prev,
      tracks: prev.tracks.map(track => {
        if (track.id !== trackId || track.type !== 'globalShape') return track;

        const existingIndex = track.keyframes.findIndex(
          kf => Math.abs(kf.timeSeconds - timeSeconds) < TIME_EPSILON
        );

        let keyframes;
        if (existingIndex >= 0) {
          // Update existing keyframe
          keyframes = track.keyframes.map((kf, i) =>
            i === existingIndex
              ? {
                ...kf,
                layers: layers || [],
                label,
                curve: extras.curve || kf.curve || 'linear',
                tension: extras.tension !== undefined ? extras.tension : kf.tension,
                variation: extras.variation || kf.variation || null,
              }
              : kf
          );
        } else {
          // Add new keyframe
          const newKeyframe = createGlobalShapeKeyframe(timeSeconds, layers, label, extras);
          keyframes = [...track.keyframes, newKeyframe].sort((a, b) => a.timeSeconds - b.timeSeconds);
        }

        return { ...track, keyframes };
      }),
    }));
  }, []);

  // --- Keyframe Copy/Paste ---

  /**
   * Copy a keyframe to the clipboard
   * @param {string} trackId - Track ID
   * @param {string} keyframeId - Keyframe ID to copy
   */
  const copyKeyframe = useCallback((trackId, keyframeId) => {
    const track = session.tracks.find(t => t.id === trackId);
    if (!track) return;

    const keyframe = track.keyframes.find(kf => kf.id === keyframeId);
    if (!keyframe) return;

    // Store a deep copy of the keyframe along with track type info
    setKeyframeClipboard({
      keyframe: JSON.parse(JSON.stringify(keyframe)),
      trackType: track.type || 'numeric',
      trackTargetId: track.targetId,
    });
  }, [session.tracks]);

  /**
   * Paste the clipboard keyframe at a specific time
   * Note: Destination track is determined by the clipboard's original trackTargetId,
   * so pasted keyframes always go back to the source track they were copied from.
   * The trackId argument is accepted for backwards compatibility but ignored.
   * @param {string} _trackId - (unused) Track ID hint
   * @param {number} timeSeconds - Time to paste at (defaults to current playhead)
   */
  const pasteKeyframe = useCallback((_trackId, timeSeconds) => {
    if (!keyframeClipboard) return;

    const pasteTime = timeSeconds ?? positionRef.current;
    const { keyframe, trackType, trackTargetId } = keyframeClipboard;
    const TIME_EPSILON = 0.01; // 10ms tolerance for "same time"

    setSession(prev => ({
      ...prev,
      tracks: prev.tracks.map(track => {
        // Only paste into the original source track (matching targetId)
        if (!trackTargetId || track.targetId !== trackTargetId) return track;

        // Check track type compatibility
        const isShapeTrack = track.type === 'shape' || track.type === 'globalShape' || track.targetId?.endsWith(':shape');
        const isShapeKeyframe = trackType === 'shape' || trackType === 'globalShape';
        const isColorTrack = track.type === 'color';
        const isColorKeyframe = trackType === 'color';

        if (isShapeTrack !== isShapeKeyframe || isColorTrack !== isColorKeyframe) {
          console.warn('Cannot paste: keyframe type does not match track type');
          return track;
        }

        // Check if a keyframe already exists at this time
        const existingIndex = track.keyframes.findIndex(
          kf => Math.abs(kf.timeSeconds - pasteTime) < TIME_EPSILON
        );

        // Create new keyframe with new ID and updated time
        const newKeyframe = {
          ...keyframe,
          id: generateId(),
          timeSeconds: pasteTime,
        };

        let keyframes;
        if (existingIndex >= 0) {
          // Replace existing keyframe at this time
          keyframes = track.keyframes.map((kf, i) =>
            i === existingIndex ? newKeyframe : kf
          );
        } else {
          // Add new keyframe
          keyframes = [...track.keyframes, newKeyframe].sort((a, b) => a.timeSeconds - b.timeSeconds);
        }

        return { ...track, keyframes };
      }),
    }));
  }, [keyframeClipboard]);

  /**
   * Paste the clipboard keyframe to a specific target track (for right-click paste menu)
   * @param {string} targetTrackId - The track ID to paste into
   * @param {number} timeSeconds - Time to paste at (defaults to current playhead)
   */
  const pasteKeyframeToTrack = useCallback((targetTrackId, timeSeconds) => {
    if (!keyframeClipboard) return;

    const pasteTime = timeSeconds ?? positionRef.current;
    const { keyframe, trackType } = keyframeClipboard;
    const TIME_EPSILON = 0.01;

    setSession(prev => ({
      ...prev,
      tracks: prev.tracks.map(track => {
        // Only paste into the specified target track
        if (track.id !== targetTrackId) return track;

        // Check track type compatibility
        const isShapeTrack = track.type === 'shape' || track.type === 'globalShape' || track.targetId?.endsWith(':shape');
        const isShapeKeyframe = trackType === 'shape' || trackType === 'globalShape';
        const isColorTrack = track.type === 'color';
        const isColorKeyframe = trackType === 'color';

        if (isShapeTrack !== isShapeKeyframe || isColorTrack !== isColorKeyframe) {
          console.warn('Cannot paste: keyframe type does not match track type');
          return track;
        }

        // Check if a keyframe already exists at this time
        const existingIndex = track.keyframes.findIndex(
          kf => Math.abs(kf.timeSeconds - pasteTime) < TIME_EPSILON
        );

        // Create new keyframe with new ID and updated time
        const newKeyframe = {
          ...keyframe,
          id: generateId(),
          timeSeconds: pasteTime,
        };

        let keyframes;
        if (existingIndex >= 0) {
          keyframes = track.keyframes.map((kf, i) =>
            i === existingIndex ? newKeyframe : kf
          );
        } else {
          keyframes = [...track.keyframes, newKeyframe].sort((a, b) => a.timeSeconds - b.timeSeconds);
        }

        return { ...track, keyframes };
      }),
    }));
  }, [keyframeClipboard]);

  // --- Audio ---

  const setAudio = useCallback((audioData) => {
    // Initialize audio context and capture nodes when audio is loaded
    // This ensures getAudioStream() returns a valid stream for recording
    if (audioData?.buffer) {
      try {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        const ctx = audioContextRef.current;

        // Create gain node and media stream destination for recording capture
        if (!audioGainRef.current) {
          audioGainRef.current = ctx.createGain();
          audioGainRef.current.connect(ctx.destination);
        }
        if (!audioDestinationRef.current) {
          audioDestinationRef.current = ctx.createMediaStreamDestination();
          audioGainRef.current.connect(audioDestinationRef.current);
        }
      } catch (error) {
        console.warn('Failed to initialize audio context for recording:', error);
      }
    }

    setSession(prev => ({
      ...prev,
      audio: audioData,
      // Optionally adjust timeline length to match audio
      lengthSeconds: audioData?.durationSeconds
        ? Math.max(prev.lengthSeconds, audioData.durationSeconds)
        : prev.lengthSeconds,
    }));
  }, []);

  const clearAudio = useCallback(() => {
    setSession(prev => ({ ...prev, audio: null }));
    // Clear transient and energy data when audio is removed
    audioFluxRef.current = null;
    setTransients([]);
    setEnergyMap({ total: [], low: [], mid: [], high: [] });
    clearTimelineAudio();
  }, []);

  // Load an audio File/Blob: decode, compute peaks, store in session, persist to IndexedDB
  const loadAudioFile = useCallback(async (file) => {
    if (!file) return;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      const channelData = audioBuffer.getChannelData(0);
      const duration = audioBuffer.duration;
      const peakCount = Math.min(2000, Math.floor(duration * 10));
      const samplesPerPeak = Math.floor(channelData.length / peakCount);
      const peaks = [];
      for (let i = 0; i < peakCount; i++) {
        const start = i * samplesPerPeak;
        const end = Math.min(start + samplesPerPeak, channelData.length);
        let max = 0;
        for (let j = start; j < end; j++) {
          const abs = Math.abs(channelData[j]);
          if (abs > max) max = abs;
        }
        peaks.push(max);
      }

      setAudio({
        src: URL.createObjectURL(file),
        durationSeconds: duration,
        peaks,
        offsetSeconds: 0,
        buffer: audioBuffer,
        fileName: file.name,
        fileType: file.type,
      });

      saveTimelineAudio(file);
      ctx.close();
    } catch (error) {
      console.error('Failed to load audio file:', error);
    }
  }, [setAudio]);

  // Restore persisted audio from IndexedDB on mount
  const hasRestoredAudioRef = useRef(false);
  useEffect(() => {
    if (hasRestoredAudioRef.current) return;
    hasRestoredAudioRef.current = true;
    loadTimelineAudio().then((file) => {
      if (file) loadAudioFile(file);
    });
  }, [loadAudioFile]);

  // --- Transient Detection ---

  /**
   * Compute transients from audio buffer.
   * Called when audio is loaded or when sensitivity changes.
   */
  const computeTransients = useCallback((audioBuffer, sensitivity) => {
    if (!audioBuffer) {
      audioFluxRef.current = null;
      setTransients([]);
      setEnergyMap({ total: [], low: [], mid: [], high: [] });
      return;
    }

    try {
      const mono = audioBuffer.getChannelData(0);
      const sampleRate = audioBuffer.sampleRate;

      // Compute flux only if not already cached
      if (!audioFluxRef.current) {
        const { flux, hopSize, frameSize } = computeEnergyFlux(mono, sampleRate);
        audioFluxRef.current = { flux, hopSize, frameSize, sampleRate };

        // Compute multi-band energy map (only once per audio file)
        // Uses FFT spectral analysis with dB-scale normalization
        const energy = buildMultiBandEnergyMap(mono, sampleRate);
        setEnergyMap(energy);
      }

      // Detect transients using current sensitivity
      const { thresholdFactor, minStrength } = sensitivityToThreshold(sensitivity);
      const detected = detectTransientsFromFlux(
        audioFluxRef.current.flux,
        audioFluxRef.current.sampleRate,
        audioFluxRef.current.hopSize,
        {
          thresholdFactor,
          minStrength,
          maxMarkers: transientSettings.maxMarkers,
        }
      );

      setTransients(detected);
    } catch (error) {
      console.warn('Failed to compute transients:', error);
      setTransients([]);
      setEnergyMap({ total: [], low: [], mid: [], high: [] });
    }
  }, [transientSettings.maxMarkers]);

  /**
   * Update transient sensitivity and recompute transients
   */
  const setTransientSensitivity = useCallback((sensitivity) => {
    const newSensitivity = Math.max(0, Math.min(100, sensitivity));
    setTransientSettings(prev => ({ ...prev, sensitivity: newSensitivity }));

    // Recompute transients with new sensitivity if we have audio
    if (session.audio?.buffer) {
      computeTransients(session.audio.buffer, newSensitivity);
    }
  }, [session.audio?.buffer, computeTransients]);

  /**
   * Toggle transient markers visibility
   */
  const setTransientsEnabled = useCallback((enabled) => {
    setTransientSettings(prev => ({ ...prev, enabled }));
  }, []);

  // Compute transients when audio is loaded
  useEffect(() => {
    if (session.audio?.buffer && transientSettings.enabled) {
      computeTransients(session.audio.buffer, transientSettings.sensitivity);
    }
  }, [session.audio?.buffer, transientSettings.enabled, transientSettings.sensitivity, computeTransients]);

  // --- Evaluation ---

  /**
   * Get the current value for a track at the current playback position
   */
  const getTrackValue = useCallback((trackId) => {
    const track = session.tracks.find(t => t.id === trackId);
    if (!track || !track.enabled) return null;
    return evaluateTrackAtTime(track, positionSeconds);
  }, [session.tracks, positionSeconds]);

  /**
   * Get all enabled track values at current position
   * Returns: { [targetId]: value }
   */
  const getAllTrackValues = useCallback(() => {
    const values = {};
    for (const track of session.tracks) {
      if (!track.enabled || !track.targetId) continue;
      const value = evaluateTrackAtTime(track, positionSeconds);
      if (value !== null) {
        values[track.targetId] = value;
      }
    }
    return values;
  }, [session.tracks, positionSeconds]);

  /**
   * Get track values at a specific time (for scrubbing preview)
   */
  const getTrackValuesAtTime = useCallback((timeSeconds) => {
    const values = {};
    for (const track of session.tracks) {
      if (!track.enabled || !track.targetId) continue;
      const value = evaluateTrackAtTime(track, timeSeconds);
      if (value !== null) {
        values[track.targetId] = value;
      }
    }
    return values;
  }, [session.tracks]);

  // --- Variation Keyframe Generation ---

  /**
   * Generate a single variation keyframe at the current playhead position.
   * Uses the evaluated shape at that time as the base, applies variation, and adds a keyframe.
   * 
   * @param {string} trackId - The shape track ID
   * @param {object} layer - The layer to use as base (should be evaluated at current time)
   * @param {object} options - { seed, variationWeights, affectCategories }
   * @returns {string|null} The new keyframe ID, or null if failed
   */
  const generateVariationKeyframe = useCallback((trackId, layer, options = {}) => {
    if (!trackId || !layer) return null;

    const track = session.tracks.find(t => t.id === trackId);
    if (!track || track.type !== 'shape') return null;

    const time = positionRef.current;
    const seed = options.seed ?? Date.now();
    const baseWeights = options.variationWeights || {
      shape: layer.variationShape ?? layer.variation ?? 0.2,
      anim: layer.variationAnim ?? layer.variation ?? 0.2,
      color: layer.variationColor ?? layer.variation ?? 0.2,
      position: layer.variationPosition ?? layer.variation ?? 0.2,
      scale: layer.variationScale ?? 0,
    };
    const existingTimes = (track.keyframes || [])
      .map(kf => kf?.timeSeconds)
      .filter(Number.isFinite);
    const [temporalScaleRaw] = computeTemporalVariationScales([time], existingTimes, {
      enabled: options.temporalDampingEnabled,
      windowSeconds: options.temporalDampingWindowSeconds,
      minScale: options.temporalDampingMinScale,
    });
    const temporalScale = Number.isFinite(temporalScaleRaw)
      ? Math.max(0, temporalScaleRaw)
      : 1;
    const variationWeights = scaleVariationWeights(baseWeights, temporalScale);

    // Get track categories for what to include in keyframe
    const categories = track.categories || { shape: true, animation: false, color: false };

    // Generate varied layer
    const variedLayer = generateVariedLayer(layer, {
      seed,
      variationWeights,
      affectCategories: options.affectCategories || ['shape', 'anim', 'color', 'position', 'scale'],
      isParamRandomizable: options.isParamRandomizable,
      constrainColorsToPalette: options.constrainColorsToPalette,
      paletteColors: options.paletteColors,
    });

    // Extract keyframe data
    const { nodes, subpaths, extras } = extractKeyframeData(variedLayer, categories);

    // Add variation metadata for reroll support
    extras.variation = {
      baseSeed: seed,
      baseTime: time,
      weights: variationWeights,
      temporalScale,
      affectCategories: options.affectCategories || ['shape', 'anim', 'color', 'position', 'scale'],
      constrainColorsToPalette: options.constrainColorsToPalette,
      paletteColors: options.paletteColors,
    };

    // Add the keyframe
    const keyframeId = addShapeKeyframe(trackId, time, nodes, subpaths, '', extras);
    return keyframeId;
  }, [session.tracks, addShapeKeyframe]);

  /**
   * Generate multiple variation keyframes at specified times.
   * 
   * @param {string} trackId - The shape track ID
   * @param {object} baseLayer - The base layer to vary from
   * @param {number[]} times - Array of times to generate keyframes at
   * @param {object} options - { variationWeights, affectCategories, evaluateAtTime, nodeMod, energyInfluence }
   * @returns {string[]} Array of new keyframe IDs
   */
  const generateVariationKeyframesAtTimes = useCallback((trackId, baseLayer, times, options = {}) => {
    if (!trackId || !baseLayer || !Array.isArray(times) || times.length === 0) return [];
    const normalizedTimes = normalizeKeyframeTimes(times);
    if (!normalizedTimes.length) return [];

    const track = session.tracks.find(t => t.id === trackId);
    if (!track || track.type !== 'shape') return [];

    const replaceExistingKeyframes = options.replaceExistingKeyframes === true;
    const categories = track.categories || { shape: true, animation: false, color: false };
    const keyframeIds = [];
    const generatedEntries = [];
    const existingTimes = (Array.isArray(options.temporalReferenceTimes)
      ? options.temporalReferenceTimes
      : (replaceExistingKeyframes ? [] : (track.keyframes || []).map(kf => kf?.timeSeconds)))
      .filter(Number.isFinite);
    const temporalScales = computeTemporalVariationScales(normalizedTimes, existingTimes, {
      enabled: options.temporalDampingEnabled,
      windowSeconds: options.temporalDampingWindowSeconds,
      minScale: options.temporalDampingMinScale,
    });
    const rawWeights = options.variationWeights || {
      shape: baseLayer.variationShape ?? baseLayer.variation ?? 0.2,
      anim: baseLayer.variationAnim ?? baseLayer.variation ?? 0.2,
      color: baseLayer.variationColor ?? baseLayer.variation ?? 0.2,
      position: baseLayer.variationPosition ?? baseLayer.variation ?? 0.2,
      scale: baseLayer.variationScale ?? 0,
    };

    // Node modulation config (merge with defaults)
    const nodeMod = options.nodeMod?.enabled
      ? { ...DEFAULT_NODE_MOD_CONFIG, ...options.nodeMod }
      : null;

    for (let i = 0; i < normalizedTimes.length; i++) {
      const time = normalizedTimes[i];
      const seed = (options.baseSeed ?? Date.now()) + i * 16807;

      // If evaluateAtTime is true, evaluate the track at this time to get interpolated base
      let layerToVary = baseLayer;
      if (options.evaluateAtTime) {
        const evaluated = evaluateShapeTrackAtTime(track, time, lerpNodes, lerpSubpaths);
        if (evaluated) {
          // Merge evaluated data back into a layer-like object
          layerToVary = {
            ...baseLayer,
            nodes: evaluated.nodes || baseLayer.nodes,
            subpaths: evaluated.subpaths || baseLayer.subpaths,
            position: { ...baseLayer.position, ...evaluated.position },
            ...(evaluated.shapeParams || {}),
            ...(evaluated.animation || {}),
            colors: evaluated.colors || baseLayer.colors,
          };
        }
      }

      // Get base variation weights (full variation, no energy scaling — energy is applied at playback time)
      // Boost weights so timeline keyframes represent large divergence from base.
      // buildVariedLayerFrom divides by 3, so raw 0.2 → 0.067 effective weight.
      // With TIMELINE_BOOST=5: 0.2*5=1.0 → 0.33 effective; 0.6*5=3.0 → 1.0 (max).
      const TIMELINE_BOOST = 5;
      const temporalScale = Number.isFinite(temporalScales[i])
        ? Math.max(0, temporalScales[i])
        : 1;
      const variationWeights = scaleVariationWeights(rawWeights, TIMELINE_BOOST * temporalScale);

      // Extract base (un-varied) keyframe data for runtime energy blending
      const baseKeyframeData = extractKeyframeData(layerToVary, categories);

      // Generate varied layer at boosted variation (energy modulation happens during playback)
      const variedLayer = generateVariedLayer(layerToVary, {
        seed,
        variationWeights,
        affectCategories: options.affectCategories || ['shape', 'anim', 'color', 'position', 'scale'],
        isParamRandomizable: options.isParamRandomizable,
        constrainColorsToPalette: options.constrainColorsToPalette,
        paletteColors: options.paletteColors,
      });

      // Extract keyframe data
      let { nodes, subpaths, extras } = extractKeyframeData(variedLayer, categories);

      // Apply node modulation if enabled
      if (nodeMod) {
        const phase = generateKeyframePhase(i, normalizedTimes.length, nodeMod.cycles || 1);
        const modConfig = {
          ...nodeMod,
          phase,
          seed: seed, // Use keyframe seed for stable per-node phases
        };

        if (nodes && nodes.length > 0) {
          nodes = applyNodeModulation(nodes, modConfig);
        }
        if (subpaths && subpaths.length > 0) {
          subpaths = applyNodeModulationToSubpaths(subpaths, modConfig);
        }

        // Store nodeMod config in extras for reference/reroll
        extras.nodeMod = { ...nodeMod, appliedPhase: phase };
      }

      // Store base (un-varied) data for runtime energy blending during playback
      extras.base = {
        nodes: baseKeyframeData.nodes,
        subpaths: baseKeyframeData.subpaths,
        position: baseKeyframeData.extras.position,
        shapeParams: baseKeyframeData.extras.shapeParams,
        animation: baseKeyframeData.extras.animation,
        colors: baseKeyframeData.extras.colors,
      };

      // Smooth easing for organic transitions between random keyframes
      extras.curve = 'easeInOut';
      extras.tension = 0.5;

      // Add variation metadata
      extras.variation = {
        baseSeed: seed,
        baseTime: time,
        weights: variationWeights,
        temporalScale,
        affectCategories: options.affectCategories || ['shape', 'anim', 'color', 'position', 'scale'],
        constrainColorsToPalette: options.constrainColorsToPalette,
        paletteColors: options.paletteColors,
      };

      if (replaceExistingKeyframes) {
        generatedEntries.push({ time, nodes, subpaths, extras });
      } else {
        // Add the keyframe
        const keyframeId = addShapeKeyframe(trackId, time, nodes, subpaths, '', extras);
        if (keyframeId) keyframeIds.push(keyframeId);
      }
    }

    if (replaceExistingKeyframes) {
      const created = generatedEntries
        .map(entry => createShapeKeyframe(entry.time, entry.nodes, entry.subpaths, '', entry.extras))
        .sort((a, b) => a.timeSeconds - b.timeSeconds);
      setSession(prev => ({
        ...prev,
        tracks: prev.tracks.map(t => {
          const isShapeTrack = t.type === 'shape' || t.targetId?.endsWith(':shape');
          if (t.id !== trackId || !isShapeTrack) return t;
          return { ...t, type: 'shape', keyframes: created };
        }),
      }));
      return created.map(kf => kf.id);
    }

    return keyframeIds;
  }, [session.tracks, addShapeKeyframe, setSession]);

  /**
   * Generate N keyframes between two existing keyframes.
   * 
   * @param {string} trackId - The shape track ID
   * @param {object} baseLayer - The base layer
   * @param {number} startTime - Start time
   * @param {number} endTime - End time
   * @param {number} count - Number of keyframes to generate
   * @param {object} options - { variationWeights, affectCategories }
   * @returns {string[]} Array of new keyframe IDs
   */
  const generateKeyframesBetween = useCallback((trackId, baseLayer, startTime, endTime, count, options = {}) => {
    const times = generateEvenlySpacedTimes(startTime, endTime, count);
    return generateVariationKeyframesAtTimes(trackId, baseLayer, times, {
      ...options,
      evaluateAtTime: true, // Use interpolated shape at each time
    });
  }, [generateVariationKeyframesAtTimes]);

  /**
   * Generate N keyframes at random times or transient times.
   * 
   * @param {string} trackId - The shape track ID
   * @param {object} baseLayer - The base layer
   * @param {number} count - Number of keyframes to generate
   * @param {object} options - { useTransients, startTime, endTime, variationWeights, affectCategories }
   * @returns {string[]} Array of new keyframe IDs
   */
  const generateRandomKeyframes = useCallback((trackId, baseLayer, count, options = {}) => {
    const startTime = options.startTime ?? 0;
    const endTime = options.endTime ?? session.lengthSeconds;

    let times;
    if (options.useTransients && transients.length > 0) {
      if (count == null) {
        // Use ALL transients in the time range
        times = transients
          .filter(t => t.time >= startTime && t.time <= endTime)
          .map(t => t.time)
          .sort((a, b) => a - b);
      } else {
        times = selectTopTransientTimes(transients, count, startTime, endTime);
      }
    } else {
      times = generateRandomTimes(startTime, endTime, count || 5, Date.now());
    }

    return generateVariationKeyframesAtTimes(trackId, baseLayer, times, {
      ...options,
      evaluateAtTime: false, // Use base layer for all
    });
  }, [session.lengthSeconds, transients, generateVariationKeyframesAtTimes]);

  /**
   * Generate random numeric keyframes on a numeric/color track at random or transient times.
   * @param {string} trackId - The track ID
   * @param {number} count - Number of keyframes (ignored when useTransients without count)
   * @param {object} options - { useTransients, startTime, endTime, curve, tension }
   * @returns {number} Number of keyframes added
   */
  const generateRandomNumericKeyframes = useCallback((trackId, count, options = {}) => {
    const track = sessionRef.current.tracks.find(t => t.id === trackId);
    if (!track) return 0;

    const startTime = options.startTime ?? 0;
    const endTime = options.endTime ?? sessionRef.current.lengthSeconds;
    const curve = options.curve || 'easeInOut';
    const tension = options.tension ?? 0.5;
    const isColor = track.type === 'color';

    let times;
    if (options.useTransients && transients.length > 0) {
      if (count == null) {
        times = transients
          .filter(t => t.time >= startTime && t.time <= endTime)
          .map(t => t.time)
          .sort((a, b) => a - b);
      } else {
        times = selectTopTransientTimes(transients, count, startTime, endTime);
      }
    } else {
      times = generateRandomTimes(startTime, endTime, count || 5, Date.now());
    }

    if (times.length === 0) return 0;

    setSession(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => {
        if (t.id !== trackId) return t;
        const newKeyframes = times.map(time => {
          if (isColor) {
            // Random hue, full saturation, medium lightness (stored as hex for interpolation).
            const hue = Math.floor(Math.random() * 360);
            const color = hslToHex(hue, 70, 55);
            return createColorKeyframe(time, color);
          }
          return createKeyframe(time, Math.random(), curve, tension);
        });
        const base = options.replaceExistingKeyframes ? [] : (t.keyframes || []);
        const merged = [...base, ...newKeyframes].sort((a, b) => a.timeSeconds - b.timeSeconds);
        return { ...t, keyframes: merged };
      }),
    }));

    return times.length;
  }, [transients]);

  /**
   * Reroll a variation keyframe with a new seed.
   * 
   * @param {string} trackId - The track ID
   * @param {string} keyframeId - The keyframe ID to reroll
   * @param {object} baseLayer - The base layer to regenerate from
   * @returns {boolean} Success
   */
  const rerollVariationKeyframe = useCallback((trackId, keyframeId, baseLayer) => {
    const track = session.tracks.find(t => t.id === trackId);
    if (!track || track.type !== 'shape') return false;

    const keyframe = track.keyframes?.find(kf => kf.id === keyframeId);
    if (!keyframe) return false;

    const variationMeta = keyframe.variation;
    if (!variationMeta) return false;

    const categories = track.categories || { shape: true, animation: false, color: false };
    const newSeed = generateRerollSeed(variationMeta.baseSeed);

    // Generate new varied layer
    const variedLayer = generateVariedLayer(baseLayer, {
      seed: newSeed,
      variationWeights: variationMeta.weights,
      affectCategories: variationMeta.affectCategories,
      constrainColorsToPalette: variationMeta.constrainColorsToPalette,
      paletteColors: variationMeta.paletteColors,
    });

    // Extract keyframe data
    const { nodes, subpaths, extras } = extractKeyframeData(variedLayer, categories);

    // Update variation metadata
    extras.variation = {
      ...variationMeta,
      baseSeed: newSeed,
      rerollCount: (variationMeta.rerollCount || 0) + 1,
    };

    // Update the keyframe
    updateKeyframe(trackId, keyframeId, {
      nodes,
      subpaths,
      ...extras,
    });

    return true;
  }, [session.tracks, updateKeyframe]);

  // --- Global Shape Track Keyframe Generation ---

  /**
   * Capture current state of all layers as a global shape keyframe
   * @param {string} trackId - The global shape track ID
   * @param {Array} layers - Current layers array
   * @param {Object} options - { label, curve, tension }
   */
  const captureGlobalShapeKeyframe = useCallback((trackId, layers, options = {}) => {
    if (!trackId || !Array.isArray(layers) || layers.length === 0) return null;

    const track = session.tracks.find(t => t.id === trackId);
    if (!track || track.type !== 'globalShape') return null;

    const time = Number.isFinite(options.timeSecondsOverride) ? options.timeSecondsOverride : positionRef.current;

    // Check for layer count consistency with existing keyframes
    const existingKeyframes = track.keyframes || [];
    if (existingKeyframes.length > 0) {
      const firstKfLayerCount = existingKeyframes[0].layers?.length || 0;
      if (firstKfLayerCount > 0 && layers.length !== firstKfLayerCount) {
        console.warn(`Global shape track layer count mismatch: existing keyframes have ${firstKfLayerCount} layers, current scene has ${layers.length}. Interpolation may not work correctly.`);
      }
    }

    const extractData = (layer) => ({
      nodes: Array.isArray(layer.nodes) ? JSON.parse(JSON.stringify(layer.nodes)) : null,
      subpaths: Array.isArray(layer.subpaths) ? JSON.parse(JSON.stringify(layer.subpaths)) : null,
      position: {
        x: layer.position?.x ?? 0.5,
        y: layer.position?.y ?? 0.5,
        scale: layer.position?.scale ?? 1,
        xOffset: layer.xOffset ?? 0,
        yOffset: layer.yOffset ?? 0,
      },
      shapeParams: {
        numSides: layer.numSides ?? 6,
        curviness: layer.curviness ?? 1.0,
        radiusFactor: layer.radiusFactor ?? 0.125,
        radiusFactorX: layer.radiusFactorX ?? layer.radiusFactor ?? 0.125,
        radiusFactorY: layer.radiusFactorY ?? layer.radiusFactor ?? 0.125,
        rotation: layer.rotation ?? 0,
      },
      // Always store animation — category toggles control playback, not storage
      animation: {
        movementStyle: layer.movementStyle ?? 'bounce',
        movementSpeed: layer.movementSpeed ?? 1,
        movementAngle: layer.movementAngle ?? 45,
        scaleSpeed: layer.scaleSpeed ?? 0.05,
        scaleMin: layer.scaleMin ?? 0,
        scaleMax: layer.scaleMax ?? 1.5,
      },
      // Always store colors so keyframes can later tween correctly when the track's
      // "Color" category is enabled (the toggle controls playback, not what is stored).
      colors: Array.isArray(layer.colors) ? [...layer.colors] : ['#0000FF'],
    });

    // Store base data explicitly so runtime variation sliders can consistently blend
    // between base and varied states for global shape tracks.
    const layersData = layers.map(layer => {
      const snapshot = extractData(layer);
      return {
        ...snapshot,
        base: extractData(layer),
      };
    });

    addGlobalShapeKeyframe(trackId, time, layersData, options.label || '', {
      curve: options.curve || 'easeInOut',
      tension: options.tension ?? 0.5,
    });

    return time;
  }, [session.tracks, addGlobalShapeKeyframe]);

  /**
   * Generate a global shape keyframe with variation applied to all layers
   * Uses the variation sliders to create new variations of all layers at once
   * @param {string} trackId - The global shape track ID
   * @param {Array} baseLayers - Current layers array to vary from
   * @param {Object} options - { seed, variationWeights, affectCategories }
   */
  const generateGlobalVariationKeyframe = useCallback((trackId, baseLayers, options = {}) => {
    if (!trackId || !Array.isArray(baseLayers) || baseLayers.length === 0) return null;

    const track = session.tracks.find(t => t.id === trackId);
    if (!track || track.type !== 'globalShape') return null;

    const time = positionRef.current;

    // Check for layer count consistency with existing keyframes
    const existingKeyframes = track.keyframes || [];
    if (existingKeyframes.length > 0) {
      const firstKfLayerCount = existingKeyframes[0].layers?.length || 0;
      if (firstKfLayerCount > 0 && baseLayers.length !== firstKfLayerCount) {
        console.warn(`Global shape track layer count mismatch: existing keyframes have ${firstKfLayerCount} layers, current scene has ${baseLayers.length}. Interpolation may not work correctly.`);
      }
    }
    const baseSeed = options.seed ?? Date.now();

    // Get variation weights from first layer or options
    const firstLayer = baseLayers[0];
    const baseWeights = options.variationWeights || {
      shape: firstLayer.variationShape ?? firstLayer.variation ?? 0.2,
      anim: firstLayer.variationAnim ?? firstLayer.variation ?? 0.2,
      color: firstLayer.variationColor ?? firstLayer.variation ?? 0.2,
      position: firstLayer.variationPosition ?? firstLayer.variation ?? 0.2,
      scale: firstLayer.variationScale ?? 0,
    };
    const [temporalScaleRaw] = computeTemporalVariationScales(
      [time],
      existingKeyframes.map(kf => kf?.timeSeconds).filter(Number.isFinite),
      {
        enabled: options.temporalDampingEnabled,
        windowSeconds: options.temporalDampingWindowSeconds,
        minScale: options.temporalDampingMinScale,
      },
    );
    const temporalScale = Number.isFinite(temporalScaleRaw)
      ? Math.max(0, temporalScaleRaw)
      : 1;
    const variationWeights = scaleVariationWeights(baseWeights, temporalScale);

    const affectCategories = options.affectCategories || ['shape', 'anim', 'color', 'position', 'scale'];

    // Generate varied version of each layer
    const layersData = baseLayers.map((layer, index) => {
      // Use different seed for each layer to get unique variations
      const layerSeed = baseSeed + index * 16807;

      const variedLayer = generateVariedLayer(layer, {
        seed: layerSeed,
        variationWeights,
        affectCategories,
        isParamRandomizable: options.isParamRandomizable,
        constrainColorsToPalette: options.constrainColorsToPalette,
        paletteColors: options.paletteColors,
      });

      const extractData = (l) => ({
        nodes: Array.isArray(l.nodes) ? JSON.parse(JSON.stringify(l.nodes)) : null,
        subpaths: Array.isArray(l.subpaths) ? JSON.parse(JSON.stringify(l.subpaths)) : null,
        position: {
          x: l.position?.x ?? 0.5,
          y: l.position?.y ?? 0.5,
          scale: l.position?.scale ?? 1,
          xOffset: l.xOffset ?? 0,
          yOffset: l.yOffset ?? 0,
        },
        shapeParams: {
          numSides: l.numSides ?? 6,
          curviness: l.curviness ?? 1.0,
          radiusFactor: l.radiusFactor ?? 0.125,
          radiusFactorX: l.radiusFactorX ?? l.radiusFactor ?? 0.125,
          radiusFactorY: l.radiusFactorY ?? l.radiusFactor ?? 0.125,
          rotation: l.rotation ?? 0,
        },
        // Always store animation — category toggles control playback, not storage
        animation: {
          movementStyle: l.movementStyle ?? 'bounce',
          movementSpeed: l.movementSpeed ?? 1,
          movementAngle: l.movementAngle ?? 45,
          scaleSpeed: l.scaleSpeed ?? 0.05,
          scaleMin: l.scaleMin ?? 0,
          scaleMax: l.scaleMax ?? 1.5,
        },
        colors: Array.isArray(l.colors) ? [...l.colors] : ['#0000FF'],
      });

      const variedData = extractData(variedLayer);
      const baseData = extractData(layer);

      return {
        ...variedData,
        base: baseData,
      };
    });

    // Add keyframe with variation metadata for reroll support
    addGlobalShapeKeyframe(trackId, time, layersData, '', {
      curve: options.curve || 'easeInOut',
      tension: options.tension ?? 0.5,
      variation: {
        baseSeed,
        baseTime: time,
        weights: variationWeights,
        temporalScale,
        affectCategories,
        layerCount: baseLayers.length,
        isParamRandomizable: options.isParamRandomizable,
        constrainColorsToPalette: options.constrainColorsToPalette,
        paletteColors: options.paletteColors,
      },
    });

    return time;
  }, [session.tracks, addGlobalShapeKeyframe]);

  /**
   * Regenerate (reroll) a global shape keyframe with new random seed
   * @param {string} trackId - The track ID
   * @param {string} keyframeId - The keyframe ID to reroll
   * @param {Array} baseLayers - Base layers to regenerate from
   */
  const rerollGlobalShapeKeyframe = useCallback((trackId, keyframeId, baseLayers) => {
    const track = session.tracks.find(t => t.id === trackId);
    if (!track || track.type !== 'globalShape') return false;

    const keyframe = track.keyframes?.find(kf => kf.id === keyframeId);
    if (!keyframe) return false;

    const variationMeta = keyframe.variation;
    if (!variationMeta) return false;

    const newSeed = generateRerollSeed(variationMeta.baseSeed);

    // Generate new varied layers
    const layersData = baseLayers.map((layer, index) => {
      const layerSeed = newSeed + index * 16807;

      const variedLayer = generateVariedLayer(layer, {
        seed: layerSeed,
        variationWeights: variationMeta.weights,
        affectCategories: variationMeta.affectCategories,
        constrainColorsToPalette: variationMeta.constrainColorsToPalette,
        paletteColors: variationMeta.paletteColors,
      });

      const extractData = (l) => ({
        nodes: Array.isArray(l.nodes) ? JSON.parse(JSON.stringify(l.nodes)) : null,
        subpaths: Array.isArray(l.subpaths) ? JSON.parse(JSON.stringify(l.subpaths)) : null,
        position: {
          x: l.position?.x ?? 0.5,
          y: l.position?.y ?? 0.5,
          scale: l.position?.scale ?? 1,
          xOffset: l.xOffset ?? 0,
          yOffset: l.yOffset ?? 0,
        },
        shapeParams: {
          numSides: l.numSides ?? 6,
          curviness: l.curviness ?? 1.0,
          radiusFactor: l.radiusFactor ?? 0.125,
          radiusFactorX: l.radiusFactorX ?? l.radiusFactor ?? 0.125,
          radiusFactorY: l.radiusFactorY ?? l.radiusFactor ?? 0.125,
          rotation: l.rotation ?? 0,
        },
        // Always store animation — category toggles control playback, not storage
        animation: {
          movementStyle: l.movementStyle ?? 'bounce',
          movementSpeed: l.movementSpeed ?? 1,
          movementAngle: l.movementAngle ?? 45,
          scaleSpeed: l.scaleSpeed ?? 0.05,
          scaleMin: l.scaleMin ?? 0,
          scaleMax: l.scaleMax ?? 1.5,
        },
        colors: Array.isArray(l.colors) ? [...l.colors] : ['#0000FF'],
      });

      const variedData = extractData(variedLayer);
      const baseData = extractData(layer);

      return {
        ...variedData,
        base: baseData,
      };
    });

    // Update the keyframe
    updateKeyframe(trackId, keyframeId, {
      layers: layersData,
      variation: {
        ...variationMeta,
        baseSeed: newSeed,
        rerollCount: (variationMeta.rerollCount || 0) + 1,
      },
    });

    return true;
  }, [session.tracks, updateKeyframe]);

  /**
   * Generate or update global shape variation keyframes at explicit times.
   * This lets callers regenerate an existing sequence while preserving timing.
   */
  const generateGlobalVariationKeyframesAtTimes = useCallback((trackId, baseLayers, times, options = {}) => {
    if (!trackId || !Array.isArray(baseLayers) || baseLayers.length === 0) return [];
    if (!Array.isArray(times) || times.length === 0) return [];
    const validTimes = normalizeKeyframeTimes(times);
    if (!validTimes.length) return [];

    const track = session.tracks.find(t => t.id === trackId);
    if (!track || track.type !== 'globalShape') return [];

    const replaceExistingKeyframes = options.replaceExistingKeyframes === true;
    const existingKeyframes = track.keyframes || [];
    if (existingKeyframes.length > 0) {
      const firstKfLayerCount = existingKeyframes[0].layers?.length || 0;
      if (firstKfLayerCount > 0 && baseLayers.length !== firstKfLayerCount) {
        console.warn(`Global shape track layer count mismatch: existing keyframes have ${firstKfLayerCount} layers, current scene has ${baseLayers.length}. Interpolation may not work correctly.`);
      }
    }

    const TIMELINE_BOOST = 5;
    const firstLayer = baseLayers[0];
    const baseWeights = options.variationWeights || {
      shape: firstLayer.variationShape ?? firstLayer.variation ?? 0.2,
      anim: firstLayer.variationAnim ?? firstLayer.variation ?? 0.2,
      color: firstLayer.variationColor ?? firstLayer.variation ?? 0.2,
      position: firstLayer.variationPosition ?? firstLayer.variation ?? 0.2,
      scale: firstLayer.variationScale ?? 0,
    };

    const temporalReferenceTimes = (Array.isArray(options.temporalReferenceTimes)
      ? options.temporalReferenceTimes
      : (replaceExistingKeyframes ? [] : existingKeyframes.map(kf => kf?.timeSeconds)))
      .filter(Number.isFinite);

    const temporalScales = computeTemporalVariationScales(validTimes, temporalReferenceTimes, {
      enabled: options.temporalDampingEnabled,
      windowSeconds: options.temporalDampingWindowSeconds,
      minScale: options.temporalDampingMinScale,
    });

    const affectCategories = options.affectCategories || ['shape', 'anim', 'color', 'position', 'scale'];
    const baseSeedStart = Number.isFinite(Number(options.baseSeed))
      ? Number(options.baseSeed)
      : Date.now();
    const curve = options.curve || 'easeInOut';
    const tension = options.tension ?? 0.5;

    const keyframeIds = [];
    const generatedEntries = [];

    for (let i = 0; i < validTimes.length; i++) {
      const time = validTimes[i];
      const baseSeed = baseSeedStart + i * 16807;
      const temporalScale = Number.isFinite(temporalScales[i])
        ? Math.max(0, temporalScales[i])
        : 1;
      const variationWeights = scaleVariationWeights(baseWeights, TIMELINE_BOOST * temporalScale);

      const layersData = baseLayers.map((layer, layerIndex) => {
        const layerSeed = baseSeed + layerIndex * 16807;

        const variedLayer = generateVariedLayer(layer, {
          seed: layerSeed,
          variationWeights,
          affectCategories,
          isParamRandomizable: options.isParamRandomizable,
          constrainColorsToPalette: options.constrainColorsToPalette,
          paletteColors: options.paletteColors,
        });

        const extractData = (l) => ({
          nodes: Array.isArray(l.nodes) ? JSON.parse(JSON.stringify(l.nodes)) : null,
          subpaths: Array.isArray(l.subpaths) ? JSON.parse(JSON.stringify(l.subpaths)) : null,
          position: {
            x: l.position?.x ?? 0.5,
            y: l.position?.y ?? 0.5,
            scale: l.position?.scale ?? 1,
            xOffset: l.xOffset ?? 0,
            yOffset: l.yOffset ?? 0,
          },
          shapeParams: {
            numSides: l.numSides ?? 6,
            curviness: l.curviness ?? 1.0,
            radiusFactor: l.radiusFactor ?? 0.125,
            radiusFactorX: l.radiusFactorX ?? l.radiusFactor ?? 0.125,
            radiusFactorY: l.radiusFactorY ?? l.radiusFactor ?? 0.125,
            rotation: l.rotation ?? 0,
          },
          animation: {
            movementStyle: l.movementStyle ?? 'bounce',
            movementSpeed: l.movementSpeed ?? 1,
            movementAngle: l.movementAngle ?? 45,
            scaleSpeed: l.scaleSpeed ?? 0.05,
            scaleMin: l.scaleMin ?? 0,
            scaleMax: l.scaleMax ?? 1.5,
          },
          colors: Array.isArray(l.colors) ? [...l.colors] : ['#0000FF'],
        });

        const variedData = extractData(variedLayer);
        const baseData = extractData(layer);

        return {
          ...variedData,
          base: baseData,
        };
      });

      const variation = {
        baseSeed,
        baseTime: time,
        weights: variationWeights,
        temporalScale,
        affectCategories,
        layerCount: baseLayers.length,
        isParamRandomizable: options.isParamRandomizable,
        constrainColorsToPalette: options.constrainColorsToPalette,
        paletteColors: options.paletteColors,
      };

      if (replaceExistingKeyframes) {
        generatedEntries.push({ time, layersData, variation });
      } else {
        addGlobalShapeKeyframe(trackId, time, layersData, '', {
          curve,
          tension,
          variation,
        });
        keyframeIds.push(`global-kf-${time}`);
      }
    }

    if (replaceExistingKeyframes) {
      const created = generatedEntries
        .map(entry => createGlobalShapeKeyframe(entry.time, entry.layersData, '', {
          curve,
          tension,
          variation: entry.variation,
        }))
        .sort((a, b) => a.timeSeconds - b.timeSeconds);
      setSession(prev => ({
        ...prev,
        tracks: prev.tracks.map(t => {
          if (t.id !== trackId || t.type !== 'globalShape') return t;
          return { ...t, keyframes: created };
        }),
      }));
      return created.map(kf => kf.id);
    }

    return keyframeIds;
  }, [session.tracks, addGlobalShapeKeyframe, setSession]);

  /**
   * Generate multiple global shape keyframes at random or transient times
   * Similar to generateRandomKeyframes but for global shape tracks (all layers)
   * @param {string} trackId - The global shape track ID
   * @param {Array} baseLayers - Current layers array to vary from
   * @param {number} count - Number of keyframes to generate
   * @param {Object} options - { useTransients, startTime, endTime, variationWeights, energyInfluence, isParamRandomizable }
   */
  const generateGlobalRandomKeyframes = useCallback((trackId, baseLayers, count, options = {}) => {
    if (!trackId || !Array.isArray(baseLayers) || baseLayers.length === 0) return [];
    if (count != null && count < 1) return [];

    const track = session.tracks.find(t => t.id === trackId);
    if (!track || track.type !== 'globalShape') return [];

    const startTime = options.startTime ?? 0;
    const endTime = options.endTime ?? session.lengthSeconds;

    // Get times (transient or random)
    let times;
    if (options.useTransients && transients.length > 0) {
      if (count == null) {
        // Use ALL transients in the time range
        times = transients
          .filter(t => t.time >= startTime && t.time <= endTime)
          .map(t => t.time)
          .sort((a, b) => a - b);
      } else {
        times = selectTopTransientTimes(transients, count, startTime, endTime);
      }
    } else {
      times = generateRandomTimes(startTime, endTime, count || 5, Date.now());
    }

    if (times.length === 0) return [];
    return generateGlobalVariationKeyframesAtTimes(trackId, baseLayers, times, options);
  }, [session.tracks, session.lengthSeconds, transients, generateGlobalVariationKeyframesAtTimes]);

  /**
   * Fill global shape keyframes between two times (evenly spaced)
   * @param {string} trackId - The global shape track ID
   * @param {Array} baseLayers - Current layers array to vary from
   * @param {number} startTime - Start time in seconds
   * @param {number} endTime - End time in seconds
   * @param {number} count - Number of keyframes to generate
   * @param {Object} options - { variationWeights, energyInfluence, isParamRandomizable }
   */
  const generateGlobalKeyframesBetween = useCallback((trackId, baseLayers, startTime, endTime, count, options = {}) => {
    if (!trackId || !Array.isArray(baseLayers) || baseLayers.length === 0 || count < 1) return [];

    const track = session.tracks.find(t => t.id === trackId);
    if (!track || track.type !== 'globalShape') return [];

    // Generate evenly spaced times
    const times = generateEvenlySpacedTimes(startTime, endTime, count);
    if (times.length === 0) return [];
    return generateGlobalVariationKeyframesAtTimes(trackId, baseLayers, times, options);
  }, [session.tracks, generateGlobalVariationKeyframesAtTimes]);

  // --- Settings ---

  const setVisible = useCallback((visible) => {
    setSettings(prev => ({ ...prev, visible }));
  }, []);

  const toggleVisible = useCallback(() => {
    setSettings(prev => ({ ...prev, visible: !prev.visible }));
  }, []);

  const setZoom = useCallback((zoom) => {
    // Allow extreme close-ups; keep practical lower bound
    setSettings(prev => ({ ...prev, zoom: Math.max(0.1, Math.min(4000, zoom)) }));
  }, []);

  const setScrollLeft = useCallback((scrollLeft) => {
    setSettings(prev => ({ ...prev, scrollLeft: Math.max(0, scrollLeft) }));
  }, []);

  const setTimelineSmoothing = useCallback((next) => {
    const num = Number(next);
    const clamped = Number.isFinite(num) ? Math.max(0, Math.min(1, num)) : 0;
    setSettings(prev => ({ ...prev, timelineSmoothing: clamped }));
  }, []);

  const setTimelineDamping = useCallback((next) => {
    const num = Number(next);
    const clamped = Number.isFinite(num) ? Math.max(0, Math.min(1, num)) : 0;
    setSettings(prev => ({ ...prev, timelineDamping: clamped }));
  }, []);

  // --- Snapshot for export/import ---

  const getTimelineSnapshot = useCallback(() => ({
    session: {
      ...session,
      audio: session.audio ? {
        durationSeconds: session.audio.durationSeconds,
        offsetSeconds: session.audio.offsetSeconds,
        fileName: session.audio.fileName,
        fileType: session.audio.fileType,
        src: session.audio.src,
      } : null,
    },
    settings: { ...settings, visible: false }, // Don't persist visibility
  }), [session, settings]);

  const applyTimelineSnapshot = useCallback((snapshot) => {
    if (!snapshot || typeof snapshot !== 'object') return;

    if (snapshot.session) {
      setSession(prev => ({
        ...createDefaultSession(),
        ...snapshot.session,
        id: prev.id, // Keep current ID
        audio: snapshot.session.audio ? {
          durationSeconds: snapshot.session.audio.durationSeconds,
          offsetSeconds: snapshot.session.audio.offsetSeconds,
          fileName: snapshot.session.audio.fileName,
          fileType: snapshot.session.audio.fileType,
        } : null, // Audio buffer must be re-loaded
      }));
    }

    if (snapshot.settings) {
      setSettings(prev => ({
        ...prev,
        ...snapshot.settings,
        visible: prev.visible, // Don't change visibility
      }));
    }
  }, []);

  // --- Clear/Reset ---

  const clearTimeline = useCallback(() => {
    stop();
    setSession(createDefaultSession());
  }, [stop]);

  // --- Context Value ---

  const value = useMemo(() => ({
    // Session state
    session,
    tracks: session.tracks,
    lengthSeconds: session.lengthSeconds,
    loop: session.loop,
    audio: session.audio,
    startPreset: session.startPreset,

    // Playback state
    isPlaying,
    positionSeconds,

    // Settings
    visible: settings.visible,
    zoom: settings.zoom,
    scrollLeft: settings.scrollLeft,
    timelineSmoothing: Number.isFinite(Number(settings.timelineSmoothing))
      ? Number(settings.timelineSmoothing)
      : DEFAULT_SETTINGS.timelineSmoothing,
    timelineDamping: Number.isFinite(Number(settings.timelineDamping))
      ? Number(settings.timelineDamping)
      : DEFAULT_SETTINGS.timelineDamping,

    // Playback controls
    play,
    pause,
    stop,
    togglePlay,
    seekTo,

    // Session mutations
    setLengthSeconds,
    setLoop,
    setSession,
    setStartPreset,
    clearStartPreset,

    // Track CRUD
    addTrack,
    updateTrack,
    removeTrack,
    reorderTracks,

    // Keyframe CRUD
    addKeyframe,
    addColorKeyframe,
    updateKeyframe,
    removeKeyframe,
    addShapeKeyframe,
    addGlobalShapeKeyframe,

    // Keyframe clipboard
    keyframeClipboard,
    copyKeyframe,
    pasteKeyframe,
    pasteKeyframeToTrack,

    // Audio
    setAudio,
    loadAudioFile,
    clearAudio,

    // Audio stream for recording (returns MediaStream or null)
    getAudioStream: () => audioDestinationRef.current?.stream || null,

    // Transient detection
    transients,
    transientSettings,
    setTransientSensitivity,
    setTransientsEnabled,

    // Energy map for variation scaling
    energyMap,

    // Variation keyframe generation
    generateVariationKeyframe,
    generateVariationKeyframesAtTimes,
    generateKeyframesBetween,
    generateRandomKeyframes,
    generateRandomNumericKeyframes,
    rerollVariationKeyframe,

    // Global shape track keyframe generation
    captureGlobalShapeKeyframe,
    generateGlobalVariationKeyframe,
    generateGlobalVariationKeyframesAtTimes,
    generateGlobalRandomKeyframes,
    generateGlobalKeyframesBetween,
    rerollGlobalShapeKeyframe,

    // Evaluation
    getTrackValue,
    getAllTrackValues,
    getTrackValuesAtTime,

    // Direct position access (for smooth playhead without re-renders)
    getPositionSeconds: () => positionRef.current,

    // Settings
    setVisible,
    toggleVisible,
    setZoom,
    setScrollLeft,
    setTimelineSmoothing,
    setTimelineDamping,

    // Snapshot
    getTimelineSnapshot,
    applyTimelineSnapshot,
    clearTimeline,

    // Helpers
    TRACK_COLORS,
    createKeyframe,
    createShapeKeyframe,
    setStartPresetStorage: (startPresetStorage) => setSession(prev => ({ ...prev, startPresetStorage })),
    getStartPresetStorage: () => session.startPresetStorage,
  }), [
    session,
    isPlaying,
    positionSeconds,
    settings,
    play,
    pause,
    stop,
    togglePlay,
    seekTo,
    setLengthSeconds,
    setLoop,
    setStartPreset,
    clearStartPreset,
    addTrack,
    updateTrack,
    removeTrack,
    reorderTracks,
    addKeyframe,
    addColorKeyframe,
    updateKeyframe,
    removeKeyframe,
    addShapeKeyframe,
    addGlobalShapeKeyframe,
    keyframeClipboard,
    copyKeyframe,
    pasteKeyframe,
    pasteKeyframeToTrack,
    setAudio,
    loadAudioFile,
    clearAudio,
    transients,
    transientSettings,
    setTransientSensitivity,
    setTransientsEnabled,
    energyMap,
    generateVariationKeyframe,
    generateVariationKeyframesAtTimes,
    generateKeyframesBetween,
    generateRandomKeyframes,
    generateRandomNumericKeyframes,
    rerollVariationKeyframe,
    captureGlobalShapeKeyframe,
    generateGlobalVariationKeyframe,
    generateGlobalVariationKeyframesAtTimes,
    generateGlobalRandomKeyframes,
    generateGlobalKeyframesBetween,
    rerollGlobalShapeKeyframe,
    getTrackValue,
    getAllTrackValues,
    getTrackValuesAtTime,
    // getPositionSeconds is defined inline above
    setVisible,
    toggleVisible,
    setZoom,
    setScrollLeft,
    setTimelineSmoothing,
    setTimelineDamping,
    getTimelineSnapshot,
    applyTimelineSnapshot,
    clearTimeline,
  ]);

  return (
    <TimelineContext.Provider value={value}>
      {children}
    </TimelineContext.Provider>
  );
};

export default TimelineContext;
