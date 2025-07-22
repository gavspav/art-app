/**
 * Animation hook for canvas rendering
 * Manages animation loop and timing for canvas-based animations
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { AnimationLoop } from '../utils/animation/animationLoop.js';

/**
 * Custom hook for managing canvas animation loop
 * @param {Function} renderCallback - Function to call on each animation frame
 * @param {Object} options - Animation options
 * @returns {Object} Animation control functions and state
 */
export const useAnimation = (renderCallback, options = {}) => {
  const {
    speed = 0.01,
    isFrozen = false,
    autoStart = true,
    targetFPS = 60
  } = options;

  const animationLoopRef = useRef(null);
  const callbackRef = useRef(renderCallback);
  const timeRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const fpsCounterRef = useRef({ frames: 0, lastTime: 0, fps: 0 });
  
  const [isRunning, setIsRunning] = useState(false);
  const [currentFPS, setCurrentFPS] = useState(0);
  const [time, setTimeState] = useState(0);

  // Update callback ref when renderCallback changes
  useEffect(() => {
    callbackRef.current = renderCallback;
  }, [renderCallback]);

  // Animation frame callback
  const animationCallback = useCallback((animationTime, deltaTime) => {
    // Update time based on speed and frozen state
    if (!isFrozen) {
      timeRef.current += speed;
      setTimeState(timeRef.current);
    }

    // Calculate FPS
    const fpsCounter = fpsCounterRef.current;
    fpsCounter.frames++;
    if (animationTime - fpsCounter.lastTime >= 1000) {
      fpsCounter.fps = Math.round((fpsCounter.frames * 1000) / (animationTime - fpsCounter.lastTime));
      setCurrentFPS(fpsCounter.fps);
      fpsCounter.frames = 0;
      fpsCounter.lastTime = animationTime;
    }

    // Call the render callback with current time and delta
    if (callbackRef.current) {
      try {
        callbackRef.current(timeRef.current, deltaTime);
      } catch (error) {
        console.error('Animation render callback error:', error);
      }
    }

    lastFrameTimeRef.current = animationTime;
  }, [speed, isFrozen]);

  // Start animation
  const start = useCallback(() => {
    if (!animationLoopRef.current) {
      animationLoopRef.current = new AnimationLoop();
    }

    const animationLoop = animationLoopRef.current;
    
    if (!animationLoop.isRunning) {
      animationLoop.addCallback(animationCallback);
      animationLoop.start();
      setIsRunning(true);
    }
  }, [animationCallback]);

  // Stop animation
  const stop = useCallback(() => {
    if (animationLoopRef.current) {
      animationLoopRef.current.removeCallback(animationCallback);
      animationLoopRef.current.stop();
      setIsRunning(false);
    }
  }, [animationCallback]);

  // Pause animation (keeps loop running but freezes time)
  const pause = useCallback(() => {
    // Animation will continue running but time won't advance due to isFrozen
    setIsRunning(false);
  }, []);

  // Resume animation
  const resume = useCallback(() => {
    setIsRunning(true);
  }, []);

  // Reset animation time
  const reset = useCallback(() => {
    timeRef.current = 0;
    setTimeState(0);
    lastFrameTimeRef.current = 0;
    fpsCounterRef.current = { frames: 0, lastTime: 0, fps: 0 };
    setCurrentFPS(0);
  }, []);

  // Set animation time directly
  const setTime = useCallback((time) => {
    timeRef.current = time;
    setTimeState(time);
  }, []);

  // Get current animation time
  const getTime = useCallback(() => {
    return timeRef.current;
  }, []);

  // Initialize animation loop
  useEffect(() => {
    if (autoStart) {
      start();
    }

    // Cleanup on unmount
    return () => {
      if (animationLoopRef.current) {
        animationLoopRef.current.removeCallback(animationCallback);
        animationLoopRef.current.stop();
        animationLoopRef.current = null;
      }
    };
  }, [start, autoStart, animationCallback]);

  // Handle frozen state changes
  useEffect(() => {
    if (isFrozen) {
      pause();
    } else if (animationLoopRef.current && !isRunning) {
      resume();
    }
  }, [isFrozen, isRunning, pause, resume]);

  return {
    // State
    isRunning: isRunning && !isFrozen,
    currentFPS,
    time,
    
    // Control functions
    start,
    stop,
    pause,
    resume,
    reset,
    setTime,
    getTime,
    
    // Animation loop reference (for advanced usage)
    animationLoop: animationLoopRef.current
  };
};
