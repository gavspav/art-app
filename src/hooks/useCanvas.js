/**
 * useCanvas Hook - Manages canvas setup and management
 * Handles canvas initialization, resizing, and pixel ratio management
 */

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Custom hook for managing canvas setup and operations
 * @param {Object} options - Canvas configuration options
 * @returns {Object} Canvas management interface
 */
export const useCanvas = (options = {}) => {
  const {
    autoResize = true,
    pixelRatio = null, // null = auto-detect
    backgroundColor = '#000000',
    contextType = '2d',
    contextAttributes = {}
  } = options;

  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [actualPixelRatio, setActualPixelRatio] = useState(1);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);
  const resizeObserverRef = useRef(null);

  // Get device pixel ratio
  const getPixelRatio = useCallback(() => {
    if (pixelRatio !== null) {
      return pixelRatio;
    }
    return window.devicePixelRatio || 1;
  }, [pixelRatio]);

  // Initialize canvas context
  const initializeContext = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      setError('Canvas element not found');
      return false;
    }

    try {
      const context = canvas.getContext(contextType, contextAttributes);
      if (!context) {
        setError(`Failed to get ${contextType} context`);
        return false;
      }

      contextRef.current = context;
      setError(null);
      return true;
    } catch (err) {
      console.error('Failed to initialize canvas context:', err);
      setError('Failed to initialize canvas context');
      return false;
    }
  }, [contextType, contextAttributes]);

  // Resize canvas to match display size
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const container = canvas.parentElement;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const displayWidth = containerRect.width;
    const displayHeight = containerRect.height;

    const ratio = getPixelRatio();
    
    // Set actual canvas size in memory (scaled by pixel ratio)
    canvas.width = displayWidth * ratio;
    canvas.height = displayHeight * ratio;
    
    // Set display size (CSS pixels)
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
    
    // Scale context to match pixel ratio
    const context = contextRef.current;
    if (context && contextType === '2d') {
      context.scale(ratio, ratio);
    }
    
    setDimensions({
      width: displayWidth,
      height: displayHeight,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height
    });
    
    setActualPixelRatio(ratio);
  }, [getPixelRatio, contextType]);

  // Clear canvas
  const clear = useCallback((color = backgroundColor) => {
    const context = contextRef.current;
    const canvas = canvasRef.current;
    
    if (!context || !canvas) return;

    if (contextType === '2d') {
      // Save current state
      context.save();
      
      // Reset transform to clear entire canvas
      context.setTransform(1, 0, 0, 1, 0, 0);
      
      if (color) {
        context.fillStyle = color;
        context.fillRect(0, 0, canvas.width, canvas.height);
      } else {
        context.clearRect(0, 0, canvas.width, canvas.height);
      }
      
      // Restore state
      context.restore();
    }
  }, [backgroundColor, contextType]);

  // Setup resize observer
  useEffect(() => {
    if (!autoResize || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const container = canvas.parentElement;
    
    if (!container) return;

    // Use ResizeObserver if available, otherwise fall back to window resize
    if (window.ResizeObserver) {
      resizeObserverRef.current = new ResizeObserver(() => {
        resizeCanvas();
      });
      
      resizeObserverRef.current.observe(container);
    } else {
      // Fallback to window resize event
      const handleResize = () => {
        resizeCanvas();
      };
      
      window.addEventListener('resize', handleResize);
      
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, [autoResize, resizeCanvas]);

  // Initialize canvas when ref is available
  useEffect(() => {
    console.log('useCanvas: Initialization effect triggered');
    
    if (!canvasRef.current) {
      console.log('useCanvas: No canvas ref, returning');
      return;
    }

    const tryInitialize = () => {
      console.log('useCanvas: tryInitialize called');
      const canvas = canvasRef.current;
      if (!canvas) {
        console.log('useCanvas: No canvas element');
        return false;
      }

      const container = canvas.parentElement;
      if (!container) {
        console.log('useCanvas: No container element');
        return false;
      }

      // Check if container has dimensions
      const rect = container.getBoundingClientRect();
      console.log(`useCanvas: Container dimensions: ${rect.width}x${rect.height}`);
      
      if (rect.width === 0 || rect.height === 0) {
        console.log('useCanvas: Container has no dimensions yet, retrying...');
        return false;
      }

      console.log('useCanvas: Attempting to initialize context...');
      const success = initializeContext();
      console.log(`useCanvas: Context initialization result: ${success}`);
      
      if (success) {
        console.log('useCanvas: Resizing canvas...');
        resizeCanvas();
        console.log('useCanvas: Setting ready to true');
        setIsReady(true);
        return true;
      }
      return false;
    };

    // Try to initialize immediately
    console.log('useCanvas: Trying immediate initialization');
    if (tryInitialize()) {
      console.log('useCanvas: Immediate initialization successful');
      return;
    }

    // If that fails, try again after a short delay
    console.log('useCanvas: Immediate initialization failed, setting up retries');
    const timeouts = [10, 50, 100, 250, 500].map(delay => 
      setTimeout(() => {
        console.log(`useCanvas: Retry after ${delay}ms, isReady: ${isReady}`);
        if (!isReady && tryInitialize()) {
          console.log('useCanvas: Retry successful, clearing remaining timeouts');
          // Clear remaining timeouts if successful
          timeouts.forEach(clearTimeout);
        }
      }, delay)
    );

    return () => {
      console.log('useCanvas: Cleaning up timeouts');
      timeouts.forEach(clearTimeout);
    };
  }, []); // Remove dependencies to prevent infinite re-renders

  // Handle pixel ratio changes
  useEffect(() => {
    const handlePixelRatioChange = () => {
      if (canvasRef.current && contextRef.current) {
        resizeCanvas();
      }
    };

    // Listen for pixel ratio changes (e.g., moving between displays)
    // Check if matchMedia is available (not available in some test environments)
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia(`(resolution: ${getPixelRatio()}dppx)`);
      if (mediaQuery && mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handlePixelRatioChange);
        return () => mediaQuery.removeEventListener('change', handlePixelRatioChange);
      } else if (mediaQuery && mediaQuery.addListener) {
        // Fallback for older browsers
        mediaQuery.addListener(handlePixelRatioChange);
        return () => mediaQuery.removeListener(handlePixelRatioChange);
      }
    }
  }, [getPixelRatio, resizeCanvas]);

  // Get canvas image data
  const getImageData = useCallback((x = 0, y = 0, width, height) => {
    const context = contextRef.current;
    const canvas = canvasRef.current;
    
    if (!context || !canvas || contextType !== '2d') {
      return null;
    }

    const w = width || canvas.width;
    const h = height || canvas.height;
    
    try {
      return context.getImageData(x, y, w, h);
    } catch (err) {
      console.error('Failed to get image data:', err);
      return null;
    }
  }, [contextType]);

  // Convert canvas to data URL
  const toDataURL = useCallback((type = 'image/png', quality = 0.92) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    try {
      return canvas.toDataURL(type, quality);
    } catch (err) {
      console.error('Failed to convert canvas to data URL:', err);
      return null;
    }
  }, []);

  // Convert canvas to blob
  const toBlob = useCallback((callback, type = 'image/png', quality = 0.92) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      callback(null);
      return;
    }

    try {
      canvas.toBlob(callback, type, quality);
    } catch (err) {
      console.error('Failed to convert canvas to blob:', err);
      callback(null);
    }
  }, []);

  // Reset canvas (clear and reinitialize if needed)
  const reset = useCallback(() => {
    clear();
    if (contextRef.current && contextType === '2d') {
      // Reset transform and styles
      contextRef.current.setTransform(1, 0, 0, 1, 0, 0);
      contextRef.current.globalAlpha = 1;
      contextRef.current.globalCompositeOperation = 'source-over';
    }
  }, [clear, contextType]);

  // Manual resize trigger
  const resize = useCallback(() => {
    resizeCanvas();
  }, [resizeCanvas]);

  return {
    // Refs
    canvasRef,
    context: contextRef.current,
    
    // State
    dimensions,
    pixelRatio: actualPixelRatio,
    isReady,
    error,
    
    // Operations
    clear,
    reset,
    resize,
    
    // Data extraction
    getImageData,
    toDataURL,
    toBlob,
    
    // Utilities
    initializeContext
  };
};

export default useCanvas;