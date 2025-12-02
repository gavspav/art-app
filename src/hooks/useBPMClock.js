import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useBPMClock - Master BPM clock with beat counter
 * 
 * Provides:
 * - Master tempo (BPM)
 * - Beat counter (0-based, wraps at specified bar length)
 * - Playback controls (play/pause/reset)
 * - Tap tempo
 * - Beat phase (0-1 within current beat)
 */

const DEFAULT_BPM = 120;
const DEFAULT_BEATS_PER_BAR = 4;

export const useBPMClock = ({
  initialBPM = DEFAULT_BPM,
  beatsPerBar = DEFAULT_BEATS_PER_BAR,
  autoStart = false,
} = {}) => {
  const [bpm, setBPM] = useState(initialBPM);
  const [isPlaying, setIsPlaying] = useState(autoStart);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [beatPhase, setBeatPhase] = useState(0); // 0-1 within current beat
  
  // Internal state
  const startTimeRef = useRef(null);
  const lastBeatTimeRef = useRef(null);
  const animationFrameRef = useRef(null);
  const tapTimesRef = useRef([]);

  // Calculate beat duration in ms
  const beatDurationMs = useCallback(() => {
    return (60 / bpm) * 1000;
  }, [bpm]);

  // Update beat counter and phase
  const updateClock = useCallback(() => {
    if (!isPlaying || !startTimeRef.current) return;

    const now = performance.now();
    const elapsed = now - startTimeRef.current;
    const beatDuration = beatDurationMs();
    
    // Calculate current beat (integer) and phase (0-1)
    const totalBeats = elapsed / beatDuration;
    const beat = Math.floor(totalBeats) % (beatsPerBar * 1000); // Wrap at large number for long sessions
    const phase = totalBeats - Math.floor(totalBeats);

    setCurrentBeat(beat);
    setBeatPhase(phase);

    // Track last beat time for tap tempo
    const beatChanged = lastBeatTimeRef.current !== beat;
    if (beatChanged) {
      lastBeatTimeRef.current = beat;
    }

    animationFrameRef.current = requestAnimationFrame(updateClock);
  }, [isPlaying, bpm, beatDurationMs, beatsPerBar]);

  // Start/resume playback
  const play = useCallback(() => {
    if (isPlaying) return;
    
    // Resume from current position
    const now = performance.now();
    if (startTimeRef.current === null) {
      startTimeRef.current = now;
    } else {
      // Adjust start time to maintain current beat position
      const beatDuration = beatDurationMs();
      const currentOffset = (currentBeat + beatPhase) * beatDuration;
      startTimeRef.current = now - currentOffset;
    }
    
    setIsPlaying(true);
  }, [isPlaying, currentBeat, beatPhase, beatDurationMs]);

  // Pause playback
  const pause = useCallback(() => {
    setIsPlaying(false);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause]);

  // Reset to beat 0
  const reset = useCallback(() => {
    startTimeRef.current = performance.now();
    lastBeatTimeRef.current = null;
    setCurrentBeat(0);
    setBeatPhase(0);
  }, []);

  // Set BPM
  const setBPMValue = useCallback((newBPM) => {
    const clamped = Math.max(20, Math.min(300, Number(newBPM) || DEFAULT_BPM));
    setBPM(clamped);
    
    // Adjust start time to maintain current beat position
    if (startTimeRef.current !== null) {
      const now = performance.now();
      const beatDuration = (60 / clamped) * 1000;
      const currentOffset = (currentBeat + beatPhase) * beatDuration;
      startTimeRef.current = now - currentOffset;
    }
  }, [currentBeat, beatPhase]);

  // Tap tempo - calculate BPM from tap intervals
  const tap = useCallback(() => {
    const now = performance.now();
    tapTimesRef.current.push(now);
    
    // Keep only last 4 taps
    if (tapTimesRef.current.length > 4) {
      tapTimesRef.current.shift();
    }
    
    // Need at least 2 taps to calculate
    if (tapTimesRef.current.length >= 2) {
      const intervals = [];
      for (let i = 1; i < tapTimesRef.current.length; i++) {
        intervals.push(tapTimesRef.current[i] - tapTimesRef.current[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const calculatedBPM = Math.round((60 / avgInterval) * 1000);
      setBPMValue(calculatedBPM);
    }
    
    // Clear taps after 2 seconds of inactivity
    setTimeout(() => {
      const lastTap = tapTimesRef.current[tapTimesRef.current.length - 1];
      if (lastTap && performance.now() - lastTap > 2000) {
        tapTimesRef.current = [];
      }
    }, 2100);
  }, [setBPMValue]);

  // Start/stop animation loop
  useEffect(() => {
    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(updateClock);
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, updateClock]);

  return {
    // State
    bpm,
    isPlaying,
    currentBeat,
    beatPhase,
    beatsPerBar,
    
    // Actions
    setBPM: setBPMValue,
    play,
    pause,
    togglePlay,
    reset,
    tap,
    
    // Helpers
    beatDurationMs: beatDurationMs(),
  };
};
