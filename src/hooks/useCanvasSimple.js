/**
 * Simplified useCanvas Hook - More robust canvas initialization
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export const useCanvasSimple = (options = {}) => {
  const {
    backgroundColor = '#000000',
    contextType = '2d'
  } = options;

  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);

  // Initialize canvas
  const initializeCanvas = useCallback(() => {
    console.log('useCanvasSimple: Starting initialization...');
    
    const canvas = canvasRef.current;
    if (!canvas) {
      console.log('useCanvasSimple: No canvas element');
      return false;
    }

    const container = canvas.parentElement;
    if (!container) {
      console.log('useCanvasSimple: No container element');
      return false;
    }

    const rect = container.getBoundingClientRect();
    console.log(`useCanvasSimple: Container dimensions: ${rect.width}x${rect.height}`);

    if (rect.width === 0 || rect.height === 0) {
      console.log('useCanvasSimple: Container has no dimensions');
      return false;
    }

    try {
      // Get context
      const context = canvas.getContext(contextType);
      if (!context) {
        setError('Failed to get canvas context');
        console.log('useCanvasSimple: Failed to get context');
        return false;
      }

      contextRef.current = context;

      // Set canvas size
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = rect.width * pixelRatio;
      canvas.height = rect.height * pixelRatio;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      // Scale context
      context.scale(pixelRatio, pixelRatio);

      // Clear canvas
      context.fillStyle = backgroundColor;
      context.fillRect(0, 0, rect.width, rect.height);

      setDimensions({
        width: rect.width,
        height: rect.height,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height
      });

      setError(null);
      setIsReady(true);
      console.log('useCanvasSimple: Initialization successful!');
      return true;

    } catch (err) {
      const errorMsg = `Canvas initialization failed: ${err.message}`;
      setError(errorMsg);
      console.error('useCanvasSimple:', errorMsg);
      return false;
    }
  }, [backgroundColor, contextType]);

  // Resize canvas
  const resize = useCallback(() => {
    if (!isReady) return;
    
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = rect.width * pixelRatio;
    canvas.height = rect.height * pixelRatio;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const context = contextRef.current;
    if (context) {
      context.scale(pixelRatio, pixelRatio);
    }

    setDimensions({
      width: rect.width,
      height: rect.height,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height
    });
  }, [isReady]);

  // Clear canvas
  const clear = useCallback((color = backgroundColor) => {
    const context = contextRef.current;
    if (!context || !dimensions.width || !dimensions.height) return;

    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    
    if (color) {
      context.fillStyle = color;
      context.fillRect(0, 0, dimensions.width, dimensions.height);
    } else {
      context.clearRect(0, 0, dimensions.width, dimensions.height);
    }
    
    context.restore();
  }, [backgroundColor, dimensions]);

  // Initialize when canvas ref is available
  useEffect(() => {
    if (!canvasRef.current) return;

    // Try multiple times with increasing delays
    const attempts = [0, 10, 50, 100, 250, 500, 1000];
    let timeouts = [];

    attempts.forEach((delay, index) => {
      const timeout = setTimeout(() => {
        if (!isReady && initializeCanvas()) {
          // Clear remaining timeouts if successful
          timeouts.forEach(clearTimeout);
        }
      }, delay);
      timeouts.push(timeout);
    });

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [initializeCanvas, isReady]);

  // Handle window resize
  useEffect(() => {
    if (!isReady) return;

    const handleResize = () => {
      resize();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isReady, resize]);

  return {
    canvasRef,
    context: contextRef.current,
    dimensions,
    pixelRatio: window.devicePixelRatio || 1,
    isReady,
    error,
    clear,
    resize
  };
};