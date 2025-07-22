/**
 * Integration tests for Canvas component with animation hook
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Canvas from '../Canvas.jsx';

// Mock the animation hook
vi.mock('../../../hooks/useAnimation.js', () => ({
  useAnimation: vi.fn(() => ({
    isRunning: true,
    currentFPS: 60,
    time: 0,
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    reset: vi.fn(),
    setTime: vi.fn(),
    getTime: vi.fn(() => 0)
  }))
}));

// Mock the canvas hook
vi.mock('../../../hooks/useCanvas.js', () => ({
  useCanvas: vi.fn(() => ({
    canvasRef: { current: null },
    context: null,
    dimensions: { width: 800, height: 600 },
    pixelRatio: 1,
    isReady: false,
    error: null,
    clear: vi.fn(),
    resize: vi.fn()
  }))
}));

// Mock the fullscreen hook
vi.mock('../../../hooks/useFullscreen.js', () => ({
  useFullscreen: vi.fn(() => ({
    isFullscreen: false,
    toggle: vi.fn(),
    error: null
  }))
}));

describe('Canvas Animation Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render loading state when canvas is not ready', () => {
    render(<Canvas />);
    
    expect(screen.getByText('Initializing Canvas...')).toBeInTheDocument();
  });

  it('should use animation hook with correct parameters', async () => {
    const { useAnimation } = await import('../../../hooks/useAnimation.js');
    
    const animationParams = {
      speed: 0.02,
      colors: ['#ff0000', '#00ff00'],
      globalOpacity: 0.9
    };

    render(<Canvas animationParams={animationParams} isFrozen={true} />);

    expect(useAnimation).toHaveBeenCalledWith(
      expect.any(Function), // render callback
      expect.objectContaining({
        speed: 0.02,
        isFrozen: true,
        autoStart: false, // Canvas not ready
        targetFPS: 60
      })
    );
  });

  it('should call onAnimationStateChange when animation state changes', async () => {
    const { useAnimation } = await import('../../../hooks/useAnimation.js');
    const onAnimationStateChange = vi.fn();

    // Mock animation hook to return specific state
    useAnimation.mockReturnValue({
      isRunning: true,
      currentFPS: 60,
      time: 1.5,
      start: vi.fn(),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      reset: vi.fn(),
      setTime: vi.fn(),
      getTime: vi.fn(() => 1.5)
    });

    render(<Canvas onAnimationStateChange={onAnimationStateChange} />);

    expect(onAnimationStateChange).toHaveBeenCalledWith({
      isRunning: true,
      currentFPS: 60,
      isFrozen: false,
      controls: {
        start: expect.any(Function),
        stop: expect.any(Function),
        pause: expect.any(Function),
        resume: expect.any(Function),
        reset: expect.any(Function)
      }
    });
  });

  it('should handle frozen animation state correctly', async () => {
    const { useAnimation } = await import('../../../hooks/useAnimation.js');

    render(<Canvas isFrozen={true} />);

    expect(useAnimation).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isFrozen: true
      })
    );
  });

  it('should pass correct speed from animationParams', async () => {
    const { useAnimation } = await import('../../../hooks/useAnimation.js');

    const animationParams = { speed: 0.05 };
    render(<Canvas animationParams={animationParams} />);

    expect(useAnimation).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        speed: 0.05
      })
    );
  });

  it('should use default speed when not provided', async () => {
    const { useAnimation } = await import('../../../hooks/useAnimation.js');

    render(<Canvas />);

    expect(useAnimation).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        speed: 0.01 // default speed
      })
    );
  });

  it('should handle animation render callback without errors', async () => {
    const { useAnimation } = await import('../../../hooks/useAnimation.js');
    const { useCanvas } = await import('../../../hooks/useCanvas.js');

    // Mock canvas as ready with context
    useCanvas.mockReturnValue({
      canvasRef: { current: document.createElement('canvas') },
      context: {
        fillStyle: '',
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        closePath: vi.fn()
      },
      dimensions: { width: 800, height: 600 },
      pixelRatio: 1,
      isReady: true,
      error: null,
      clear: vi.fn(),
      resize: vi.fn()
    });

    render(<Canvas layers={[]} />);

    // Get the render callback that was passed to useAnimation
    const renderCallback = useAnimation.mock.calls[0][0];

    // Should not throw when called with time and deltaTime
    expect(() => {
      renderCallback(1.0, 16.67);
    }).not.toThrow();
  });
});