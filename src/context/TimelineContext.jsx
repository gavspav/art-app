import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { evaluateTrackAtTime } from '../utils/envelopes.js';

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
 * Create a shape keyframe (stores node geometry snapshot)
 */
const createShapeKeyframe = (timeSeconds, nodes, subpaths, label = '') => ({
  id: generateId(),
  timeSeconds,
  nodes: nodes || null,
  subpaths: subpaths || null,
  label,
});

/**
 * Create a default track
 * @param {string} name - Track display name
 * @param {string} targetId - e.g., 'layer:abc123:radiusFactor' or 'global:globalSpeedMultiplier' or 'layer:abc123:shape'
 * @param {string} color - Track color
 * @param {number} lengthSeconds - Timeline length
 * @param {'numeric'|'shape'} type - Track type (default: 'numeric')
 */
const createTrack = (name, targetId, color, lengthSeconds, type = 'numeric') => {
  const isShape = type === 'shape' || (targetId && targetId.endsWith(':shape'));
  return {
    id: generateId(),
    name,
    color,
    enabled: true,
    targetId,
    type: isShape ? 'shape' : 'numeric',
    // Numeric tracks have range and numeric keyframes
    // Shape tracks have shape keyframes (no range needed)
    range: isShape ? null : { outputMin: 0, outputMax: 1 },
    keyframes: isShape ? [] : [
      createKeyframe(0, 0),
      createKeyframe(lengthSeconds, 1),
    ],
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

  // Refs for RAF loop
  const lastUpdateTimeRef = useRef(null);
  const animationFrameRef = useRef(null);
  const positionRef = useRef(positionSeconds);
  const sessionRef = useRef(session);
  
  // Audio playback refs
  const audioContextRef = useRef(null);
  const audioSourceRef = useRef(null);
  const audioStartTimeRef = useRef(0);
  const audioStartPositionRef = useRef(0);
  
  // Timing refs for RAF loop (used by seekTo and tick)
  const playStartTimeRef = useRef(0); // performance.now() when playback started
  const playStartPositionRef = useRef(0); // timeline position when playback started
  const frameCountRef = useRef(0);

  // Keep refs in sync
  useEffect(() => { positionRef.current = positionSeconds; }, [positionSeconds]);
  useEffect(() => { sessionRef.current = session; }, [session]);

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
      source.connect(ctx.destination);
      
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
    setIsPlaying(false);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    stopAudioPlayback();
  }, [stopAudioPlayback]);

  const stop = useCallback(() => {
    pause();
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
      
      if (isPlaying && newPosition < lengthSeconds) {
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
    setSession(prev => ({
      ...prev,
      loop: { ...prev.loop, ...loopConfig },
    }));
  }, []);

  // --- Track CRUD ---

  const addTrack = useCallback((name, targetId) => {
    setSession(prev => {
      const colorIndex = prev.tracks.length % TRACK_COLORS.length;
      const newTrack = createTrack(
        name || `Track ${prev.tracks.length + 1}`,
        targetId || '',
        TRACK_COLORS[colorIndex],
        prev.lengthSeconds
      );
      return { ...prev, tracks: [...prev.tracks, newTrack] };
    });
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
        
        // Don't allow removing if only 2 keyframes left (for numeric tracks)
        // Shape tracks can have any number of keyframes (including 0)
        if (track.type !== 'shape' && track.keyframes.length <= 2) return track;
        
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
   */
  const addShapeKeyframe = useCallback((trackId, timeSeconds, nodes, subpaths, label = '') => {
    const TIME_EPSILON = 0.01; // 10ms tolerance for "same time"
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
          // Update existing keyframe
          keyframes = track.keyframes.map((kf, i) =>
            i === existingIndex
              ? { ...kf, nodes: nodes || null, subpaths: subpaths || null, label }
              : kf
          );
        } else {
          // Add new keyframe
          const newKeyframe = createShapeKeyframe(timeSeconds, nodes, subpaths, label);
          keyframes = [...track.keyframes, newKeyframe].sort((a, b) => a.timeSeconds - b.timeSeconds);
        }
        
        return { ...track, type: 'shape', keyframes };
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
   * @param {string} trackId - Track ID to paste into
   * @param {number} timeSeconds - Time to paste at (defaults to current playhead)
   */
  const pasteKeyframe = useCallback((trackId, timeSeconds) => {
    if (!keyframeClipboard) return;
    
    const pasteTime = timeSeconds ?? positionRef.current;
    const { keyframe, trackType } = keyframeClipboard;
    const TIME_EPSILON = 0.01; // 10ms tolerance for "same time"
    
    setSession(prev => ({
      ...prev,
      tracks: prev.tracks.map(track => {
        if (track.id !== trackId) return track;
        
        // Check track type compatibility
        const isShapeTrack = track.type === 'shape' || track.targetId?.endsWith(':shape');
        const isShapeKeyframe = trackType === 'shape';
        
        if (isShapeTrack !== isShapeKeyframe) {
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

  // --- Audio ---

  const setAudio = useCallback((audioData) => {
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
  }, []);

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
    updateKeyframe,
    removeKeyframe,
    addShapeKeyframe,

    // Keyframe clipboard
    keyframeClipboard,
    copyKeyframe,
    pasteKeyframe,

    // Audio
    setAudio,
    clearAudio,

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
    updateKeyframe,
    removeKeyframe,
    addShapeKeyframe,
    keyframeClipboard,
    copyKeyframe,
    pasteKeyframe,
    setAudio,
    clearAudio,
    getTrackValue,
    getAllTrackValues,
    getTrackValuesAtTime,
    // getPositionSeconds is defined inline above
    setVisible,
    toggleVisible,
    setZoom,
    setScrollLeft,
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
