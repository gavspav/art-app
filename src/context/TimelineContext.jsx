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
 * Create a default keyframe
 */
const createKeyframe = (timeSeconds, value01, curve = 'linear', tension = 0.5) => ({
  id: generateId(),
  timeSeconds,
  value01,
  curve,
  tension,
});

/**
 * Create a default track
 */
const createTrack = (name, targetId, color, lengthSeconds) => ({
  id: generateId(),
  name,
  color,
  enabled: true,
  targetId, // e.g., 'layer:abc123:radiusFactor' or 'global:globalSpeedMultiplier'
  range: { outputMin: 0, outputMax: 1 },
  keyframes: [
    createKeyframe(0, 0),
    createKeyframe(lengthSeconds, 1),
  ],
});

/**
 * Default timeline session
 */
const createDefaultSession = () => ({
  id: generateId(),
  lengthSeconds: DEFAULT_LENGTH_SECONDS,
  tracks: [],
  audio: null, // { src, durationSeconds, peaks, offsetSeconds }
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
      
      // Start from the current position
      const offset = Math.max(0, Math.min(startPosition, audio.durationSeconds));
      source.start(0, offset);
      
      audioSourceRef.current = source;
      audioStartTimeRef.current = ctx.currentTime;
      audioStartPositionRef.current = offset;
    } catch (error) {
      console.warn('Failed to start audio playback:', error);
    }
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
    setPositionSeconds(clamped);
    
    // If playing, restart audio from new position
    if (isPlaying) {
      stopAudioPlayback();
      startAudioPlayback(clamped);
    }
  }, [isPlaying, startAudioPlayback, stopAudioPlayback]);

  // --- RAF Playback Loop ---

  useEffect(() => {
    if (!isPlaying) return;

    const tick = () => {
      const now = performance.now();
      const deltaMs = lastUpdateTimeRef.current ? now - lastUpdateTimeRef.current : 0;
      lastUpdateTimeRef.current = now;

      const deltaSeconds = deltaMs / 1000;
      let newPosition = positionRef.current + deltaSeconds;

      const { lengthSeconds, loop } = sessionRef.current;

      // Handle looping or end
      if (loop.enabled) {
        // Loop within region
        if (newPosition >= loop.endSeconds) {
          newPosition = loop.startSeconds + (newPosition - loop.endSeconds);
        }
      } else {
        // One-shot: stop at end
        if (newPosition >= lengthSeconds) {
          newPosition = lengthSeconds;
          setIsPlaying(false);
        }
      }

      setPositionSeconds(newPosition);
      
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
  }, [isPlaying]);

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
        
        // Don't allow removing if only 2 keyframes left
        if (track.keyframes.length <= 2) return track;
        
        return {
          ...track,
          keyframes: track.keyframes.filter(kf => kf.id !== keyframeId),
        };
      }),
    }));
  }, []);

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

    // Track CRUD
    addTrack,
    updateTrack,
    removeTrack,
    reorderTracks,

    // Keyframe CRUD
    addKeyframe,
    updateKeyframe,
    removeKeyframe,

    // Audio
    setAudio,
    clearAudio,

    // Evaluation
    getTrackValue,
    getAllTrackValues,
    getTrackValuesAtTime,

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
    addTrack,
    updateTrack,
    removeTrack,
    reorderTracks,
    addKeyframe,
    updateKeyframe,
    removeKeyframe,
    setAudio,
    clearAudio,
    getTrackValue,
    getAllTrackValues,
    getTrackValuesAtTime,
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
