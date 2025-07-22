/**
 * Canvas Component Tests
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Canvas from '../Canvas.jsx';

// Mock the animation utilities
vi.mock('../../../utils/animation/canvasRenderer.js', () => ({
  renderFrame: vi.fn()
}));

vi.mock('../../../utils/animation/shapeGenerator.js', () => ({
  generateLayerParams: vi.fn(() => [])
}));

// Mock the useCanvas hook to return not ready state (loading)
vi.mock('../../../hooks/useCanvas.js', () => ({
  useCanvas: vi.fn(() => ({
    canvasRef: { current: null },
    context: null,
    dimensions: { width: 0, height: 0 },
    pixelRatio: 1,
    isReady: false,
    error: null,
    clear: vi.fn(),
    resize: vi.fn()
  }))
}));

// Mock the useFullscreen hook
vi.mock('../../../hooks/useFullscreen.js', () => ({
  useFullscreen: vi.fn(() => ({
    isFullscreen: false,
    isSupported: true,
    error: null,
    enter: vi.fn().mockResolvedValue({ success: true }),
    exit: vi.fn().mockResolvedValue({ success: true }),
    toggle: vi.fn().mockResolvedValue({ success: true }),
    clearError: vi.fn(),
    methods: {
      request: vi.fn(),
      exit: vi.fn(),
      element: null
    }
  }))
}));

// Mock AnimationLoop - this won't be called in loading state
vi.mock('../../../utils/animation/animationLoop.js', () => ({
  AnimationLoop: vi.fn().mockImplementation(() => ({
    addCallback: vi.fn(),
    removeCallback: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    updateTime: vi.fn(),
    getTime: vi.fn(() => 0)
  }))
}));

describe('Canvas Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading state when canvas is not ready', () => {
    render(<Canvas />);
    
    expect(screen.getByText('Initializing Canvas...')).toBeInTheDocument();
    const container = document.querySelector('[class*="canvasContainer"]');
    expect(container).toBeInTheDocument();
    expect(container.className).toMatch(/loading/);
  });

  it('renders with default props in loading state', () => {
    render(<Canvas />);
    
    const container = document.querySelector('[class*="canvasContainer"]');
    expect(container).toBeInTheDocument();
    expect(container.className).toMatch(/canvasContainer/);
  });

  it('applies custom className in loading state', () => {
    render(<Canvas className="custom-class" />);
    
    const container = document.querySelector('[class*="canvasContainer"]');
    expect(container).toHaveClass('custom-class');
  });

  it('renders with animation parameters in loading state', () => {
    const animationParams = {
      speed: 0.02,
      colors: ['#ff0000', '#00ff00'],
      globalOpacity: 0.9,
      blendMode: 'screen',
      numLayers: 5
    };

    render(<Canvas animationParams={animationParams} />);
    
    expect(screen.getByText('Initializing Canvas...')).toBeInTheDocument();
  });

  it('handles layers prop in loading state', () => {
    const layers = [
      {
        position: { x: 0.5, y: 0.5 },
        colors: ['#ff0000'],
        opacity: 0.8,
        blendMode: 'multiply'
      }
    ];

    render(<Canvas layers={layers} />);
    
    expect(screen.getByText('Initializing Canvas...')).toBeInTheDocument();
  });

  it('handles frozen animation state in loading state', () => {
    render(<Canvas isFrozen={true} />);
    
    expect(screen.getByText('Initializing Canvas...')).toBeInTheDocument();
  });

  it('does not render debug info in production mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    
    render(<Canvas />);
    
    // Debug info should not be present in loading state
    expect(screen.queryByText(/Canvas:/)).not.toBeInTheDocument();
    
    process.env.NODE_ENV = originalEnv;
  });

  it('renders loading spinner', () => {
    render(<Canvas />);
    
    const spinner = document.querySelector('[class*="spinner"]');
    expect(spinner).toBeInTheDocument();
  });
});