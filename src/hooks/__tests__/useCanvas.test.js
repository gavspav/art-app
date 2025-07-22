/**
 * Tests for useCanvas hook
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useCanvas } from '../useCanvas.js';

// Mock canvas and context
const mockContext = {
  scale: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  setTransform: vi.fn(),
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  getImageData: vi.fn(),
  globalAlpha: 1,
  globalCompositeOperation: 'source-over'
};

const mockCanvas = {
  getContext: vi.fn(() => mockContext),
  width: 0,
  height: 0,
  style: {},
  parentElement: {
    getBoundingClientRect: vi.fn(() => ({
      width: 800,
      height: 600
    }))
  },
  toDataURL: vi.fn(() => 'data:image/png;base64,mock'),
  toBlob: vi.fn((callback) => callback(new Blob()))
};

// Mock ResizeObserver
const mockResizeObserver = {
  observe: vi.fn(),
  disconnect: vi.fn()
};

describe('useCanvas', () => {
  let mockRef;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock devicePixelRatio
    Object.defineProperty(window, 'devicePixelRatio', {
      writable: true,
      value: 2
    });

    // Create a mock ref
    mockRef = { current: mockCanvas };
    
    // Reset canvas mock
    mockCanvas.width = 0;
    mockCanvas.height = 0;
    mockCanvas.style = {};
    mockContext.fillStyle = '#000000';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default options', () => {
      const { result } = renderHook(() => useCanvas());
      
      expect(result.current.canvasRef).toBeDefined();
      expect(result.current.context).toBe(null); // No canvas attached yet
      expect(result.current.dimensions).toEqual({ width: 0, height: 0 });
      expect(result.current.pixelRatio).toBe(1);
      expect(result.current.isReady).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should initialize with custom options', () => {
      const options = {
        autoResize: false,
        pixelRatio: 3,
        backgroundColor: '#ff0000',
        contextType: 'webgl'
      };
      
      const { result } = renderHook(() => useCanvas(options));
      
      expect(result.current.canvasRef).toBeDefined();
    });

    it('should detect device pixel ratio', () => {
      const { result } = renderHook(() => useCanvas());
      
      // Simulate canvas being attached
      result.current.canvasRef.current = mockCanvas;
      
      act(() => {
        result.current.initializeContext();
      });
      
      // The hook should use device pixel ratio of 2
      expect(result.current.pixelRatio).toBe(2);
    });

    it('should use custom pixel ratio', () => {
      const { result } = renderHook(() => useCanvas({ pixelRatio: 1.5 }));
      
      result.current.canvasRef.current = mockCanvas;
      
      act(() => {
        result.current.initializeContext();
        result.current.resize();
      });
      
      expect(result.current.pixelRatio).toBe(1.5);
    });
  });

  describe('context initialization', () => {
    it('should initialize 2D context successfully', () => {
      const { result } = renderHook(() => useCanvas());
      
      result.current.canvasRef.current = mockCanvas;
      
      let success;
      act(() => {
        success = result.current.initializeContext();
      });
      
      expect(success).toBe(true);
      expect(mockCanvas.getContext).toHaveBeenCalledWith('2d', {});
      expect(result.current.context).toBe(mockContext);
      expect(result.current.error).toBe(null);
    });

    it('should handle context initialization failure', () => {
      mockCanvas.getContext.mockReturnValue(null);
      
      const { result } = renderHook(() => useCanvas());
      
      result.current.canvasRef.current = mockCanvas;
      
      let success;
      act(() => {
        success = result.current.initializeContext();
      });
      
      expect(success).toBe(false);
      expect(result.current.error).toBe('Failed to get 2d context');
    });

    it('should handle missing canvas element', () => {
      const { result } = renderHook(() => useCanvas());
      
      let success;
      act(() => {
        success = result.current.initializeContext();
      });
      
      expect(success).toBe(false);
      expect(result.current.error).toBe('Canvas element not found');
    });

    it('should initialize WebGL context', () => {
      const { result } = renderHook(() => useCanvas({ contextType: 'webgl' }));
      
      result.current.canvasRef.current = mockCanvas;
      
      act(() => {
        result.current.initializeContext();
      });
      
      expect(mockCanvas.getContext).toHaveBeenCalledWith('webgl', {});
    });

    it('should pass context attributes', () => {
      const contextAttributes = { alpha: false, antialias: true };
      const { result } = renderHook(() => useCanvas({ contextAttributes }));
      
      result.current.canvasRef.current = mockCanvas;
      
      act(() => {
        result.current.initializeContext();
      });
      
      expect(mockCanvas.getContext).toHaveBeenCalledWith('2d', contextAttributes);
    });
  });

  describe('canvas resizing', () => {
    it('should resize canvas correctly', () => {
      const { result } = renderHook(() => useCanvas());
      
      result.current.canvasRef.current = mockCanvas;
      
      act(() => {
        result.current.initializeContext();
        result.current.resize();
      });
      
      // Canvas should be sized according to container (800x600) * pixelRatio (2)
      expect(mockCanvas.width).toBe(1600);
      expect(mockCanvas.height).toBe(1200);
      expect(mockCanvas.style.width).toBe('800px');
      expect(mockCanvas.style.height).toBe('600px');
      
      // Context should be scaled
      expect(mockContext.scale).toHaveBeenCalledWith(2, 2);
      
      // Dimensions should be updated
      expect(result.current.dimensions).toEqual({
        width: 800,
        height: 600,
        canvasWidth: 1600,
        canvasHeight: 1200
      });
    });

    it('should handle missing parent element', () => {
      const canvasWithoutParent = {
        ...mockCanvas,
        parentElement: null
      };
      
      const { result } = renderHook(() => useCanvas());
      
      result.current.canvasRef.current = canvasWithoutParent;
      
      act(() => {
        result.current.resize();
      });
      
      // Should not throw or crash
      expect(result.current.dimensions.width).toBe(0);
    });

    it('should not scale context for non-2D contexts', () => {
      const { result } = renderHook(() => useCanvas({ contextType: 'webgl' }));
      
      result.current.canvasRef.current = mockCanvas;
      
      act(() => {
        result.current.initializeContext();
        result.current.resize();
      });
      
      expect(mockContext.scale).not.toHaveBeenCalled();
    });
  });

  describe('canvas clearing', () => {
    it('should clear canvas with default background color', () => {
      const { result } = renderHook(() => useCanvas());
      
      result.current.canvasRef.current = mockCanvas;
      
      act(() => {
        result.current.initializeContext();
        result.current.clear();
      });
      
      expect(mockContext.save).toHaveBeenCalled();
      expect(mockContext.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
      expect(mockContext.fillRect).toHaveBeenCalled();
      expect(mockContext.restore).toHaveBeenCalled();
    });

    it('should clear canvas with custom color', () => {
      const { result } = renderHook(() => useCanvas());
      
      result.current.canvasRef.current = mockCanvas;
      
      act(() => {
        result.current.initializeContext();
        result.current.clear('#ff0000');
      });
      
      expect(mockContext.fillStyle).toBe('#ff0000');
      expect(mockContext.fillRect).toHaveBeenCalled();
    });

    it('should clear canvas without color (transparent)', () => {
      const { result } = renderHook(() => useCanvas());
      
      result.current.canvasRef.current = mockCanvas;
      
      act(() => {
        result.current.initializeContext();
        result.current.clear(null);
      });
      
      expect(mockContext.clearRect).toHaveBeenCalled();
      expect(mockContext.fillRect).not.toHaveBeenCalled();
    });

    it('should handle clear without context', () => {
      const { result } = renderHook(() => useCanvas());
      
      act(() => {
        result.current.clear();
      });
      
      // Should not throw
      expect(mockContext.save).not.toHaveBeenCalled();
    });
  });

  describe('canvas reset', () => {
    it('should reset canvas state', () => {
      const { result } = renderHook(() => useCanvas());
      
      result.current.canvasRef.current = mockCanvas;
      
      act(() => {
        result.current.initializeContext();
        result.current.reset();
      });
      
      expect(mockContext.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
      expect(mockContext.globalAlpha).toBe(1);
      expect(mockContext.globalCompositeOperation).toBe('source-over');
    });
  });

  describe('data extraction', () => {
    it('should get image data', () => {
      const mockImageData = { data: new Uint8ClampedArray(4), width: 1, height: 1 };
      mockContext.getImageData.mockReturnValue(mockImageData);
      
      const { result } = renderHook(() => useCanvas());
      
      result.current.canvasRef.current = mockCanvas;
      
      act(() => {
        result.current.initializeContext();
      });
      
      const imageData = result.current.getImageData(0, 0, 100, 100);
      
      expect(mockContext.getImageData).toHaveBeenCalledWith(0, 0, 100, 100);
      expect(imageData).toBe(mockImageData);
    });

    it('should handle getImageData failure', () => {
      mockContext.getImageData.mockImplementation(() => {
        throw new Error('Security error');
      });
      
      const { result } = renderHook(() => useCanvas());
      
      result.current.canvasRef.current = mockCanvas;
      
      act(() => {
        result.current.initializeContext();
      });
      
      const imageData = result.current.getImageData();
      
      expect(imageData).toBe(null);
    });

    it('should convert to data URL', () => {
      const { result } = renderHook(() => useCanvas());
      
      result.current.canvasRef.current = mockCanvas;
      
      act(() => {
        result.current.initializeContext();
      });
      
      const dataURL = result.current.toDataURL();
      
      expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/png', 0.92);
      expect(dataURL).toBe('data:image/png;base64,mock');
    });

    it('should convert to blob', () => {
      const { result } = renderHook(() => useCanvas());
      
      result.current.canvasRef.current = mockCanvas;
      
      act(() => {
        result.current.initializeContext();
      });
      
      const callback = vi.fn();
      result.current.toBlob(callback);
      
      expect(mockCanvas.toBlob).toHaveBeenCalledWith(callback, 'image/png', 0.92);
      expect(callback).toHaveBeenCalledWith(expect.any(Blob));
    });

    it('should handle toBlob failure', () => {
      mockCanvas.toBlob.mockImplementation(() => {
        throw new Error('Conversion failed');
      });
      
      const { result } = renderHook(() => useCanvas());
      
      result.current.canvasRef.current = mockCanvas;
      
      act(() => {
        result.current.initializeContext();
      });
      
      const callback = vi.fn();
      result.current.toBlob(callback);
      
      expect(callback).toHaveBeenCalledWith(null);
    });
  });

  describe('resize observer', () => {
    it('should set up resize observer when autoResize is true', () => {
      const { result } = renderHook(() => useCanvas({ autoResize: true }));
      
      result.current.canvasRef.current = mockCanvas;
      
      act(() => {
        result.current.initializeContext();
      });
      
      expect(global.ResizeObserver).toHaveBeenCalled();
      expect(mockResizeObserver.observe).toHaveBeenCalledWith(mockCanvas.parentElement);
    });

    it('should not set up resize observer when autoResize is false', () => {
      const { result } = renderHook(() => useCanvas({ autoResize: false }));
      
      result.current.canvasRef.current = mockCanvas;
      
      act(() => {
        result.current.initializeContext();
      });
      
      expect(mockResizeObserver.observe).not.toHaveBeenCalled();
    });

    it('should clean up resize observer on unmount', () => {
      const { result, unmount } = renderHook(() => useCanvas({ autoResize: true }));
      
      result.current.canvasRef.current = mockCanvas;
      
      act(() => {
        result.current.initializeContext();
      });
      
      unmount();
      
      expect(mockResizeObserver.disconnect).toHaveBeenCalled();
    });

    it('should fall back to window resize when ResizeObserver is not available', () => {
      // Temporarily remove ResizeObserver
      const originalResizeObserver = global.ResizeObserver;
      delete global.ResizeObserver;
      
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      
      const { result, unmount } = renderHook(() => useCanvas({ autoResize: true }));
      
      result.current.canvasRef.current = mockCanvas;
      
      act(() => {
        result.current.initializeContext();
      });
      
      expect(addEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
      
      unmount();
      
      expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
      
      // Restore ResizeObserver
      global.ResizeObserver = originalResizeObserver;
      addEventListenerSpy.mockRestore();
      removeEventListenerSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('should handle context initialization errors', () => {
      mockCanvas.getContext.mockImplementation(() => {
        throw new Error('Context error');
      });
      
      const { result } = renderHook(() => useCanvas());
      
      result.current.canvasRef.current = mockCanvas;
      
      act(() => {
        result.current.initializeContext();
      });
      
      expect(result.current.error).toBe('Failed to initialize canvas context');
    });

    it('should return null for data operations without canvas', () => {
      const { result } = renderHook(() => useCanvas());
      
      const imageData = result.current.getImageData();
      const dataURL = result.current.toDataURL();
      
      expect(imageData).toBe(null);
      expect(dataURL).toBe(null);
    });

    it('should handle toBlob without canvas', () => {
      const { result } = renderHook(() => useCanvas());
      
      const callback = vi.fn();
      result.current.toBlob(callback);
      
      expect(callback).toHaveBeenCalledWith(null);
    });
  });
});